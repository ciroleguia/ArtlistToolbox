// CSV builder used by the background service worker (visible-track export)
// and by the test suite. Pure functions only.

export function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(columns, rows) {
  const lines = [columns.map(escapeCsvValue).join(",")];
  rows.forEach((row) => {
    lines.push(row.map(escapeCsvValue).join(","));
  });
  return lines.join("\r\n");
}

export function formatDurationLabel(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) {
    return "";
  }
  const rounded = Math.round(total);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
