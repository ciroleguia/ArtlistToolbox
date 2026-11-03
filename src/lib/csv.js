// CSV builder used by the background service worker, rankings page, options
// page and test suite. Pure functions only.

// Guards against spreadsheet formula evaluation (=, @, tab/CR, or non-numeric
// leading +/- expressions) when opened in Excel, LibreOffice or Google Sheets.
export function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }
  if (/^[=@\t\r]/.test(text)) {
    return `'${text}`;
  }
  if (/^[+-]/.test(text) && !/^[+-]\d+(?:\.\d+)?$/.test(text)) {
    return `'${text}`;
  }
  return text;
}

export function escapeCsvValue(value) {
  const text = sanitizeCsvCell(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(columns, rows) {
  const lines = [columns.map((col) => escapeCsvValue(col)).join(",")];
  rows.forEach((row) => {
    lines.push(row.map((cell) => escapeCsvValue(cell)).join(","));
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
