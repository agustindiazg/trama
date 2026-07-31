"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, Check, Clipboard, Code2, Download,
  FileText, LockKeyhole, SlidersHorizontal, Sparkles, Target, Upload, X
} from "lucide-react";
import { calculateAtsAudit } from "./lib/ats";
const escapeLatex = (value) => value
  .replaceAll("\\", "\\textbackslash{}")
  .replaceAll("&", "\\&").replaceAll("%", "\\%").replaceAll("$", "\\$")
  .replaceAll("#", "\\#").replaceAll("_", "\\_").replaceAll("{", "\\{")
  .replaceAll("}", "\\}").replaceAll("~", "\\textasciitilde{}")
  .replaceAll("^", "\\textasciicircum{}");

const getDiffSummary = (before, after) => {
  if (!before || !after || before === after) return { changed: 0, lines: [] };
  const oldLines = before.split("\n").filter((line) => line.trim());
  const newLines = after.split("\n").filter((line) => line.trim());
  const lines = newLines.filter((line) => !oldLines.includes(line)).filter((line) => !line.startsWith("\\document") && !line.startsWith("\\usepackage")).slice(0, 8);
  return { changed: lines.length, lines };
};

const makeLatex = (rawText) => {
  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  const name = lines[0] || "Tu Nombre";
  const contact = lines.slice(1, 3).join(" · ");
  const body = lines.slice(contact ? 3 : 1);
  const sectionMatcher = /^(experiencia|experience|educaci[oó]n|education|habilidades|skills|proyectos|projects|perfil|profile|resumen|summary|idiomas|languages)$/i;
  const output = [];
  let hasSection = false;

  body.forEach((line) => {
    if (sectionMatcher.test(line.replace(/:$/, ""))) {
      hasSection = true;
      output.push(`\\section*{${escapeLatex(line.replace(/:$/, ""))}}`);
    } else {
      output.push(`${escapeLatex(line)}\\\\[3pt]`);
    }
  });

  if (!hasSection && output.length) output.unshift("\\section*{Perfil profesional}");

  return `\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=1.6cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{xcolor}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\definecolor{ink}{HTML}{17231D}
\\color{ink}

\\begin{document}
{\\LARGE\\bfseries ${escapeLatex(name)}}\\\\[4pt]
${escapeLatex(contact)}\\\\[10pt]
\\hrule
\\vspace{8pt}

${output.join("\n")}

\\end{document}
`;
};

const makeLatexFromCv = (cv) => {
  const command = (title) => `\\section*{${escapeLatex(title)}}`;
  const period = (start, end) => [start, end].filter(Boolean).join(" -- ");
  const blocks = [];

  if (cv.summary) blocks.push(`${command("Perfil profesional")}\n${escapeLatex(cv.summary)}\\\\[5pt]`);
  if (cv.experience?.length) {
    blocks.push(command("Experiencia"));
    cv.experience.forEach((item) => {
      const heading = [item.role, item.company].filter(Boolean).join(" — ");
      blocks.push(`\\textbf{${escapeLatex(heading)}} \\hfill ${escapeLatex(period(item.start, item.end))}\\\\`);
      if (item.location) blocks.push(`\\textit{${escapeLatex(item.location)}}\\\\[2pt]`);
      if (item.bullets?.length) {
        blocks.push("\\begin{itemize}[leftmargin=*,nosep]");
        item.bullets.filter(Boolean).forEach((bullet) => blocks.push(`  \\item ${escapeLatex(bullet)}`));
        blocks.push("\\end{itemize}\n\\vspace{4pt}");
      }
    });
  }
  if (cv.education?.length) {
    blocks.push(command("Educación"));
    cv.education.forEach((item) => {
      blocks.push(`\\textbf{${escapeLatex(item.institution || "")}} \\hfill ${escapeLatex(period(item.start, item.end))}\\\\`);
      if (item.degree) blocks.push(`${escapeLatex(item.degree)}\\\\[4pt]`);
    });
  }
  if (cv.projects?.length) {
    blocks.push(command("Proyectos"));
    cv.projects.forEach((item) => blocks.push(`\\textbf{${escapeLatex(item.name || "")}}${item.url ? ` — \\href{${escapeLatex(item.url)}}{enlace}` : ""}\\\\\n${escapeLatex(item.description || "")}\\\\[4pt]`));
  }
  if (cv.skills?.length) blocks.push(`${command("Habilidades")}\n${escapeLatex(cv.skills.filter(Boolean).join(" · "))}\\\\[5pt]`);
  if (cv.languages?.length) blocks.push(`${command("Idiomas")}\n${escapeLatex(cv.languages.filter(Boolean).join(" · "))}\\\\[5pt]`);
  cv.otherSections?.forEach((section) => {
    if (section.title && section.items?.length) blocks.push(`${command(section.title)}\n${section.items.map((item) => `${escapeLatex(item)}\\\\[3pt]`).join("\n")}`);
  });

  return `\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=1.6cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{xcolor}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\definecolor{ink}{HTML}{17231D}
\\color{ink}

\\begin{document}
{\\LARGE\\bfseries ${escapeLatex(cv.name || "Tu Nombre")}}\\\\[3pt]
${cv.headline ? `${escapeLatex(cv.headline)}\\\\[3pt]\n` : ""}${escapeLatex((cv.contact || []).filter(Boolean).join(" · "))}\\\\[9pt]
\\hrule
\\vspace{8pt}

${blocks.join("\n")}

\\end{document}
`;
};

