// Sanity check for manifest.json: valid JSON, MV3, required fields, and every
// referenced file exists on disk.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const errors = [];

if (manifest.manifest_version !== 3) {
  errors.push(`Expected manifest_version 3, got ${manifest.manifest_version}`);
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) {
  errors.push(`Invalid version "${manifest.version}"`);
}

const files = new Set();

if (manifest.background?.service_worker) {
  files.add(manifest.background.service_worker);
}

if (manifest.action?.default_popup) {
  files.add(manifest.action.default_popup);
}

if (manifest.options_ui?.page) {
  files.add(manifest.options_ui.page);
}

if (manifest.side_panel?.default_path) {
  files.add(manifest.side_panel.default_path);
}

Object.values(manifest.icons || {}).forEach((icon) => files.add(icon));

(manifest.content_scripts || []).forEach((entry) => {
  if (entry.all_frames) {
    errors.push("content_scripts must not enable all_frames");
  }
  (entry.js || []).forEach((file) => files.add(file));
  (entry.css || []).forEach((file) => files.add(file));
});

files.forEach((file) => {
  if (!existsSync(resolve(root, file))) {
    errors.push(`Missing file referenced by manifest.json: ${file}`);
  }
});

if (errors.length) {
  errors.forEach((err) => console.error(`ERROR: ${err}`));
  process.exit(1);
}

console.log(`manifest.json OK (v${manifest.version})`);
