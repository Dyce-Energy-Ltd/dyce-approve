// Supplier file adapters for the DNA Hub Pricing tab.
//
// parseSupplierFile(format, workbook) turns an already-parsed SheetJS workbook into
// pricing.base_rate rows. No browser globals, and no import of SheetJS: the caller parses the file
// and passes the workbook object, so the page and the Node tests each bring their own copy.
//
// How to parse the file (the caller's job):
//   Excel files   XLSX.read(bytes, { type: 'array' })              dates stay Excel serial numbers
//   Jellyfish CSV XLSX.read(text, { type: 'string', raw: true })   raw: true keeps dates as text
//
// Parse with dense mode OFF (the SheetJS default): cells are read by address ('A1'), which a
// dense-mode worksheet (an array of rows) does not have.
//
// Source of the rules: PRICING_INTEGRATION.md section 5 (dyce-spine pricing programme), the
// pricing.base_rate table (20260923120000_pricing_schema.sql) and pricing.add_base_rates
// (20261116160000_pricing_loader.sql), which refuses any key that is not a base_rate column.
//
// Rates leave here as integer milli-pence: the cell is read as a number, rounded to 3 dp, then
// multiplied by 1000. A rate that is not a finite number is refused, never turned into 0.

export const FORMATS = [
  'voltx_elec_v1', 'yu_elec_v1', 'yu_gas_v1', 'jellyfish_elec_v1', 'jellyfish_gas_v1',
];

// Every key a row carries. Exactly the base_rate columns the loader accepts, minus the two it
// strips (base_rate_id, supplier_file_id).
export const ROW_KEYS = [
  'source_row_number', 'product_name', 'source_price_id', 'source_product_version',
  'dno_id', 'ldz', 'exit_zone', 'meter_type', 'profile_class', 'rate_structure',
  'rate_structure_source', 'llf_band_group', 'llf_band_number', 'llf_band_source',
  'min_kva', 'max_kva', 'term_months', 'contract_start_earliest', 'contract_start_latest',
  'green_energy', 'carbon_offset', 'supplier_eac_min_kwh', 'supplier_eac_max_kwh',
  'standing_charge_milli_pence_per_day', 'unit_rate_single_milli_pence_per_kwh',
  'unit_rate_day_milli_pence_per_kwh', 'unit_rate_night_milli_pence_per_kwh',
  'unit_rate_ew_milli_pence_per_kwh', 'capacity_rate_milli_pence_per_kva_day',
];

const JELLYFISH_DNO = {
  A: '10', B: '11', C: '12', D: '13', E: '14', F: '15', G: '16', P: '17', N: '18', J: '19',
  H: '20', K: '21', L: '22', M: '23',
};

// What is read from each format. `sheet` null means the first sheet (a CSV has one).
const LAYOUTS = {
  voltx_elec_v1: {
    sheet: 'SS Base Rates (RAW DATA)', headerRow: 5,
    required: ['DNO_ID', 'Profile_Class', 'Rate_Structure', 'LLF_Band', 'Contract_Duration',
      'Minimum_Contract_Start_Date', 'Maximum_Contract_Start_Date', 'Product_Name',
      'Green_Energy', 'Standing_Charge', 'Standard_Rate', 'Day_Rate', 'Night_Rate'],
  },
  yu_elec_v1: {
    sheet: 'Dyce', headerRow: 1,
    required: ['DNO_ID', 'Profile_Class', 'Rate_Structure', 'LLF_Band', 'Contract_Duration',
      'Minimum_Annual_Consumption', 'Maximum_Annual_Consumption', 'Minimum_kVa', 'Maximum_kVa',
      'Minimum_Contract_Start_Date', 'Maximum_Contract_Start_Date', 'Product_Name',
      'Green_Energy', 'Standing_Charge', 'Standard_Rate', 'Day_Rate', 'Night_Rate',
      'Evening_And_Weekend_Rate', 'Capacity_Rate'],
  },
  yu_gas_v1: {
    sheet: 'Dyce', headerRow: 1,
    required: ['LDZ', 'Exit_Zone', 'Contract_Duration', 'Minimum_Annual_Consumption',
      'Maximum_Annual_Consumption', 'Minimum_Contract_Start_Date', 'Maximum_Contract_Start_Date',
      'Product_Name', 'Carbon_Offset', 'Standing_Charge', 'Unit_Rate'],
  },
  jellyfish_elec_v1: {
    sheet: null, headerRow: 1,
    required: ['id', 'name', 'region', 'meterType', 'profileClass', 'standingCharge',
      'allOrDayUnitRate', 'nightRate', 'eveningWeekendRate', 'minAq', 'maxAq', 'effectiveFrom',
      'effectiveTo', 'term'],
  },
  jellyfish_gas_v1: {
    sheet: null, headerRow: 1,
    required: ['id', 'name', 'region', 'standingCharge', 'unitRate', 'minAq', 'maxAq',
      'effectiveFrom', 'effectiveTo', 'term'],
  },
};

