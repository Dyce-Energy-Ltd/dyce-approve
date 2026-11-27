import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  fyMonths, fyStartOf, fyLabel, monthText, monthName, inRange, parseMonth, parseNumber, serialToIso,
  formatValue, checkValue, sortItems, monthStatus, templateAoa, buildTemplate, readTemplate,
  formChanges, rowsForYear, TEMPLATE_SHEET, TEMPLATE_HEADER, inputValue, restValue,
} from './import.js';

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js');

// The items as the design seeds dpf.figure_item. Every figure in this file is invented.
const ITEMS = [
  ['cost_of_sales_gbp', 'Cost of sales', 'GBP', 'actual', null, null, false],
  ['overheads_gbp', 'Overheads', 'GBP', 'actual', null, null, false],
  ['opex_gbp', 'OPEX', 'GBP', 'actual', null, null, false],
  ['bad_debt_written_off_gbp', 'Bad debt written off', 'GBP', 'actual', 0, null, false],
  ['trustpilot_score', 'Trustpilot score at month end', 'score', 'actual', 0, 5, false],
  ['trustpilot_new_reviews', 'Trustpilot new reviews in the month', 'count', 'actual', 0, null, true],
  ['plan_gm_gbp', 'Plan gross margin', 'GBP', 'plan', null, null, false],
  ['plan_ebitda_gbp', 'Plan EBITDA', 'GBP', 'plan', null, null, false],
  ['plan_volume_mwh', 'Plan volume at month end', 'MWh', 'plan', 0, null, false],
  ['plan_opex_gbp', 'Plan OPEX', 'GBP', 'plan', null, null, false],
  ['plan_bad_debt_pct', 'Bad debt target', '% of revenue billed', 'plan', 0, 100, false],
  ['plan_trustpilot_score', 'Trustpilot score target', 'score', 'plan', 0, 5, false],
  ['plan_trustpilot_new_reviews', 'Trustpilot new reviews target', 'count', 'plan', 0, null, true],
].map(([code, label, unit, kind, min_value, max_value, whole_number], i) => ({ code, label, unit, kind, sort: i + 1, min_value, max_value, whole_number }));
const item = (code) => ITEMS.find((x) => x.code === code);
const toSerial = (iso) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;
const bytesOf = (wb) => new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

test('financial years run June to May', () => {
  assert.deepEqual(fyMonths(2026).slice(0, 2), ['2026-06-01', '2026-07-01']);
  assert.equal(fyMonths(2026)[11], '2027-05-01');
  assert.equal(fyStartOf('2026-05-01'), 2025);
  assert.equal(fyStartOf('2026-06-01'), 2026);
  assert.equal(fyLabel(2026), 'June 2026 to May 2027');
  assert.equal(monthText('2026-06-01'), '06/2026');
  assert.equal(monthName('2026-06-01'), 'Jun 2026');
  assert.ok(inRange('2024-06-01') && inRange('2031-05-01'));
  assert.ok(!inRange('2024-05-01') && !inRange('2031-06-01') && !inRange('2026-06-15'));
});

test('Excel serials and month cells', () => {
  // A known serial, not one worked out the same way as the code: 44927 is 01/01/2023.
  assert.equal(serialToIso(44927), '2023-01-01');
  assert.equal(parseMonth(44927), '2023-01-01');
  assert.equal(parseMonth(44928), null, 'a date on the 2nd is not a month');
  assert.equal(parseMonth('06/2026'), '2026-06-01');
  assert.equal(parseMonth('6/2026'), '2026-06-01');
  assert.equal(parseMonth('2026-06'), '2026-06-01');
  assert.equal(parseMonth('01/06/2026'), '2026-06-01');
  assert.equal(parseMonth('15/06/2026'), null);
  assert.equal(parseMonth('13/2026'), null);
  assert.equal(parseMonth('June'), null);
});

test('numbers are read without guessing', () => {
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('\u00a31,234'), 1234);
  assert.equal(parseNumber('-250'), -250);
  assert.equal(parseNumber('0.5%'), 0.5);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(null), null);
  assert.ok(Number.isNaN(parseNumber('about 5')));
  assert.ok(Number.isNaN(parseNumber('#REF!')));
});

test('values are shown in their unit', () => {
  assert.equal(formatValue(item('opex_gbp'), 123456), '\u00a3123,456');
  assert.equal(formatValue(item('opex_gbp'), 1234.5), '\u00a31,234.50');
  assert.equal(formatValue(item('plan_ebitda_gbp'), -2500), '-\u00a32,500');
  assert.equal(formatValue(item('plan_volume_mwh'), 165970.25), '165,970.25 MWh');
  assert.equal(formatValue(item('trustpilot_score'), 4.56), '4.6');
  assert.equal(formatValue(item('trustpilot_new_reviews'), 1200), '1,200');
  assert.equal(formatValue(item('plan_bad_debt_pct'), 0.5), '0.5%');
  assert.equal(formatValue(item('opex_gbp'), null), '');
});

