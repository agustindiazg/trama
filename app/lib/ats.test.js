import test from "node:test";
import assert from "node:assert/strict";
import { calculateAtsAudit, extractJobKeywords } from "./ats.js";

const resumeText = `
Ana Perez ana@example.com
Experiencia
• Lideré el desarrollo de productos con React
• Implementé investigación de usuarios
• Mejoré conversión un 20%
• Coordiné entregas con producto, diseño e ingeniería para lanzar mejoras confiables y documentadas para clientes.
Habilidades
React, análisis de datos, producto
Educación
Universidad
`;

test("calcula un match gradual en vez de limitarlo a 50 o 100", () => {
  const keywords = ["product designer", "investigación de usuarios", "react", "figma", "prototipado", "análisis de datos"];
  const audit = calculateAtsAudit(resumeText, keywords);
  assert.ok(audit.matchScore > 0 && audit.matchScore < 100);
  assert.ok(audit.matched.includes("react"));
  assert.ok(audit.missing.includes("figma"));
});

test("normaliza acentos y variantes morfológicas", () => {
  const keywords = extractJobKeywords("Diseñará soluciones y análisis de producto");
  const audit = calculateAtsAudit(resumeText, ["diseño", "análisis", "productos"]);
  assert.ok(keywords.length > 0);
  assert.ok(audit.matchScore > 50);
});

test("descarta metadata web aunque llegue en la respuesta estructurada", () => {
  const audit = calculateAtsAudit(resumeText, ["React", "href", "privacyhtml", "https://example.com", "ajfbsilp9hi4uk5c", "#ffffff"]);
  assert.deepEqual(audit.matched, ["react"]);
  assert.deepEqual(audit.missing, []);
});

test("reconoce equivalencias e inferencias respaldadas por el perfil", () => {
  const audit = calculateAtsAudit(resumeText, [
    { term: "desarrollo frontend", status: "inferred", evidence: "Desarrolló productos con React" },
    { term: "figma", status: "unsupported", evidence: "" }
  ]);
  assert.equal(audit.matchScore, 50);
  assert.deepEqual(audit.inferred, [{ term: "desarrollo frontend", evidence: "Desarrolló productos con React" }]);
  assert.deepEqual(audit.missing, ["figma"]);
});

test("la auditoría técnica suma 100 cuando supera todos los controles", () => {
  assert.equal(calculateAtsAudit(resumeText).technicalScore, 100);
});