const ASSUMPTIONS = {
  voltx_elec_v1: [
    'Voltx line loss band group is inferred as nda for every row (from the old tool\'s Broker output, not confirmed by Voltx).',
    'Rate structure is inferred from which rates are filled and checked against Profile_Class (3 single, 4 day_night).',
  ],
  yu_elec_v1: [
    'Profile class is derived from the rate structure where the file leaves it blank or 0 (Standard 3, other NHH 4, HH none).',
    'HH rows are stored as meter_type hh with rate_structure day_night.',
  ],
  yu_gas_v1: [
    'The gas file has no rate structure column, so rate_structure_source is recorded as single.',
  ],
  jellyfish_elec_v1: [
    'The region letter is mapped to a DNO id by the standard industry mapping; Jellyfish does not state it.',
    'A night or evening and weekend rate of 0 is read as no such rate.',
    'No green column: green_energy is false on every row. No line loss band is given.',
    'The file has no product name, so the name column is used as the product name.',
  ],
  jellyfish_gas_v1: [
    'No carbon column: carbon_offset is false on every row.',
    'The file has no product name, so the name column is used as the product name.',
    'The gas file has no rate structure column, so rate_structure_source is recorded as single.',
  ],
};

// ---------------------------------------------------------------------------------------------
// Reading the workbook
// ---------------------------------------------------------------------------------------------

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function colLetters(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetRange(ws) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ws['!ref'] || '');
  if (!m) return null;
  return {
    firstCol: colIndex(m[1]), firstRow: Number(m[2]),
    lastCol: colIndex(m[3] || m[1]), lastRow: Number(m[4] || m[2]),
  };
}

// A cell's value, or undefined when it is empty. Text is trimmed.
function cell(ws, col, row) {
  const c = ws[colLetters(col) + row];
  if (!c || c.v === undefined || c.v === null) return undefined;
  if (typeof c.v === 'string') {
    const t = c.v.trim();
    return t === '' ? undefined : t;
  }
  return c.v;
}

function pickSheet(workbook, name) {
  if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.Sheets) {
    throw new Error('Not a parsed workbook');
  }
  const wanted = name === null ? workbook.SheetNames[0] : name;
  const ws = wanted ? workbook.Sheets[wanted] : undefined;
  if (!ws) throw new Error(`Missing sheet: ${wanted === undefined ? '(none)' : wanted}`);
  return ws;
}

// ---------------------------------------------------------------------------------------------
// Converting one value. A refusal is a thrown Refusal, caught per row.
// ---------------------------------------------------------------------------------------------

class Refusal extends Error {}
const refuse = (reason) => { throw new Refusal(reason); };

function numberOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v)) return Number(v);
  return NaN;
}

// pence (as read from the cell) to integer milli-pence. `what` names the field for the reason.
// A blank or non-numeric cell is refused ('blank rate'), never read as 0.
function milli(v, what) {
  if (v === undefined) refuse('blank rate');
  const n = numberOf(v);
  if (!Number.isFinite(n)) refuse('rate is not a number' + (what ? ` (${what})` : ''));
  if (n < 0) refuse('negative rate' + (what ? ` (${what})` : ''));
  const scaled = n * 1000;
  const m = Math.round(scaled);
  if (Math.abs(scaled - m) > 1e-6) refuse('rate does not round cleanly to 3 dp' + (what ? ` (${what})` : ''));
  return m;
}

function intOf(v, what) {
  const n = numberOf(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) refuse(`${what} is not a whole number`);
  return n;
}