test('each item is checked as the database checks it', () => {
  assert.equal(checkValue(item('cost_of_sales_gbp'), -10), null);
  assert.equal(checkValue(item('bad_debt_written_off_gbp'), -1), 'Bad debt written off: must be 0 or more.');
  assert.equal(checkValue(item('trustpilot_score'), 5.1), 'Trustpilot score at month end: must be from 0 to 5.');
  assert.equal(checkValue(item('trustpilot_new_reviews'), 2.5), 'Trustpilot new reviews in the month: must be a whole number.');
  assert.equal(checkValue(item('plan_bad_debt_pct'), 101), 'Bad debt target: must be from 0 to 100.');
  assert.equal(checkValue(item('opex_gbp'), NaN), 'OPEX: not a number.');
});

test('items sort actuals first, then plan', () => {
  const mixed = [item('plan_gm_gbp'), item('opex_gbp'), { ...item('cost_of_sales_gbp'), sort: 99 }];
  assert.deepEqual(sortItems(mixed).map((x) => x.code), ['opex_gbp', 'cost_of_sales_gbp', 'plan_gm_gbp']);
});

test('a month status says complete or how many are missing, and nothing of a sign-off', () => {
  assert.deepEqual(monthStatus({ missing: [], signed_off: null }), { kind: 'complete', text: 'Complete' });
  assert.deepEqual(monthStatus({ missing: ['a', 'b'], signed_off: null }), { kind: 'missing', text: '2 missing' });
  assert.deepEqual(monthStatus({ missing: [], signed_off: { by: 'carl.example@dyce-energy.co.uk', at: '2026-07-05T09:00:00+00:00' } }),
    { kind: 'complete', text: 'Complete' });
});

// ---------- the Dyce template

const STATE_MONTHS = fyMonths(2026).map((month, i) => ({ month, figures: i === 0 ? { opex_gbp: 41000, trustpilot_score: 4.5 } : {} }));
const csvOf = (lines) => new TextEncoder().encode(lines.join('\n'));

test('the template is laid out as the Months table, with the values held', () => {
  const aoa = templateAoa(ITEMS, STATE_MONTHS);
  assert.deepEqual(aoa[0], [...TEMPLATE_HEADER, '06/2026', '07/2026', '08/2026', '09/2026', '10/2026', '11/2026', '12/2026', '01/2027', '02/2027', '03/2027', '04/2027', '05/2027']);
  assert.equal(aoa.length, 1 + 2 + 13, 'a header, the two group rows and every item');
  assert.deepEqual(aoa[1], [null, 'Actuals', null, ...Array(12).fill(null)]);
  assert.deepEqual(aoa[2], ['cost_of_sales_gbp', 'Cost of sales', 'GBP', ...Array(12).fill(null)]);
  assert.deepEqual(aoa[4], ['opex_gbp', 'OPEX', 'GBP', 41000, ...Array(11).fill(null)]);
  assert.deepEqual(aoa[8].slice(0, 3), [null, 'Plan', null]);
  assert.equal(aoa[9][0], 'plan_gm_gbp');
});

test('template round trip: download, change a value, read it back', () => {
  const bytes = buildTemplate(XLSX, ITEMS, STATE_MONTHS);
  const wb = XLSX.read(bytes, { type: 'array' });
  assert.deepEqual(wb.SheetNames, [TEMPLATE_SHEET]);
  const ws = wb.Sheets[TEMPLATE_SHEET];
  assert.equal(ws.D1.t, 's', 'the month heading is text, MM/YYYY');
  // Row 3 is cost of sales, row 5 OPEX; column D is June, E July.
  ws.E3 = { t: 'n', v: 120000 };
  ws.D5 = { t: 'n', v: 42500 };
  const back = readTemplate(XLSX, bytesOf(wb), 'dpf-template.xlsx', ITEMS);
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.rows, [
    { month: '2026-07-01', code: 'cost_of_sales_gbp', value: 120000 },
    { month: '2026-06-01', code: 'opex_gbp', value: 42500 },
    { month: '2026-06-01', code: 'trustpilot_score', value: 4.5 },
  ]);
  assert.equal(back.blank, 12 * 13 - 3, 'blank cells are left as they are');
});

test('a CSV template is read by its headings, wherever the columns are', () => {
  const r = readTemplate(XLSX, csvOf(['﻿Item,08/2026,Item code,07/2026', 'Trustpilot score at month end,4.2,,',
    'OPEX,,opex_gbp,"1,250"', ',,overheads_gbp,']), 'figures.csv', ITEMS);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows, [
    { month: '2026-08-01', code: 'trustpilot_score', value: 4.2 },
    { month: '2026-07-01', code: 'opex_gbp', value: 1250 },
  ]);
});

test('a month heading Excel turned into a date is still read', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Item code', 'Item', toSerial('2026-09-01')], ['opex_gbp', 'OPEX', 5]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET);
  assert.deepEqual(readTemplate(XLSX, bytesOf(wb), 't.xlsx', ITEMS).rows, [{ month: '2026-09-01', code: 'opex_gbp', value: 5 }]);
});

