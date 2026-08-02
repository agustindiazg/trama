import test from "node:test";
import assert from "node:assert/strict";
import { validateCvContent } from "./cv-validation.js";

test("accepts a professional CV", () => {
  assert.equal(validateCvContent({ name: "Ana Pérez", headline: "Designer", contact: ["ana@example.com"], experience: [{ role: "Designer", company: "Acme", bullets: [] }], education: [], projects: [], skills: ["Figma", "Research"] }).valid, true);
});

test("accepts an early-career CV based on education", () => {
  assert.equal(validateCvContent({ name: "Juan Pérez", summary: "Estudiante", experience: [], education: [{ institution: "UTN", degree: "Ingeniería" }], projects: [], skills: ["JavaScript", "SQL"] }).valid, true);
});

test("accepts a visually complex CV when only identity and experience were structured", () => {
  assert.equal(validateCvContent({
    name: "Maggie Morales",
    experience: [{ role: "Senior Brand & Web Designer", company: "Dialpad", bullets: ["Led the development of the brand across digital touchpoints."] }],
    education: [],
    projects: [],
    skills: []
  }).valid, true);
});

test("rejects a non-CV document represented as text", () => {
  assert.equal(validateCvContent({ name: "Factura 0001", summary: "Total a pagar", contact: [], experience: [], education: [], projects: [], skills: [] }).valid, false);
});

test("rejects an empty structured response", () => {
  assert.equal(validateCvContent({ experience: [], education: [], projects: [], skills: [] }).valid, false);
});
