import test from "node:test";
import assert from "node:assert/strict";
import { detectCvLanguage, getCvSectionTitles } from "./cv-language.js";

test("uses English headings for an English CV", () => {
  const cv = { summary: "Product designer with experience in research", experience: [{ bullets: ["Led the design of a platform"] }], skills: ["Leadership"] };
  assert.equal(detectCvLanguage(cv), "en");
  assert.equal(getCvSectionTitles(cv).summary, "Professional Profile");
  assert.equal(getCvSectionTitles(cv).experience, "Experience");
});

test("uses Spanish headings for a Spanish CV", () => {
  const cv = { summary: "Diseñadora de producto con experiencia en investigación", experience: [{ bullets: ["Lideré el diseño de la plataforma"] }], skills: ["Liderazgo"] };
  assert.equal(detectCvLanguage(cv), "es");
  assert.equal(getCvSectionTitles(cv).education, "Educación");
});

test("uses supplied headings for any CV language", () => {
  const cv = { language: "fr", sectionTitles: { summary: "Profil professionnel", experience: "Expérience" } };
  assert.equal(getCvSectionTitles(cv).summary, "Profil professionnel");
  assert.equal(getCvSectionTitles(cv).experience, "Expérience");
});