const SETTINGS_STORAGE_KEY = "trama:conversion-settings";
const VERSION_STORAGE_KEY = "trama:cv-versions";

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const byY = new Map();
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5] / 4) * 4;
      byY.set(y, [...(byY.get(y) || []), item]);
    });
    const pageLines = [...byY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(" "))
      .filter(Boolean);
    pages.push(pageLines.join("\n"));
  }
  return { text: pages.join("\n"), pages: doc.numPages };
}

function App() {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [latex, setLatex] = useState("");
  const [originalLatex, setOriginalLatex] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState("preview");
  const [conversionMode, setConversionMode] = useState("local");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allowImprovement, setAllowImprovement] = useState(true);
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [jobKeywords, setJobKeywords] = useState([]);
  const [jobAnalysis, setJobAnalysis] = useState({ requested: false, sourceRead: false, sourceType: null });
  const [versions, setVersions] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const preferences = JSON.parse(saved);
        if (typeof preferences.allowImprovement === "boolean") setAllowImprovement(preferences.allowImprovement);
        if (typeof preferences.targetRole === "string") setTargetRole(preferences.targetRole.slice(0, 120));
        if (typeof preferences.jobDescription === "string") setJobDescription(preferences.jobDescription.slice(0, 12000));
        if (typeof preferences.jobUrl === "string") setJobUrl(preferences.jobUrl.slice(0, 500));
        if (typeof preferences.additionalInformation === "string") {
          setAdditionalInformation(preferences.additionalInformation.slice(0, 4000));
        } else if (typeof preferences.supplementalContact === "string") {
          setAdditionalInformation(preferences.supplementalContact.slice(0, 4000));
        }
      }
    } catch {
      // Una preferencia corrupta no debe impedir usar la aplicación.
    } finally {
      setSettingsHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VERSION_STORAGE_KEY);
      if (saved) setVersions(JSON.parse(saved).slice(0, 5));
    } catch {
      setVersions([]);
    }
  }, []);

  useEffect(() => {
    if (!settingsHydrated) return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      allowImprovement,
      targetRole,
      jobDescription,
      jobUrl,
      additionalInformation
    }));
  }, [allowImprovement, targetRole, jobDescription, jobUrl, additionalInformation, settingsHydrated]);

  const processFile = useCallback(async (candidate) => {
    if (!candidate) return;
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("Necesitamos un archivo PDF para comenzar.");
      return;
    }
    if (candidate.size > 10 * 1024 * 1024) {
      setError("El archivo supera el límite de 10 MB.");
      return;
    }
    setError("");
    setFile(candidate);
    setJobKeywords([]);
    setJobAnalysis({ requested: Boolean(jobDescription.trim() || jobUrl.trim()), sourceRead: false, sourceType: null });
    setStatus("reading");
    try {
      const localPromise = extractPdfText(candidate).catch(() => ({ text: "", pages: 0 }));
      const formData = new FormData();
      formData.append("cv", candidate);
      formData.append("allowImprovement", String(allowImprovement));
      formData.append("targetRole", targetRole.trim());
      formData.append("jobDescription", jobDescription.trim());
      formData.append("jobUrl", jobUrl.trim());
      formData.append("additionalInformation", additionalInformation.trim());
      const aiPromise = fetch("/api/interpret-cv", { method: "POST", body: formData });
      const [result, aiResponse] = await Promise.all([localPromise, aiPromise]);
      setPages(result.pages);
      let generatedLatex = "";

      if (aiResponse.ok) {
        const data = await aiResponse.json();
        generatedLatex = makeLatexFromCv(data.cv);
        setLatex(generatedLatex);
        setOriginalLatex(result.text ? makeLatex(result.text) : "");
        setJobKeywords(Array.isArray(data.cv?.jobKeywords) ? data.cv.jobKeywords : []);
        setJobAnalysis(data.jobAnalysis || { requested: Boolean(jobDescription.trim() || jobUrl.trim()), sourceRead: Boolean(data.jobSource), sourceType: null });
        setConversionMode("claude");
      } else {
        const apiError = await aiResponse.json().catch(() => ({}));
        if (!result.text.trim()) throw new Error(apiError.error || "Este PDF no contiene texto seleccionable y Claude no está disponible.");
        generatedLatex = makeLatex(result.text);
        setLatex(generatedLatex);
        setOriginalLatex(generatedLatex);
        setConversionMode("local");
        if (apiError.code !== "CLAUDE_NOT_CONFIGURED") setError(`Claude no estuvo disponible; usamos el extractor local. ${apiError.error || ""}`.trim());
      }
      setActiveView("preview");
      setStatus("ready");
      const nextVersion = { id: Date.now(), file: candidate.name, role: targetRole.trim(), mode: allowImprovement ? "Optimizado" : "Fiel", latex: generatedLatex, createdAt: new Date().toISOString() };
      setVersions((current) => {
        const updated = [nextVersion, ...current].slice(0, 5);
        window.localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
      setTimeout(() => document.querySelector("#resultado")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch (err) {
      setStatus("error");
      setError(err.message || "No pudimos leer este PDF. Probá con otro archivo.");
    }
  }, [allowImprovement, targetRole, jobDescription, jobUrl, additionalInformation]);

  const drop = (event) => {
    event.preventDefault();
    setDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const download = () => {
    const blob = new Blob([latex], { type: "application/x-tex" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${file?.name.replace(/\.pdf$/i, "") || "cv"}-ats.tex`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const atsAudit = useMemo(() => status === "ready" ? calculateAtsAudit(latex, jobKeywords) : { technicalScore: 0, matchScore: null, checks: [], keywordCheck: null, inferred: [] }, [status, latex, jobKeywords]);
  const keywordLabels = useMemo(() => jobKeywords.map((item) => typeof item === "object" && item ? item.term : item).filter(Boolean), [jobKeywords]);
  const diffSummary = useMemo(() => getDiffSummary(originalLatex, latex), [originalLatex, latex]);
  const preview = useMemo(() => {
    const name = latex.match(/\\LARGE\\bfseries\s+([^}]*)}/)?.[1] || "Tu Nombre";
    const contact = latex.match(/\\LARGE\\bfseries[^]*?}\\\\\[4pt\]\s*([^\n]*)/)?.[1] || "";
    const content = latex.split("\\vspace{8pt}")[1]?.split("\\end{document}")[0] || "";
    const sections = [];
    let current = { title: "", lines: [] };

    content.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const section = line.match(/^\\section\*\{(.*)}$/);
      if (section) {
        if (current.title || current.lines.length) sections.push(current);
        current = { title: section[1], lines: [] };
      } else if (!/^\\(?:begin|end|vspace)/.test(line)) {
        const readable = line
          .replace(/^\\item\s+/, "• ")
          .replace(/\\textbf\{([^}]*)}/g, "$1")
          .replace(/\\textit\{([^}]*)}/g, "$1")
          .replace(/\\href\{[^}]*}\{([^}]*)}/g, "$1")
          .replace(/\s*\\hfill\s*/, "  ·  ")
          .replace(/\\\\(?:\[\d+pt])?$/, "");
        if (readable) current.lines.push(readable);
      }
    });
    if (current.title || current.lines.length) sections.push(current);

    const clean = (value) => value
      .replaceAll("\\&", "&").replaceAll("\\%", "%").replaceAll("\\$", "$")
      .replaceAll("\\#", "#").replaceAll("\\_", "_").replaceAll("\\{", "{")
      .replaceAll("\\}", "}").replaceAll("\\textasciitilde{}", "~")
      .replaceAll("\\textasciicircum{}", "^").replaceAll("\\textbackslash{}", "\\");
    return { name: clean(name), contact: clean(contact), sections: sections.map((s) => ({ ...s, title: clean(s.title), lines: s.lines.map(clean) })) };
  }, [latex]);

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#"><span className="brand-mark">T</span><span>trama</span></a>
        <a className="nav-link" href="#como-funciona">Cómo funciona <ArrowDown size={15} /></a>
      </nav>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> PDF → LaTeX, sin vueltas</div>
        <h1>Tu experiencia merece<br />pasar el <em>primer filtro.</em></h1>
        <p className="hero-copy">Convertí tu CV en PDF a un documento LaTeX limpio, legible y pensado para sistemas ATS. Interpretado visualmente y en segundos.</p>

        <div className={`settings ${settingsOpen ? "open" : ""}`}>
          <button
            className="settings-trigger"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
          >
            <span><SlidersHorizontal size={15} /> Ajustar conversión</span>
            <span className="settings-summary">
              {allowImprovement ? targetRole.trim() || "Mejora ATS activa" : "Transcripción fiel"}
              <ArrowDown size={14} />
            </span>
          </button>
          {settingsOpen ? (
            <div className="settings-panel">
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={allowImprovement}
                  onChange={(event) => setAllowImprovement(event.target.checked)}
                />
                <span className="check-ui"><Check size={13} /></span>
                <span>
                  <strong>Permitir que Claude mejore el contenido</strong>
                <small>Reclutador sénior + fórmula XYZ para bullets ATS. Nunca inventa experiencia ni métricas.</small>
                </span>
              </label>
              <label className={`role-field ${allowImprovement ? "" : "disabled"}`}>
                <span><Target size={14} /> Puesto al que querés aplicar</span>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(event) => setTargetRole(event.target.value)}
                  placeholder="Ej. Senior Product Designer"
                  disabled={!allowImprovement}
                  maxLength={120}
                />
                <small>Opcional · ayuda a priorizar términos relevantes para el ATS.</small>
              </label>
              <label className="role-field job-field">
                <span><FileText size={14} /> Información adicional para mejorar el CV</span>
                <textarea
                  value={additionalInformation}
                  onChange={(event) => setAdditionalInformation(event.target.value)}
                  placeholder={"Agregá cualquier dato que pida la auditoría. Ej.:\nMi email es agustin@email.com\nLideré un equipo de 6 personas\nMejoramos la conversión un 18%"}
                  maxLength={4000}
                  rows={5}
                />
                <small>Opcional · Claude ubica cada dato en la sección correcta. Se guarda sólo en este navegador.</small>
              </label>
              <label className={`role-field job-field ${allowImprovement ? "" : "disabled"}`}>
                <span><FileText size={14} /> Oferta de trabajo</span>
                <textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Pegá acá la descripción del puesto…"
                  disabled={!allowImprovement}
                  maxLength={12000}
                  rows={5}
                />
                <small>Opcional · Claude extrae keywords y requisitos. Se guarda sólo en este navegador.</small>
              </label>
              <div className="setting-divider"><span>o</span></div>
              <label className={`role-field job-field ${allowImprovement ? "" : "disabled"}`}>
                <span><Target size={14} /> Link de la oferta</span>
                <input type="url" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} placeholder="https://empresa.com/jobs/product-designer" disabled={!allowImprovement} maxLength={500} />
                <small>Opcional · debe ser una página pública. Si completás ambos, se prioriza el link.</small>
              </label>
            </div>
          ) : null}
        </div>

        <div
          className={`dropzone ${dragging ? "dragging" : ""} ${status === "reading" ? "processing" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          onClick={() => status !== "reading" && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => processFile(e.target.files?.[0])} />
          <div className="file-icon"><FileText size={31} strokeWidth={1.6} /><span>PDF</span></div>
          {status === "reading" ? (
            <><h2>Estamos leyendo tu historia…</h2><p>Extrayendo estructura y contenido del PDF</p><div className="progress"><span /></div></>
          ) : (
            <><h2>Soltá tu CV acá</h2><p>o hacé clic para elegir un archivo</p><button><Upload size={17} /> Elegir PDF</button><small>Máximo 10 MB · Tu archivo no queda almacenado</small></>
          )}
        </div>
        {error && <div className="error"><X size={17} />{error}</div>}
        <div className="trust"><span><LockKeyhole size={15} /> API key protegida</span><span><Check size={15} /> Compatible con ATS</span><span><Code2 size={15} /> LaTeX editable</span></div>
      </section>

      {status === "ready" && (
        <section className="result" id="resultado">
          <div className="result-head">
            <div><span className="kicker">CONVERSIÓN COMPLETA · {conversionMode === "claude" ? (allowImprovement ? "OPTIMIZADO CON CLAUDE" : "INTERPRETADO POR CLAUDE") : "EXTRACCIÓN LOCAL"}</span><h2>Tu CV ya tiene una trama más clara.</h2><p>{file.name} · {pages || "—"} {pages === 1 ? "página" : "páginas"} · {allowImprovement && targetRole.trim() ? `orientado a ${targetRole.trim()}` : "estructura ATS optimizada"}</p></div>
            <div className="scores"><div className="score" title={`${atsAudit.checks.filter((check) => check.pass).length}/${atsAudit.checks.length} checks técnicos`}><strong>{atsAudit.technicalScore}</strong><span>/100<br />ATS técnico</span></div><div className="score match-score" title={atsAudit.matchScore === null ? (jobAnalysis.requested ? "No se detectaron keywords profesionales para calcular el match" : "Agregá una oferta para evaluar compatibilidad") : "Cobertura de keywords de la oferta"}><strong>{atsAudit.matchScore ?? "—"}</strong><span>/100<br />match oferta</span></div></div>
          </div>
          <details className="audit-details"><summary><span>Auditoría explicable</span><small>{atsAudit.checks.filter((check) => check.pass).length}/{atsAudit.checks.length} checks técnicos superados</small></summary><div className="audit-grid">{atsAudit.checks.map((check) => <div className={check.pass ? "audit-pass" : "audit-fail"} key={check.label}>{check.pass ? <Check size={14} /> : <X size={14} />}<span>{check.label}</span>{!check.pass && <small>{check.fix}</small>}</div>)}{atsAudit.keywordCheck && <div className={atsAudit.keywordCheck.pass ? "audit-pass" : "audit-fail"}>{atsAudit.keywordCheck.pass ? <Check size={14} /> : <X size={14} />}<span>{atsAudit.keywordCheck.label}</span>{!atsAudit.keywordCheck.pass && <small>{atsAudit.keywordCheck.fix}</small>}</div>}</div>{(jobAnalysis.requested || atsAudit.keywordCheck) && <div className="keyword-coverage">{atsAudit.keywordCheck ? <><p><strong>Keywords detectadas</strong>{keywordLabels.join(" · ")}</p><p><strong>Cubiertas por el CV</strong>{atsAudit.matched.length ? atsAudit.matched.join(" · ") : "Ninguna detectada"}</p>{atsAudit.inferred.length > 0 && <p><strong>Equivalentes o inferidas</strong>{atsAudit.inferred.map((item) => `${item.term}${item.evidence ? ` — ${item.evidence}` : ""}`).join(" · ")}</p>}<p><strong>No respaldadas o ausentes</strong>{atsAudit.missing.length ? atsAudit.missing.join(" · ") : "Ninguna"}</p><small>Las inferencias cuentan sólo cuando el perfil aporta evidencia. Las ausentes no se agregan automáticamente.</small></> : <><p><strong>Keywords detectadas</strong>Ninguna</p><small>{jobAnalysis.sourceRead ? "La oferta se leyó, pero Claude no identificó términos laborales confiables. Revisá el contenido y reprocesá el PDF." : "No pudimos leer la oferta. Si el sitio bloquea el acceso automático, pegá el texto de la oferta en Configuración y reprocesá el PDF."}</small></>}</div>}</details>
          {allowImprovement && diffSummary.changed > 0 && <details className="diff-details"><summary><span>Qué cambió en la mejora</span><small>{diffSummary.changed} líneas nuevas</small></summary><div className="diff-list">{diffSummary.lines.map((line, index) => <div key={index}><span>+</span><code>{line.replace(/\\\\(?:\[.*?\])?$/, "")}</code></div>)}</div></details>}
          <div className="result-tools"><div><strong>¿La mejora te resultó útil?</strong><button className={feedback === "yes" ? "selected" : ""} onClick={() => setFeedback("yes")}><Check size={14} /> Sí</button><button className={feedback === "no" ? "selected" : ""} onClick={() => setFeedback("no")}><X size={14} /> Necesita revisión</button></div>{versions.length > 1 && <details className="versions"><summary>Historial ({versions.length})</summary><div>{versions.map((version) => <button key={version.id} onClick={() => setLatex(version.latex)}><span>{version.mode} · {version.role || "sin puesto"}</span><small>{new Date(version.createdAt).toLocaleString("es-AR")}</small></button>)}</div></details>}</div>
          <div className="reprocess-note">
            <span>¿Cambiaste algún ajuste?</span>
            <button type="button" onClick={() => processFile(file)} disabled={status === "reading"}><Sparkles size={14} /> Reprocesar este PDF</button>
          </div>
          <div className="workspace">
            <div className="workspace-bar">
              <div className="view-tabs">
                <button className={activeView === "preview" ? "active" : ""} onClick={() => setActiveView("preview")}><FileText size={14} /> Vista previa</button>
                <button className={activeView === "code" ? "active" : ""} onClick={() => setActiveView("code")}><Code2 size={14} /> Código LaTeX</button>
              </div>
              <div className="workspace-actions">
                <button onClick={copy}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? "Copiado" : "Copiar"}</button>
                <button className="download" onClick={download}><Download size={15} /> Descargar .tex</button>
              </div>
            </div>
            <div className={`workspace-content ${activeView}`}>
              <div className="code-pane">
                <div className="pane-label"><i /> LATEX · CV-ATS.TEX</div>
                <textarea value={latex} onChange={(e) => setLatex(e.target.value)} spellCheck="false" aria-label="Código LaTeX generado" />
              </div>
              <div className="preview-pane">
                <div className="pane-label"><i /> PREVIEW · A4</div>
                <div className="paper-wrap">
                  <article className="latex-paper">
                    <h1>{preview.name}</h1>
                    {preview.contact && <p className="paper-contact">{preview.contact}</p>}
                    <hr />
                    {preview.sections.map((section, index) => (
                      <section key={`${section.title}-${index}`}>
                        {section.title && <h2>{section.title}</h2>}
                        {section.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
                      </section>
                    ))}
                  </article>
                </div>
              </div>
            </div>
          </div>
          <button className="new-file" onClick={() => { setStatus("idle"); setFile(null); setLatex(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowRight size={16} /> Convertir otro CV</button>
        </section>
      )}

      <section className="how" id="como-funciona">
        <div><span className="section-num">01—03</span><h2>Menos decoración.<br />Más información.</h2></div>
        <div className="steps">
          <article><b>01</b><h3>Leemos</h3><p>Extraemos el texto de tu PDF directamente en tu navegador.</p></article>
          <article><b>02</b><h3>Ordenamos</h3><p>Detectamos las secciones clave y limpiamos el formato visual.</p></article>
          <article><b>03</b><h3>Convertimos</h3><p>Generamos LaTeX simple, editable y fácil de interpretar por un ATS.</p></article>
        </div>
      </section>

      <footer><a className="brand" href="#"><span className="brand-mark">T</span><span>trama</span></a><p>Un CV más claro no inventa tu experiencia.<br />La vuelve imposible de ignorar.</p><span>Hecho en Argentina · 2026</span></footer>
    </main>
  );
}

export default App;
