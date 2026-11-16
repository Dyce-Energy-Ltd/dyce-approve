import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FORMATS, ROW_KEYS, parseSupplierFile } from './adapters.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js');

// The same options the page uses: Excel as bytes, the Jellyfish CSVs as raw text.
function load(name) {
  const file = path.join(here, 'fixtures', name);
  if (name.endsWith('.csv')) {
    return XLSX.read(fs.readFileSync(file, 'utf8'), { type: 'string', raw: true });
  }
  return XLSX.read(fs.readFileSync(file), { type: 'array' });
}
const FILES = {
  voltx_elec_v1: 'voltx_elec_v1.xlsx', yu_elec_v1: 'yu_elec_v1.xlsx', yu_gas_v1: 'yu_gas_v1.xlsx',
  jellyfish_elec_v1: 'jellyfish_elec_v1.csv', jellyfish_gas_v1: 'jellyfish_gas_v1.csv',
};
const first = (wb) => wb.Sheets[wb.SheetNames[0]];
const num = (v) => ({ t: 'n', v });
const str = (v) => ({ t: 's', v });

// An expected row: every key null unless stated.
function row(over) {
  const r = Object.fromEntries(ROW_KEYS.map((k) => [k, null]));
  return Object.assign(r, over);
}

test('FORMATS lists the five adapters', () => {
  assert.deepEqual(FORMATS, ['voltx_elec_v1', 'yu_elec_v1', 'yu_gas_v1', 'jellyfish_elec_v1', 'jellyfish_gas_v1']);
});

test('every format returns keys that are exactly the base_rate columns', () => {
  for (const f of FORMATS) {
    const { rows } = parseSupplierFile(f, load(FILES[f]));
    assert.ok(rows.length > 0, f);
    for (const r of rows) assert.deepEqual(Object.keys(r).sort(), [...ROW_KEYS].sort(), f);
  }
});

test('voltx_elec_v1 converts three rows, with pence noise rounded', () => {
  const out = parseSupplierFile('voltx_elec_v1', load(FILES.voltx_elec_v1));
  assert.equal(out.rowCountSource, 3);
  assert.deepEqual(out.refused, []);
  const base = { product_name: 'Test Fixed', meter_type: 'nhh', rate_structure_source: 'NHH',
    llf_band_group: 'nda', contract_start_earliest: '2030-02-01', contract_start_latest: '2030-02-15' };
  assert.deepEqual(out.rows, [
    row({ ...base, source_row_number: 6, dno_id: '10', profile_class: 3, rate_structure: 'single',
      llf_band_number: 1, llf_band_source: 'Band 1', term_months: 12, green_energy: false,
      standing_charge_milli_pence_per_day: 50500, unit_rate_single_milli_pence_per_kwh: 27914 }),
    row({ ...base, source_row_number: 7, dno_id: '11', profile_class: 4, rate_structure: 'day_night',
      llf_band_number: 2, llf_band_source: 'Band 2', term_months: 24, green_energy: true,
      standing_charge_milli_pence_per_day: 60250, unit_rate_day_milli_pence_per_kwh: 22115,
      unit_rate_night_milli_pence_per_kwh: 20257 }),
    row({ ...base, source_row_number: 8, product_name: 'Test Green', dno_id: '23', profile_class: 3,
      rate_structure: 'single', llf_band_number: 4, llf_band_source: 'Band 4', term_months: 36,
      green_energy: true, standing_charge_milli_pence_per_day: 70000,
      unit_rate_single_milli_pence_per_kwh: 25521 }),
  ]);
});

