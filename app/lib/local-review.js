export const LOCAL_REVIEW_STORAGE_KEY = "trama:local-review";

const baseCv = {
  language: "es",
  sectionTitles: { summary: "Perfil", experience: "Experiencia", education: "Educación", projects: "Proyectos", skills: "Habilidades", languages: "Idiomas" },
  name: "Sofía Herrera",
  headline: "Product Designer · Productos digitales B2B",
  contact: ["sofia.herrera@example.com", "Buenos Aires, Argentina", "linkedin.com/in/sofia-herrera"],
  summary: "Product Designer con experiencia diseñando productos B2B y convirtiendo problemas complejos en experiencias simples y medibles.",
  experience: [{
    role: "Product Designer",
    company: "Nexo",
    location: "Buenos Aires",
    start: "2022",
    end: "Actualidad",
    bullets: ["Diseñé flujos para una plataforma B2B junto a producto e ingeniería.", "Organicé entrevistas y pruebas de usabilidad para validar nuevas funcionalidades."]
  }, {
    role: "UX Designer",
    company: "Estudio Norte",
    location: "Remoto",
    start: "2020",
    end: "2022",
    bullets: ["Creé prototipos y sistemas de componentes para productos web."]
  }],
  education: [{ institution: "Universidad de Buenos Aires", degree: "Diseño Gráfico", start: "2015", end: "2020" }],
  skills: ["Product discovery", "Figma", "Prototipado", "Investigación de usuarios", "Design systems"],
  languages: ["Español nativo", "Inglés avanzado"],
  projects: [],
  otherSections: [],
  jobKeywords: []
};

const improvedCv = {
  ...baseCv,
  headline: "Product Designer B2B · Discovery, research y design systems",
  summary: "Product Designer especializada en productos B2B. Integro discovery, investigación y diseño de interacción para transformar problemas complejos en flujos claros, trabajando de punta a punta con producto e ingeniería.",
  experience: [{
    ...baseCv.experience[0],
    bullets: ["Diseñé de punta a punta flujos para una plataforma B2B, colaborando con producto e ingeniería.", "Planifiqué entrevistas y pruebas de usabilidad para validar funcionalidades antes del desarrollo."]
  }, baseCv.experience[1]],
  jobKeywords: [
    { term: "Product discovery", status: "explicit", evidence: "Incluido en habilidades y resumen." },
    { term: "Design systems", status: "explicit", evidence: "Incluido en habilidades." },
    { term: "Métricas de producto", status: "unsupported", evidence: "No hay evidencia suficiente en el CV." }
  ]
};

export const DEFAULT_LOCAL_REVIEW_SCENARIO = {
  name: "Product Designer · recorrido completo",
  latencyMs: 650,
  errors: { interpret: false, improve: false, revision: false, coverLetter: false },
  interpret: { cv: baseCv, evaluation: null, jobSource: "", jobAnalysis: { requested: false, sourceRead: false, sourceType: null } },
  improve: {
    cv: improvedCv,
    analysis: {
      changes: [
        { section: "Título profesional", before: baseCv.headline, after: improvedCv.headline, reason: "Hace visible la especialización y las competencias relevantes." },
        { section: "Perfil", before: baseCv.summary, after: improvedCv.summary, reason: "Aclara el alcance del trabajo y la colaboración interdisciplinaria." }
      ],
      questions: [{ id: "metricas", question: "¿Usaste métricas de producto para evaluar alguno de estos flujos?", why: "Permitirá respaldar el impacto del trabajo.", quickAnswers: ["Sí, métricas de adopción", "Sí, métricas de conversión", "No tengo esa experiencia"] }]
    },
    jobAnalysis: { requested: true, sourceRead: true, sourceType: "role" }
  },
  revision: {
    cv: { ...improvedCv, experience: [{ ...improvedCv.experience[0], bullets: ["Diseñé de punta a punta flujos para una plataforma B2B, colaborando con producto e ingeniería y siguiendo métricas de adopción.", improvedCv.experience[0].bullets[1]] }, improvedCv.experience[1]], jobKeywords: improvedCv.jobKeywords.map((item) => item.term === "Métricas de producto" ? { ...item, status: "explicit", evidence: "Métricas de adopción en experiencia de Nexo." } : item) },
    analysis: { changes: [{ section: "Experiencia · Nexo", before: improvedCv.experience[0].bullets[0], after: "Diseñé de punta a punta flujos para una plataforma B2B, colaborando con producto e ingeniería y siguiendo métricas de adopción.", reason: "Incorpora información confirmada por la persona." }], questions: [] },
    jobAnalysis: { requested: true, sourceRead: true, sourceType: "role" }
  },
  coverLetter: { company: "Lumen", role: "Senior Product Designer", greeting: "Hola equipo de Lumen:", paragraphs: ["Me interesa sumarme a Lumen para aportar mi experiencia diseñando productos B2B y simplificando problemas complejos.", "En Nexo trabajé de punta a punta con producto e ingeniería, desde discovery y entrevistas hasta pruebas de usabilidad y seguimiento de adopción.", "Creo que esta combinación de investigación, diseño de interacción y colaboración puede contribuir al desafío del equipo."], closing: "Saludos,", senderName: "Sofía Herrera" }
};

export function validateLocalReviewScenario(value) {
  if (!value || typeof value !== "object") return "El escenario debe ser un objeto JSON.";
  if (!value.interpret?.cv || !Array.isArray(value.interpret.cv.experience) || !Array.isArray(value.interpret.cv.skills)) return "interpret.cv debe contener experience y skills como arrays.";
  for (const key of ["improve", "revision"]) {
    if (!value[key]?.cv || !Array.isArray(value[key].cv.experience) || !Array.isArray(value[key].cv.skills)) return `${key}.cv debe contener experience y skills como arrays.`;
    if (!Array.isArray(value[key]?.analysis?.changes) || !Array.isArray(value[key]?.analysis?.questions)) return `${key}.analysis debe contener changes y questions.`;
  }
  return "";
}

export function loadLocalReviewSettings(storage) {
  try {
    const saved = JSON.parse(storage.getItem(LOCAL_REVIEW_STORAGE_KEY) || "null");
    if (saved && !validateLocalReviewScenario(saved.scenario)) return saved;
  } catch {}
  return { enabled: false, scenario: DEFAULT_LOCAL_REVIEW_SCENARIO };
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function localReviewFetch(url, options, fallbackFetch = fetch) {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined" || !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return fallbackFetch(url, options);
  const settings = loadLocalReviewSettings(window.localStorage);
  if (!settings.enabled || !String(url).startsWith("/api/")) return fallbackFetch(url, options);
  const scenario = settings.scenario;
  await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Math.min(5000, Number(scenario.latencyMs) || 0))));
  let stage = "";
  let payload;
  if (url === "/api/interpret-cv") { stage = "interpret"; payload = scenario.interpret; }
  if (url === "/api/improve-cv") {
    const body = JSON.parse(options?.body || "{}");
    stage = body.revisionFeedback ? "revision" : "improve";
    payload = scenario[stage];
  }
  if (url === "/api/generate-cover-letter") { stage = "coverLetter"; payload = { letter: scenario.coverLetter }; }
  if (!stage) return fallbackFetch(url, options);
  if (scenario.errors?.[stage]) return jsonResponse({ error: `Error local simulado en ${stage}.`, code: "LOCAL_REVIEW_ERROR" }, 503);
  return jsonResponse(payload);
}
