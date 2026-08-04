"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowDown, ArrowRight, Check, ChevronDown, ClipboardPaste, Download,
  FileText, Link2, LockKeyhole, Mail, RotateCcw, Sparkles, Target, Trash2, Upload, X
} from "lucide-react";
import { calculateAtsAudit } from "./lib/ats";
import { countResumeBullets, createResumeDocument, resumeDocumentToPreview, resumeDocumentToText } from "./lib/resume-document";
import { deleteSavedResume, loadSavedResume, saveResume } from "./lib/resume-storage";
const makeRawTextPreview = (rawText) => {
  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  const name = lines[0] || "Tu Nombre";
  const contactLine = lines.slice(1, 3).join(" · ");
  const body = lines.slice(contactLine ? 3 : 1);
  const sectionMatcher = /^(experiencia|experience|educaci[oó]n|education|habilidades|skills|proyectos|projects|perfil|profile|resumen|summary|idiomas|languages)$/i;
  const sections = [];
  let current = { title: "", lines: [] };

  body.forEach((line) => {
    if (sectionMatcher.test(line.replace(/:$/, ""))) {
      if (current.title || current.lines.length) sections.push(current);
      current = { title: line.replace(/:$/, ""), lines: [] };
    } else {
      current.lines.push({ type: /^[•◦▪●‣-]\s+/.test(line) ? "bullet" : "body", text: line });
    }
  });
  if (current.title || current.lines.length) sections.push(current);

  return { name, headline: "", contactLine, contact: contactLine, headerLines: contactLine ? [contactLine] : [], sections };
};

const SETTINGS_STORAGE_KEY = "trama:conversion-settings";
const savedResumeDateFormatter = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

const isValidJobUrl = (value) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

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
  // ready y finished rechazan cuando una transición se saltea (p. ej. dos
  // seguidas); sin estos catch queda un "Uncaught (in promise)" en consola.
  transition.ready?.catch(() => {});
  transition.finished
    .catch(() => {})
    .finally(() => { delete document.documentElement.dataset.vtDirection; });
}