test('yu_elec_v1 converts four rows: structure, HH, line loss bands, derived profile class', () => {
  const out = parseSupplierFile('yu_elec_v1', load(FILES.yu_elec_v1));
  assert.equal(out.rowCountSource, 4);
  assert.deepEqual(out.refused, []);
  const base = { contract_start_earliest: '2029-02-01', contract_start_latest: '2029-02-11' };
  assert.deepEqual(out.rows, [
    row({ ...base, source_row_number: 2, product_name: 'Test Std', dno_id: '12', meter_type: 'nhh',
      profile_class: 3, rate_structure: 'single', rate_structure_source: 'Standard',
      llf_band_group: 'nda', llf_band_number: 1, llf_band_source: 'NDA Band 1', term_months: 12,
      supplier_eac_min_kwh: 1000, supplier_eac_max_kwh: 300000, green_energy: false,
      standing_charge_milli_pence_per_day: 40500, unit_rate_single_milli_pence_per_kwh: 22528 }),
    row({ ...base, source_row_number: 3, product_name: 'Test HH', dno_id: '13', meter_type: 'hh',
      profile_class: null, rate_structure: 'day_night', rate_structure_source: 'HH',
      llf_band_group: 'hv', llf_band_number: 1, llf_band_source: 'HV Band 1', min_kva: 0, max_kva: 100,
      term_months: 24, supplier_eac_min_kwh: 0, supplier_eac_max_kwh: 5000000, green_energy: false,
      standing_charge_milli_pence_per_day: 100757, unit_rate_day_milli_pence_per_kwh: 18563,
      unit_rate_night_milli_pence_per_kwh: 12250, capacity_rate_milli_pence_per_kva_day: 3125 }),
    row({ ...base, source_row_number: 4, product_name: 'Test EW', dno_id: '14', meter_type: 'nhh',
      profile_class: 4, rate_structure: 'evening_weekend', rate_structure_source: 'EveningAndWeekend',
      llf_band_group: 'lv', llf_band_number: 2, llf_band_source: 'LV Band 2', term_months: 36,
      supplier_eac_min_kwh: 1000, supplier_eac_max_kwh: 300000, green_energy: true,
      standing_charge_milli_pence_per_day: 45037, unit_rate_day_milli_pence_per_kwh: 39007,
      unit_rate_ew_milli_pence_per_kwh: 19521 }),
    row({ ...base, source_row_number: 5, product_name: 'Test EWN', dno_id: '15', meter_type: 'nhh',
      profile_class: 4, rate_structure: 'evening_weekend_night',
      rate_structure_source: 'EveningWeekendAndNight', llf_band_group: 'lv_sub', llf_band_number: 3,
      llf_band_source: 'LV Sub Band 3', term_months: 12, supplier_eac_min_kwh: 1000,
      supplier_eac_max_kwh: 300000, green_energy: false, standing_charge_milli_pence_per_day: 48037,
      unit_rate_day_milli_pence_per_kwh: 39013, unit_rate_night_milli_pence_per_kwh: 14037,
      unit_rate_ew_milli_pence_per_kwh: 17037 }),
  ]);
});

test('yu_gas_v1 converts three rows; carbon_offset not green_energy; blank exit zone is null', () => {
  const out = parseSupplierFile('yu_gas_v1', load(FILES.yu_gas_v1));
  assert.equal(out.rowCountSource, 3);
  assert.deepEqual(out.refused, []);
  const base = { product_name: 'Test Gas', rate_structure: 'single', rate_structure_source: 'single',
    contract_start_earliest: '2029-02-01', contract_start_latest: '2029-02-11' };
  assert.deepEqual(out.rows, [
    row({ ...base, source_row_number: 2, ldz: 'XA', exit_zone: 'XA1', term_months: 12,
      supplier_eac_min_kwh: 1000, supplier_eac_max_kwh: 24999, carbon_offset: false,
      standing_charge_milli_pence_per_day: 30507, unit_rate_single_milli_pence_per_kwh: 7292 }),
    row({ ...base, source_row_number: 3, ldz: 'XB', exit_zone: null, term_months: 24,
      supplier_eac_min_kwh: 25000, supplier_eac_max_kwh: 49999, carbon_offset: true,
      standing_charge_milli_pence_per_day: 31264, unit_rate_single_milli_pence_per_kwh: 6875 }),
    row({ ...base, source_row_number: 4, ldz: 'XC', exit_zone: 'XC2', term_months: 36,
      supplier_eac_min_kwh: 450000, supplier_eac_max_kwh: 731999, carbon_offset: false,
      standing_charge_milli_pence_per_day: 35000, unit_rate_single_milli_pence_per_kwh: 5500 }),
  ]);
  for (const r of out.rows) { assert.equal(r.meter_type, null); assert.equal(r.green_energy, null); }
});