function iso(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// A date cell to 'YYYY-MM-DD'. `textFormat` is 'dmy-dash' (Voltx DD-MM-YYYY) or 'dmy-slash'
// (Jellyfish dd/mm/yyyy) for text cells, parsed with an explicit pattern, never by guessing.
// Excel serial numbers and Date objects are accepted for the Excel files.
function dateOf(v, what, textFormat) {
  if (v === undefined) refuse(`${what} is blank`);
  let out = null;
  if (typeof v === 'string') {
    const re = textFormat === 'dmy-slash' ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
      : textFormat === 'dmy-dash' ? /^(\d{1,2})-(\d{1,2})-(\d{4})$/ : null;
    const m = re && re.exec(v);
    if (m) out = iso(Number(m[3]), Number(m[2]), Number(m[1]));
  } else if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Rounded to the nearest day so a local-midnight Date does not slip a day.
    const d = new Date(Math.round(v.getTime() / 86400000) * 86400000);
    out = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  } else if (typeof v === 'number' && Number.isFinite(v) && textFormat !== 'dmy-slash'
      && v >= 1 && v < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    out = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (!out) refuse(`${what} is not a date in the expected form`);
  return out;
}

function flagOf(v, what) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.toUpperCase();
    if (t === 'TRUE') return true;
    if (t === 'FALSE') return false;
  }
  return refuse(`${what} is not TRUE or FALSE`);
}

function termOf(v) {
  const t = intOf(v, 'term');
  if (t < 1 || t > 36) refuse('term outside 1 to 36 months');
  return t;
}

// Supplier consumption range: both ends or neither.
function rangeOf(lo, hi) {
  if (lo === undefined && hi === undefined) return [null, null];
  if (lo === undefined || hi === undefined) refuse('one end of the consumption range is blank');
  const a = intOf(lo, 'minimum consumption');
  const b = intOf(hi, 'maximum consumption');
  if (a < 0 || b < 1 || b < a) refuse('consumption range is not valid');
  return [a, b];
}

function startWindow(a, b, textFormat) {
  const from = dateOf(a, 'contract start from', textFormat);
  const to = dateOf(b, 'contract start to', textFormat);
  if (to < from) refuse('contract start window is reversed');
  return [from, to];
}

function blankRow() {
  const r = {};
  for (const k of ROW_KEYS) r[k] = null;
  return r;
}

function optNumber(v, what) {
  if (v === undefined) return null;
  const n = numberOf(v);
  if (!Number.isFinite(n) || n < 0) refuse(`${what} is not a valid number`);
  return n;
}

// ---------------------------------------------------------------------------------------------
// The five formats. Each gets `g(name)`, the trimmed value of that column in this row.
// ---------------------------------------------------------------------------------------------

function productName(v) {
  if (v === undefined) refuse('blank product name');
  return String(v);
}

function voltxRow(g, rowNumber) {
  const r = blankRow();
  r.source_row_number = rowNumber;
  r.product_name = productName(g('Product_Name'));

  const dno = g('DNO_ID');
  const dnoN = numberOf(dno);
  if (!Number.isInteger(dnoN) || dnoN < 10 || dnoN > 23) refuse('unknown DNO id');
  r.dno_id = String(dnoN);

  if (String(g('Rate_Structure')).toUpperCase() !== 'NHH') refuse('unknown rate structure');
  r.rate_structure_source = String(g('Rate_Structure'));
  r.meter_type = 'nhh';

  const pcRaw = g('Profile_Class');
  const pc = numberOf(pcRaw);
  if (pc !== 3 && pc !== 4) refuse('unknown profile class');
  r.profile_class = pc;

  const llf = g('LLF_Band');
  const m = llf === undefined ? null : /^Band (\d+)$/i.exec(String(llf));
  if (!m) refuse('unknown line loss band');
  r.llf_band_group = 'nda';
  r.llf_band_number = Number(m[1]);
  r.llf_band_source = String(llf);

  r.term_months = termOf(g('Contract_Duration'));
  [r.contract_start_earliest, r.contract_start_latest] =
    startWindow(g('Minimum_Contract_Start_Date'), g('Maximum_Contract_Start_Date'), 'dmy-dash');
  r.green_energy = flagOf(g('Green_Energy'), 'Green_Energy');

  const std = g('Standard_Rate');
  const day = g('Day_Rate');
  const night = g('Night_Rate');
  const hasStd = std !== undefined;
  const hasDay = day !== undefined || night !== undefined;
  if (hasStd && hasDay) refuse('both single and day or night rates are filled');
  if (!hasStd && !hasDay) refuse('blank rate');
  if (hasStd) {
    if (pc !== 3) refuse('rates do not agree with profile class');
    r.rate_structure = 'single';
    r.unit_rate_single_milli_pence_per_kwh = milli(std, 'Standard_Rate');
  } else {
    if (pc !== 4) refuse('rates do not agree with profile class');
    r.rate_structure = 'day_night';
    r.unit_rate_day_milli_pence_per_kwh = milli(day, 'Day_Rate');
    r.unit_rate_night_milli_pence_per_kwh = milli(night, 'Night_Rate');
  }
  r.standing_charge_milli_pence_per_day = milli(g('Standing_Charge'), 'Standing_Charge');
  return r;
}

