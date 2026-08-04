export const SAVED_RESUME_STORAGE_KEY = "trama:saved-resume:v1";

const MAX_FILE_NAME_LENGTH = 255;

export function parseSavedResume(value) {
  if (!value) return null;

  try {
    const resume = JSON.parse(value);
    if (
      resume?.schemaVersion !== 1 ||
      typeof resume.sourceFileName !== "string" ||
      !resume.sourceFileName.trim() ||
      !resume.content ||
      typeof resume.content !== "object" ||
      typeof resume.updatedAt !== "string"
    ) return null;

    return {
      ...resume,
      sourceFileName: resume.sourceFileName.slice(0, MAX_FILE_NAME_LENGTH),
      sourceFileSize: Number.isFinite(resume.sourceFileSize) ? resume.sourceFileSize : 0,
      pages: Number.isFinite(resume.pages) ? resume.pages : 0
    };
  } catch {
    return null;
  }
}

export function loadSavedResume(storage) {
  const value = storage.getItem(SAVED_RESUME_STORAGE_KEY);
  const resume = parseSavedResume(value);
  if (value && !resume) storage.removeItem(SAVED_RESUME_STORAGE_KEY);
  return resume;
}

export function saveResume(storage, { file, pages, content }) {
  const resume = {
    schemaVersion: 1,
    sourceFileName: file.name.slice(0, MAX_FILE_NAME_LENGTH),
    sourceFileSize: file.size || 0,
    pages: pages || 0,
    content,
    updatedAt: new Date().toISOString()
  };

  storage.setItem(SAVED_RESUME_STORAGE_KEY, JSON.stringify(resume));
  return resume;
}

export function deleteSavedResume(storage) {
  storage.removeItem(SAVED_RESUME_STORAGE_KEY);
}
