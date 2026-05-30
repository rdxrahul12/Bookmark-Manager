// Bundles the production build (./dist) into a Chrome-installable .zip.
// Run via `npm run build:ext` — the resulting file lives at
// ./bookmark-manager-extension.zip and can be uploaded directly to the
// Chrome Web Store or shared for "Load unpacked".

import archiver from "archiver";
import { createWriteStream, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const distDir = resolve(projectRoot, "dist");
const outFile = resolve(projectRoot, "bookmark-manager-extension.zip");

try {
  statSync(distDir);
} catch {
  console.error("[zip-extension] ./dist does not exist. Run `npm run build` first.");
  process.exit(1);
}

await mkdir(dirname(outFile), { recursive: true });
const output = createWriteStream(outFile);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  const sizeMb = (archive.pointer() / (1024 * 1024)).toFixed(2);
  console.log(`[zip-extension] wrote ${outFile} (${sizeMb} MB)`);
});
archive.on("warning", (err) => {
  if (err.code !== "ENOENT") throw err;
});
archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
await archive.finalize();
