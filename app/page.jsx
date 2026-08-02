"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowDown, ArrowRight, Check, Download,
  FileText, LockKeyhole, Mail, RotateCcw, Sparkles, Target, Upload, X
} from "lucide-react";
import { calculateAtsAudit } from "./lib/ats";
import { getCvSectionTitles } from "./lib/cv-language";
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
  const titles = getCvSectionTitles({ summary: rawText });

  body.forEach((line) => {
    if (sectionMatcher.test(line.replace(/:$/, ""))) {
      hasSection = true;
      output.push(`\\section*{${escapeLatex(line.replace(/:$/, ""))}}`);
    } else {
      output.push(`${escapeLatex(line)}\\\\[3pt]`);
    }
  });

  if (!hasSection && output.length) output.unshift(`\\section*{${escapeLatex(titles.summary)}}`);

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
  const titles = getCvSectionTitles(cv);

  if (cv.summary) blocks.push(`${command(titles.summary)}\n${escapeLatex(cv.summary)}\\\\[5pt]`);
  if (cv.experience?.length) {
    blocks.push(command(titles.experience));
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
    blocks.push(command(titles.education));
    cv.education.forEach((item) => {
      blocks.push(`\\textbf{${escapeLatex(item.institution || "")}} \\hfill ${escapeLatex(period(item.start, item.end))}\\\\`);
      if (item.degree) blocks.push(`${escapeLatex(item.degree)}\\\\[4pt]`);
    });
  }
  if (cv.projects?.length) {
    blocks.push(command(titles.projects));
    cv.projects.forEach((item) => blocks.push(`\\textbf{${escapeLatex(item.name || "")}}${item.url ? ` — \\href{${escapeLatex(item.url)}}{enlace}` : ""}\\\\\n${escapeLatex(item.description || "")}\\\\[4pt]`));
  }
  if (cv.skills?.length) blocks.push(`${command(titles.skills)}\n${escapeLatex(cv.skills.filter(Boolean).join(" · "))}\\\\[5pt]`);
  if (cv.languages?.length) blocks.push(`${command(titles.languages)}\n${escapeLatex(cv.languages.filter(Boolean).join(" · "))}\\\\[5pt]`);
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

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Anima cambios de fase con la View Transition API. `direction` ("expand" |
// "step" | "collapse") se expone en <html data-vt-direction> para ajustar la
// animación desde CSS. flushSync es necesario en React 18 para que el DOM esté
// actualizado antes de que el callback resuelva; es seguro acá porque los call
// sites son handlers o código post-await, nunca render.
function withViewTransition(update, direction) {
  if (typeof document === "undefined" || !document.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }
  if (direction) document.documentElement.dataset.vtDirection = direction;
  const transition = document.startViewTransition(() => { flushSync(update); });
  transition.finished
    .catch(() => {})
    .finally(() => { delete document.documentElement.dataset.vtDirection; });
}

function App() {
  const inputRef = useRef(null);
  const flowIdRef = useRef(0);
  const [phase, setPhase] = useState("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [latex, setLatex] = useState("");
  const [originalLatex, setOriginalLatex] = useState("");
  const [pdfStatus, setPdfStatus] = useState("idle");
  const [pdfError, setPdfError] = useState("");
  const allowImprovement = true;
  const [targetRole, setTargetRole] = useState("");
  const [jobInputMode, setJobInputMode] = useState("url");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [jobKeywords, setJobKeywords] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [originalCv, setOriginalCv] = useState(null);
  const [workingCv, setWorkingCv] = useState(null);
  const [queuedContext, setQueuedContext] = useState(null);
  const [jobAnalysis, setJobAnalysis] = useState({ requested: false, sourceRead: false, sourceType: null });
  const [versions, setVersions] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [workflowStep, setWorkflowStep] = useState(3);
  const [improvementAnalysis, setImprovementAnalysis] = useState({ changes: [], questions: [] });
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [questionQuickAnswers, setQuestionQuickAnswers] = useState({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [iterationComplete, setIterationComplete] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [coverLetter, setCoverLetter] = useState(null);
  const [coverLetterStatus, setCoverLetterStatus] = useState("idle");
  const [coverLetterError, setCoverLetterError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const preferences = JSON.parse(saved);
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
  }, [targetRole, jobDescription, jobUrl, additionalInformation, settingsHydrated]);

  const resetFlow = useCallback(() => {
    flowIdRef.current += 1;
    withViewTransition(() => {
      setPhase("upload");
      setDragging(false);
      setFile(null);
      setStatus("idle");
      setError("");
      setPages(0);
      setLatex("");
      setOriginalLatex("");
      setPdfStatus("idle");
      setPdfError("");
      setTargetRole("");
      setJobInputMode("url");
      setJobDescription("");
      setJobUrl("");
      setAdditionalInformation("");
      setJobKeywords([]);
      setEvaluation(null);
      setOriginalCv(null);
      setWorkingCv(null);
      setQueuedContext(null);
      setJobAnalysis({ requested: false, sourceRead: false, sourceType: null });
      setFeedback(null);
      setFeedbackNote("");
      setWorkflowStep(3);
      setImprovementAnalysis({ changes: [], questions: [] });
      setQuestionAnswers({});
      setQuestionQuickAnswers({});
      setActiveQuestionIndex(0);
      setIterationComplete(false);
      setCoverLetter(null);
      setCoverLetterStatus("idle");
      setCoverLetterError("");
      if (inputRef.current) inputRef.current.value = "";
      window.scrollTo(0, 0);
    }, "collapse");
  }, []);

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
    withViewTransition(() => {
      setError("");
      setFile(candidate);
      setPhase("context");
      setOriginalCv(null);
      setWorkingCv(null);
      setQueuedContext(null);
      setFeedback(null);
      setFeedbackNote("");
      setWorkflowStep(3);
      setImprovementAnalysis({ changes: [], questions: [] });
      setQuestionAnswers({});
      setQuestionQuickAnswers({});
      setActiveQuestionIndex(0);
      setIterationComplete(false);
      setCoverLetter(null);
      setCoverLetterStatus("idle");
      setCoverLetterError("");
      setJobKeywords([]);
      setEvaluation(null);
      setJobAnalysis({ requested: Boolean(jobDescription.trim() || jobUrl.trim()), sourceRead: false, sourceType: null });
      setStatus("reading");
    }, "expand");
    const flowId = flowIdRef.current;
    try {
      const localPromise = extractPdfText(candidate).catch(() => ({ text: "", pages: 0 }));
      const formData = new FormData();
      formData.append("cv", candidate);
      formData.append("intent", "extract");
      const aiPromise = fetch("/api/interpret-cv", { method: "POST", body: formData });
      const [result, aiResponse] = await Promise.all([localPromise, aiPromise]);
      if (flowId !== flowIdRef.current) return;
      setPages(result.pages);
      let generatedLatex = "";

      if (aiResponse.ok) {
        const data = await aiResponse.json();
        setOriginalCv(data.cv);
        setWorkingCv(data.cv);
        generatedLatex = makeLatexFromCv(data.cv);
        setLatex(generatedLatex);
        setOriginalLatex(result.text ? makeLatex(result.text) : "");
        setJobKeywords(Array.isArray(data.cv?.jobKeywords) ? data.cv.jobKeywords : []);
        setEvaluation(null);
        setJobAnalysis(data.jobAnalysis || { requested: Boolean(jobDescription.trim() || jobUrl.trim()), sourceRead: Boolean(data.jobSource), sourceType: null });
      } else {
        const apiError = await aiResponse.json().catch(() => ({}));
        if (apiError.code === "INVALID_CV_CONTENT") {
          const invalidCvError = new Error(apiError.error);
          invalidCvError.code = apiError.code;
          throw invalidCvError;
        }
        if (!result.text.trim()) throw new Error(apiError.error || "Este PDF no contiene texto seleccionable y Claude no está disponible.");
        generatedLatex = makeLatex(result.text);
        setLatex(generatedLatex);
        setOriginalLatex(generatedLatex);
        withViewTransition(() => {
          if (apiError.code !== "CLAUDE_NOT_CONFIGURED") setError(`Claude no estuvo disponible; usamos el extractor local. ${apiError.error || ""}`.trim());
          setStatus("ready");
          setPhase("result");
        }, "step");
        return;
      }
      setStatus("context-ready");
    } catch (err) {
      if (flowId !== flowIdRef.current) return;
      const backToUpload = err.code === "INVALID_CV_CONTENT";
      withViewTransition(() => {
        setStatus("error");
        setPhase(backToUpload ? "upload" : "context");
        if (backToUpload) {
          setFile(null);
          if (inputRef.current) inputRef.current.value = "";
        }
        setQueuedContext(null);
        setError(err.message || "No pudimos leer este PDF. Probá con otro archivo.");
      }, backToUpload ? "collapse" : "step");
    }
  }, [jobDescription, jobUrl]);

  const runImprovement = useCallback(async (cv, context) => {
    const flowId = flowIdRef.current;
    setStatus("improving");
    setError("");
    try {
      const response = await fetch("/api/improve-cv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cv,
          targetRole: context.targetRole,
          jobUrl: context.mode === "url" ? context.jobUrl : "",
          jobDescription: "",
          additionalInformation: context.mode === "manual" ? context.additionalInformation : ""
        })
      });
      const data = await response.json();
      if (flowId !== flowIdRef.current) return;
      if (!response.ok) throw new Error(data.error || "No pudimos mejorar el CV.");
      const improvedCv = data.cv;
      const generatedLatex = makeLatexFromCv(improvedCv);
      withViewTransition(() => {
        setImprovementAnalysis(data.analysis || { changes: [], questions: [] });
        setQuestionAnswers({});
        setQuestionQuickAnswers({});
        setJobAnalysis(data.jobAnalysis || { requested: false, sourceRead: false, sourceType: null });
        setWorkingCv(improvedCv);
        setLatex(generatedLatex);
        setJobKeywords(Array.isArray(improvedCv.jobKeywords) ? improvedCv.jobKeywords : []);
        setStatus("ready");
        setPhase("result");
        setWorkflowStep(3);
        setIterationComplete(false);
        setQueuedContext(null);
        const nextVersion = { id: Date.now(), file: file.name, role: context.targetRole.trim(), mode: "Optimizado", latex: generatedLatex, createdAt: new Date().toISOString() };
        setVersions((current) => {
          const updated = [nextVersion, ...current].slice(0, 5);
          window.localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
      }, "step");
    } catch (err) {
      if (flowId !== flowIdRef.current) return;
      withViewTransition(() => {
        setStatus("context-ready");
        setPhase("context");
        setQueuedContext(null);
        if (context.mode === "url" && context.jobUrl.trim()) setJobInputMode("manual");
        setError(err.message || "No pudimos preparar la mejora.");
      }, "step");
    }
  }, [file]);

  useEffect(() => {
    if (!originalCv || !queuedContext || status !== "context-ready") return;
    runImprovement(originalCv, queuedContext);
  }, [originalCv, queuedContext, runImprovement, status]);

  const continueWithContext = (event, skipObjective = false) => {
    event.preventDefault();
    const hasObjective = !skipObjective && Boolean(
      jobInputMode === "url" ? jobUrl.trim() : targetRole.trim()
    );
    const context = skipObjective ? {
      mode: "general",
      hasObjective: false,
      jobUrl: "",
      targetRole: "",
      additionalInformation: "",
      allowImprovement: true
    } : {
      mode: jobInputMode,
      hasObjective,
      jobUrl: jobInputMode === "url" ? jobUrl : "",
      targetRole: jobInputMode === "manual" ? targetRole : "",
      additionalInformation: jobInputMode === "manual" ? additionalInformation : "",
      allowImprovement: true
    };
    withViewTransition(() => {
      setQueuedContext(context);
      setPhase("waiting");
    }, "step");
  };

  const applyRevisionFeedback = async () => {
    const answeredQuestions = improvementAnalysis.questions
      .map((question, index) => {
        const key = question.id || index;
        const quick = String(questionQuickAnswers[key] || "").trim();
        const detail = String(questionAnswers[key] || "").trim();
        return { question: question.question, answer: [quick, detail].filter(Boolean).join(". Aclaración: ") };
      })
      .filter((item) => item.answer);
    const revisionParts = answeredQuestions.map((item) => `${item.question}\nRespuesta confirmada por el usuario: ${item.answer}`);
    if (feedbackNote.trim()) revisionParts.push(`Información o pedido adicional del usuario:\n${feedbackNote.trim()}`);
    const revisionRequest = revisionParts.join("\n\n");
    if (!workingCv || !revisionRequest) return;
    setStatus("revising");
    setError("");
    const flowId = flowIdRef.current;
    try {
      const response = await fetch("/api/improve-cv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cv: workingCv, revisionFeedback: revisionRequest })
      });
      const data = await response.json();
      if (flowId !== flowIdRef.current) return;
      if (!response.ok) throw new Error(data.error || "No pudimos aplicar el feedback.");
      const generatedLatex = makeLatexFromCv(data.cv);
      setWorkingCv(data.cv);
      setLatex(generatedLatex);
      setJobKeywords(Array.isArray(data.cv.jobKeywords) ? data.cv.jobKeywords : []);
      setImprovementAnalysis(data.analysis || { changes: [], questions: [] });
      setQuestionAnswers({});
      setQuestionQuickAnswers({});
      setFeedbackNote("");
      setFeedback(null);
      setWorkflowStep(4);
      setIterationComplete(true);
      setStatus("ready");
    } catch (err) {
      if (flowId !== flowIdRef.current) return;
      setStatus("ready");
      setError(err.message || "No pudimos aplicar el feedback.");
    }
  };

  const drop = (event) => {
    event.preventDefault();
    setDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const atsAudit = useMemo(() => status === "ready" ? calculateAtsAudit(latex, jobKeywords) : { technicalScore: 0, matchScore: null, checks: [], keywordCheck: null, inferred: [] }, [status, latex, jobKeywords]);
  const perfectMatch = atsAudit.technicalScore === 100 && atsAudit.matchScore === 100;
  const keywordLabels = useMemo(() => jobKeywords.map((item) => typeof item === "object" && item ? item.term : item).filter(Boolean), [jobKeywords]);
  const diffSummary = useMemo(() => getDiffSummary(originalLatex, latex), [originalLatex, latex]);
  const iterationSteps = [...improvementAnalysis.questions, { id: "freeform", question: "¿Hay algo más que quieras agregar o cambiar?", why: "Podés sumar información verdadera que no hayamos preguntado o pedir un ajuste de redacción.", freeform: true }];
  const activeQuestion = iterationSteps[activeQuestionIndex] || iterationSteps[iterationSteps.length - 1];
  const preview = useMemo(() => {
    const name = latex.match(/\\LARGE\\bfseries\s+([^}]*)}/)?.[1] || "Tu Nombre";
    const headerBlock = latex.match(/\\LARGE\\bfseries[^]*?}\\\\\[\d+pt\]\s*([^]*?)\\hrule/)?.[1] || "";
    const headerLines = headerBlock.split("\n")
      .map((line) => line.trim().replace(/\\\\(?:\[\d+pt\])?$/, ""))
      .filter(Boolean);
    const content = latex.split("\\vspace{8pt}")[1]?.split("\\end{document}")[0] || "";
    const sections = [];
    let current = { title: "", lines: [] };

    content.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const section = line.match(/^\\section\*\{(.*)}$/);
      if (section) {
        if (current.title || current.lines.length) sections.push(current);
        current = { title: section[1], lines: [] };
      } else if (!/^\\(?:begin|end|vspace)/.test(line)) {
        const type = /^\\item\s+/.test(line) ? "bullet" : /\\textbf\{/.test(line) ? "heading" : /\\textit\{/.test(line) ? "subheading" : "body";
        const readable = line
          .replace(/^\\item\s+/, "• ")
          .replace(/\\textbf\{([^}]*)}/g, "$1")
          .replace(/\\textit\{([^}]*)}/g, "$1")
          .replace(/\\href\{[^}]*}\{([^}]*)}/g, "$1")
          .replace(/\s*\\hfill\s*/, "  ·  ")
          .replace(/\\\\(?:\[\d+pt])?$/, "");
        if (readable) current.lines.push({ text: readable, type });
      }
    });
    if (current.title || current.lines.length) sections.push(current);

    const clean = (value) => value
      .replaceAll("\\&", "&").replaceAll("\\%", "%").replaceAll("\\$", "$")
      .replaceAll("\\#", "#").replaceAll("\\_", "_").replaceAll("\\{", "{")
      .replaceAll("\\}", "}").replaceAll("\\textasciitilde{}", "~")
      .replaceAll("\\textasciicircum{}", "^").replaceAll("\\textbackslash{}", "\\");
    return {
      name: clean(name),
      headerLines: headerLines.map(clean),
      contact: headerLines.map(clean).join(" · "),
      sections: sections.map((s) => ({ ...s, title: clean(s.title), lines: s.lines.map((line) => ({ ...line, text: clean(line.text) })) }))
    };
  }, [latex]);

  const downloadPdf = async () => {
    setPdfStatus("generating");
    setPdfError("");

    try {
      const { jsPDF } = await import("jspdf");
      const document = new jsPDF({ unit: "mm", format: "a4", compress: true });
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      const ink = [29, 39, 34];
      const muted = [92, 104, 97];
      const accent = [75, 99, 85];
      let y = 20;

      const ensureSpace = (height) => {
        if (y + height <= pageHeight - margin) return;
        document.addPage();
        y = margin;
      };

      const writeText = (text, { fontSize = 9.2, style = "normal", color = ink, x = margin, width = contentWidth, lineHeight = 4.5 } = {}) => {
        document.setFont("helvetica", style);
        document.setFontSize(fontSize);
        document.setTextColor(...color);
        const wrapped = document.splitTextToSize(text, width);
        ensureSpace(wrapped.length * lineHeight);
        document.text(wrapped, x, y);
        y += wrapped.length * lineHeight;
      };

      writeText(preview.name, { fontSize: 23, style: "bold", lineHeight: 8 });
      preview.headerLines.forEach((line, index) => writeText(line, {
        fontSize: index === 0 && preview.headerLines.length > 1 ? 9.5 : 8.5,
        style: index === 0 && preview.headerLines.length > 1 ? "bold" : "normal",
        color: muted,
        lineHeight: 4.6
      }));
      y += 2;
      document.setDrawColor(...accent);
      document.setLineWidth(0.45);
      document.line(margin, y, pageWidth - margin, y);
      y += 8;

      preview.sections.forEach((section) => {
        ensureSpace(16);
        if (section.title) {
          writeText(section.title.toUpperCase(), { fontSize: 10, style: "bold", color: accent, lineHeight: 5 });
          document.setDrawColor(205, 211, 207);
          document.setLineWidth(0.18);
          document.line(margin, y - 1.2, pageWidth - margin, y - 1.2);
          y += 3;
        }
        section.lines.forEach((line, index) => {
          if (line.type === "heading") {
            if (index > 0) y += 2.4;
            const [label, date = ""] = line.text.split(/\s{2}·\s{2}/);
            const dateWidth = date ? Math.min(38, document.getTextWidth(date) + 2) : 0;
            document.setFont("helvetica", "bold");
            document.setFontSize(9.5);
            const wrapped = document.splitTextToSize(label, contentWidth - dateWidth - 3);
            ensureSpace(Math.max(5, wrapped.length * 4.5));
            document.setTextColor(...ink);
            document.text(wrapped, margin, y);
            if (date) {
              document.setFont("helvetica", "normal");
              document.setFontSize(8.5);
              document.setTextColor(...muted);
              document.text(date, pageWidth - margin, y, { align: "right" });
            }
            y += wrapped.length * 4.5 + 1;
          } else if (line.type === "bullet") {
            document.setFont("helvetica", "normal");
            document.setFontSize(9.1);
            const bulletText = line.text.replace(/^•\s*/, "");
            const wrapped = document.splitTextToSize(bulletText, contentWidth - 5);
            ensureSpace(wrapped.length * 4.35);
            document.setFillColor(...accent);
            document.circle(margin + 1, y - 1.05, 0.55, "F");
            document.setTextColor(...ink);
            document.text(wrapped, margin + 4, y);
            y += wrapped.length * 4.35 + 0.55;
          } else {
            writeText(line.text, {
              fontSize: line.type === "subheading" ? 8.8 : 9.2,
              style: line.type === "subheading" ? "italic" : "normal",
              color: line.type === "subheading" ? muted : ink,
              lineHeight: 4.5
            });
            y += 0.8;
          }
        });
        y += 5;
      });

      document.setProperties({
        title: `${preview.name} - CV ATS`,
        subject: "Curriculum vitae optimizado para ATS",
        creator: "Trama"
      });
      document.save(`${file?.name.replace(/\.pdf$/i, "") || "cv"}-ats.pdf`);
      setPdfStatus("idle");
    } catch {
      setPdfStatus("error");
      setPdfError("No pudimos generar el PDF. Intentá nuevamente en unos segundos.");
    }
  };

  const generateCoverLetter = async () => {
    if (!workingCv || !jobUrl.trim()) return;
    setCoverLetterStatus("generating");
    setCoverLetterError("");
    const flowId = flowIdRef.current;
    try {
      const response = await fetch("/api/generate-cover-letter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cv: workingCv, jobUrl: jobUrl.trim() })
      });
      const data = await response.json();
      if (flowId !== flowIdRef.current) return;
      if (!response.ok) throw new Error(data.error || "No pudimos generar la cover letter.");
      setCoverLetter(data.letter);
      setCoverLetterStatus("ready");
    } catch (err) {
      if (flowId !== flowIdRef.current) return;
      setCoverLetterStatus("error");
      setCoverLetterError(err.message || "No pudimos generar la cover letter.");
    }
  };

  const downloadCoverLetter = async () => {
    if (!coverLetter) return;
    const { jsPDF } = await import("jspdf");
    const document = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const margin = 24;
    const width = document.internal.pageSize.getWidth() - margin * 2;
    let y = 25;
    const write = (text, { size = 11, style = "normal", gap = 7 } = {}) => {
      document.setFont("helvetica", style);
      document.setFontSize(size);
      document.setTextColor(29, 39, 34);
      const lines = document.splitTextToSize(text, width);
      document.text(lines, margin, y);
      y += lines.length * 5.3 + gap;
    };
    write(coverLetter.senderName, { size: 19, style: "bold", gap: 4 });
    write(`${coverLetter.role} · ${coverLetter.company}`, { size: 9, gap: 14 });
    write(coverLetter.greeting, { gap: 7 });
    coverLetter.paragraphs.forEach((paragraph) => write(paragraph, { gap: 7 }));
    write(coverLetter.closing, { gap: 3 });
    write(coverLetter.senderName, { style: "bold" });
    document.setProperties({ title: `${coverLetter.senderName} - Cover letter - ${coverLetter.company}`, creator: "Trama" });
    const safeCompany = coverLetter.company.replace(/[^a-z0-9áéíóúñü]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    document.save(`cover-letter-${safeCompany || "empresa"}.pdf`);
  };

  const inFlow = phase !== "upload";

  return (
    <main className={inFlow ? "app-mode" : ""}>
      <nav className="nav">
        <a className="brand" href="#"><span className="brand-mark">T</span><span>trama</span></a>
        <div className="nav-actions">
          {inFlow ? <button type="button" className="restart-flow" onClick={resetFlow}><RotateCcw size={14} /> Empezar de nuevo</button> : null}
          {!inFlow ? <a className="nav-link" href="#como-funciona">Cómo funciona <ArrowDown size={15} /></a> : null}
        </div>
      </nav>

      <section className="hero">
        {!inFlow ? <>
          <div className="eyebrow"><Sparkles size={14} /> OPTIMIZACIÓN DE CV PARA ATS</div>
          <h1>Tu experiencia merece<br />llegar a la <em>entrevista.</em></h1>
          <p className="hero-copy">Analizamos tu CV, mejoramos su redacción y lo preparamos para que los sistemas de selección y los reclutadores entiendan mejor el valor de tu experiencia.</p>

          <aside className="ats-explainer">
            <span>¿Qué es un ATS?</span>
            <p>Es el sistema que muchas empresas usan para recibir, ordenar y filtrar currículums antes de que lleguen a un reclutador.</p>
          </aside>
        </> : null}

        {phase === "upload" ? (
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => processFile(e.target.files?.[0])} />
            <div className="file-icon"><FileText size={31} strokeWidth={1.6} /><span>PDF</span></div>
            <h2>Empezá por tu CV actual</h2><p>Subilo en PDF y te mostramos cómo mejorarlo</p><button><Upload size={17} /> Mejorar mi CV</button><small>Máximo 10 MB · Lo procesamos solo para generar tu mejora</small>
          </div>
        ) : phase === "context" ? (
          <form className="context-step" onSubmit={continueWithContext}>
            <div className="flow-progress" aria-label="Progreso">
              <span className="done"><Check size={13} /> CV</span><i /><span className="active">02 Objetivo</span><i /><span>03 CV mejorado</span><i /><span>04 Seguir mejorando</span><i /><span>05 Final</span>
            </div>
            <div className="analysis-status" aria-live="polite">
              <span className={status === "reading" ? "status-pulse" : "status-check"}>{status === "reading" ? null : <Check size={13} />}</span>
              <div><strong>{status === "reading" ? "Estamos analizando tu CV en segundo plano" : "Tu CV ya está listo para comparar"}</strong><small>{file?.name} · podés completar el objetivo mientras avanzamos</small></div>
            </div>
            <div className="context-heading"><span className="kicker">PASO 02 · OBJETIVO</span><h2>¿Para qué oportunidad querés preparar tu CV?</h2><p>Elegí una oferta pública o contanos manualmente qué estás buscando.</p></div>
            <fieldset className="job-source">
              <legend><FileText size={14} /> Contexto de la búsqueda</legend>
              <div className="job-tabs" role="tablist" aria-label="Cómo agregar la oferta">
                <button type="button" role="tab" aria-selected={jobInputMode === "url"} className={jobInputMode === "url" ? "active" : ""} onClick={() => { setJobInputMode("url"); setError(""); }}>Tengo una oferta <span>Más rápido</span></button>
                <button type="button" role="tab" aria-selected={jobInputMode === "manual"} className={jobInputMode === "manual" ? "active" : ""} onClick={() => { setJobInputMode("manual"); setError(""); }}>Definir mi objetivo</button>
              </div>
              <div className="job-tab-panel" role="tabpanel">
                {jobInputMode === "url" ? (
                  <label><span className="sr-only">URL pública de la oferta</span><input type="url" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} placeholder="https://empresa.com/jobs/product-designer" maxLength={500} /><small>Debe ser una página pública. Si el sitio bloquea la lectura, te pediremos completar el objetivo manualmente.</small></label>
                ) : (
                  <div className="manual-objective">
                    <label><span><Target size={13} /> Puesto objetivo</span><input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Ej. Senior Product Designer" maxLength={120} /></label>
                    <label><span><Sparkles size={13} /> Información verdadera que no figura en el PDF</span><textarea value={additionalInformation} onChange={(event) => setAdditionalInformation(event.target.value)} placeholder="Ej. Lideré un equipo de 6 personas o mejoramos la conversión un 18%." maxLength={4000} rows={4} /><small>Usaremos únicamente la información que confirmes como verdadera.</small></label>
                  </div>
                )}
              </div>
            </fieldset>
            <div className="improvement-guarantee"><Check size={15} /><span><strong>La primera mejora está incluida</strong><small>Reescribimos y priorizamos sin inventar experiencia ni métricas.</small></span></div>
            <div className="context-actions">
              <button type="button" className="back-button" onClick={resetFlow}>Cambiar PDF</button>
              <div className="context-primary-actions">
                <button type="button" className="skip-button" disabled={status === "error"} onClick={(event) => continueWithContext(event, true)}>Saltar este paso</button>
                <button type="submit" className="continue-button" disabled={status === "error"}>Continuar<ArrowRight size={16} /></button>
              </div>
            </div>
          </form>
        ) : phase === "waiting" ? (
          <section className="context-step waiting-step" aria-live="polite">
            <div className="flow-progress" aria-label="Progreso"><span className={originalCv ? "done" : "active"}>{originalCv ? <Check size={13} /> : null} CV</span><i /><span className="done"><Check size={13} /> {queuedContext?.hasObjective ? "Objetivo" : "Sin objetivo"}</span><i /><span className={originalCv ? "active" : ""}>03 CV mejorado</span><i /><span>04 Seguir mejorando</span><i /><span>05 Final</span></div>
            <div className="waiting-orbit"><Sparkles size={24} /></div>
            <span className="kicker">PASO 03 · PREPARANDO EL RECORRIDO</span>
            <h2>{originalCv ? queuedContext?.hasObjective ? "Estamos cruzando tu experiencia con el objetivo." : "Estamos mejorando tu CV de forma general." : "Seguimos analizando tu CV."}</h2>
            <p>{originalCv ? queuedContext?.hasObjective ? "El CV y tu contexto ya están listos. Estamos preparando las mejoras." : "Nos enfocamos en claridad, evidencia y compatibilidad ATS sin orientarlo a una oportunidad específica." : queuedContext?.hasObjective ? "Tu objetivo ya quedó guardado. En cuanto termine la lectura del PDF, continuamos automáticamente." : "En cuanto termine la lectura del PDF, aplicaremos una mejora general automáticamente."}</p>
            <div className="waiting-lines"><i /><i /><i /></div>
          </section>
        ) : phase === "result" ? (
          <section className="context-step improvement-step" id="flujo-mejoras">
            <div className="flow-progress" aria-label="Progreso">
              <span className="done"><Check size={13} /> CV</span><i /><span className="done"><Check size={13} /> Objetivo</span><i /><span className={workflowStep > 3 ? "done" : "active"}>{workflowStep > 3 ? <Check size={13} /> : null} 03 CV mejorado</span><i /><span className={workflowStep === 4 ? "active" : workflowStep > 4 ? "done" : ""}>04 Seguir mejorando</span><i /><span className={workflowStep === 5 ? "active" : ""}>05 Final</span>
            </div>
            <div className={`improvement-content ${status === "revising" ? "is-loading" : ""}`}>
              {status === "revising" ? <div className="revision-loading" aria-live="polite"><div className="waiting-orbit"><Sparkles size={24} /></div><span className="kicker">PASO 04 · GENERANDO OTRA VERSIÓN</span><h2>Estamos incorporando tus respuestas.</h2><p>Contrastamos cada dato con el CV y recalculamos las mejoras sin inventar información.</p><div className="waiting-lines"><i /><i /><i /></div></div> : null}
              <span className="kicker">{workflowStep === 3 ? "PASO 03 · CV MEJORADO" : workflowStep === 4 ? iterationComplete ? perfectMatch ? "PASO 04 · OBJETIVO ALCANZADO" : "PASO 04 · NUEVA ITERACIÓN" : "PASO 04 · SEGUIR MEJORANDO" : "PASO 05 · CONFIRMACIÓN FINAL"}</span>
              <h2>{workflowStep === 3 ? "Ya mejoramos tu CV." : workflowStep === 4 ? iterationComplete ? perfectMatch ? "Llegamos a la versión ideal para esta oportunidad." : "La nueva versión ya está lista." : "Hagamos una nueva iteración." : "Tu CV ya está listo."}</h2>
              <p>{workflowStep === 3 ? "Esta versión ya incorpora la mejora inicial. Revisá el resultado y decidí si está lista o si querés seguir iterando." : workflowStep === 4 ? iterationComplete ? perfectMatch ? "El CV supera todos los controles ATS y respalda todos los requisitos detectados en la oferta." : "Revisá cómo cambió el resultado. Podés seguir iterando o confirmar que esta versión está lista." : "Trabajá sobre el feedback de los agentes o pedí un ajuste propio sin salir de este paso." : "Podés revisar y descargar el documento. Si todavía querés cambiar algo, volvé al paso anterior; esta versión ya está preparada para usar."}</p>
              {workflowStep === 4 && iterationComplete && perfectMatch ? <div className="perfect-result"><span><Check size={18} /></span><div><strong>100/100 ATS · 100/100 coincidencia</strong><small>Todos los controles y requisitos detectados están cubiertos.</small></div></div> : null}
              {workflowStep === 3 || workflowStep === 4 && iterationComplete ? <div className={`step-results ${atsAudit.matchScore === null ? "without-match" : ""}`}>
                <article><span>Lectura ATS</span><strong>{atsAudit.technicalScore}<small>/100</small></strong><p>{atsAudit.checks.filter((check) => check.pass).length} de {atsAudit.checks.length} controles superados</p></article>
                {atsAudit.matchScore !== null ? <article><span>Coincidencia</span><strong>{atsAudit.matchScore}<small>/100</small></strong><p>{atsAudit.matched.length} requisitos respaldados</p></article> : null}
                <article><span>Cambios</span><strong>{improvementAnalysis.changes.length || diffSummary.changed}</strong><p>{improvementAnalysis.changes.length || diffSummary.changed ? "mejoras explicadas en esta versión" : "sin cambios de contenido"}</p></article>
              </div> : null}
              {(workflowStep === 3 || workflowStep === 4 && iterationComplete) && improvementAnalysis.changes.length ? <details className="step-explanation"><summary><span>Qué cambió en esta versión</span><small>{improvementAnalysis.changes.length} cambios</small></summary><div>{improvementAnalysis.changes.map((change, index) => <article key={`${change.section}-${index}`}><span>{change.section || "Contenido"}</span><div><small>Antes</small><p>{change.before || "—"}</p></div><div><small>Después</small><p>{change.after || "—"}</p></div><strong>{change.reason}</strong></article>)}</div></details> : null}
              {(workflowStep === 3 || workflowStep === 4 && iterationComplete) && atsAudit.matchScore !== null ? <details className="step-explanation match-explanation"><summary><span>Cómo calculamos la coincidencia</span><small>{atsAudit.matchScore}/100</small></summary><div className="match-breakdown"><p><strong>{atsAudit.matched.length}</strong><span>requisitos respaldados</span></p><p><strong>{atsAudit.missing.length}</strong><span>ausentes o sin evidencia</span></p><small>El puntaje es el porcentaje de requisitos detectados en la oferta que aparecen explícitamente, mediante una equivalencia clara o con evidencia suficiente en el CV.</small>{atsAudit.matched.length ? <div><b>Cubiertos</b>{atsAudit.matched.join(" · ")}</div> : null}{atsAudit.missing.length ? <div><b>Por trabajar</b>{atsAudit.missing.join(" · ")}</div> : null}</div></details> : null}
              {(workflowStep === 3 || workflowStep === 4 && iterationComplete) && atsAudit.checks.some((check) => !check.pass) ? <div className="step-findings"><strong>Feedback de los agentes</strong>{atsAudit.checks.filter((check) => !check.pass).slice(0, 3).map((check) => <p key={check.label}><X size={13} /><span>{check.label}<small>{check.fix}</small></span></p>)}</div> : null}
              {workflowStep === 4 && !iterationComplete && activeQuestion ? <div className="agent-questions question-stepper">
                <div className="question-head"><div><strong>{activeQuestion.freeform ? "Información adicional" : "Preguntas para aumentar la coincidencia"}</strong><p>{activeQuestion.freeform ? "Este último campo siempre es opcional." : "Respondé sólo lo que puedas confirmar."}</p></div><div className="question-counter"><span>{activeQuestionIndex + 1} / {iterationSteps.length}</span>{!activeQuestion.freeform ? <button type="button" onClick={() => setActiveQuestionIndex(iterationSteps.length - 1)}>Saltar todas</button> : null}</div></div>
                <div className="question-progress" aria-label={`Paso ${activeQuestionIndex + 1} de ${iterationSteps.length}`}>{iterationSteps.map((question, index) => { const key = question.id || index; const answered = question.freeform ? feedbackNote.trim() : questionQuickAnswers[key] || questionAnswers[key]?.trim(); return <i key={key} className={index === activeQuestionIndex ? "active" : answered ? "answered" : index < activeQuestionIndex ? "skipped" : ""} />; })}</div>
                <div className="question-card"><span>{String(activeQuestionIndex + 1).padStart(2, "0")}</span><div><strong>{activeQuestion.question}</strong>{activeQuestion.why ? <small>{activeQuestion.why}</small> : null}{activeQuestion.freeform ? <textarea value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} placeholder="Más datos, contexto o cambios que quieras pedir…" rows={4} autoFocus /> : <><div className="quick-answers" role="group" aria-label="Respuesta rápida"><button type="button" aria-pressed={questionQuickAnswers[activeQuestion.id || activeQuestionIndex] === "Sí"} className={questionQuickAnswers[activeQuestion.id || activeQuestionIndex] === "Sí" ? "selected" : ""} onClick={() => { setQuestionQuickAnswers((current) => ({ ...current, [activeQuestion.id || activeQuestionIndex]: "Sí" })); setActiveQuestionIndex((index) => Math.min(iterationSteps.length - 1, index + 1)); }}><Check size={14} /> Sí</button><button type="button" aria-pressed={questionQuickAnswers[activeQuestion.id || activeQuestionIndex] === "No"} className={questionQuickAnswers[activeQuestion.id || activeQuestionIndex] === "No" ? "selected" : ""} onClick={() => { setQuestionQuickAnswers((current) => ({ ...current, [activeQuestion.id || activeQuestionIndex]: "No" })); setActiveQuestionIndex((index) => Math.min(iterationSteps.length - 1, index + 1)); }}><X size={14} /> No</button></div><details className="answer-details" open={Boolean(questionAnswers[activeQuestion.id || activeQuestionIndex])}><summary>Agregar contexto</summary><textarea value={questionAnswers[activeQuestion.id || activeQuestionIndex] || ""} onChange={(event) => setQuestionAnswers((current) => ({ ...current, [activeQuestion.id || activeQuestionIndex]: event.target.value }))} placeholder="Aclaración opcional…" rows={3} /></details></>}</div></div>
                <div className="question-actions">
                  <button type="button" disabled={activeQuestionIndex === 0} onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}>Anterior</button>
                  {activeQuestionIndex < iterationSteps.length - 1 ? <><button type="button" onClick={() => setActiveQuestionIndex((index) => index + 1)}>Omitir</button><button type="button" onClick={() => setActiveQuestionIndex((index) => index + 1)}>Siguiente <ArrowRight size={14} /></button></> : <button type="button" onClick={() => (feedbackNote.trim() || Object.values(questionQuickAnswers).some(Boolean) || Object.values(questionAnswers).some((answer) => String(answer).trim())) ? applyRevisionFeedback() : setIterationComplete(true)}>{feedbackNote.trim() || Object.values(questionQuickAnswers).some(Boolean) || Object.values(questionAnswers).some((answer) => String(answer).trim()) ? "Generar nueva versión" : "Omitir y continuar"}</button>}
                </div>
              </div> : null}
              <div className="step-feedback">
                <button className="step-back" onClick={() => workflowStep === 3 ? withViewTransition(() => { setPhase("context"); setStatus("context-ready"); }, "step") : workflowStep === 5 ? (setWorkflowStep(4), setIterationComplete(true)) : iterationComplete ? setWorkflowStep(3) : setWorkflowStep(3)}>← Volver</button>
                {workflowStep === 3 ? <><button onClick={() => setWorkflowStep(5)}><Check size={15} /> Esta versión está lista</button><button onClick={() => { setActiveQuestionIndex(0); setIterationComplete(false); setWorkflowStep(4); }}><Sparkles size={15} /> Seguir mejorando</button></> : null}
                {workflowStep === 4 && iterationComplete ? <><button onClick={() => setWorkflowStep(5)}><Check size={15} /> {perfectMatch ? "Confirmar versión ideal" : "Este CV está listo"}</button>{!perfectMatch ? <button onClick={() => { setActiveQuestionIndex(0); setIterationComplete(false); }}><Sparkles size={15} /> Seguir iterando</button> : null}</> : null}
                <a href="#preview-document"><FileText size={15} /> Revisar preview</a>
              </div>
            </div>
          </section>
        ) : null}
        {error && <div className="error"><X size={17} />{error}</div>}
        {!inFlow ? <div className="trust"><span><LockKeyhole size={15} /> Tus datos están protegidos</span><span><Check size={15} /> No inventamos experiencia</span><span><FileText size={15} /> Preparado para filtros ATS</span></div> : null}
      </section>

      {status === "ready" && (
        <section className="result" id="resultado">
          <div className="result-stepper"><a href="#flujo-mejoras">Volver al flujo</a><span>CV <Check size={12} /></span><i /><span>Objetivo <Check size={12} /></span><i /><span className={workflowStep === 3 ? "active" : ""}>CV mejorado</span><i /><span className={workflowStep === 4 ? "active" : ""}>Seguir mejorando</span><i /><span className={workflowStep === 5 ? "active" : ""}>Final</span></div>
          {false ? <>
          <div className="result-head">
            <div><span className="kicker">TU CV MEJORADO ESTÁ LISTO</span><h2>Tu experiencia ahora se entiende mejor.</h2><p>{file.name} · {pages || "—"} {pages === 1 ? "página" : "páginas"} · {allowImprovement && targetRole.trim() ? `preparado para ${targetRole.trim()}` : "preparado para sistemas de selección"}</p></div>
            <div className="scores"><div className="score" title={`${atsAudit.checks.filter((check) => check.pass).length}/${atsAudit.checks.length} controles de lectura superados`}><strong>{atsAudit.technicalScore}</strong><span>/100<br />compatibilidad ATS</span></div>{atsAudit.matchScore !== null ? <div className="score match-score" title="Cobertura de requisitos de la oferta"><strong>{atsAudit.matchScore}</strong><span>/100<br />coincidencia oferta</span></div> : null}</div>
          </div>
          {evaluation ? (
            <section className="agent-panel" aria-labelledby="agent-verdict-title">
              <div className="agent-verdict">
                <div className="verdict-score"><strong>{evaluation.score}</strong><span>/100</span></div>
                <div>
                  <span className="agent-label">EVALUACIÓN DE TU PERFIL · {evaluation.agentsUsed?.length || 0} PERSPECTIVAS</span>
                  <h3 id="agent-verdict-title">{evaluation.decisionLabel || "Veredicto del panel"}</h3>
                  <p>{evaluation.scoreReason}</p>
                </div>
              </div>
              {evaluation.superSummary?.length > 0 ? (
                <blockquote className="super-summary">
                  <span>Tu perfil en tres líneas</span>
                  {evaluation.superSummary.slice(0, 3).map((line, index) => <p key={index}>{line}</p>)}
                  {evaluation.whyHire ? <div className="why-hire"><strong>Por qué contratarte</strong>{evaluation.whyHire}</div> : null}
                </blockquote>
              ) : null}
              <div className="agent-columns">
                <article>
                  <span className="agent-label">SEÑALES A FAVOR</span>
                  <ul>{evaluation.hireSignals?.map((signal, index) => <li key={index}><Check size={14} /> <span>{signal}</span></li>)}</ul>
                </article>
                <article>
                  <span className="agent-label">RIESGOS DE RECHAZO</span>
                  <ul>{evaluation.rejectionRisks?.map((item, index) => <li key={index} className={`severity-${item.severity}`}><X size={14} /><span><strong>{item.risk}</strong><small>{item.fix}</small></span></li>)}</ul>
                </article>
              </div>
              {evaluation.quantificationOpportunities?.length > 0 ? (
                <details className="agent-details">
                  <summary><span>Oportunidades para demostrar impacto</span><small>{evaluation.quantificationOpportunities.length} preguntas para completar</small></summary>
                  <div className="quant-grid">{evaluation.quantificationOpportunities.map((item, index) => <article key={index}><span className={`priority priority-${item.priority}`}>{item.priority}</span><p>{item.original}</p><strong>{item.question}</strong><small>Plantilla: {item.rewriteTemplate}</small></article>)}</div>
                </details>
              ) : null}
              {evaluation.prioritizedChanges?.length > 0 ? (
                <details className="agent-details">
                  <summary><span>Plan de mejora priorizado</span><small>{evaluation.prioritizedChanges.length} acciones</small></summary>
                  <ol className="change-plan">{evaluation.prioritizedChanges.map((item, index) => <li key={index}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{item.title}</strong><small>{item.reason}</small></span><em className={`priority priority-${item.priority}`}>{item.priority}</em></li>)}</ol>
                </details>
              ) : null}
            </section>
          ) : null}
          <details className="audit-details">
            <summary><span>Qué tan fácil es leer tu CV</span><small>{atsAudit.checks.filter((check) => check.pass).length}/{atsAudit.checks.length} controles superados</small></summary>
            <div className="audit-grid">{atsAudit.checks.map((check) => <div className={check.pass ? "audit-pass" : "audit-fail"} key={check.label}>{check.pass ? <Check size={14} /> : <X size={14} />}<span>{check.label}</span>{!check.pass && <small>{check.fix}</small>}</div>)}{atsAudit.keywordCheck && <div className={atsAudit.keywordCheck.pass ? "audit-pass" : "audit-fail"}>{atsAudit.keywordCheck.pass ? <Check size={14} /> : <X size={14} />}<span>{atsAudit.keywordCheck.label}</span>{!atsAudit.keywordCheck.pass && <small>{atsAudit.keywordCheck.fix}</small>}</div>}</div>
            {(jobAnalysis.requested || atsAudit.keywordCheck) && <div className="keyword-coverage">{atsAudit.keywordCheck ? <><p><strong>Requisitos detectados</strong>{keywordLabels.join(" · ")}</p><p><strong>Presentes en tu CV</strong>{atsAudit.matched.length ? atsAudit.matched.join(" · ") : "Ninguno detectado"}</p>{atsAudit.inferred.length > 0 && <p><strong>Equivalentes respaldados</strong>{atsAudit.inferred.map((item) => `${item.term}${item.evidence ? ` — ${item.evidence}` : ""}`).join(" · ")}</p>}<p><strong>Ausentes o sin respaldo</strong>{atsAudit.missing.length ? atsAudit.missing.join(" · ") : "Ninguno"}</p><small>Solo contamos coincidencias respaldadas por tu experiencia. Nunca agregamos requisitos que no puedas demostrar.</small></> : <><p><strong>Requisitos detectados</strong>Ninguno</p><small>{jobAnalysis.sourceRead ? "Leímos la oferta, pero no identificamos requisitos laborales confiables. Revisá el contenido y actualizá el análisis." : "No pudimos leer la oferta. Si el sitio bloquea el acceso, definí manualmente tu objetivo y actualizá el análisis."}</small></>}</div>}
          </details>
          {allowImprovement && diffSummary.changed > 0 && <details className="diff-details"><summary><span>Qué cambió en la mejora</span><small>{diffSummary.changed} líneas nuevas</small></summary><div className="diff-list">{diffSummary.lines.map((line, index) => <div key={index}><span>+</span><code>{line.replace(/\\\\(?:\[.*?\])?$/, "")}</code></div>)}</div></details>}
          {versions.length > 1 ? <div className="result-tools"><span /><details className="versions"><summary>Historial ({versions.length})</summary><div>{versions.map((version) => <button key={version.id} onClick={() => setLatex(version.latex)}><span>{version.mode} · {version.role || "sin puesto"}</span><small>{new Date(version.createdAt).toLocaleString("es-AR")}</small></button>)}</div></details></div> : null}
          <div className="reprocess-note">
            <span>¿Cambiaste algún ajuste?</span>
            <button type="button" onClick={() => processFile(file)} disabled={status === "reading"}><Sparkles size={14} /> Actualizar el análisis</button>
          </div>
          </> : null}
          <div className="workspace" id="preview-document">
            <div className="workspace-bar">
              <div className="workspace-title"><FileText size={14} /> Vista previa de tu CV mejorado</div>
              <div className="workspace-actions">
                {workflowStep === 5 ? <button className="download" onClick={downloadPdf} disabled={pdfStatus === "generating"}><Download size={15} /> {pdfStatus === "generating" ? "Generando PDF…" : "Descargar CV mejorado"}</button> : <a className="back-to-flow" href="#flujo-mejoras">Volver a la decisión</a>}
              </div>
            </div>
            {pdfError && <div className="pdf-error" role="alert"><X size={14} />{pdfError}</div>}
            <div className="workspace-content preview-only">
              <div className="preview-pane">
                <div className="pane-label"><i /> DOCUMENTO FINAL · A4</div>
                <div className="paper-wrap">
                  <article className="latex-paper">
                    <h1>{preview.name}</h1>
                    {preview.contact && <p className="paper-contact">{preview.contact}</p>}
                    <hr />
                    {preview.sections.map((section, index) => (
                      <section key={`${section.title}-${index}`}>
                        {section.title && <h2>{section.title}</h2>}
                        {section.lines.map((line, lineIndex) => <p className={`paper-${line.type}`} key={lineIndex}>{line.text}</p>)}
                      </section>
                    ))}
                  </article>
                </div>
              </div>
            </div>
          </div>
          {workflowStep === 5 && jobAnalysis.sourceType === "url" && jobUrl.trim() ? <section className={`cover-letter ${coverLetter ? "has-letter" : ""}`} aria-labelledby="cover-letter-title">
            <div className="cover-letter-intro">
              <span><Mail size={18} /></span>
              <div><small>ÚLTIMO PASO · OPCIONAL</small><h3 id="cover-letter-title">¿También necesitás una cover letter?</h3><p>Usamos la empresa, el puesto y los requisitos de la oferta que compartiste para preparar una carta coherente con este CV.</p></div>
              {!coverLetter ? <button type="button" onClick={generateCoverLetter} disabled={coverLetterStatus === "generating"}><Sparkles size={15} /> {coverLetterStatus === "generating" ? "Leyendo la oferta…" : "Generar cover letter"}</button> : null}
            </div>
            {coverLetterError ? <div className="cover-letter-error"><X size={14} />{coverLetterError}<button type="button" onClick={generateCoverLetter}>Reintentar</button></div> : null}
            {coverLetter ? <div className="cover-letter-document">
              <div className="cover-letter-meta"><span>PARA {coverLetter.company}</span><span>{coverLetter.role}</span></div>
              <article><h4>{coverLetter.senderName}</h4><p className="letter-target">{coverLetter.role} · {coverLetter.company}</p><p>{coverLetter.greeting}</p>{coverLetter.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<p>{coverLetter.closing}<br /><strong>{coverLetter.senderName}</strong></p></article>
              <div className="cover-letter-actions"><button type="button" onClick={generateCoverLetter} disabled={coverLetterStatus === "generating"}><Sparkles size={14} /> Regenerar</button><button type="button" className="download-letter" onClick={downloadCoverLetter}><Download size={14} /> Descargar PDF</button></div>
            </div> : null}
          </section> : null}
          {workflowStep === 5 ? <button className="new-file" onClick={resetFlow}><RotateCcw size={16} /> Empezar de nuevo</button> : null}
        </section>
      )}

      {!inFlow ? <section className="how" id="como-funciona">
        <div><span className="section-num">01—04</span><h2>De tu CV actual<br />a una versión más competitiva.</h2></div>
        <div className="steps">
          <article><b>01</b><h3>Analizamos</h3><p>Detectamos qué información pueden leer los sistemas de selección y qué partes pierden fuerza.</p></article>
          <article><b>02</b><h3>Mejoramos</h3><p>Reordenamos el contenido y reforzamos la redacción sin inventar experiencia.</p></article>
          <article><b>03</b><h3>Adaptamos</h3><p>Si compartís una oferta, priorizamos los requisitos que tu trayectoria realmente respalda.</p></article>
          <article><b>04</b><h3>Revisás</h3><p>Ves el resultado y descargás tu nuevo CV listo para postularte.</p></article>
        </div>
      </section> : null}

      {!inFlow ? <footer><a className="brand" href="#"><span className="brand-mark">T</span><span>trama</span></a><p>Tu experiencia ya tiene valor.<br />Trama ayuda a mostrarlo.</p><span>Hecho en Argentina · 2026</span></footer> : null}
    </main>
  );
}

export default App;
