import assert from "node:assert/strict";
import test from "node:test";
import { deleteSavedResume, loadSavedResume, parseSavedResume, saveResume, SAVED_RESUME_STORAGE_KEY } from "./resume-storage.js";

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
};

test("saveResume stores only the processed CV and source metadata", () => {
  const storage = createStorage();
  const content = { name: "Ana", experience: [] };
  const saved = saveResume(storage, {
    file: { name: "CV Ana.pdf", size: 1234 },
    pages: 2,
    content
  });

  assert.equal(saved.sourceFileName, "CV Ana.pdf");
  assert.equal(saved.sourceFileSize, 1234);
  assert.equal(saved.pages, 2);
  assert.deepEqual(saved.content, content);
  assert.deepEqual(parseSavedResume(storage.getItem(SAVED_RESUME_STORAGE_KEY)).content, content);
});

test("loadSavedResume removes corrupted entries", () => {
  const storage = createStorage();
  storage.setItem(SAVED_RESUME_STORAGE_KEY, "not-json");

  assert.equal(loadSavedResume(storage), null);
  assert.equal(storage.getItem(SAVED_RESUME_STORAGE_KEY), null);
});

test("deleteSavedResume removes the saved CV", () => {
  const storage = createStorage();
  storage.setItem(SAVED_RESUME_STORAGE_KEY, "saved-cv");

  deleteSavedResume(storage);

  assert.equal(storage.getItem(SAVED_RESUME_STORAGE_KEY), null);
});
