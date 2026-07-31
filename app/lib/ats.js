const STOP_WORDS = new Set(`
the and for with from that this your you are our of to in on a an as at by or be is
will have has their they about over more than into role job work team candidate
una uno unas unos las los del por para con un de en es al se como su sus el la y o
ser será debe tener buscamos puesto trabajo equipo experiencia años year years
required preferred requirements responsibilities qualifications nice plus
`.trim().split(/\s+/));
const NOISE_WORDS = new Set(`color colors text background border button default hover active primary secondary enabled enable false true px rem rgb rgba hex careers center company demo pcss css html body div span style margin padding width height display flex grid none block solid inherit auto nav navlink notification static image images label target title value url type items accent domain meli mercadolibre pcsx http https branding cubiertasbranding href key noscript script scripts tag blank blank1 fields footer privacy privacidad privacyhtml declaration data conditions`.split(/\s+/));

const normalize = (value) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9+#. ]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const stem = (word) => word
  .replace(/(amientos|imientos|aciones|adores|adoras|mente)$/i, "")
  .replace(/(ing|ed|es|os|as|ar|er|ir|s)$/i, "");

const latexToText = (latex) => latex
  .replace(/\\href\{([^}]*)}\{([^}]*)}/g, "$1 $2")
  .replace(/\\[a-zA-Z]+(?:\*|\[[^\]]*\])?(?:\{([^}]*)\})?/g, "$1 ")
  .replace(/[{}\\]/g, " ");

export const extractJobKeywords = (jobDescription, limit = 24) => {
  const normalized = normalize(jobDescription);
  if (!normalized) return [];
  const words = normalized.split(" ").filter((word) =>
    word.length >= 3 && !STOP_WORDS.has(word) && !NOISE_WORDS.has(word) && !/^\d+$/.test(word) && !/^#?[0-9a-f]{1,8}$/i.test(word) && !/^(?:true|false|null|undefined)$/.test(word) && !/[/:;]/.test(word) && !/^[a-f0-9]{2,8}$/i.test(word) && !/\./.test(word)
  );
  const counts = new Map();
  words.forEach((word, index) => {
    const base = stem(word);
    if (base.length < 3) return;
    const current = counts.get(base) || { term: word, count: 0, first: index };
    current.count += 1;
    if (word.length > current.term.length) current.term = word;
    counts.set(base, current);
  });
  return [...counts.entries()]
    .map(([base, data]) => ({
      term: data.term,
      base,
      weight: 1 + Math.min(data.count - 1, 3) * 0.35 + (data.first < words.length * 0.25 ? 0.25 : 0)
    }))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, limit);
};

export const calculateAtsAudit = (latex, explicitKeywords = []) => {
  const text = latexToText(latex);
  const normalizedText = normalize(text);
  const textStems = new Set(normalizedText.split(" ").map(stem));
  const bulletCount = (latex.match(/\\item\b/g) || []).length;
  const technicalChecks = [
    { label: "Documento LaTeX válido", pass: /\\documentclass/.test(latex) && /\\begin\{document\}/.test(latex) && /\\end\{document\}/.test(latex), weight: 15 },
    { label: "Contacto detectable", pass: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || /https?:\/\//i.test(text), weight: 15, fix: "Agregá email, teléfono o portfolio visibles en el CV original." },
    { label: "Secciones ATS estándar", pass: /(experiencia|experience|educacion|education|habilidades|skills)/i.test(normalizedText), weight: 20, fix: "Usá headings claros como Experiencia, Educación y Habilidades." },
    { label: "Experiencia presentada con bullets", pass: bulletCount >= 3, weight: 15, fix: "Convertí responsabilidades y logros en al menos tres bullets concretos." },
    { label: "Verbos de acción", pass: /(logr|lider|cre|diseñ|desarroll|gestion|implement|mejor|dirig|optimiz|constru|analiz|built|led|designed|developed|managed|improved|delivered|increased|reduced)/i.test(normalizedText), weight: 15, fix: "Comenzá los bullets con verbos de acción." },
    { label: "Evidencia cuantificable", pass: /\b\d+(?:[.,]\d+)?\s*(?:%|k|m|anos|meses|usuarios|clientes|proyectos|personas|x)?\b/i.test(normalizedText), weight: 10, fix: "Agregá métricas reales; no inventes ninguna." },
    { label: "Formato simple y legible", pass: !/\\begin\{(?:tabular|multicols|tikzpicture)\}/.test(latex) && text.trim().length >= 250, weight: 10, fix: "Evitá tablas, columnas complejas y documentos demasiado cortos." }
  ];

  const seenKeywords = new Set();
  const keywords = (Array.isArray(explicitKeywords) ? explicitKeywords : [])
    .map((item) => ({
      term: normalize(String(typeof item === "object" && item ? item.term : item)),
      status: typeof item === "object" && item ? item.status : "",
      evidence: typeof item === "object" && item ? String(item.evidence || "") : ""
    }))
    .filter((item) => {
      const term = item.term;
      if (
        term.length < 3 ||
        term.length > 60 ||
        NOISE_WORDS.has(term) ||
        /^#?[0-9a-f]{3,8}$/i.test(term) ||
        /(?:https?|www|\.com|\.net|\.org)\b/.test(term) ||
        /[{}[\]/:=;]/.test(term) ||
        /^[a-z0-9]{12,}$/.test(term) ||
        seenKeywords.has(term)
      ) return false;
      seenKeywords.add(term);
      return true;
    })
    .slice(0, 24)
    .map((item) => ({ ...item, base: stem(item.term), weight: 1 }));
  const coverage = keywords.map((keyword) => ({
    ...keyword,
    matched: ["explicit", "equivalent", "inferred"].includes(keyword.status) || normalizedText.includes(keyword.term) || textStems.has(keyword.base)
  }));
  const totalWeight = coverage.reduce((sum, item) => sum + item.weight, 0);
  const matchedWeight = coverage.filter((item) => item.matched).reduce((sum, item) => sum + item.weight, 0);
  const matchScore = keywords.length ? Math.round((matchedWeight / totalWeight) * 100) : null;
  const technicalScore = technicalChecks.reduce((total, check) => total + (check.pass ? check.weight : 0), 0);
  const matched = coverage.filter((item) => item.matched).map((item) => item.term);
  const missing = coverage.filter((item) => !item.matched).map((item) => item.term);
  const inferred = coverage.filter((item) => ["equivalent", "inferred"].includes(item.status)).map((item) => ({ term: item.term, evidence: item.evidence }));
  const keywordCheck = keywords.length
    ? { label: `${matched.length}/${keywords.length} keywords relevantes cubiertas`, pass: matchScore >= 60, fix: "Las keywords faltantes no se agregan automáticamente si tu CV no aporta evidencia." }
    : null;

  return { technicalScore, matchScore, checks: technicalChecks, keywordCheck, matched, missing, inferred };
};
