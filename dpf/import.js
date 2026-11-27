// DPF figures for the DNA Hub: the pure logic behind the DPF figures tab (no page, no fetch).
//
//   Months and values
//     fyStartOf(iso), fyMonths(fyStartYear), fyLabel(fyStartYear), monthText(iso) MM/YYYY,
//     monthName(iso) "Jun 2026", inRange(iso), parseMonth(value), parseNumber(value),
//     formatValue(item, value), checkValue(item, value), sortItems(items), monthStatus(month)
//   The Dyce template (one sheet, "DPF figures", laid out as the Months table: Item code, Item,
//   Unit, then the year's months across as MM/YYYY)
//     templateAoa(items, months), buildTemplate(XLSX, items, months), readTemplate(XLSX, bytes, fileName, items),
//     rowsForYear(rows, fyStartYear)
//   What the page saves
//     inputValue(item, value), restValue(item, value), formChanges(items, held, typed)
//
// Design: dna-hub docs/superpowers/specs/2026-11-26-dpf-figures-design.md (Phil Brook, 26/11/2026).
// Phil Brook, 27/11/2026: the template is downloaded and read back on the Months screen, and the
// plan workbook and DPF workbook uploads were taken out. A month is 'YYYY-MM-01'. The
// financial year runs June to May. XLSX is the vendored SheetJS, passed in by the caller (the page
// and the Node tests each bring their own copy; this module imports nothing and reads no global).
// Every problem is a plain sentence; a problem stops the save.

export const FY_START_MONTH = 6;
export const MONTH_MIN = '2024-06-01';
export const MONTH_MAX = '2031-05-01';
export const TEMPLATE_SHEET = 'DPF figures';
export const TEMPLATE_HEADER = ['Item code', 'Item', 'Unit'];
const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m) => `${y}-${pad(m)}-01`;

// ---------- months

export function isMonth(iso) {
  const m = /^(\d{4})-(\d{2})-01$/.exec(String(iso ?? ''));
  return !!m && +m[2] >= 1 && +m[2] <= 12;
}
export const inRange = (iso) => isMonth(iso) && iso >= MONTH_MIN && iso <= MONTH_MAX;
export function fyStartOf(iso) {
  const y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7);
  return m >= FY_START_MONTH ? y : y - 1;
}
export function fyMonths(fyStartYear) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const n = FY_START_MONTH - 1 + i;
    out.push(isoOf(fyStartYear + Math.floor(n / 12), (n % 12) + 1));
  }
  return out;
}
export const fyLabel = (y) => `June ${y} to May ${y + 1}`;
export const monthText = (iso) => `${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}`;
export const monthName = (iso) => `${NAMES[+String(iso).slice(5, 7) - 1]} ${String(iso).slice(0, 4)}`;
// The month containing a day ('YYYY-MM-DD' or a Date), as 'YYYY-MM-01'.
export function monthOf(d) {
  if (d instanceof Date) return isoOf(d.getFullYear(), d.getMonth() + 1);
  return String(d).slice(0, 7) + '-01';
}

// An Excel date serial as 'YYYY-MM-DD'. Day 0 is 30/12/1899 (the 1900 leap-year bug lines every
// later serial up against it), as dpf_workbook.py in dyce-context reads them.
export function serialToIso(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const SERIAL_MIN = 30000, SERIAL_MAX = 80000; // 1982 to 2119: wide enough for any month here

// A month cell as 'YYYY-MM-01', or null. Takes MM/YYYY (the template's own form), YYYY-MM,
// YYYY-MM-01, 01/MM/YYYY, a Date, or an Excel date serial on the first of a month (Excel turns a
// typed 06/2026 into 01/06/2026). A date on any other day is not a month.
export function parseMonth(v) {
  if (v instanceof Date) return isNaN(v) || v.getDate() !== 1 ? null : isoOf(v.getFullYear(), v.getMonth() + 1);
  if (typeof v === 'number') {
    if (!(v > SERIAL_MIN && v < SERIAL_MAX)) return null;
    const iso = serialToIso(v);
    return iso.endsWith('-01') ? iso : null;
  }
  const s = String(v ?? '').trim();
  let m;
  if ((m = /^(\d{1,2})\/(\d{4})$/.exec(s))) return +m[1] >= 1 && +m[1] <= 12 ? isoOf(+m[2], +m[1]) : null;
  if ((m = /^(?:0?1)\/(\d{1,2})\/(\d{4})$/.exec(s))) return +m[1] >= 1 && +m[1] <= 12 ? isoOf(+m[2], +m[1]) : null;
  if ((m = /^(\d{4})-(\d{2})(?:-01)?$/.exec(s))) return +m[2] >= 1 && +m[2] <= 12 ? isoOf(+m[1], +m[2]) : null;
  return null;
}

// ---------- values

// A typed or read value: a number, null for blank, NaN for anything that is not a number. Takes
// 1234, "1,234.56", "\u00a31,234", "-250", "0.5%". Never guesses at words.
export function parseNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(/^\u00a3/, '').replace(/^-\u00a3/, '-').replace(/,/g, '').replace(/%$/, '').trim();
  if (s === '') return null;
  return /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
}