test('a percentage typed as 0.5% in Excel is read as 0.5, a plain 0.5 too', () => {
  const ws = XLSX.utils.aoa_to_sheet([['Item code', 'Item', '06/2026', '07/2026'], ['plan_bad_debt_pct', null, 0.005, 0.5]]);
  ws.C2.z = '0.00%';
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET);
  assert.deepEqual(readTemplate(XLSX, bytesOf(wb), 't.xlsx', ITEMS).rows, [
    { month: '2026-06-01', code: 'plan_bad_debt_pct', value: 0.5 },
    { month: '2026-07-01', code: 'plan_bad_debt_pct', value: 0.5 },
  ]);
});

test('negative control: every bad heading and cell is a problem, and nothing passes with it', () => {
  const r = readTemplate(XLSX, csvOf(['Item code,Item,06/2026,15/06/2026,06/2023,07/2026,07/2026',
    'nope,,1,,,,', 'opex_gbp,,lots,,,,', 'trustpilot_score,,6,,,,', 'trustpilot_new_reviews,,2.5,,,,',
    'opex_gbp,,,,,1,', 'Plan,,,,,,']), 'bad.csv', ITEMS);
  assert.deepEqual(r.problems, [
    'Cell D1: "15/06/2026" is not a month. Write it as MM/YYYY.',
    'Cell E1: 06/2023 is outside 06/2024 to 05/2031.',
    'Cell G1: 07/2026 is also in cell F1.',
    'Row 2: "nope" is not a DPF item.',
    'Cell C3: OPEX for 06/2026: "lots" is not a number.',
    'Cell C4: 06/2026, Trustpilot score at month end: must be from 0 to 5.',
    'Cell C5: 06/2026, Trustpilot new reviews in the month: must be a whole number.',
    'Row 6: OPEX is also on row 3.',
  ]);
  assert.deepEqual(r.rows, []);
  assert.deepEqual(readTemplate(XLSX, csvOf(['a,b', '1,2']), 'x.csv', ITEMS).problems,
    ['The file has no header row with Item code and the months (MM/YYYY).']);
  assert.deepEqual(readTemplate(XLSX, csvOf(['Item code,Item,06/2026', 'opex_gbp,,']), 'x.csv', ITEMS).problems,
    ['The file holds no values to save.']);
});

test('a box on the Months screen holds the value at full precision and reads back as it', () => {
  const cases = [['opex_gbp', 118250.5, '£118,250.50'], ['opex_gbp', -250, '-£250'], ['plan_volume_mwh', 158400.25, '158,400.25'],
    ['trustpilot_score', 4.65, '4.65'], ['trustpilot_score', 4, '4.0'], ['plan_bad_debt_pct', 0.5, '0.5%'], ['trustpilot_new_reviews', 18, '18']];
  for (const [code, v, want] of cases) {
    assert.equal(inputValue(item(code), v), want);
    assert.equal(parseNumber(inputValue(item(code), v)), v, `${code} ${v} reads back`);
  }
  assert.equal(inputValue(item('opex_gbp'), null), '');
});

test('a box at rest shows GBP to the whole pound and everything else as typed', () => {
  assert.equal(restValue(item('cost_of_sales_gbp'), 1031426.14), '\u00a31,031,426');
  assert.equal(restValue(item('opex_gbp'), 118250.5), '\u00a3118,251');
  assert.equal(restValue(item('plan_ebitda_gbp'), -43353.39), '-\u00a343,353');
  assert.equal(restValue(item('plan_volume_mwh'), 159100.25), '159,100.25');
  assert.equal(restValue(item('plan_bad_debt_pct'), 0.5), '0.5%');
  assert.equal(restValue(item('opex_gbp'), null), '');
});

test('the template is loaded only for the year shown, or refused whole', () => {
  const rows = [{ month: '2026-06-01', code: 'opex_gbp', value: 1 }, { month: '2027-05-01', code: 'opex_gbp', value: 2 }];
  assert.deepEqual(rowsForYear(rows, 2026), { rows, problems: [] });
  const out = rowsForYear([...rows, { month: '2027-06-01', code: 'opex_gbp', value: 3 }, { month: '2026-05-01', code: 'opex_gbp', value: 4 }], 2026);
  assert.deepEqual(out.rows, []);
  assert.deepEqual(out.problems, ['The file holds 05/2026, 06/2027, outside June 2026 to May 2027 shown here. Move to that year first, or leave those months blank.']);
});

// ---------- what the page saves

test('the form sends only changed values, null for a cleared one', () => {
  const held = { opex_gbp: 41000, trustpilot_score: 4.5, overheads_gbp: 12 };
  const r = formChanges(ITEMS, held, { opex_gbp: '41,000', trustpilot_score: '4.6', overheads_gbp: '', cost_of_sales_gbp: '', plan_gm_gbp: '\u00a35,000' });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.values, { overheads_gbp: null, trustpilot_score: 4.6, plan_gm_gbp: 5000 });
  const bad = formChanges(ITEMS, held, { trustpilot_score: '9', opex_gbp: 'n/a' });
  assert.deepEqual(bad.problems, ['OPEX: "n/a" is not a number.', 'Trustpilot score at month end: must be from 0 to 5.']);
  assert.deepEqual(bad.values, {});
});
