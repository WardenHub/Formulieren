function pad(value) {
  return String(value).padStart(2, "0");
}

function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseDateInput(value) {
  const text = String(value || "").trim();
  if (!text) return { iso: null, error: "" };
  let year;
  let month;
  let day;
  let match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  } else {
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return { iso: null, error: "Gebruik dd-mm-jjjj; bijvoorbeeld 13-08-2025." };
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  }
  if (!isRealDate(year, month, day)) return { iso: null, error: "Deze datum bestaat niet." };
  return { iso: `${year}-${pad(month)}-${pad(day)}`, error: "" };
}

export function formatDateInput(value) {
  const match = String(value || "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}