const YU_STRUCTURES = {
  Standard: { meter: 'nhh', structure: 'single', pc: 3, need: ['single'] },
  DayNight: { meter: 'nhh', structure: 'day_night', pc: 4, need: ['day', 'night'] },
  EveningAndWeekend: { meter: 'nhh', structure: 'evening_weekend', pc: 4, need: ['day', 'ew'] },
  EveningWeekendAndNight: {
    meter: 'nhh', structure: 'evening_weekend_night', pc: 4, need: ['day', 'night', 'ew'],
  },
  HH: { meter: 'hh', structure: 'day_night', pc: null, need: ['day', 'night', 'capacity'] },
};

function yuLlf(v, r) {
  if (v === undefined) return;
  const m = /^(NDA|LV Sub|LV|HV) Band (\d+)$/i.exec(String(v));
  if (!m) refuse('unknown line loss band');
  r.llf_band_group = { nda: 'nda', lv: 'lv', 'lv sub': 'lv_sub', hv: 'hv' }[m[1].toLowerCase()];
  r.llf_band_number = Number(m[2]);
  r.llf_band_source = String(v);
}

function yuElecRow(g, rowNumber) {
  const r = blankRow();
  r.source_row_number = rowNumber;
  r.product_name = productName(g('Product_Name'));

  const dnoN = numberOf(g('DNO_ID'));
  if (!Number.isInteger(dnoN) || dnoN < 10 || dnoN > 23) refuse('unknown DNO id');
  r.dno_id = String(dnoN);

  const written = g('Rate_Structure');
  const s = YU_STRUCTURES[written === undefined ? '' : String(written)];
  if (!s) refuse('unknown rate structure');
  r.rate_structure_source = String(written);
  r.meter_type = s.meter;
  r.rate_structure = s.structure;

  const pcFile = numberOf(g('Profile_Class'));
  r.profile_class = s.meter === 'hh' ? null : (pcFile === 3 || pcFile === 4 ? pcFile : s.pc);

  // Spec 5.3 does not say whether an HH row carries a line loss band. A band is required on NHH
  // rows; an HH row may leave it blank (base_rate allows both band columns null).
  if (s.meter !== 'hh' && g('LLF_Band') === undefined) refuse('blank line loss band');
  yuLlf(g('LLF_Band'), r);
  r.term_months = termOf(g('Contract_Duration'));
  [r.supplier_eac_min_kwh, r.supplier_eac_max_kwh] =
    rangeOf(g('Minimum_Annual_Consumption'), g('Maximum_Annual_Consumption'));
  r.min_kva = optNumber(g('Minimum_kVa'), 'Minimum_kVa');
  r.max_kva = optNumber(g('Maximum_kVa'), 'Maximum_kVa');
  if (r.min_kva !== null && r.max_kva !== null && r.max_kva < r.min_kva) refuse('kVA range is not valid');
  [r.contract_start_earliest, r.contract_start_latest] =
    startWindow(g('Minimum_Contract_Start_Date'), g('Maximum_Contract_Start_Date'), null);
  r.green_energy = flagOf(g('Green_Energy'), 'Green_Energy');

  const cols = {
    single: 'Standard_Rate', day: 'Day_Rate', night: 'Night_Rate', ew: 'Evening_And_Weekend_Rate',
    capacity: 'Capacity_Rate',
  };
  const out = {
    single: 'unit_rate_single_milli_pence_per_kwh', day: 'unit_rate_day_milli_pence_per_kwh',
    night: 'unit_rate_night_milli_pence_per_kwh', ew: 'unit_rate_ew_milli_pence_per_kwh',
    capacity: 'capacity_rate_milli_pence_per_kva_day',
  };
  for (const k of Object.keys(cols)) {
    const v = g(cols[k]);
    if (s.need.includes(k)) r[out[k]] = milli(v, cols[k]);
    else if (v !== undefined) refuse('rates do not match the rate structure');
  }
  r.standing_charge_milli_pence_per_day = milli(g('Standing_Charge'), 'Standing_Charge');
  return r;
}

