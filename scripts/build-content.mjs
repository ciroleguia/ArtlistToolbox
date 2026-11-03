// Bundles src/content-main.js and its shared src/lib/* dependencies into a
// single self-contained classic content script (src/content.js) so Chromium and
// Brave inject it directly into the isolated world without web_accessible_resources
// or dynamic import() CSP / use_dynamic_url issues.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const TARGET = resolve(ROOT, "src/content.js");

const SOURCES = [
  "src/lib/matcher.js",
  "src/lib/csv.js",
  "src/lib/rankings.js",
  "src/lib/dom-extract.js",
  "src/lib/i18n.js",
  "src/content-main.js"
];

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, "")
    .trim();
}

const sections = SOURCES.map((relPath) => {
  const fullPath = resolve(ROOT, relPath);
  const raw = readFileSync(fullPath, "utf8");
  return `  // ---- ${relPath} ----\n${stripModuleSyntax(raw)}`;
});

const output = [
  "// Auto-generated classic content script bundle from src/content-main.js + src/lib/*.",
  "// Run `node scripts/build-content.mjs` after editing src/content-main.js or src/lib/*.",
  "(() => {",
  '  "use strict";',
  "",
  sections.join("\n\n"),
  "})();",
  ""
].join("\n");

if (process.argv.includes("--check")) {
  const current = readFileSync(TARGET, "utf8");
  if (current !== output) {
    console.error("src/content.js is out of sync. Run: node scripts/build-content.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(TARGET, output, "utf8");
}
