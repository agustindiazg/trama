import test from "node:test";
import assert from "node:assert/strict";
import { mergeChangeHistory } from "./change-history.js";

test("conserva los cambios de iteraciones anteriores", () => {
  const previous = [{ section: "Resumen", before: "Antes", after: "Después", reason: "Claridad" }];
  const next = [{ section: "Experiencia", before: "Viejo", after: "Nuevo", reason: "Impacto" }];

  assert.deepEqual(mergeChangeHistory(previous, next), [...previous, ...next]);
});

test("no duplica un cambio que vuelve a aparecer", () => {
  const previous = [{ section: "Resumen", before: "Antes", after: "Después", reason: "Claridad" }];
  const repeated = [{ section: " resumen ", before: "Antes", after: "Después", reason: "Otro texto" }];

  assert.deepEqual(mergeChangeHistory(previous, repeated), previous);
});