test('jellyfish_elec_v1 converts three rows; 0 night and E&W rates become null; DNO mapped', () => {
  const out = parseSupplierFile('jellyfish_elec_v1', load(FILES.jellyfish_elec_v1));
  assert.equal(out.rowCountSource, 3);
  assert.deepEqual(out.refused, []);
  const base = { product_name: 'Test Product (v1)', source_product_version: 'Test Product (v1)',
    meter_type: 'nhh', green_energy: false, supplier_eac_min_kwh: 1, supplier_eac_max_kwh: 300000,
    contract_start_earliest: '2030-10-01', contract_start_latest: '2031-08-31' };
  assert.deepEqual(out.rows, [
    row({ ...base, source_row_number: 2, source_price_id: '9000001', dno_id: '10', profile_class: 3,
      rate_structure: 'single', rate_structure_source: 'DAY', term_months: 12,
      standing_charge_milli_pence_per_day: 50500, unit_rate_single_milli_pence_per_kwh: 24521 }),
    row({ ...base, source_row_number: 3, source_price_id: '9000002', dno_id: '11', profile_class: 4,
      rate_structure: 'day_night', rate_structure_source: 'E7', term_months: 24,
      standing_charge_milli_pence_per_day: 50500, unit_rate_day_milli_pence_per_kwh: 25257,
      unit_rate_night_milli_pence_per_kwh: 20146 }),
    row({ ...base, source_row_number: 4, source_price_id: '9000003', dno_id: '17', profile_class: 4,
      rate_structure: 'evening_weekend_night', rate_structure_source: 'EWN', term_months: 3,
      standing_charge_milli_pence_per_day: 55037, unit_rate_day_milli_pence_per_kwh: 26037,
      unit_rate_night_milli_pence_per_kwh: 21037, unit_rate_ew_milli_pence_per_kwh: 23514 }),
  ]);
});

test('jellyfish_gas_v1 converts three rows; carbon_offset false; dates parsed dd/mm/yyyy', () => {
  const out = parseSupplierFile('jellyfish_gas_v1', load(FILES.jellyfish_gas_v1));
  assert.equal(out.rowCountSource, 3);
  assert.deepEqual(out.refused, []);
  const base = { product_name: 'Test Product (v1)', source_product_version: 'Test Product (v1)',
    rate_structure: 'single', rate_structure_source: 'single', carbon_offset: false,
    contract_start_earliest: '2030-10-01', contract_start_latest: '2031-08-31' };
  assert.deepEqual(out.rows, [
    row({ ...base, source_row_number: 2, source_price_id: '9100001', ldz: 'XA', term_months: 3,
      supplier_eac_min_kwh: 1, supplier_eac_max_kwh: 10000, standing_charge_milli_pence_per_day: 22528,
      unit_rate_single_milli_pence_per_kwh: 8257 }),
    row({ ...base, source_row_number: 3, source_price_id: '9100002', ldz: 'XB', term_months: 12,
      supplier_eac_min_kwh: 10001, supplier_eac_max_kwh: 20000, standing_charge_milli_pence_per_day: 40757,
      unit_rate_single_milli_pence_per_kwh: 7507 }),
    row({ ...base, source_row_number: 4, source_price_id: '9100003', ldz: 'XC', term_months: 36,
      contract_start_earliest: '2030-10-02', supplier_eac_min_kwh: 20001, supplier_eac_max_kwh: 293000,
      standing_charge_milli_pence_per_day: 58037, unit_rate_single_milli_pence_per_kwh: 6139 }),
  ]);
});

// --- blank rate -------------------------------------------------------------------------------

// The cell holding the first data row's main rate, and that row's sheet number.
const RATE_CELL = {
  voltx_elec_v1: ['X6', 6], yu_elec_v1: ['W2', 2], yu_gas_v1: ['S2', 2],
  jellyfish_elec_v1: ['G2', 2], jellyfish_gas_v1: ['E2', 2],
};
for (const f of FORMATS) {
  test(`${f}: a blank rate is refused with reason 'blank rate' and the sheet row number`, () => {
    const wb = load(FILES[f]);
    const [addr, rn] = RATE_CELL[f];
    assert.ok(first(wb)[addr], `fixture has a value at ${addr}`);
    delete first(wb)[addr];
    const out = parseSupplierFile(f, wb);
    assert.deepEqual(out.refused, [{ row: rn, reason: 'blank rate' }]);
    assert.equal(out.rows.length, out.rowCountSource - 1);
    assert.ok(out.rows.every((r) => r.source_row_number !== rn));
  });
}

test('a rate that is text, not a number, is refused and never read as 0', () => {
  const wb = load(FILES.yu_gas_v1);
  first(wb).S2 = str('n/a');
  const out = parseSupplierFile('yu_gas_v1', wb);
  assert.equal(out.refused.length, 1);
  assert.match(out.refused[0].reason, /not a number/);
  assert.equal(out.rows.length, 2);
});