function yuGasRow(g, rowNumber) {
  const r = blankRow();
  r.source_row_number = rowNumber;
  r.product_name = productName(g('Product_Name'));
  const ldz = g('LDZ');
  if (ldz === undefined) refuse('blank LDZ');
  r.ldz = String(ldz);
  r.exit_zone = g('Exit_Zone') === undefined ? null : String(g('Exit_Zone'));
  r.rate_structure = 'single';
  r.rate_structure_source = 'single';
  r.term_months = termOf(g('Contract_Duration'));
  [r.supplier_eac_min_kwh, r.supplier_eac_max_kwh] =
    rangeOf(g('Minimum_Annual_Consumption'), g('Maximum_Annual_Consumption'));
  [r.contract_start_earliest, r.contract_start_latest] =
    startWindow(g('Minimum_Contract_Start_Date'), g('Maximum_Contract_Start_Date'), null);
  r.carbon_offset = flagOf(g('Carbon_Offset'), 'Carbon_Offset');
  r.standing_charge_milli_pence_per_day = milli(g('Standing_Charge'), 'Standing_Charge');
  r.unit_rate_single_milli_pence_per_kwh = milli(g('Unit_Rate'), 'Unit_Rate');
  return r;
}

// Jellyfish: a rate of 0 means no such rate (loaded as null).
function jfRate(v) {
  return v !== undefined && numberOf(v) === 0 ? undefined : v;
}

function jfCommon(g, r, rowNumber) {
  r.source_row_number = rowNumber;
  const name = g('name');
  r.product_name = productName(name);
  r.source_product_version = String(name);
  const id = g('id');
  r.source_price_id = id === undefined ? null : String(id);
  r.term_months = termOf(g('term'));
  [r.supplier_eac_min_kwh, r.supplier_eac_max_kwh] = rangeOf(g('minAq'), g('maxAq'));
  [r.contract_start_earliest, r.contract_start_latest] =
    startWindow(g('effectiveFrom'), g('effectiveTo'), 'dmy-slash');
  r.standing_charge_milli_pence_per_day = milli(g('standingCharge'), 'standingCharge');
}

const JF_METERS = {
  DAY: { structure: 'single', need: ['day'] },
  E7: { structure: 'day_night', need: ['day', 'night'] },
  EW: { structure: 'evening_weekend', need: ['day', 'ew'] },
  EWN: { structure: 'evening_weekend_night', need: ['day', 'night', 'ew'] },
};

function jellyfishElecRow(g, rowNumber) {
  const r = blankRow();
  jfCommon(g, r, rowNumber);

  const region = g('region');
  const letter = region === undefined ? '' : String(region).replace(/^_/, '').toUpperCase();
  if (!JELLYFISH_DNO[letter]) refuse('unknown region letter');
  r.dno_id = JELLYFISH_DNO[letter];

  const mt = g('meterType');
  const s = JF_METERS[mt === undefined ? '' : String(mt).toUpperCase()];
  if (!s) refuse('unknown rate structure');
  r.rate_structure_source = String(mt);
  r.rate_structure = s.structure;
  r.meter_type = 'nhh';

  const pc = numberOf(g('profileClass'));
  if (!Number.isInteger(pc)) refuse('unknown profile class');
  r.profile_class = pc;
  r.green_energy = false;

  const v = { day: g('allOrDayUnitRate'), night: jfRate(g('nightRate')), ew: jfRate(g('eveningWeekendRate')) };
  const slot = s.structure === 'single' ? 'unit_rate_single_milli_pence_per_kwh'
    : 'unit_rate_day_milli_pence_per_kwh';
  const out = { day: slot, night: 'unit_rate_night_milli_pence_per_kwh', ew: 'unit_rate_ew_milli_pence_per_kwh' };
  const cols = { day: 'allOrDayUnitRate', night: 'nightRate', ew: 'eveningWeekendRate' };
  for (const k of ['day', 'night', 'ew']) {
    if (s.need.includes(k)) r[out[k]] = milli(jfRate(v[k]), cols[k]);
    else if (v[k] !== undefined) refuse('rates do not match the rate structure');
  }
  return r;
}

