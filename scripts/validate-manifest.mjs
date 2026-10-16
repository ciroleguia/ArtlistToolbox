import { existsSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...(manifest.content_scripts ?? []).flatMap((entry) => [
    ...(entry.js ?? []),
    ...(entry.css ?? [])
  ]),
  ...Object.values(manifest.icons ?? {})
].filter(Boolean);

const missing = [...new Set(referencedFiles)].filter((file) => !existsSync(file));

if (missing.length) {
  console.error("manifest.json references missing files:");
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

if (!manifest.version || !manifest.background?.service_worker) {
  console.error("manifest.json is missing required fields.");
  process.exit(1);
}

console.log(`manifest.json OK (v${manifest.version})`);
