import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LOCAL_REVIEW_SCENARIO, loadLocalReviewSettings, validateLocalReviewScenario } from "./local-review.js";

test("el escenario local predeterminado cumple el contrato del flujo", () => {
  assert.equal(validateLocalReviewScenario(DEFAULT_LOCAL_REVIEW_SCENARIO), "");
  assert.ok(DEFAULT_LOCAL_REVIEW_SCENARIO.improve.analysis.questions.length > 0);
  assert.ok(DEFAULT_LOCAL_REVIEW_SCENARIO.revision.analysis.changes.length > 0);
});

test("rechaza escenarios que no definen las respuestas completas", () => {
  assert.match(validateLocalReviewScenario({ interpret: { cv: {} } }), /experience y skills/);
});

test("descarta configuración local corrupta", () => {
  const storage = { getItem: () => "{not-json" };
  const settings = loadLocalReviewSettings(storage);
  assert.equal(settings.enabled, false);
  assert.equal(settings.scenario, DEFAULT_LOCAL_REVIEW_SCENARIO);
});
