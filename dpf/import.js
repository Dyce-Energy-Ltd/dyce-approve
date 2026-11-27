// DPF figures for the DNA Hub: the pure logic behind the DPF figures tab (no page, no fetch).
//
//   Months and values
//     fyStartOf(iso), fyMonths(fyStartYear), fyLabel(fyStartYear), monthText(iso) MM/YYYY,
//     monthName(iso) "Jun 2026", inRange(iso), parseMonth(value), parseNumber(value),
//     formatValue(item, value), checkValue(item, value), sortItems(items), monthStatus(month)
//   The Dyce template (one sheet, "DPF figures": Month (MM/YYYY), Item code, Item, Value)
//     templateAoa(items, months), buildTemplate(XLSX, items, months), readTemplate(XLSX, bytes, fileName, items)
//   Carl's five-year plan workbook (rows by their column-B label, months by their header date)
//     PLAN_LINES, readPlanWorkbook(XLSX, bytes, {mode, months})
//   The DPF workbook ("SLT Dashboard": annual targets in column C, rows by their column-B label)
//     DPF_LINES, readDpfWorkbook(XLSX, bytes, {months})
//   What the page saves
//     formChanges(items, held, typed), previewRows(rows, items, heldByMonth)
//
// Design: dna-hub docs/superpowers/specs/2026-11-26-dpf-figures-design.md (Phil Brook, 26/11/2026),
// with Phil's answers of the same evening (the DPF workbook route). A month is 'YYYY-MM-01'. The
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

const LONDON_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' });
const ukDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : LONDON_DAY.format(d); };