const num = (x) => (x == null || x === '' ? null : Number(x));
const fmt = (v, min, max) => v.toLocaleString('en-GB', { minimumFractionDigits: min, maximumFractionDigits: max });
const isPct = (item) => /^%/.test(String(item.unit ?? ''));

// A value as the page shows it: GBP with a pound sign and thousands separators (pence only when
// there are any), MWh to 3 places at most, a score to 1 place, a count whole, a percentage to 2 places.
export function formatValue(item, value) {
  const v = num(value);
  if (v == null || !Number.isFinite(v)) return '';
  const unit = String(item && item.unit || '');
  if (unit === 'GBP') {
    const pence = Math.round(Math.abs(v) * 100) % 100 !== 0;
    return (v < 0 ? '-' : '') + '\u00a3' + fmt(Math.abs(v), pence ? 2 : 0, 2);
  }
  if (unit === 'MWh') return fmt(v, 0, 3) + ' MWh';
  if (unit === 'score') return fmt(v, 1, 1);
  if (unit === 'count') return fmt(v, 0, 0);
  if (isPct(item)) return fmt(v, 0, 2) + '%';
  return fmt(v, 0, 6);
}

// A value as a box on the Months screen holds it: as formatValue but at full precision and without
// the MWh unit (the row says it), so it reads back through parseNumber as the value held.
export function inputValue(item, value) {
  const v = num(value);
  if (v == null || !Number.isFinite(v)) return '';
  const unit = String(item && item.unit || '');
  if (unit === 'GBP') {
    const pence = Math.round(Math.abs(v) * 100) % 100 !== 0;
    return (v < 0 ? '-' : '') + '£' + fmt(Math.abs(v), pence ? 2 : 0, 6);
  }
  if (unit === 'score') return fmt(v, 1, 6);
  if (isPct(item)) return fmt(v, 0, 6) + '%';
  return fmt(v, 0, 6);
}

// A box at rest on the Months screen: as inputValue, but GBP to the whole pound, so £1,031,426.14
// fits its column as £1,031,426. The exact figure shows while the box is being typed in, and on
// hover; it is what is saved either way (Phil Brook, 27/11/2026).
export function restValue(item, value) {
  const v = num(value);
  if (String(item && item.unit || '') !== 'GBP' || v == null || !Number.isFinite(v)) return inputValue(item, value);
  return (v < 0 ? '-' : '') + '\u00a3' + fmt(Math.round(Math.abs(v)), 0, 0);
}

// What the item allows, in words (the checks dpf.figure_item holds).
export function ruleText(item) {
  const min = num(item.min_value), max = num(item.max_value), whole = item.whole_number === true;
  if (min != null && max != null) return `${whole ? 'A whole number from' : 'From'} ${min} to ${max}`;
  if (min != null) return whole ? `A whole number, ${min} or more` : `${min} or more`;
  if (max != null) return whole ? `A whole number, ${max} or less` : `${max} or less`;
  return whole ? 'A whole number' : 'Any number';
}

