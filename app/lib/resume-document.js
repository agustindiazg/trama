import { getCvSectionTitles } from "./cv-language.js";

const cleanList = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);
const period = (start, end) => [start, end].filter(Boolean).join(" – ");
const cleanBullet = (value) => String(value || "")
  .replace(/^\s*(?:[•◦▪●‣·]|[-–—])\s+/, "")
  .trim();
const cleanBullets = (items) => cleanList(items).map(cleanBullet).filter(Boolean);

export const inferResumeStrategy = (cv = {}) => {
  const experienceCount = cleanList(cv.experience).length;
  const projectCount = cleanList(cv.projects).length;
  const educationCount = cleanList(cv.education).length;

  if (!experienceCount && educationCount) return "student";
  if (experienceCount <= 1 && projectCount) return "early-career";
  return "experienced";
};

const sectionOrderFor = (strategy) => {
  if (strategy === "student") return ["summary", "education", "projects", "skills", "experience", "languages", "other"];
  if (strategy === "early-career") return ["summary", "skills", "experience", "projects", "education", "languages", "other"];
  return ["summary", "experience", "skills", "projects", "education", "languages", "other"];
};

export const createResumeDocument = (cv = {}, options = {}) => {
  const strategy = options.strategy || inferResumeStrategy(cv);
  const titles = getCvSectionTitles(cv);
  const sections = {
    summary: cv.summary ? {
      id: "summary", title: titles.summary, blocks: [{ type: "paragraph", text: cv.summary }]
    } : null,
    experience: cleanList(cv.experience).length ? {
      id: "experience",
      title: titles.experience,
      blocks: cleanList(cv.experience).map((item) => ({
        type: "entry",
        label: [item.role, item.company].filter(Boolean).join(" — "),
        meta: period(item.start, item.end),
        sublabel: item.location || "",
        bullets: cleanBullets(item.bullets),
        keepWithNext: true
      }))
    } : null,
    education: cleanList(cv.education).length ? {
      id: "education",
      title: titles.education,
      blocks: cleanList(cv.education).map((item) => ({
        type: "entry",
        label: item.institution || "",
        meta: period(item.start, item.end),
        sublabel: item.degree || "",
        bullets: []
      }))
    } : null,
    projects: cleanList(cv.projects).length ? {
      id: "projects",
      title: titles.projects,
      blocks: cleanList(cv.projects).map((item) => ({
        type: "entry",
        label: item.name || "",
        meta: "",
        sublabel: item.url || "",
        link: item.url || "",
        bullets: item.description ? [item.description] : []
      }))
    } : null,
    skills: cleanList(cv.skills).length ? {
      id: "skills", title: titles.skills, blocks: [{ type: "inline-list", items: cleanList(cv.skills) }]
    } : null,
    languages: cleanList(cv.languages).length ? {
      id: "languages", title: titles.languages, blocks: [{ type: "inline-list", items: cleanList(cv.languages) }]
    } : null,
    other: cleanList(cv.otherSections).length ? {
      id: "other",
      title: "",
      blocks: cleanList(cv.otherSections).flatMap((section) => section?.title && cleanList(section.items).length
        ? [{ type: "subsection", title: section.title, items: cleanList(section.items) }]
        : [])
    } : null
  };

  const order = Array.isArray(options.sectionOrder) && options.sectionOrder.length
    ? options.sectionOrder
    : sectionOrderFor(strategy);

  return {
    strategy,
    name: cv.name || "Tu Nombre",
    headline: cv.headline || "",
    contact: cleanList(cv.contact),
    sections: order.flatMap((id) => sections[id] ? [sections[id]] : [])
  };
};

export const resumeDocumentToPreview = (document) => {
  const headerLines = [document.headline, document.contact.join(" · ")].filter(Boolean);
  return {
    name: document.name,
    headline: document.headline,
    contactLine: document.contact.join(" · "),
    headerLines,
    contact: headerLines.join(" · "),
    sections: document.sections.flatMap((section) => {
      if (section.id === "other") {
        return section.blocks.map((block) => ({
          title: block.title,
          lines: block.items.map((text) => ({ type: "body", text }))
        }));
      }
      return [{
        title: section.title,
        lines: section.blocks.flatMap((block) => {
          if (block.type === "paragraph") return [{ type: "body", text: block.text }];
          if (block.type === "inline-list") return [{ type: "body", text: block.items.join(" · ") }];
          return [
            { type: "heading", text: [block.label, block.meta].filter(Boolean).join("  ·  "), keepWithNext: block.keepWithNext },
            ...(block.sublabel ? [{ type: "subheading", text: block.sublabel, link: block.link }] : []),
            ...block.bullets.map((text) => ({ type: "bullet", text: `• ${text}` }))
          ];
        })
      }];
    })
  };
};

export const resumeDocumentToText = (document) => resumeDocumentToPreview(document)
  .sections
  .flatMap((section) => [section.title, ...section.lines.map(({ text }) => text)])
  .concat([document.name, document.headline, ...document.contact])
  .filter(Boolean)
  .join("\n");

export const countResumeBullets = (document) => document.sections.reduce((total, section) =>
  total + section.blocks.reduce((blockTotal, block) => blockTotal + (Array.isArray(block.bullets) ? block.bullets.length : 0), 0), 0);