function jellyfishGasRow(g, rowNumber) {
  const r = blankRow();
  jfCommon(g, r, rowNumber);
  const region = g('region');
  if (region === undefined) refuse('blank LDZ');
  r.ldz = String(region);
  r.rate_structure = 'single';
  r.rate_structure_source = 'single';
  r.carbon_offset = false;
  r.unit_rate_single_milli_pence_per_kwh = milli(jfRate(g('unitRate')), 'unitRate');
  return r;
}

const ROW_PARSERS = {
  voltx_elec_v1: voltxRow,
  yu_elec_v1: yuElecRow,
  yu_gas_v1: yuGasRow,
  jellyfish_elec_v1: jellyfishElecRow,
  jellyfish_gas_v1: jellyfishGasRow,
};

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

// Returns { rows, refused, rowCountSource, assumptions }.
//   rows            base_rate rows (rates in integer milli-pence), keys exactly ROW_KEYS
//   refused         [{ row, reason }], row is the 1-based sheet row number
//   rowCountSource  data rows read (rows + refused); wholly blank rows are not counted
//   assumptions     the inferences this format makes, plus any unit-check flag, for the load report
// Throws Error('Missing columns: a, b') if a required header is absent, and returns nothing.
export function parseSupplierFile(format, workbook) {
  const layout = LAYOUTS[format];
  if (!layout) throw new Error(`Unknown format: ${format}`);
  const ws = pickSheet(workbook, layout.sheet);
  const range = sheetRange(ws);
  if (!range || range.lastRow < layout.headerRow) {
    throw new Error(`Missing columns: ${layout.required.join(', ')}`);
  }

  const cols = new Map();
  for (let c = range.firstCol; c <= range.lastCol; c++) {
    const h = cell(ws, c, layout.headerRow);
    if (typeof h === 'string' && !cols.has(h)) cols.set(h, c);
  }
  const missing = layout.required.filter((h) => !cols.has(h));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);

  const parse = ROW_PARSERS[format];
  const rows = [];
  const refused = [];
  let rowCountSource = 0;
  for (let rn = layout.headerRow + 1; rn <= range.lastRow; rn++) {
    let any = false;
    for (let c = range.firstCol; c <= range.lastCol; c++) {
      if (cell(ws, c, rn) !== undefined) { any = true; break; }
    }
    if (!any) continue;
    rowCountSource += 1;
    const g = (name) => cell(ws, cols.get(name), rn);
    try {
      rows.push(parse(g, rn));
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      refused.push({ row: rn, reason: e.message });
    }
  }
  const assumptions = ASSUMPTIONS[format].slice();
  // Unit guard: a flag on the load report, not a refusal. Catches a file switched to pounds or a
  // stray value. Unit rates outside 1p to 100p per kWh, standing charges over 1,000p a day.
  const RATE_KEYS = ['unit_rate_single_milli_pence_per_kwh', 'unit_rate_day_milli_pence_per_kwh',
    'unit_rate_night_milli_pence_per_kwh', 'unit_rate_ew_milli_pence_per_kwh'];
  let oddRates = 0;
  let oddStanding = 0;
  for (const r of rows) {
    if (RATE_KEYS.some((k) => r[k] !== null && (r[k] < 1000 || r[k] > 100000))) oddRates += 1;
    if (r.standing_charge_milli_pence_per_day > 1000000) oddStanding += 1;
  }
  if (oddRates) {
    assumptions.push(`Unit check: ${oddRates} converted rows have a unit rate below 1p or above 100p per kWh. Check the file is in pence.`);
  }
  if (oddStanding) {
    assumptions.push(`Unit check: ${oddStanding} converted rows have a standing charge above 1,000p a day. Check the file is in pence.`);
  }
  return { rows, refused, rowCountSource, assumptions };
}
