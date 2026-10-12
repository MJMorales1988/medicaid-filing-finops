// Shared helpers: money (integer cents), dates, ids, CSV.
export const TODAY = '2026-10-13'; // demo "today"

export function fmtUSD(c, cur = 'USD') {
  if (c == null) return 'Unknown';
  const s = (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (c < 0 ? '-' : '') + (cur === 'USD' ? '$' : cur + ' ') + s;
}
export function fmt0(c, cur = 'USD') {
  if (c == null) return 'Unknown';
  const s = (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (c < 0 ? '-' : '') + (cur === 'USD' ? '$' : cur + ' ') + s;
}
// "12,000.50" -> 1200050 ; "" -> null ; invalid -> NaN
export function toCents(str) {
  if (str == null) return null;
  const t = String(str).replace(/[$,\s]/g, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100);
}
export const centsToInput = (c) => (c == null ? '' : (c / 100).toFixed(2));

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MON[m - 1]} ${d}, ${y}`;
}
const utc = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export function addDays(iso, n) {
  const t = new Date(utc(iso) + n * 86400000);
  return t.toISOString().slice(0, 10);
}
export const monthKey = (iso) => iso.slice(0, 7);
export function stamp() {
  let t = '09:00:00';
  try { t = new Date().toTimeString().slice(0, 8); } catch (e) { /* ignore */ }
  return TODAY + 'T' + t;
}
export function fmtStamp(s) {
  if (!s) return '';
  return fmtDate(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) : '');
}

export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export function nextId(db, key, prefix) {
  db.seq[key] = (db.seq[key] || 0) + 1;
  return prefix + '-' + db.seq[key];
}

export function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(rows, cols) {
  const head = cols.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => csvEscape(c.get ? c.get(r) : r[c.key])).join(','));
  return [head, ...body].join('\n');
}
export const centsCsv = (c) => (c == null ? 'Unknown' : (c / 100).toFixed(2));
