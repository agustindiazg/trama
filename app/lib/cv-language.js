const ENGLISH_TITLES = { summary: "Professional Profile", experience: "Experience", education: "Education", projects: "Projects", skills: "Skills", languages: "Languages" };
const SPANISH_TITLES = { summary: "Perfil profesional", experience: "Experiencia", education: "Educación", projects: "Proyectos", skills: "Habilidades", languages: "Idiomas" };
const SPANISH_MARKERS = /\b(el|la|los|las|de|del|para|con|experiencia|educaci[oó]n|habilidades|perfil|actualidad)\b/gi;
const ENGLISH_MARKERS = /\b(the|and|of|for|with|experience|education|skills|profile|present)\b/gi;
const countMatches = (text, matcher) => (String(text || "").match(matcher) || []).length;

export const detectCvLanguage = (cv) => {
  if (typeof cv?.language === "string" && cv.language.trim()) return cv.language.trim().toLowerCase().split(/[-_]/)[0];
  const content = JSON.stringify(cv || {});
  return countMatches(content, SPANISH_MARKERS) > countMatches(content, ENGLISH_MARKERS) ? "es" : "en";
};

export const getCvSectionTitles = (cv) => {
  const defaults = detectCvLanguage(cv) === "es" ? SPANISH_TITLES : ENGLISH_TITLES;
  const supplied = cv?.sectionTitles && typeof cv.sectionTitles === "object" ? cv.sectionTitles : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof supplied[key] === "string" && supplied[key].trim() ? supplied[key].trim() : fallback]));
};