function App() {
  const inputRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const flowIdRef = useRef(0);
  const [phase, setPhase] = useState("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [pages, setPages] = useState(0);
  const [fallbackText, setFallbackText] = useState("");
  const [pdfStatus, setPdfStatus] = useState("idle");
  const [pdfError, setPdfError] = useState("");
  const allowImprovement = true;
  const [targetRole, setTargetRole] = useState("");
  const [resumeGoal, setResumeGoal] = useState(null);
  const [jobInputMode, setJobInputMode] = useState("url");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [pasteStatus, setPasteStatus] = useState("idle");
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [jobKeywords, setJobKeywords] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [originalCv, setOriginalCv] = useState(null);
  const [workingCv, setWorkingCv] = useState(null);
  const [queuedContext, setQueuedContext] = useState(null);
  const [jobAnalysis, setJobAnalysis] = useState({ requested: false, sourceRead: false, sourceType: null });
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
  const [previewOpen, setPreviewOpen] = useState(true);
  const [savedResume, setSavedResume] = useState(null);
  const [savedResumeHydrated, setSavedResumeHydrated] = useState(false);
  const [improvementSkipped, setImprovementSkipped] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setSavedResume(loadSavedResume(window.localStorage));
    setSavedResumeHydrated(true);
  }, []);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (deleteDialogOpen && !dialog.open) dialog.showModal();
    if (!deleteDialogOpen && dialog.open) dialog.close();
  }, [deleteDialogOpen]);

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
    if (!settingsHydrated) return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      allowImprovement,
      targetRole,
      jobDescription,
      jobUrl,
      additionalInformation
    }));
  }, [targetRole, jobDescription, jobUrl, additionalInformation, settingsHydrated]);

  const openSavedResume = useCallback((destination = "context") => {
    if (!savedResume) return;
    const savedFile = {
      name: savedResume.sourceFileName,
      size: savedResume.sourceFileSize,
      type: "application/pdf"
    };
    withViewTransition(() => {
      setFile(savedFile);
      setPages(savedResume.pages);
      setOriginalCv(savedResume.content);
      setWorkingCv(savedResume.content);
      setFallbackText("");
      setJobKeywords(Array.isArray(savedResume.content.jobKeywords) ? savedResume.content.jobKeywords : []);
      setEvaluation(null);
      setError("");
      setImprovementAnalysis({ changes: [], questions: [] });
      setImprovementSkipped(false);
      setWorkflowStep(3);
      setStatus(destination === "overview" ? "ready" : "context-ready");
      setPhase(destination === "overview" ? "overview" : "context");
      setPreviewOpen(true);
      setJobAnalysis({ requested: Boolean(jobDescription.trim() || jobUrl.trim()), sourceRead: false, sourceType: null });
    }, "expand");
  }, [jobDescription, jobUrl, savedResume]);

  const useSavedResume = useCallback(() => openSavedResume("context"), [openSavedResume]);
  const previewSavedResume = useCallback(() => openSavedResume("overview"), [openSavedResume]);

  const removeSavedResume = useCallback(() => {
    try {
      deleteSavedResume(window.localStorage);
      setSavedResume(null);
      setDeleteDialogOpen(false);
      setError("");
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("No pudimos borrar el CV guardado. Revisá los permisos del navegador e intentá nuevamente.");
      setDeleteDialogOpen(false);
    }
  }, []);

  const resetFlow = useCallback(() => {
    flowIdRef.current += 1;
    withViewTransition(() => {
      setPhase("upload");
      setDragging(false);
      setFile(null);
      setStatus("idle");
      setError("");
      setPages(0);
      setFallbackText("");
      setPdfStatus("idle");
      setPdfError("");
      setTargetRole("");
      setResumeGoal(null);
      setJobInputMode("url");
      setJobDescription("");
      setJobUrl("");
      setPasteStatus("idle");
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
      setPreviewOpen(true);
      setImprovementSkipped(false);
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
      setResumeGoal(null);
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
      setImprovementSkipped(false);
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
      if (aiResponse.ok) {
        const data = await aiResponse.json();
        setOriginalCv(data.cv);
        setWorkingCv(data.cv);
        setFallbackText("");
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
        setFallbackText(result.text);
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
      let persistedResume = null;
      try {
        persistedResume = saveResume(window.localStorage, { file, pages, content: improvedCv });
      } catch {
        // La mejora sigue disponible aunque el navegador bloquee el almacenamiento local.
      }
      withViewTransition(() => {
        if (persistedResume) setSavedResume(persistedResume);
        setImprovementAnalysis(data.analysis || { changes: [], questions: [] });
        setQuestionAnswers({});
        setQuestionQuickAnswers({});
        setJobAnalysis(data.jobAnalysis || { requested: false, sourceRead: false, sourceType: null });
        setWorkingCv(improvedCv);
        setFallbackText("");
        setJobKeywords(Array.isArray(improvedCv.jobKeywords) ? improvedCv.jobKeywords : []);
        setStatus("ready");
        setPhase("result");
        setWorkflowStep(3);
        setIterationComplete(false);
        setQueuedContext(null);
        setPreviewOpen(true);
      }, "step");
    } catch (err) {
      if (flowId !== flowIdRef.current) return;
      withViewTransition(() => {
        setStatus("context-ready");
        setPhase("context");
        setQueuedContext(null);
        if (context.mode === "url" && context.jobUrl.trim()) setJobInputMode("manual");
        if (context.mode === "general") setResumeGoal(null);
        setError(err.message || "No pudimos preparar la mejora.");
      }, "step");
    }
  }, [file]);

  const finishWithoutImprovement = useCallback((cv) => {
    let persistedResume = null;
    try {
      persistedResume = saveResume(window.localStorage, { file, pages, content: cv });
    } catch {
      // El CV sigue disponible en esta sesión aunque localStorage esté bloqueado.
    }
    withViewTransition(() => {
      if (persistedResume) setSavedResume(persistedResume);
      setWorkingCv(cv);
      setFallbackText("");
      setImprovementAnalysis({ changes: [], questions: [] });
      setJobKeywords(Array.isArray(cv.jobKeywords) ? cv.jobKeywords : []);
      setJobAnalysis({ requested: false, sourceRead: false, sourceType: null });
      setQueuedContext(null);
      setImprovementSkipped(true);
      setIterationComplete(true);
      setWorkflowStep(5);
      setStatus("ready");
      setPhase("result");
      setPreviewOpen(true);
    }, "step");
  }, [file, pages]);

  useEffect(() => {
    if (!originalCv || !queuedContext || status !== "context-ready") return;
    if (queuedContext.skipImprovement) {
      finishWithoutImprovement(originalCv);
      return;
    }
    runImprovement(originalCv, queuedContext);
  }, [finishWithoutImprovement, originalCv, queuedContext, runImprovement, status]);

  const continueWithContext = (event, improveGenerally = false) => {
    event.preventDefault();
    const hasValidObjective = jobInputMode === "url"
      ? isValidJobUrl(jobUrl)
      : Boolean(targetRole.trim());
    if (!improveGenerally && !hasValidObjective) {
      setError(jobInputMode === "url" ? "Pegá un link válido para personalizar tu CV." : "Ingresá el puesto objetivo para personalizar tu CV.");
      return;
    }
    const hasObjective = !improveGenerally && Boolean(
      jobInputMode === "url" ? jobUrl.trim() : targetRole.trim()
    );
    const context = improveGenerally ? {
      mode: "general",
      hasObjective: false,
      skipImprovement: false,
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
    withViewTransition(() => {
      setStatus("revising");
      setError("");
    }, "drawer");
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
      let persistedResume = null;
      try {
        persistedResume = saveResume(window.localStorage, { file, pages, content: data.cv });
      } catch {
        // La revisión sigue disponible aunque el navegador bloquee el almacenamiento local.
      }
      withViewTransition(() => {
        if (persistedResume) setSavedResume(persistedResume);
        setWorkingCv(data.cv);
        setFallbackText("");
        setJobKeywords(Array.isArray(data.cv.jobKeywords) ? data.cv.jobKeywords : []);
        setImprovementAnalysis(data.analysis || { changes: [], questions: [] });
        setQuestionAnswers({});
        setQuestionQuickAnswers({});
        setFeedbackNote("");
        setFeedback(null);
        setWorkflowStep(4);
        setIterationComplete(true);
        setStatus("ready");
        setPreviewOpen(true);
      }, "drawer");
    } catch (err) {
      if (flowId !== flowIdRef.current) return;
      withViewTransition(() => {
        setStatus("ready");
        setError(err.message || "No pudimos aplicar el feedback.");
      }, "drawer");
    }
  };

  const drop = (event) => {
    event.preventDefault();
    setDragging(false);
    processFile(event.dataTransfer.files?.[0]);
  };

  const atsAudit = useMemo(() => {
    if (status !== "ready") return { technicalScore: 0, matchScore: null, checks: [], keywordCheck: null, inferred: [] };
    if (!workingCv) return calculateAtsAudit(fallbackText, jobKeywords);
    const resumeDocument = createResumeDocument(workingCv);
    return calculateAtsAudit(resumeDocumentToText(resumeDocument), jobKeywords, {
      bulletCount: countResumeBullets(resumeDocument),
      simpleLayout: true
    });
  }, [status, fallbackText, jobKeywords, workingCv]);
  const perfectMatch = atsAudit.technicalScore === 100 && atsAudit.matchScore === 100;
  const keywordLabels = useMemo(() => jobKeywords.map((item) => typeof item === "object" && item ? item.term : item).filter(Boolean), [jobKeywords]);
  const iterationSteps = [...improvementAnalysis.questions, { id: "freeform", question: "¿Hay algo más que quieras agregar o cambiar?", why: "Podés sumar información verdadera que no hayamos preguntado o pedir un ajuste de redacción.", freeform: true }];
  const activeQuestion = iterationSteps[activeQuestionIndex] || iterationSteps[iterationSteps.length - 1];
  const activeQuickAnswers = activeQuestion?.freeform || !Array.isArray(activeQuestion?.quickAnswers) || activeQuestion.quickAnswers.length < 2
    ? ["Sí", "No"]
    : activeQuestion.quickAnswers.slice(0, 4);
  const preview = useMemo(() => {
    if (workingCv) return resumeDocumentToPreview(createResumeDocument(workingCv));
    return makeRawTextPreview(fallbackText);
  }, [fallbackText, workingCv]);

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
        const safeText = String(text ?? "").trim();
        if (!safeText) return false;
        document.setFont("helvetica", style);
        document.setFontSize(fontSize);
        document.setTextColor(...color);
        const wrapped = document.splitTextToSize(safeText, width);
        if (!wrapped.length) return false;
        ensureSpace(wrapped.length * lineHeight);
        document.text(wrapped, x, y);
        y += wrapped.length * lineHeight;
        return true;
      };

      writeText(preview.name, { fontSize: 20, style: "bold", lineHeight: 7.4 });
      if (preview.headline) writeText(preview.headline, { fontSize: 12, style: "bold", color: accent, lineHeight: 5.4 });
      if (preview.contactLine) writeText(preview.contactLine, { fontSize: 8.5, color: muted, lineHeight: 4.6 });
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
          const lineText = String(line?.text ?? "").trim();
          if (!lineText) return;
          if (line.type === "heading") {
            if (index > 0) y += 2.4;
            const [label, date = ""] = lineText.split(/\s{2}·\s{2}/);
            const dateWidth = date ? Math.min(38, document.getTextWidth(date) + 2) : 0;
            document.setFont("helvetica", "bold");
            document.setFontSize(9.5);
            const wrapped = document.splitTextToSize(label, contentWidth - dateWidth - 3);
            const nextLine = section.lines[index + 1];
            const nextText = nextLine?.text?.replace(/^•\s*/, "") || "";
            const nextWidth = nextLine?.type === "bullet" ? contentWidth - 5 : contentWidth;
            const nextHeight = nextText ? Math.min(2, document.splitTextToSize(nextText, nextWidth).length) * 4.5 : 0;
            ensureSpace(Math.max(5, wrapped.length * 4.5) + nextHeight);
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
            const bulletText = lineText.replace(/^•\s*/, "");
            const wrapped = document.splitTextToSize(bulletText, contentWidth - 5);
            ensureSpace(wrapped.length * 4.35);
            document.setFillColor(...accent);
            document.circle(margin + 1, y - 1.05, 0.55, "F");
            document.setTextColor(...ink);
            document.text(wrapped, margin + 4, y);
            y += wrapped.length * 4.35 + 0.55;
          } else {
            if (line.link && /^https?:\/\//i.test(line.link) && document.splitTextToSize(lineText, contentWidth).length === 1) {
              ensureSpace(4.5);
              document.setFont("helvetica", "italic");
              document.setFontSize(8.8);
              document.setTextColor(...muted);
              document.textWithLink(lineText, margin, y, { url: line.link });
              y += 5.3;
              return;
            }
            writeText(lineText, {
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
    } catch (error) {
      console.error("No se pudo generar el PDF", error);
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
  const canPersonalize = jobInputMode === "url" ? isValidJobUrl(jobUrl) : Boolean(targetRole.trim());
  const pasteJobUrl = async () => {
    if (!navigator.clipboard?.readText) {
      setError("Tu navegador no permite pegar automáticamente. Podés usar Ctrl+V o ⌘V en el campo.");
      return;
    }

    setPasteStatus("reading");
    setError("");
    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();
      if (!clipboardText) {
        setPasteStatus("idle");
        setError("No hay ningún link en el portapapeles.");
        return;
      }
      if (!isValidJobUrl(clipboardText)) {
        setPasteStatus("idle");
        setError("El contenido del portapapeles no es un link válido.");
        return;
      }
      setJobUrl(clipboardText.slice(0, 500));
      setPasteStatus("pasted");
    } catch {
      setPasteStatus("idle");
      setError("No pudimos acceder al portapapeles. Podés usar Ctrl+V o ⌘V en el campo.");
    }
  };
  const togglePreview = () => withViewTransition(() => setPreviewOpen((open) => !open), "drawer");
  const personalizeResume = () => withViewTransition(() => {
    setPhase("context");
    setResumeGoal("personalize");
    setStatus("context-ready");
    setPreviewOpen(false);
    setError("");
  }, "step");
  const returnHome = (event) => {
    event.preventDefault();
    resetFlow();
  };

  return (
    <main className={`${inFlow ? "app-mode" : ""}${status === "ready" && previewOpen ? " preview-open" : ""}`}>
      <nav className="nav">
        <a className="brand" href="/" onClick={returnHome}><span className="brand-mark">T</span><span>trama</span></a>
        <div className="nav-actions">
          {phase === "result" && status === "ready" ? <>
            <a className="nav-preview mobile-only" href="#preview-document"><FileText size={14} /> Revisar preview</a>
            <button type="button" className="nav-preview desktop-only" aria-expanded={previewOpen} onClick={togglePreview}><FileText size={14} /> {previewOpen ? "Ocultar preview" : "Revisar preview"}</button>
          </> : null}
          {!inFlow ? <a className="nav-link" href="#como-funciona">Cómo funciona <ArrowDown size={15} /></a> : null}
        </div>
      </nav>

      <section className="hero">
        {!inFlow ? <>
          <div className="eyebrow"><Sparkles size={14} /> TU CV, PREPARADO PARA ESA OPORTUNIDAD</div>
          <h1>Un CV que conecta<br />tu experiencia con <em>el puesto.</em></h1>
          <p className="hero-copy">{savedResume ? "Tu CV está guardado y listo para una nueva búsqueda." : "Subí tu CV. Trama lo adapta a la oportunidad sin inventar experiencia."}</p>
        </> : null}

        {phase === "upload" ? (savedResumeHydrated ? savedResume ? (
          <section className="saved-resume" aria-labelledby="saved-resume-title">
            <button type="button" className="delete-saved-resume" onClick={() => setDeleteDialogOpen(true)} aria-label="Borrar CV guardado" title="Borrar CV guardado"><X size={18} /></button>
            <div className="saved-resume-icon"><FileText size={28} strokeWidth={1.6} /><span><Check size={12} /></span></div>
            <span className="kicker">CV GUARDADO EN ESTE DISPOSITIVO</span>
            <h2 id="saved-resume-title">Prepará tu CV para tu próxima oportunidad.</h2>
            <div className="saved-resume-file">
              <div><strong>{savedResume.sourceFileName}</strong><small>{savedResume.pages ? `${savedResume.pages} ${savedResume.pages === 1 ? "página" : "páginas"} · ` : ""}Actualizado el {savedResumeDateFormatter.format(new Date(savedResume.updatedAt))}</small></div>
            </div>
            <div className="saved-resume-actions action-hierarchy">
              <button type="button" className="replace-saved tertiary-action" onClick={() => inputRef.current?.click()}><Upload size={15} /> Reemplazar archivo</button>
              <div className="saved-resume-primary-actions">
                <button type="button" className="preview-saved" onClick={previewSavedResume}><FileText size={15} /> Revisar CV</button>
                <button type="button" className="continue-saved" onClick={useSavedResume}><Target size={15} /> Personalizar CV <ArrowRight size={16} /></button>
              </div>
            </div>
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => processFile(e.target.files?.[0])} />
          </section>
        ) : (
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          >
            <input ref={inputRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => processFile(e.target.files?.[0])} />
            <div className="file-icon"><FileText size={31} strokeWidth={1.6} /><span>PDF</span></div>
            <h2>Empezá por tu CV actual</h2><p>Después podés adaptarlo a una oportunidad.</p><button type="button"><Upload size={17} /> Subir mi CV</button><small>PDF · Máximo 10 MB</small>
          </div>
        ) : null) : phase === "overview" ? (
          <section className="context-step resume-overview" aria-labelledby="resume-overview-title">
            <div className="overview-heading">
              <span className="kicker">TU CV GUARDADO</span>
              <h2 id="resume-overview-title">Revisá tu CV cuando quieras.</h2>
              <p>Esta es la versión guardada en este dispositivo. Podés comprobar su lectura ATS, descargarla o personalizarla para una propuesta.</p>
            </div>
            <div className="overview-score" aria-label={`Puntaje de lectura ATS: ${atsAudit.technicalScore} sobre 100`}>
              <div><strong>{atsAudit.technicalScore}</strong><span>/100</span></div>
              <div><small>LECTURA ATS</small><strong>{atsAudit.checks.filter((check) => check.pass).length} de {atsAudit.checks.length} controles superados</strong><p>Evalúa estructura, secciones y legibilidad. La coincidencia con una oferta se calcula cuando personalizás el CV.</p></div>
            </div>
            {atsAudit.checks.some((check) => !check.pass) ? <div className="overview-findings"><strong>Qué podrías mejorar</strong>{atsAudit.checks.filter((check) => !check.pass).slice(0, 2).map((check) => <p key={check.label}><X size={13} /><span>{check.label}<small>{check.fix}</small></span></p>)}</div> : <div className="overview-pass"><Check size={16} /><span><strong>Buena lectura técnica</strong><small>El CV supera todos los controles básicos para ATS.</small></span></div>}
            {pdfError ? <div className="final-download-error" role="alert"><X size={14} />{pdfError}</div> : null}
            <div className="overview-actions">
              <button type="button" className="personalize-resume" onClick={personalizeResume}><Target size={15} /> Personalizar para una propuesta <ArrowRight size={15} /></button>
              <a className="preview-link mobile-only" href="#preview-document"><FileText size={15} /> Ver preview</a>
              <button type="button" className="preview-link desktop-only" aria-expanded={previewOpen} onClick={togglePreview}><FileText size={15} /> {previewOpen ? "Ocultar preview" : "Ver preview"}</button>
              <button type="button" className="final-download" onClick={downloadPdf} disabled={pdfStatus === "generating"}><Download size={15} /> {pdfStatus === "generating" ? "Generando PDF…" : "Descargar PDF"}</button>
            </div>
          </section>
        ) : phase === "context" ? (
          <form className="context-step" onSubmit={continueWithContext}>
            <div className="flow-progress compact-progress" aria-label="Paso 2 de 5: objetivo"><strong>Paso 2 de 5 · Objetivo</strong></div>
            {resumeGoal !== "personalize" ? <>
              <div className="context-heading choice-heading"><span className="kicker">ELEGÍ EL ENFOQUE</span><h2>¿Qué querés hacer con tu CV?</h2><p>Podés adaptarlo a una búsqueda concreta o mejorarlo sin enfocarlo en una oferta.</p></div>
              <div className="goal-choices" role="group" aria-label="Elegí cómo mejorar tu CV">
                <button type="button" className="goal-choice recommended" onClick={() => { setResumeGoal("personalize"); setError(""); }}>
                  <span className="goal-choice-icon"><Target size={21} /></span>
                  <span><small>RECOMENDADO</small><strong>Personalizarlo para una oferta</strong><em>Adaptamos tu experiencia y palabras clave al puesto que buscás.</em></span>
                  <ArrowRight size={18} />
                </button>
                <button type="button" className="goal-choice" onClick={(event) => { setResumeGoal("general"); continueWithContext(event, true); }}>
                  <span className="goal-choice-icon"><Sparkles size={21} /></span>
                  <span><small>MEJORA GENERAL</small><strong>Mejorar mi CV</strong><em>Optimizamos claridad, redacción, estructura e impacto profesional.</em></span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </> : <>
            <div className="context-heading"><span className="kicker">PERSONALIZACIÓN</span><h2>Personalizá tu CV para esta oportunidad.</h2><p>{jobInputMode === "url" ? "Pegá el link de la oferta." : "Contanos qué tipo de oportunidad estás buscando."}</p></div>
            <fieldset className="job-source">
              <legend className="sr-only">Cómo agregar el objetivo</legend>
              <div className="job-tab-panel">
                {jobInputMode === "url" ? (
                  <div className="job-url-field">
                    <span className="job-url-heading"><i><Link2 size={18} /></i><b><small>OFERTA · LINK</small>Link de la oferta</b></span>
                    <span className="job-url-copy">Vamos a leer el puesto y sus requisitos para adaptar tu experiencia.</span>
                    <label className="sr-only" htmlFor="job-url">Link de la oferta</label>
                    <span className="job-url-input">
                      <Link2 size={16} aria-hidden="true" />
                      <input id="job-url" type="url" name="job-url" value={jobUrl} onChange={(event) => { setJobUrl(event.target.value); setPasteStatus("idle"); setError(""); }} placeholder="https://empresa.com/jobs/product-designer" maxLength={500} required />
                      <button type="button" className={`paste-url-button ${pasteStatus === "pasted" ? "pasted" : ""}`} onClick={pasteJobUrl} disabled={pasteStatus === "reading"} aria-label="Pegar link desde el portapapeles">
                        {pasteStatus === "pasted" ? <Check size={14} /> : <ClipboardPaste size={14} />}
                        {pasteStatus === "reading" ? "Pegando…" : pasteStatus === "pasted" ? "Pegado" : "Pegar"}
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="job-manual-field">
                    <span className="job-url-heading"><i><Target size={18} /></i><b><small>OFERTA · MANUAL</small>Contanos tu objetivo</b></span>
                    <span className="job-url-copy">Usaremos el puesto y la información que compartas para adaptar tu experiencia.</span>
                    <div className="manual-objective">
                      <label><span><Target size={13} /> Puesto objetivo</span><input name="target-role" value={targetRole} onChange={(event) => { setTargetRole(event.target.value); setError(""); }} placeholder="Ej. Senior Product Designer" maxLength={120} required /></label>
                      <label><span><Sparkles size={13} /> Información verdadera que no figura en el PDF</span><textarea value={additionalInformation} onChange={(event) => setAdditionalInformation(event.target.value)} placeholder="Ej. Lideré un equipo de 6 personas o mejoramos la conversión un 18%." maxLength={4000} rows={4} /><small>Usaremos únicamente la información que confirmes como verdadera.</small></label>
                    </div>
                  </div>
                )}
              </div>
              <button type="button" className="objective-mode-link" onClick={() => { setJobInputMode((mode) => mode === "url" ? "manual" : "url"); setError(""); }}>{jobInputMode === "url" ? "No tengo el link o no funciona" : "Tengo el link de la oferta"}</button>
            </fieldset>
            </>}
            <div className="context-actions">
              <button type="button" className="back-button tertiary-action" onClick={resumeGoal === "personalize" ? () => { setResumeGoal(null); setError(""); } : resetFlow}>← Volver</button>
              {resumeGoal === "personalize" ? <div className="context-primary-actions">
                <button type="submit" className="continue-button primary-action" disabled={status === "error" || !canPersonalize}>Personalizar CV<ArrowRight size={16} /></button>
              </div> : null}
            </div>
          </form>
        ) : phase === "waiting" ? (
          <section className="context-step waiting-step" aria-live="polite">
            <div className="flow-progress compact-progress" aria-label="Paso 3 de 5: preparando CV"><strong>Paso 3 de 5 · Preparando CV</strong></div>
            <div className="waiting-orbit">{queuedContext?.skipImprovement ? <FileText size={24} /> : <Sparkles size={24} />}</div>
            <h2>{queuedContext?.skipImprovement ? "Estamos preparando tu CV." : "Estamos mejorando tu CV."}</h2>
            <p>{queuedContext?.mode === "general" ? "Estamos optimizando su claridad, estructura e impacto profesional." : queuedContext?.skipImprovement ? "Enseguida vas a poder revisarlo y descargarlo." : "Lo estamos adaptando al objetivo con la experiencia que compartiste."}</p>
            <div className="waiting-lines"><i /></div>
          </section>
        ) : phase === "result" ? (
          <section className="context-step improvement-step" id="flujo-mejoras">
            <div className="flow-progress compact-progress" aria-label={`Paso ${workflowStep} de 5`}><strong>Paso {workflowStep} de 5 · {workflowStep === 3 ? "Revisar versión" : workflowStep === 4 ? "Seguir mejorando" : "Descargar"}</strong></div>
            <div className={`improvement-content ${status === "revising" ? "is-loading" : ""}`}>
              {status === "revising" ? <div className="revision-loading" aria-live="polite"><div className="waiting-orbit"><Sparkles size={24} /></div><span className="kicker">PASO 04 · GENERANDO OTRA VERSIÓN</span><h2>Estamos incorporando tus respuestas.</h2><p>Contrastamos cada dato con el CV y recalculamos las mejoras sin inventar información.</p><div className="waiting-lines"><i /></div></div> : null}
              <h2>{workflowStep === 3 ? "Ya mejoramos tu CV." : workflowStep === 4 ? iterationComplete ? perfectMatch ? "Llegamos a la versión ideal para esta oportunidad." : "La nueva versión ya está lista." : "Hagamos una nueva iteración." : improvementSkipped ? "Tu CV está listo, sin cambios." : "Tu CV ya está listo."}</h2>
              <p>{workflowStep === 3 ? "Revisá el resultado y elegí si está listo." : workflowStep === 4 ? iterationComplete ? "Revisá el resultado o hacé otra iteración." : "Respondé solo lo que puedas confirmar." : improvementSkipped ? "No aplicamos cambios al contenido." : "Descargá la versión lista para postularte."}</p>
              {workflowStep === 5 && jobAnalysis.sourceType === "url" && jobUrl.trim() ? <section className={`cover-letter ${coverLetter ? "has-letter" : ""}`} aria-labelledby="cover-letter-title">
                <div className="cover-letter-intro">
                  <span><Mail size={18} /></span>
                  <div><small>EXTRA · OPCIONAL</small><h3 id="cover-letter-title">¿También necesitás una cover letter?</h3><p>{coverLetter ? `Tu carta para ${coverLetter.company} ya está lista para descargar.` : "Usamos la empresa, el puesto y los requisitos de la oferta que compartiste para preparar una carta coherente con este CV."}</p></div>
                  <div className="cover-letter-primary-actions">
                    {!coverLetter ? <button type="button" onClick={generateCoverLetter} disabled={coverLetterStatus === "generating"}><Sparkles size={15} /> {coverLetterStatus === "generating" ? "Leyendo la oferta…" : "Generar cover letter"}</button> : <>
                      <button type="button" className="regenerate-letter" onClick={generateCoverLetter} disabled={coverLetterStatus === "generating"}><Sparkles size={14} /> {coverLetterStatus === "generating" ? "Regenerando…" : "Regenerar"}</button>
                      <button type="button" className="download-letter" onClick={downloadCoverLetter}><Download size={14} /> Descargar cover letter</button>
                    </>}
                  </div>
                </div>
                {coverLetterError ? <div className="cover-letter-error"><X size={14} />{coverLetterError}<button type="button" onClick={generateCoverLetter}>Reintentar</button></div> : null}
              </section> : null}
              {workflowStep === 4 && iterationComplete && perfectMatch ? <div className="perfect-result"><span><Check size={18} /></span><div><strong>100/100 ATS · 100/100 coincidencia</strong><small>Todos los controles y requisitos detectados están cubiertos.</small></div></div> : null}
              {workflowStep === 3 || workflowStep === 4 && iterationComplete ? <div className={`step-results ${atsAudit.matchScore === null ? "without-match" : ""}`}>
                <article><span>Lectura ATS</span><strong>{atsAudit.technicalScore}<small>/100</small></strong><p>{atsAudit.checks.filter((check) => check.pass).length} de {atsAudit.checks.length} controles superados</p></article>
                {atsAudit.matchScore !== null ? <article><span>Coincidencia</span><strong>{atsAudit.matchScore}<small>/100</small></strong><p>{atsAudit.matched.length} requisitos respaldados</p></article> : null}
                <article><span>Cambios</span><strong>{improvementAnalysis.changes.length}</strong><p>{improvementAnalysis.changes.length ? "mejoras explicadas en esta versión" : "sin cambios de contenido"}</p></article>
              </div> : null}
              {(workflowStep === 3 || workflowStep === 4 && iterationComplete) && improvementAnalysis.changes.length ? <details className="step-explanation changes-explanation"><summary><span><b>Qué cambió en esta versión</b><small>Compará cada ajuste y por qué lo hicimos</small></span><span className="change-count">{improvementAnalysis.changes.length} {improvementAnalysis.changes.length === 1 ? "cambio" : "cambios"}<ChevronDown size={15} /></span></summary><div className="change-list">{improvementAnalysis.changes.map((change, index) => <article className="change-card" key={`${change.section}-${index}`}><header><span className="change-index">{String(index + 1).padStart(2, "0")}</span><div><small>Sección modificada</small><h3>{change.section || "Contenido"}</h3></div></header><div className="change-comparison"><section className="change-before" aria-label="Contenido anterior"><small>Antes</small><p>{change.before || "—"}</p></section><section className="change-after" aria-label="Contenido mejorado"><small>Después</small><p>{change.after || "—"}</p></section></div>{change.reason ? <div className="change-reason"><small>Por qué lo cambiamos</small><p>{change.reason}</p></div> : null}</article>)}</div></details> : null}
              {(workflowStep === 3 || workflowStep === 4 && iterationComplete) && atsAudit.matchScore !== null ? <details className="step-explanation match-explanation"><summary><span>Cómo calculamos la coincidencia</span><small>{atsAudit.matchScore}/100</small></summary><div className="match-breakdown"><p><strong>{atsAudit.matched.length}</strong><span>requisitos respaldados</span></p><p><strong>{atsAudit.missing.length}</strong><span>ausentes o sin evidencia</span></p><small>El puntaje es el porcentaje de requisitos detectados en la oferta que aparecen explícitamente, mediante una equivalencia clara o con evidencia suficiente en el CV.</small>{atsAudit.matched.length ? <div><b>Cubiertos</b>{atsAudit.matched.join(" · ")}</div> : null}{atsAudit.missing.length ? <div><b>Por trabajar</b>{atsAudit.missing.join(" · ")}</div> : null}</div></details> : null}
              {(workflowStep === 3 || workflowStep === 4 && iterationComplete) && atsAudit.checks.some((check) => !check.pass) ? <details className="step-explanation findings-details"><summary><span>Ver recomendaciones</span><small>{atsAudit.checks.filter((check) => !check.pass).length}</small></summary><div className="step-findings"><strong>Recomendaciones</strong>{atsAudit.checks.filter((check) => !check.pass).slice(0, 3).map((check) => <p key={check.label}><X size={13} /><span>{check.label}<small>{check.fix}</small></span></p>)}</div></details> : null}
              {workflowStep === 4 && !iterationComplete && activeQuestion ? <div className="agent-questions question-stepper">
                <div className="question-head"><div><strong>{activeQuestion.freeform ? "Información adicional" : "Preguntas para aumentar la coincidencia"}</strong><p>{activeQuestion.freeform ? "Este último campo siempre es opcional." : "Respondé sólo lo que puedas confirmar."}</p></div><div className="question-counter"><span>{activeQuestionIndex + 1} / {iterationSteps.length}</span>{!activeQuestion.freeform ? <button type="button" onClick={() => setActiveQuestionIndex(iterationSteps.length - 1)}>Saltar todas</button> : null}</div></div>
                <div className="question-progress" aria-label={`Paso ${activeQuestionIndex + 1} de ${iterationSteps.length}`}>{iterationSteps.map((question, index) => { const key = question.id || index; const answered = question.freeform ? feedbackNote.trim() : questionQuickAnswers[key] || questionAnswers[key]?.trim(); return <i key={key} className={index === activeQuestionIndex ? "active" : answered ? "answered" : index < activeQuestionIndex ? "skipped" : ""} />; })}</div>
                <div className="question-card"><span>{String(activeQuestionIndex + 1).padStart(2, "0")}</span><div><strong>{activeQuestion.question}</strong>{activeQuestion.why ? <small>{activeQuestion.why}</small> : null}{activeQuestion.freeform ? <textarea value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} placeholder="Más datos, contexto o cambios que quieras pedir…" rows={4} autoFocus /> : <><div className="quick-answers" role="group" aria-label="Respuesta rápida">{activeQuickAnswers.map((answer) => { const questionKey = activeQuestion.id || activeQuestionIndex; const selected = questionQuickAnswers[questionKey] === answer; return <button key={answer} type="button" aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => { setQuestionQuickAnswers((current) => ({ ...current, [questionKey]: answer })); setActiveQuestionIndex((index) => Math.min(iterationSteps.length - 1, index + 1)); }}>{selected ? <Check size={14} /> : null}{answer}</button>; })}</div><details className="answer-details" open={Boolean(questionAnswers[activeQuestion.id || activeQuestionIndex])}><summary>Agregar contexto</summary><textarea value={questionAnswers[activeQuestion.id || activeQuestionIndex] || ""} onChange={(event) => setQuestionAnswers((current) => ({ ...current, [activeQuestion.id || activeQuestionIndex]: event.target.value }))} placeholder="Aclaración opcional…" rows={3} /></details></>}</div></div>
                <div className="question-actions">
                  <button type="button" className="tertiary-action" disabled={activeQuestionIndex === 0} onClick={() => setActiveQuestionIndex((index) => Math.max(0, index - 1))}>Anterior</button>
                  {activeQuestionIndex < iterationSteps.length - 1 ? <><button type="button" className="tertiary-action" onClick={() => setActiveQuestionIndex((index) => index + 1)}>Omitir</button><button type="button" className="primary-action" onClick={() => setActiveQuestionIndex((index) => index + 1)}>Siguiente <ArrowRight size={14} /></button></> : <button type="button" className="primary-action" onClick={() => (feedbackNote.trim() || Object.values(questionQuickAnswers).some(Boolean) || Object.values(questionAnswers).some((answer) => String(answer).trim())) ? applyRevisionFeedback() : setIterationComplete(true)}>{feedbackNote.trim() || Object.values(questionQuickAnswers).some(Boolean) || Object.values(questionAnswers).some((answer) => String(answer).trim()) ? "Generar nueva versión" : "Continuar sin cambios"}</button>}
                </div>
              </div> : null}
              {workflowStep === 5 && pdfError ? <div className="final-download-error" role="alert"><X size={14} />{pdfError}</div> : null}
              <div className="step-feedback">
                <button type="button" className="step-back tertiary-action" onClick={() => workflowStep === 3 || improvementSkipped ? withViewTransition(() => { setPhase("context"); setStatus("context-ready"); setImprovementSkipped(false); }, "step") : workflowStep === 5 ? (setWorkflowStep(4), setIterationComplete(true)) : iterationComplete ? setWorkflowStep(3) : setWorkflowStep(3)}>← Volver</button>
                {workflowStep === 5 ? <button type="button" className="start-new-flow tertiary-action" onClick={resetFlow}><RotateCcw size={15} /> Empezar de nuevo</button> : null}
                {workflowStep === 3 ? <><button type="button" className="secondary-action" onClick={() => { setActiveQuestionIndex(0); setIterationComplete(false); setWorkflowStep(4); }}><Sparkles size={15} /> Seguir mejorando</button><button type="button" className="primary-action" onClick={() => setWorkflowStep(5)}><Check size={15} /> Confirmar cambios</button></> : null}
                {workflowStep === 4 && iterationComplete ? <>{!perfectMatch ? <button type="button" className="secondary-action" onClick={() => { setActiveQuestionIndex(0); setIterationComplete(false); }}><Sparkles size={15} /> Seguir mejorando</button> : null}<button type="button" className="primary-action" onClick={() => setWorkflowStep(5)}><Check size={15} /> Confirmar cambios</button></> : null}
                {workflowStep === 5 ? <button type="button" className="final-download primary-action" onClick={downloadPdf} disabled={pdfStatus === "generating"}><Download size={15} /> {pdfStatus === "generating" ? "Generando PDF…" : "Descargar CV en PDF"}</button> : null}
              </div>
            </div>
          </section>
        ) : null}
        {error && <div className="error"><X size={17} />{error}</div>}
        {!inFlow ? <div className="trust"><span><LockKeyhole size={15} /> Tu versión queda en este dispositivo</span><span><Target size={15} /> Optimizado para tu oferta</span></div> : null}
      </section>

      {status === "ready" && (
        <section className="result" id="resultado">
          {phase !== "overview" ? <div className="result-stepper"><a href="#flujo-mejoras">Volver al flujo</a><span>CV <Check size={12} /></span><i /><span>{improvementSkipped ? "Sin objetivo" : "Objetivo"} <Check size={12} /></span><i /><span className={workflowStep === 3 ? "active" : ""}>{improvementSkipped ? "Sin mejoras" : "CV mejorado"}</span><i /><span className={workflowStep === 4 ? "active" : ""}>{improvementSkipped ? "Omitido" : "Seguir mejorando"}</span><i /><span className={workflowStep === 5 ? "active" : ""}>Final</span></div> : null}
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
          <div className="reprocess-note">
            <span>¿Cambiaste algún ajuste?</span>
            <button type="button" onClick={() => processFile(file)} disabled={status === "reading"}><Sparkles size={14} /> Actualizar el análisis</button>
          </div>
          </> : null}
          <div className="workspace" id="preview-document">
            <div className="workspace-content preview-only">
              <div className="preview-pane">
                <div className="paper-wrap">
                  <article className="resume-paper">
                    <h1>{preview.name}</h1>
                    {preview.headline ? <p className="paper-headline">{preview.headline}</p> : null}
                    {preview.contactLine ? <p className="paper-contact">{preview.contactLine}</p> : null}
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
          {workflowStep === 5 && coverLetter ? <section className="cover-letter-document" aria-label="Vista previa de la cover letter">
              <article><h4>{coverLetter.senderName}</h4><p className="letter-target">{coverLetter.role} · {coverLetter.company}</p><p>{coverLetter.greeting}</p>{coverLetter.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<p>{coverLetter.closing}<br /><strong>{coverLetter.senderName}</strong></p></article>
          </section> : null}
        </section>
      )}

      {!inFlow ? <section className="ats-section" aria-labelledby="ats-title">
        <div className="ats-heading">
          <span className="ats-badge">ATS</span>
          <div><span className="section-num">APPLICANT TRACKING SYSTEM</span><small>EL PRIMER FILTRO DE TU POSTULACIÓN</small></div>
        </div>
        <div className="ats-content">
          <h2 id="ats-title">El sistema que lee tu CV antes que una persona.</h2>
          <div className="ats-copy"><span className="section-num">¿QUÉ ES UN ATS?</span><p>Es la herramienta que muchas empresas usan para recibir, ordenar y filtrar currículums.</p><strong>Preparamos tu CV para que lo interprete correctamente y encuentre lo relevante para la oferta.</strong></div>
        </div>
      </section> : null}

      {!inFlow ? <section className="how" id="como-funciona">
        <div><span className="section-num">CÓMO FUNCIONA</span><h2>Mejoramos tu CV<br />para la oferta que querés.</h2><p className="how-intro">Analizamos qué busca la empresa y preparamos una versión de tu CV con mayor coincidencia, lista para postularte.</p></div>
        <div className="steps">
          <article><b>01</b><h3>Analizamos tu CV</h3><p>Detectamos fortalezas y oportunidades de mejora.</p></article>
          <article><b>02</b><h3>Entendemos la oferta</h3><p>Identificamos los requisitos que más importan.</p></article>
          <article><b>03</b><h3>Mejoramos la coincidencia</h3><p>Ajustamos el contenido para destacar lo más relevante.</p></article>
          <article><b>04</b><h3>Te damos el resultado</h3><p>Revisás los cambios y descargás tu CV listo para enviar.</p></article>
        </div>
      </section> : null}

      {!inFlow ? <section className="deliverables" aria-labelledby="deliverables-title">
        <div className="deliverables-kicker">
          <span className="deliverables-badge"><Check size={17} /></span>
          <div><span className="section-num">EL RESULTADO</span><small>UNA VERSIÓN LISTA PARA ESA OPORTUNIDAD</small></div>
        </div>
        <div className="deliverables-heading"><h2 id="deliverables-title">Un CV más relevante.<br />Una postulación más fuerte.</h2><p>No recibís recomendaciones sueltas. Te llevás una versión optimizada para la oferta, revisada y lista para enviar.</p></div>
        <div className="deliverables-grid">
          <article><span>01</span><Target size={22} /><h3>Coincidencia con la oferta</h3><p>Ves qué requisitos ya respaldás y cuáles necesitan más evidencia.</p></article>
          <article><span>02</span><Sparkles size={22} /><h3>Mejoras explicadas</h3><p>Entendés cada ajuste de redacción antes de dar por lista la versión.</p></article>
          <article><span>03</span><FileText size={22} /><h3>Documentos listos</h3><p>Descargás un PDF legible para ATS y, si compartiste una oferta, una carta de presentación coherente.</p></article>
        </div>
      </section> : null}

      {!inFlow ? <footer><a className="brand" href="/" onClick={returnHome}><span className="brand-mark">T</span><span>trama</span></a><p>Tu experiencia ya tiene valor.<br />Trama ayuda a mostrarlo.</p><span>Hecho en Argentina · 2026</span></footer> : null}

      <dialog
        ref={deleteDialogRef}
        className="delete-dialog"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onCancel={() => setDeleteDialogOpen(false)}
        onClose={() => setDeleteDialogOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setDeleteDialogOpen(false); }}
      >
        <div className="delete-dialog-card">
          <div className="delete-dialog-icon" aria-hidden="true"><Trash2 size={22} strokeWidth={1.7} /></div>
          <span className="kicker">BORRAR CV GUARDADO</span>
          <h2 id="delete-dialog-title">¿Querés borrar este CV?</h2>
          <p id="delete-dialog-description">Se va a eliminar únicamente de este dispositivo. Esta acción no se puede deshacer.</p>
          {savedResume?.sourceFileName ? <div className="delete-dialog-file"><FileText size={16} /><span>{savedResume.sourceFileName}</span></div> : null}
          <div className="delete-dialog-actions">
            <button type="button" className="delete-dialog-cancel" onClick={() => setDeleteDialogOpen(false)}>Conservar CV</button>
            <button type="button" className="delete-dialog-confirm" onClick={removeSavedResume}><Trash2 size={15} /> Sí, borrar CV</button>
          </div>
        </div>
      </dialog>
    </main>
  );
}

export default App;