test('a rate that does not round cleanly to 3 dp is refused', () => {
  const wb = load(FILES.yu_gas_v1);
  first(wb).S2 = num(7.2504);
  const out = parseSupplierFile('yu_gas_v1', wb);
  assert.match(out.refused[0].reason, /3 dp/);
});

// --- layout drift -----------------------------------------------------------------------------

const HEADER_CELL = {
  voltx_elec_v1: ['W5', 'Standing_Charge'], yu_elec_v1: ['V1', 'Standing_Charge'],
  yu_gas_v1: ['R1', 'Standing_Charge'], jellyfish_elec_v1: ['F1', 'standingCharge'],
  jellyfish_gas_v1: ['D1', 'standingCharge'],
};
for (const f of FORMATS) {
  test(`${f}: a renamed header throws 'Missing columns' and returns nothing`, () => {
    const wb = load(FILES[f]);
    const [addr, name] = HEADER_CELL[f];
    assert.equal(first(wb)[addr].v, name, 'fixture header is where the test expects');
    first(wb)[addr] = str(name + ' (p/day)');
    let result;
    assert.throws(() => { result = parseSupplierFile(f, wb); }, (e) => {
      assert.equal(e.message, `Missing columns: ${name}`);
      return true;
    });
    assert.equal(result, undefined);
  });
}

// A row put in above the header (a title a supplier adds, say) moves the header down one row. The
// adapter reads the header from its fixed row, so it finds the title there and refuses the file,
// rather than reading a data row as the header or the header as data.
const HEADER_ROW = { voltx_elec_v1: 5, yu_elec_v1: 1, yu_gas_v1: 1, jellyfish_elec_v1: 1, jellyfish_gas_v1: 1 };
function withRowAbove(ws, rowNumber, text) {
  const out = {};
  for (const [addr, cell] of Object.entries(ws)) {
    if (addr.startsWith('!')) continue;
    const c = XLSX.utils.decode_cell(addr);
    if (c.r >= rowNumber - 1) c.r += 1;
    out[XLSX.utils.encode_cell(c)] = cell;
  }
  out[XLSX.utils.encode_cell({ r: rowNumber - 1, c: 0 })] = str(text);
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.e.r += 1;
  out['!ref'] = XLSX.utils.encode_range(range);
  return out;
}
for (const f of FORMATS) {
  test(`${f}: an extra title row above the header throws 'Missing columns' and returns nothing`, () => {
    const wb = load(FILES[f]);
    const name = wb.SheetNames[0];
    wb.Sheets[name] = withRowAbove(wb.Sheets[name], HEADER_ROW[f], 'Price list (an invented title row)');
    let result;
    assert.throws(() => { result = parseSupplierFile(f, wb); }, (e) => {
      assert.match(e.message, /^Missing columns: \S/);
      return true;
    });
    assert.equal(result, undefined);
  });
}

test('several missing headers are all named', () => {
  const wb = load(FILES.yu_gas_v1);
  first(wb).O1 = str('Carbon');
  first(wb).S1 = str('Rate');
  assert.throws(() => parseSupplierFile('yu_gas_v1', wb), { message: 'Missing columns: Carbon_Offset, Unit_Rate' });
});

test('an unknown format or a missing sheet throws', () => {
  assert.throws(() => parseSupplierFile('nope', load(FILES.yu_gas_v1)), /Unknown format/);
  const wb = load(FILES.yu_gas_v1);
  const ws = first(wb);
  wb.SheetNames = ['Other'];
  wb.Sheets = { Other: ws };
  assert.throws(() => parseSupplierFile('yu_gas_v1', wb), /Missing sheet: Dyce/);
});

// --- format rules -----------------------------------------------------------------------------

test('Yu HH rows carry meter_type hh, max_kva and capacity, and no profile class', () => {
  const { rows } = parseSupplierFile('yu_elec_v1', load(FILES.yu_elec_v1));
  const hh = rows.find((r) => r.rate_structure_source === 'HH');
  assert.equal(hh.meter_type, 'hh');
  assert.equal(hh.max_kva, 100);
  assert.equal(hh.capacity_rate_milli_pence_per_kva_day, 3125);
  assert.equal(hh.profile_class, null);
  assert.equal(hh.rate_structure, 'day_night');
});

