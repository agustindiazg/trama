const text = (value) => typeof value === "string" ? value.trim() : "";

const hasExperience = (items) => Array.isArray(items) && items.some((item) => {
  if (!item || typeof item !== "object") return false;
  const bullets = Array.isArray(item.bullets) ? item.bullets.map(text).filter(Boolean) : [];
  return Boolean(text(item.role) || text(item.company)) && (Boolean(text(item.role) && text(item.company)) || bullets.length > 0);
});

const hasEducation = (items) => Array.isArray(items) && items.some((item) =>
  item && typeof item === "object" && Boolean(text(item.institution) || text(item.degree))
);

const hasProjects = (items) => Array.isArray(items) && items.some((item) =>
  item && typeof item === "object" && Boolean(text(item.name) && text(item.description))
);

export function validateCvContent(cv) {
  if (!cv || typeof cv !== "object" || Array.isArray(cv)) return { valid: false, reason: "invalid_structure" };
  const professionalSections = [hasExperience(cv.experience), hasEducation(cv.education), hasProjects(cv.projects)].filter(Boolean).length;
  const skills = Array.isArray(cv.skills) && cv.skills.map(text).filter(Boolean).length >= 2;
  const profile = Boolean(text(cv.headline) || text(cv.summary));
  const identity = Boolean(text(cv.name));
  const contact = Array.isArray(cv.contact) && cv.contact.map(text).filter(Boolean).length > 0;
  const supportingSignals = [skills, profile, identity, contact].filter(Boolean).length;
  // Una sección profesional real más una señal de identidad o perfil alcanza.
  // Algunos diseños visuales hacen que el extractor no asocie correctamente
  // contacto, headline o skills aunque el documento sea claramente un CV.
  const valid = professionalSections >= 1 && supportingSignals >= 1;
  return { valid, reason: valid ? "valid_cv" : "insufficient_cv_content" };
}
