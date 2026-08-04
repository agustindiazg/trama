import test from "node:test";
import assert from "node:assert/strict";
import { createResumeDocument, inferResumeStrategy, resumeDocumentToPreview } from "./resume-document.js";

const baseCv = {
  language: "es",
  name: "Ada Lovelace",
  headline: "Ingeniera de software",
  contact: ["ada@example.com", "github.com/ada"],
  summary: "Construye sistemas confiables.",
  experience: [], education: [], projects: [], skills: [], languages: [], otherSections: []
};

test("prioriza educación para un perfil estudiante", () => {
    const cv = { ...baseCv, education: [{ institution: "Universidad", degree: "Ingeniería" }], projects: [{ name: "Compilador", description: "Creó un compilador." }] };
  assert.equal(inferResumeStrategy(cv), "student");
  assert.deepEqual(createResumeDocument(cv).sections.map(({ id }) => id), ["summary", "education", "projects"]);
});

test("prioriza skills para un perfil early-career", () => {
    const cv = { ...baseCv, experience: [{ role: "Developer", company: "Acme", bullets: ["Lanzó una API."] }], projects: [{ name: "SDK", description: "Diseñó un SDK." }], skills: ["JavaScript"] };
  assert.deepEqual(createResumeDocument(cv).sections.map(({ id }) => id), ["summary", "skills", "experience", "projects"]);
});

test("crea un modelo de preview compartido con entradas estructuradas", () => {
    const cv = { ...baseCv, experience: [{ role: "Lead", company: "Acme", start: "2024", end: "Actual", bullets: ["Redujo errores."] }] };
    const preview = resumeDocumentToPreview(createResumeDocument(cv));
  assert.deepEqual(preview.headerLines, ["Ingeniera de software", "ada@example.com · github.com/ada"]);
  assert.equal(preview.headline, "Ingeniera de software");
  assert.equal(preview.contactLine, "ada@example.com · github.com/ada");
  assert.equal(preview.sections[1].lines[0].type, "heading");
  assert.equal(preview.sections[1].lines[0].keepWithNext, true);
  assert.equal(preview.sections[1].lines[1].text, "• Redujo errores.");
});

test("elimina marcadores existentes antes de renderizar bullets", () => {
  const cv = {
    ...baseCv,
    experience: [{
      role: "Lead",
      company: "Acme",
      bullets: ["• Lideró el equipo.", "- Redujo errores.", "Entregó el producto."]
    }]
  };
  const document = createResumeDocument(cv);
  const bullets = document.sections.find(({ id }) => id === "experience").blocks[0].bullets;
  const preview = resumeDocumentToPreview(document);
  const rendered = preview.sections.find(({ title }) => title === "Experiencia").lines.filter(({ type }) => type === "bullet");

  assert.deepEqual(bullets, ["Lideró el equipo.", "Redujo errores.", "Entregó el producto."]);
  assert.deepEqual(rendered.map(({ text }) => text), ["• Lideró el equipo.", "• Redujo errores.", "• Entregó el producto."]);
});
