import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = [".next/static", ".next/server"];
const forbidden = ["trama:local-review", "Sofía Herrera", "Product Designer · recorrido completo", "LOCAL REVIEW", "Banco de pruebas"];

async function filesInside(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesInside(target) : [target];
  }));
  return nested.flat();
}

const files = (await Promise.all(roots.map(filesInside))).flat().filter((file) => /\.(?:js|json|html|rsc)$/.test(file));
for (const file of files) {
  const contents = await readFile(file, "utf8");
  const leaked = forbidden.find((marker) => contents.includes(marker));
  if (leaked) throw new Error(`El build productivo contiene una marca del modo local (${JSON.stringify(leaked)}) en ${file}.`);
}

console.log("Production guard: el modo local no está presente en los artefactos ejecutables.");