// The month's status line: signed off (by whom, when), ready to sign (nothing missing), or N missing.
export function monthStatus(m) {
  if (m && m.signed_off) return { kind: 'signed', text: `Signed off by ${m.signed_off.by} on ${ukDay(m.signed_off.at)}` };
  const n = Array.isArray(m && m.missing) ? m.missing.length : 0;
  return n ? { kind: 'missing', text: `${n} missing` } : { kind: 'ready', text: 'Ready to sign' };
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

// ---------- Carl's five-year plan workbook

// Each line the import reads: its sheet, the column-B label(s) summed, and the item it fills for
// Targets (the BASE plan) or Actuals (Carl's working copy). From the design's mapping.
export const PLAN_LINES = [
  { sheet: 'P&L Forecast', labels: ['Gross Profit'], targets: 'plan_gm_gbp' },
  { sheet: 'P&L Forecast', labels: ['Net Profit (\u00a3)'], targets: 'plan_ebitda_gbp' },
  { sheet: 'P&L Forecast', labels: ['Volume (MWh)'], targets: 'plan_volume_mwh' },
  { sheet: 'Costs', labels: ['OPEX'], targets: 'plan_opex_gbp', actuals: 'opex_gbp' },
  { sheet: 'P&L Forecast', labels: ['Total Purchases (\u00a3)', 'Total Direct Expenses (\u00a3)'], actuals: 'cost_of_sales_gbp' },
  { sheet: 'P&L Forecast', labels: ['Total Overheads (\u00a3)'], actuals: 'overheads_gbp' },
];
// Pounds to the penny, MWh to 3 places: the plan's cached values carry float noise.
const roundFor = (code, v) => { const p = /_gbp$/.test(code) ? 100 : /_mwh$/.test(code) ? 1000 : 1e6; return Math.round(v * p) / p; };

const cellAt = (XLSX, ws, r, c) => ws[XLSX.utils.encode_cell({ r, c })];
const LABEL_COL = 1; // column B

// The one row whose column-B label is `label`, spaces trimmed; a sentence when there is none or more.
function findRow(XLSX, ws, sheet, label) {
  const rg = XLSX.utils.decode_range(ws['!ref']), found = [];
  for (let r = rg.s.r; r <= rg.e.r; r++) {
    const c = cellAt(XLSX, ws, r, LABEL_COL);
    if (c && c.t === 's' && cellText(c.v) === label) found.push(r);
  }
  if (found.length === 1) return { row: found[0] };
  return { problem: found.length
    ? `${sheet}: ${found.length} rows are labelled "${label}" in column B (rows ${found.map((r) => r + 1).join(', ')}); exactly one was expected.`
    : `${sheet}: no row is labelled "${label}" in column B. Carl may have renamed the line.` };
}

// The month a header cell gives, or null: a month-start date, as an Excel serial or a Date.
function headerMonth(c) {
  if (!c) return null;
  if (c.v instanceof Date) return parseMonth(c.v);
  if (c.t === 'n' || c.t === 'd') return typeof c.v === 'number' ? parseMonth(c.v) : null;
  return null;
}
// The header row of month-start dates: the row near the top with the most of them. Columns are
// found by these dates, never by letter (Carl adds and moves columns).
function monthColumns(XLSX, ws) {
  const rg = XLSX.utils.decode_range(ws['!ref']);
  let best = null;
  for (let r = rg.s.r; r <= Math.min(rg.e.r, rg.s.r + 60); r++) {
    const cols = new Map(), dup = new Set();
    for (let c = rg.s.c; c <= rg.e.c; c++) {
      const m = headerMonth(cellAt(XLSX, ws, r, c));
      if (!m) continue;
      if (cols.has(m)) dup.add(m); else cols.set(m, c);
    }
    if (cols.size && (!best || cols.size > best.cols.size)) best = { row: r, cols, dup };
  }
  return best;
}

function numberCell(XLSX, ws, r, c, where) {
  const cell = cellAt(XLSX, ws, r, c), ref = XLSX.utils.encode_cell({ r, c });
  if (!cell || cell.v == null || cell.v === '') return { problem: `${where} (cell ${ref}) is empty.` };
  if (cell.t === 'n' && Number.isFinite(cell.v)) return { value: cell.v, cell };
  const said = cell.t === 'e' ? (cell.w || '#ERROR') : cellText(cell.v);
  return { problem: `${where} (cell ${ref}) reads "${said}", not a number.` };
}

// The plan workbook: {rows, problems}. mode is 'targets' or 'actuals'; months the chosen
// 'YYYY-MM-01's. A label not found, a month with no column, or a cell that is not a number is a
// problem, and stops the import.
export function readPlanWorkbook(XLSX, bytes, { mode, months }) {
  const problems = [], rows = [];
  if (mode !== 'targets' && mode !== 'actuals') return { rows, problems: ['Choose Targets or Actuals.'] };
  if (!Array.isArray(months) || !months.length) return { rows, problems: ['Choose at least one month.'] };
  const lines = PLAN_LINES.filter((l) => l[mode]);
  const sheets = [...new Set(lines.map((l) => l.sheet))];
  let wb;
  try { wb = readBook(XLSX, bytes, 'plan.xlsx', { sheets }); } catch { return { rows, problems: ['The file could not be read as a spreadsheet.'] }; }
  const found = {};
  for (const sheet of sheets) {
    const ws = wb.Sheets[sheet];
    if (!ws || !ws['!ref']) { problems.push(`The workbook has no sheet named "${sheet}".`); continue; }
    const head = monthColumns(XLSX, ws);
    if (!head) { problems.push(`${sheet}: no row of month-start dates was found.`); continue; }
    for (const m of months) {
      if (head.dup.has(m)) problems.push(`${sheet}: more than one column is dated ${monthText(m)}.`);
      else if (!head.cols.has(m)) problems.push(`${sheet}: no column is dated ${monthText(m)}.`);
    }
    found[sheet] = { ws, head };
  }
  for (const line of lines) {
    const f = found[line.sheet];
    if (!f) continue;
    const at = line.labels.map((label) => ({ label, ...findRow(XLSX, f.ws, line.sheet, label) }));
    at.filter((x) => x.problem).forEach((x) => problems.push(x.problem));
    if (at.some((x) => x.problem)) continue;
    for (const m of months) {
      const c = f.head.cols.get(m);
      if (c == null || f.head.dup.has(m)) continue;
      let total = 0, ok = true;
      for (const x of at) {
        const got = numberCell(XLSX, f.ws, x.row, c, `${line.sheet} "${x.label}", ${monthText(m)}`);
        if (got.problem) { problems.push(got.problem); ok = false; } else total += got.value;
      }
      if (ok) rows.push({ month: m, code: line[mode], value: roundFor(line[mode], total) });
    }
  }
  return { rows, problems };
}

// ---------- the DPF workbook

// Carl's "Dyce Performance Framework (DPF).xlsx": the annual targets on "SLT Dashboard", each row
// found by its column-B label, the target in column C (Phil Brook, 26/11/2026). Bad debt and the
// Trustpilot score are levels (the same each month); the Trustpilot count is a year's total, split
// evenly across the twelve months.
export const DPF_SHEET = 'SLT Dashboard';
export const DPF_LINES = [
  { label: 'Bad Debt Charge', code: 'plan_bad_debt_pct', basis: 'level', percent: true },
  { label: 'CSAT (Trust Pilot Score)', code: 'plan_trustpilot_score', basis: 'level' },
  { label: 'CSAT (Trust Pilot Count)', code: 'plan_trustpilot_new_reviews', basis: 'year' },
];
const TARGET_COL = 2; // column C

// {rows, problems}. Bad debt is a percentage: 0.5 means 0.5%. A cell Excel formats as a percentage
// holds 0.005 for 0.5%, so such a cell is multiplied by 100 to give what it shows. A year's count
// that does not divide by 12 into whole numbers is a problem, never rounded.
export function readDpfWorkbook(XLSX, bytes, { months }) {
  const problems = [], rows = [];
  if (!Array.isArray(months) || !months.length) return { rows, problems: ['Choose at least one month.'] };
  let wb;
  try { wb = readBook(XLSX, bytes, 'dpf.xlsx', { sheets: [DPF_SHEET], cellNF: true }); } catch { return { rows, problems: ['The file could not be read as a spreadsheet.'] }; }
  const ws = wb.Sheets[DPF_SHEET];
  if (!ws || !ws['!ref']) return { rows, problems: [`The workbook has no sheet named "${DPF_SHEET}".`] };
  for (const line of DPF_LINES) {
    const at = findRow(XLSX, ws, DPF_SHEET, line.label);
    if (at.problem) { problems.push(at.problem); continue; }
    const got = numberCell(XLSX, ws, at.row, TARGET_COL, `${DPF_SHEET} "${line.label}" target`);
    if (got.problem) { problems.push(got.problem); continue; }
    let v = got.value;
    if (line.percent && /%/.test(String(got.cell.z || ''))) v = Math.round(v * 100 * 1e9) / 1e9;
    if (line.basis === 'year') {
      const each = v / 12;
      if (!Number.isInteger(each)) {
        problems.push(`${DPF_SHEET} "${line.label}" is ${v} for the year, which does not split into 12 whole months (${Math.round(each * 100) / 100} a month). Type the monthly targets on the Months screen or in the Dyce template instead.`);
        continue;
      }
      v = each;
    }
    for (const m of months) rows.push({ month: m, code: line.code, value: v });
  }
  return { rows, problems };
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

// The preview: one line per row with the value held and the new value, by month then item order.
// heldByMonth is {'YYYY-MM-01': {code: value}}.
export function previewRows(rows, items, heldByMonth) {
  const order = new Map(sortItems(items).map((it, i) => [it.code, i]));
  const byCode = new Map(items.map((it) => [it.code, it]));
  return rows.map((r) => {
    const held = num(((heldByMonth || {})[r.month] || {})[r.code]);
    return { month: r.month, code: r.code, item: byCode.get(r.code) || { code: r.code, label: r.code }, held, value: r.value, changed: held !== r.value };
  }).sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99)));
}