// null when the value passes the item's check, else a sentence (as the database checks it again).
export function checkValue(item, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${item.label}: not a number.`;
  const min = num(item.min_value), max = num(item.max_value);
  if (item.whole_number === true && !Number.isInteger(value)) return `${item.label}: must be a whole number.`;
  if ((min != null && value < min) || (max != null && value > max)) {
    const range = min != null && max != null ? `from ${min} to ${max}` : min != null ? `${min} or more` : `${max} or less`;
    return `${item.label}: must be ${range}.`;
  }
  return null;
}

// Actuals first, then plan, each by the item's sort.
export function sortItems(items) {
  const k = (x) => (x.kind === 'plan' ? 1 : 0);
  return (Array.isArray(items) ? items : []).slice().sort((a, b) => k(a) - k(b) || (+a.sort || 0) - (+b.sort || 0));
}

// The month's status line: complete (nothing missing) or how many figures are missing. Saving a
// figure is its approval; there is no sign-off (Phil Brook, 27/11/2026).
export function monthStatus(m) {
  const n = Array.isArray(m && m.missing) ? m.missing.length : 0;
  return n ? { kind: 'missing', text: `${n} missing` } : { kind: 'complete', text: 'Complete' };
}

// ---------- the Dyce template

// Laid out as the Months screen: items down (actuals, then plan, each under its group row), the
// year's months across as MM/YYYY, each cell the value held or blank. months is dpf_state's months
// (or plain 'YYYY-MM-01' strings, for a blank template).
const GROUP_WORDS = { actual: 'Actuals', plan: 'Plan' };
export function templateAoa(items, months) {
  const list = months.map((m) => (typeof m === 'string' ? { month: m, figures: {} } : m));
  const aoa = [[...TEMPLATE_HEADER, ...list.map((m) => monthText(m.month))]];
  for (const kind of ['actual', 'plan']) {
    const group = sortItems(items).filter((it) => (it.kind === 'plan' ? 'plan' : 'actual') === kind);
    if (!group.length) continue;
    aoa.push([null, GROUP_WORDS[kind], null, ...list.map(() => null)]);
    for (const it of group) aoa.push([it.code, it.label, it.unit ?? null, ...list.map((m) => num((m.figures || {})[it.code]))]);
  }
  return aoa;
}

export function buildTemplate(XLSX, items, months) {
  const aoa = templateAoa(items, months);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 28 }, { wch: 36 }, { wch: 20 }, ...aoa[0].slice(TEMPLATE_HEADER.length).map(() => ({ wch: 13 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }));
}

function readBook(XLSX, bytes, fileName, opts) {
  if (/\.csv$/i.test(String(fileName || ''))) {
    // raw keeps every CSV cell as its text, so 06/2026 stays a month and is not made a date.
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
    return XLSX.read(text, { type: 'string', raw: true });
  }
  return XLSX.read(bytes, { type: 'array', ...(opts || {}) });
}

const cellText = (v) => (v == null ? '' : String(v).trim());
const shown = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : cellText(v));

// The template back: {rows: [{month, code, value}], problems: [sentence], blank: n}. The header row
// is the one holding Item code (or Item) and the months; every other heading but Unit must be a
// month (MM/YYYY, or a date Excel made of one). Each row is an item, found by its code, or its
// label when the code is blank. A blank cell leaves the figure as it is (clear a figure on the
// Months screen); a row naming no item (the Actuals and Plan rows) is passed over when it is blank.
// Excel stores a cell typed as 0.5% as 0.005, so a percentage-formatted cell on a percentage item
// is read back as the percentage it shows.
export function readTemplate(XLSX, bytes, fileName, items) {
  const problems = [], rows = [];
  let wb;
  try { wb = readBook(XLSX, bytes, fileName, { cellNF: true }); } catch { return { rows, problems: ['The file could not be read as a spreadsheet.'], blank: 0 }; }
  const ws = wb.Sheets[TEMPLATE_SHEET] || wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) return { rows, problems: ['The file is empty.'], blank: 0 };
  const start = XLSX.utils.decode_range(ws['!ref']).s;
  const addr = (i, j) => XLSX.utils.encode_cell({ r: start.r + i, c: start.c + j });
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  let head = -1, codeCol = -1, labelCol = -1;
  for (let i = 0; i < Math.min(aoa.length, 20) && head < 0; i++) {
    const r = aoa[i] || [], names = r.map((c) => cellText(c).toLowerCase());
    const cc = names.indexOf('item code'), lc = names.indexOf('item');
    if ((cc >= 0 || lc >= 0) && r.some((c, j) => j !== cc && j !== lc && parseMonth(c))) { head = i; codeCol = cc; labelCol = lc; }
  }
  if (head < 0) return { rows, problems: ['The file has no header row with Item code and the months (MM/YYYY).'], blank: 0 };
  const cols = [], monthAt = new Map();
  (aoa[head] || []).forEach((c, j) => {
    if (j === codeCol || j === labelCol || cellText(c) === '' || cellText(c).toLowerCase() === 'unit') return;
    const month = parseMonth(c);
    if (!month) { problems.push(`Cell ${addr(head, j)}: "${shown(c)}" is not a month. Write it as MM/YYYY.`); return; }
    if (!inRange(month)) { problems.push(`Cell ${addr(head, j)}: ${monthText(month)} is outside 06/2024 to 05/2031.`); return; }
    if (monthAt.has(month)) { problems.push(`Cell ${addr(head, j)}: ${monthText(month)} is also in cell ${monthAt.get(month)}.`); return; }
    monthAt.set(month, addr(head, j));
    cols.push({ j, month });
  });
  const byCode = new Map(items.map((it) => [it.code, it]));
  const byLabel = new Map(items.map((it) => [cellText(it.label).toLowerCase(), it]));
  const seen = new Map();
  let blank = 0;
  for (let i = head + 1; i < aoa.length; i++) {
    const r = aoa[i] || [], n = start.r + i + 1;
    const code = codeCol >= 0 ? cellText(r[codeCol]) : '', label = labelCol >= 0 ? cellText(r[labelCol]) : '';
    const filled = cols.filter((x) => parseNumber(r[x.j]) !== null);
    const it = code ? byCode.get(code) : byLabel.get(label.toLowerCase());
    if (!it) { if (filled.length) problems.push(`Row ${n}: "${code || label}" is not a DPF item.`); continue; }
    if (seen.has(it.code)) { if (filled.length) problems.push(`Row ${n}: ${it.label} is also on row ${seen.get(it.code)}.`); continue; }
    seen.set(it.code, n);
    blank += cols.length - filled.length;
    for (const x of filled) {
      const at = addr(i, x.j), raw = r[x.j], cellObj = ws[at];
      let value = parseNumber(raw);
      if (Number.isNaN(value)) { problems.push(`Cell ${at}: ${it.label} for ${monthText(x.month)}: "${shown(raw)}" is not a number.`); continue; }
      if (isPct(it) && cellObj && cellObj.t === 'n' && /%/.test(String(cellObj.z || ''))) value = Math.round(value * 1e8) / 1e6;
      const bad = checkValue(it, value);
      if (bad) { problems.push(`Cell ${at}: ${monthText(x.month)}, ${bad}`); continue; }
      rows.push({ month: x.month, code: it.code, value });
    }
  }
  if (!rows.length && !problems.length) problems.push('The file holds no values to save.');
  return { rows, problems, blank };
}

// The template's figures for the year shown on the Months screen: {rows, problems}. A file holding
// months of another year is refused whole, naming them, so nothing is half loaded.
export function rowsForYear(rows, fyStartYear) {
  const months = new Set(fyMonths(fyStartYear));
  const outside = [...new Set(rows.map((r) => r.month).filter((m) => !months.has(m)))].sort();
  if (!outside.length) return { rows, problems: [] };
  return { rows: [], problems: [`The file holds ${outside.map(monthText).join(', ')}, outside ${fyLabel(fyStartYear)} shown here. Move to that year first, or leave those months blank.`] };
}

// ---------- what the page saves

// The Months screen's form: {values: {code: number | null}, problems}. Only changed values are
// sent; a box cleared where a figure is held sends null (the figure is deleted).
export function formChanges(items, held, typed) {
  const values = {}, problems = [];
  for (const it of sortItems(items)) {
    if (!Object.prototype.hasOwnProperty.call(typed, it.code)) continue;
    const before = num(held[it.code]), v = parseNumber(typed[it.code]);
    if (Number.isNaN(v)) { problems.push(`${it.label}: "${cellText(typed[it.code])}" is not a number.`); continue; }
    if (v === null) { if (before != null) values[it.code] = null; continue; }
    const bad = checkValue(it, v);
    if (bad) { problems.push(bad); continue; }
    if (before !== v) values[it.code] = v;
  }
  return { values, problems };
}
