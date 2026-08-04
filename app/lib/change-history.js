const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const changeKey = (change) => [change?.section, change?.before, change?.after].map(normalize).join("\u0000");

export function mergeChangeHistory(previousChanges, nextChanges) {
  const merged = [];
  const seen = new Set();

  [...(Array.isArray(previousChanges) ? previousChanges : []), ...(Array.isArray(nextChanges) ? nextChanges : [])]
    .forEach((change) => {
      if (!change || typeof change !== "object") return;
      const key = changeKey(change);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(change);
    });

  return merged;
}