test('Yu: an unknown structure, a rate the structure does not use, and one end of a range are refused', () => {
  const wb = load(FILES.yu_elec_v1);
  const ws = first(wb);
  ws.F2 = str('Weekday');   // unknown structure
  ws.W3 = num(9);           // Standard rate filled on an HH row
  delete ws.K4;             // maximum consumption missing on row 4
  const out = parseSupplierFile('yu_elec_v1', wb);
  assert.deepEqual(out.refused, [
    { row: 2, reason: 'unknown rate structure' },
    { row: 3, reason: 'rates do not match the rate structure' },
    { row: 4, reason: 'one end of the consumption range is blank' },
  ]);
  assert.equal(out.rows.length, 1);
});

test('Voltx: both kinds of rate, or rates that disagree with the profile class, are refused', () => {
  const wb = load(FILES.voltx_elec_v1);
  const ws = first(wb);
  ws.Y6 = num(20);   // Day_Rate filled on a Standard row
  ws.F7 = str('03'); // Profile_Class 3 on a day/night row
  const out = parseSupplierFile('voltx_elec_v1', wb);
  assert.deepEqual(out.refused, [
    { row: 6, reason: 'both single and day or night rates are filled' },
    { row: 7, reason: 'rates do not agree with profile class' },
  ]);
});

test('a term over 36 months is refused, and a term under 12 is allowed', () => {
  const wb = load(FILES.jellyfish_gas_v1);
  first(wb).J4 = num(48);
  const out = parseSupplierFile('jellyfish_gas_v1', wb);
  assert.deepEqual(out.refused, [{ row: 4, reason: 'term outside 1 to 36 months' }]);
  assert.equal(out.rows[0].term_months, 3);
});

test('Jellyfish: a 0 rate the structure needs is blank, one it does not need loads as null', () => {
  const wb = load(FILES.jellyfish_elec_v1);
  first(wb).H3 = num(0);   // E7 needs a night rate
  const out = parseSupplierFile('jellyfish_elec_v1', wb);
  assert.deepEqual(out.refused, [{ row: 3, reason: 'blank rate' }]);
  assert.equal(out.rows[0].unit_rate_night_milli_pence_per_kwh, null);
  assert.equal(out.rows[0].unit_rate_ew_milli_pence_per_kwh, null);
});

test('Jellyfish: an unknown region letter and an impossible date are refused', () => {
  const wb = load(FILES.jellyfish_elec_v1);
  first(wb).C2 = str('_Z');
  first(wb).L3 = str('31/31/2030');
  const out = parseSupplierFile('jellyfish_elec_v1', wb);
  assert.deepEqual(out.refused.map((r) => r.row), [2, 3]);
  assert.equal(out.refused[0].reason, 'unknown region letter');
  assert.match(out.refused[1].reason, /not a date/);
});

test('wholly blank rows are not counted, and assumptions are reported', () => {
  const out = parseSupplierFile('voltx_elec_v1', load(FILES.voltx_elec_v1));
  assert.equal(out.rowCountSource, 3);
  assert.ok(out.assumptions.some((a) => /nda/.test(a)));
});

test('unit check: odd magnitudes are flagged in assumptions, not refused; clean files are not flagged', () => {
  const clean = parseSupplierFile('yu_gas_v1', load(FILES.yu_gas_v1));
  assert.ok(!clean.assumptions.some((a) => /Unit check/.test(a)));
  const wb = load(FILES.yu_gas_v1);
  first(wb).S2 = num(0.072);   // a rate in pounds
  first(wb).S3 = num(250);     // a stray large rate
  first(wb).R4 = num(1500);    // a stray large standing charge
  const out = parseSupplierFile('yu_gas_v1', wb);
  assert.deepEqual(out.refused, []);
  assert.equal(out.rows.length, 3);
  assert.ok(out.assumptions.includes('Unit check: 2 converted rows have a unit rate below 1p or above 100p per kWh. Check the file is in pence.'));
  assert.ok(out.assumptions.includes('Unit check: 1 converted rows have a standing charge above 1,000p a day. Check the file is in pence.'));
});

test('Yu electricity: a blank line loss band is refused on NHH rows, allowed on HH rows', () => {
  const wb = load(FILES.yu_elec_v1);
  const ws = first(wb);
  delete ws.G2;   // NHH row
  delete ws.G3;   // HH row
  const out = parseSupplierFile('yu_elec_v1', wb);
  assert.deepEqual(out.refused, [{ row: 2, reason: 'blank line loss band' }]);
  const hh = out.rows.find((r) => r.source_row_number === 3);
  assert.equal(hh.llf_band_group, null);
  assert.equal(hh.llf_band_number, null);
  assert.equal(hh.llf_band_source, null);
});
