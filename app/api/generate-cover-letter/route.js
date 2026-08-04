import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { calculateCost } from "@/lib/costCalculator";
import { logCost } from "@/lib/costLogger";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = "claude-sonnet-4-6";

const isSafePublicUrl = (value) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return !(["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) || host.endsWith(".local") || /^(10|127|169\.254|192\.168)\./.test(host));
  } catch {
    return false;
  }
};

const parseJson = (payload) => {
  const text = payload.content?.filter((block) => block.type === "text").map((block) => block.text).join("") || "";
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
};

async function readJob(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Trama/1.0 cover-letter-reader" },
      cache: "no-store"
    });
    if (!response.ok) return null;
    const $ = cheerio.load(await response.text());
    let company = "";
    let role = "";
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const parsed = JSON.parse($(element).html() || "");
        const candidates = (Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed]).flat(Infinity);
        const job = candidates.find((item) => item?.["@type"] === "JobPosting");
        if (job) {
          company ||= String(job.hiringOrganization?.name || "").trim();
          role ||= String(job.title || "").trim();
        }
      } catch {
        // El contenido visible sigue siendo suficiente para intentar identificar la oferta.
      }
    });
    $("script, style, noscript, svg, iframe, nav, footer, form, template").remove();
    const root = $("main").text().trim() ? $("main") : $("article").text().trim() ? $("article") : $("body");
    return {
      company: company.slice(0, 160),
      role: role.slice(0, 160),
      pageTitle: ($('meta[property="og:title"]').attr("content") || $("title").text()).trim().slice(0, 240),
      text: root.text().replace(/\s+/g, " ").trim().slice(0, 14000)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Claude no está configurado." }, { status: 503 });
  }
  try {
    const body = await request.json();
    const jobUrl = String(body.jobUrl || "").trim().slice(0, 500);
    if (!isSafePublicUrl(jobUrl)) return NextResponse.json({ error: "Hace falta una URL pública válida de la oferta." }, { status: 400 });
    if (!body.cv || typeof body.cv !== "object") return NextResponse.json({ error: "Falta el CV mejorado." }, { status: 400 });

    const job = await readJob(jobUrl);
    if (!job?.text) return NextResponse.json({ error: "No pudimos volver a leer la oferta para preparar la carta." }, { status: 422 });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 2200,
        temperature: 0,
        system: "Sos especialista en cartas de presentación. No inventás experiencia, logros, nombres ni información sobre la empresa. Devolvés exclusivamente JSON válido.",
        messages: [{
          role: "user",
          content: `Generá una cover letter breve y específica usando exclusivamente hechos respaldados por el CV y esta oferta. Conservá el idioma principal del CV. Identificá empresa y puesto desde los datos de la página; si no son confiables, devolvé una cadena vacía en ese campo. No incluyas dirección postal, fecha ni datos inventados. Usá 3 párrafos de entre 45 y 80 palabras y un saludo neutro si no hay nombre de recruiter.\n\nDevolvé exactamente: {"company":"...","role":"...","greeting":"...","paragraphs":["...","...","..."],"closing":"...","senderName":"..."}\n\nDatos detectados: ${JSON.stringify({ company: job.company, role: job.role, pageTitle: job.pageTitle, url: jobUrl })}\n<job_posting>${job.text}</job_posting>\n<cv>${JSON.stringify(body.cv).slice(0, 24000)}</cv>`
        }]
      }),
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok) {
      // Log error
      await logCost({
        action: "generate-cover-letter",
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        status: "error",
        error: payload?.error?.message || "API error",
        inputTokens: 0,
        outputTokens: 0,
        costUSD: 0
      });
      return NextResponse.json({ error: payload?.error?.message || "No pudimos generar la carta." }, { status: response.status });
    }
    const letter = parseJson(payload);
    letter.company = String(letter.company || job.company || "").trim().slice(0, 160);
    letter.role = String(letter.role || job.role || "").trim().slice(0, 160);
    letter.paragraphs = Array.isArray(letter.paragraphs) ? letter.paragraphs.map((item) => String(item).trim()).filter(Boolean).slice(0, 3) : [];
    if (!letter.company || !letter.role || letter.paragraphs.length < 2) {
      return NextResponse.json({ error: "No pudimos identificar con suficiente certeza la empresa y el puesto de esta oferta." }, { status: 422 });
    }

    // LOG COST
    const cost = calculateCost(payload.model, payload.usage.input_tokens, payload.usage.output_tokens);
    await logCost({
      action: "generate-cover-letter",
      model: payload.model,
      status: "success",
      inputTokens: payload.usage.input_tokens,
      outputTokens: payload.usage.output_tokens,
      costUSD: cost.total,
      metadata: {
        company: letter.company,
        role: letter.role
      }
    });

    return NextResponse.json({ letter, _cost: cost.total });
  } catch (error) {
    console.error("Cover letter generation failed", error);
    return NextResponse.json({ error: "No pudimos generar la cover letter." }, { status: 500 });
  }
}
