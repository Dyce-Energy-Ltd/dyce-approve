import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  BROKER_HEADER, BROKER_GAS_HEADER, UD_HEADER, BROKER_SHEET, BROKER_GAS_SHEET, UD_SHEET, brokerSheet,
  brokerGasSheet, udUploadSheet, workbookFor,
} from './exports.js';

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js');

// Every value here is invented. The rates are not any supplier's or any Dyce price.
const NAMES = {
  tariff_name_acquisition: 'Dec26-12M-Acq Gold Standard',
  tariff_name_renewal: 'Dec26-12M-Ren Gold Standard',
};
function book(over = {}) {
  return {
    price_run_id: '00000000-0000-4000-8000-000000000001', product_key: 'k1', supplier_id: 'acme',
    fuel: 'electricity', product: 'Gold', sale_type: 'acquisition', base_rate_id: 1, band_index: 1,
    product_name: 'Example Fixed', dno_id: '10', ldz: null, exit_zone: null, meter_type: 'nhh',
    profile_class: 3, rate_structure: 'single', llf_band_group: 'nda', llf_band_number: 1,
    min_kva: null, max_kva: null, term_months: 12, contract_start_earliest: '2026-12-01',
    contract_start_latest: '2026-12-31', green_energy: false, carbon_offset: false,
    piece_min_kwh: 1000, piece_max_kwh: 10000,
    sell_standing_charge_milli_pence_per_day: 61228,
    sell_unit_rate_single_milli_pence_per_kwh: 31468,
    sell_unit_rate_day_milli_pence_per_kwh: null, sell_unit_rate_night_milli_pence_per_kwh: null,
    sell_unit_rate_ew_milli_pence_per_kwh: null, sell_capacity_rate_milli_pence_per_kva_day: null,
    sell_standing_charge_pence_2dp: '61.23', sell_unit_rate_single_pence_2dp: '31.47',
    sell_unit_rate_day_pence_2dp: null, sell_unit_rate_night_pence_2dp: null,
    sell_unit_rate_ew_pence_2dp: null, sell_capacity_rate_pence_2dp: null,
    tariff_code: 'DV SR Standard', ...NAMES, split_used: null, sell_tac_pence: 123456,
    quote_valid_from: '2026-11-20', quote_valid_until: '2026-11-27', published_by: 'someone@example.invalid',
    published_at: '2026-11-20T09:00:00Z', ...over,
  };
}
const dayNight = (over = {}) => book({
  rate_structure: 'day_night', profile_class: 4, tariff_code: 'DV TR DN',
  sell_unit_rate_single_pence_2dp: null, sell_unit_rate_day_pence_2dp: '35.11',
  sell_unit_rate_night_pence_2dp: '20.42', ...over,
});
const hh = (over = {}) => dayNight({
  meter_type: 'hh', profile_class: null, llf_band_group: 'lv', llf_band_number: 2,
  sell_capacity_rate_pence_2dp: '1.75', ...over,
});
const gas = (over = {}) => book({ fuel: 'gas', dno_id: null, ldz: 'EA', meter_type: null, profile_class: null,
  rate_structure: 'single', llf_band_group: null, llf_band_number: null, piece_min_kwh: 1000,
  piece_max_kwh: 10000, tariff_code: 'GAS Gold', sell_standing_charge_pence_2dp: '63.33',
  sell_unit_rate_single_pence_2dp: '8.71', ...over });
const TODAY = '2026-11-20';
const at = (r, n) => r[UD_HEADER.indexOf(n)];

test('Broker header is exactly the old file\'s 20 columns', () => {
  assert.deepEqual(BROKER_HEADER, [
    'Type', 'Tariff ID', 'ProfileClass', 'Area Code', 'ratestructure', 'LLF_Band', 'EAC Min',
    'EAC Max', 'Tariff Code', 'Term', 'Start Date', 'End Date', 'Single Rate', 'Day Rate',
    'Night Rate', 'Evening/Weekend Rate', 'Standing charge electricity', 'Capacity_Rate',
    'Metering_Charge', 'Green']);
  const s = brokerSheet([]);
  assert.equal(s.name, 'Broker Flat-File');
  assert.deepEqual(s.aoa, [BROKER_HEADER]);
});

test('UD Upload header is exactly the 35 column Template layout', () => {
  assert.deepEqual(UD_HEADER, [
    'BrokerId', 'Utility', 'DnoId', 'ProfileClass', 'RateStructure', 'Ldz', 'ExitZone', 'SaleType',
    'ContractDuration', 'MinimumAnnualConsumption', 'MaximumAnnualConsumption',
    'MinimumContractStartDate', 'MaximumContractStartDate', 'MinimumValidQuoteDate',
    'MaximumValidQuoteDate', 'PaymentMethod', 'ProductName', 'StandingChargeType', 'GreenEnergy',
    'Amr', 'MinimumCreditScore', 'MaximumCreditScore', 'SetUplift', 'StandingCharge', 'DayRate',
    'NightRate', 'EveningWeekendRate', 'UnitRate', 'FixedContractEndDate', 'Version',
    'TariffInformation1', 'TariffInformation2', 'TariffInformation3', 'TariffInformation4',
    'TariffInformation5']);
  assert.equal(UD_HEADER.length, 35);
  const s = udUploadSheet([], TODAY);
  assert.equal(s.name, 'Template');
  assert.deepEqual(s.aoa, [UD_HEADER]);
});

test('Gas broker header is exactly the 14 columns of the old gas file', () => {
  assert.deepEqual(BROKER_GAS_HEADER, [
    'Type', 'Tariff ID', 'Ldz', 'ContractDuration', 'AQ Min', 'AQ Max', 'MinimumContractStartDate',
    'MaximumContractStartDate', 'MinimumValidQuoteDate', 'MaximumValidQuoteDate', 'Carbon_Offset',
    'StandingCharge', 'UnitRate', 'Version']);
  const s = brokerGasSheet([], TODAY);
  assert.equal(s.name, 'Gas Broker Pricing');
  assert.deepEqual(s.aoa, [BROKER_GAS_HEADER]);
});

test('a single rate acquisition row gives the Broker line in the old shape, at 2 dp', () => {
  const { aoa } = brokerSheet([book()]);
  assert.equal(aoa.length, 2);
  assert.deepEqual(aoa[1], [
    'Acquisition', 'Dec26-12M-Acq Gold Standard', 3, 10, 'Standard', 'NDA Band 1', 1000, 10000,
    'DV SR Standard', '12 Months', '01/12/2026', '31/12/2026', 31.47, null, null, null, 61.23,
    null, null, 'Standard']);
});

test('the rates are the 2 dp figures, never the milli-pence ones', () => {
  const line = brokerSheet([book()]).aoa[1];
  assert.equal(line[12], 31.47);
  assert.equal(line[16], 61.23);
  assert.ok(!line.includes(31468) && !line.includes(61228));
});

test('a green day night row gives Day and Night rates and the Green flag', () => {
  const line = brokerSheet([dayNight({ green_energy: true, term_months: 24 })]).aoa[1];
  assert.equal(line[2], 4);
  assert.equal(line[4], 'Day Night');
  assert.equal(line[9], '24 Months');
  assert.deepEqual(line.slice(12, 17), [null, 35.11, 20.42, null, 61.23]);
  assert.equal(line[19], 'Green');
});

test('a sale type all row gives an Acquisition line and a Renewal line, each with its name', () => {
  const { aoa } = brokerSheet([book({ sale_type: 'all' })]);
  assert.equal(aoa.length, 3);
  assert.deepEqual([aoa[1][0], aoa[1][1]], ['Acquisition', 'Dec26-12M-Acq Gold Standard']);
  assert.deepEqual([aoa[2][0], aoa[2][1]], ['Renewal', 'Dec26-12M-Ren Gold Standard']);
  assert.deepEqual(aoa[1].slice(2), aoa[2].slice(2));
  const ud = udUploadSheet([book({ sale_type: 'all' })], TODAY).aoa;
  assert.equal(ud.length, 3);
  assert.deepEqual([at(ud[1], 'SaleType'), at(ud[1], 'TariffInformation2')],
    ['Acquisition', 'Dec26-12M-Acq Gold Standard']);
  assert.deepEqual([at(ud[2], 'SaleType'), at(ud[2], 'TariffInformation2')],
    ['Renewal', 'Dec26-12M-Ren Gold Standard']);
});

test('an acquisition row or a renewal row gives one line', () => {
  assert.equal(brokerSheet([book({ sale_type: 'acquisition' })]).aoa.length, 2);
  const r = brokerSheet([book({ sale_type: 'renewal', tariff_name_acquisition: null })]).aoa;
  assert.equal(r.length, 2);
  assert.deepEqual([r[1][0], r[1][1]], ['Renewal', 'Dec26-12M-Ren Gold Standard']);
});

test('a line with no tariff name is refused, not dropped', () => {
  assert.throws(() => brokerSheet([book({ tariff_name_acquisition: null })]), /tariff name/i);
  assert.throws(() => udUploadSheet([book({ sale_type: 'all', tariff_name_renewal: null })], TODAY), /tariff name/i);
  assert.throws(() => brokerGasSheet([gas({ tariff_name_acquisition: null })], TODAY), /tariff name/i);
});

test('Broker keeps half hourly rows with the Capacity rate; gas rows are not in it', () => {
  const { aoa } = brokerSheet([book(), hh(), gas()]);
  assert.equal(aoa.length, 3);
  const line = aoa[2];
  assert.equal(line[2], null);
  assert.equal(line[5], 'LV Band 2');
  assert.equal(line[17], 1.75);
});

test('UD Upload omits half hourly rows, keeps gas rows', () => {
  const { aoa } = udUploadSheet([hh(), gas(), dayNight()], TODAY);
  assert.equal(aoa.length, 3);
  assert.deepEqual(aoa.slice(1).map((r) => at(r, 'Utility')), ['Gas', 'Electricity']);
  assert.equal(at(aoa[2], 'RateStructure'), 'Day Night Band 1');
});

test('UD Upload leaves out terms under 6 months; the broker files keep them', () => {
  const rows = [book({ term_months: 3 }), book({ term_months: 6 }), gas({ term_months: 3 })];
  const ud = udUploadSheet(rows, TODAY).aoa;
  assert.equal(ud.length, 2);
  assert.equal(at(ud[1], 'ContractDuration'), 6);
  assert.equal(brokerSheet(rows).aoa.length, 3);
  assert.equal(brokerGasSheet(rows, TODAY).aoa.length, 2);
});

test('UD Upload electricity line, cell by cell', () => {
  const a = udUploadSheet([book()], TODAY).aoa[1];
  assert.equal(a.length, 35);
  assert.deepEqual(a, [
    'Dyce', 'Electricity', 10, 3, 'Standard Band 1', null, null, 'Acquisition', 12, 1000, 10000,
    '01/12/2026', '31/12/2026', '20/11/2026', '27/11/2026', 'Direct Debit', 'Example Fixed',
    'With S/C', 'N', null, null, null, null, 61.23, null, null, null, 31.47, null, '20/11/2026',
    'DV SR Standard', 'Dec26-12M-Acq Gold Standard', null, null, null]);
  assert.equal(at(udUploadSheet([book({ green_energy: true })], TODAY).aoa[1], 'GreenEnergy'), 'Y');
  const dn = udUploadSheet([dayNight()], TODAY).aoa[1];
  assert.deepEqual([at(dn, 'DayRate'), at(dn, 'NightRate'), at(dn, 'UnitRate')], [35.11, 20.42, null]);
  const noBand = udUploadSheet([book({ llf_band_group: null, llf_band_number: null })], TODAY).aoa[1];
  assert.equal(at(noBand, 'RateStructure'), 'Standard');
});

test('UD Upload gas line, cell by cell', () => {
  const a = udUploadSheet([gas({ product_name: 'DY4 Gold' })], TODAY).aoa[1];
  assert.deepEqual(a, [
    'Dyce', 'Gas', null, null, 'Standard', 'EA', null, 'Acquisition', 12, 1000, 10000,
    '01/12/2026', '31/12/2026', '20/11/2026', '27/11/2026', 'Direct Debit', 'DY4 Gold',
    'With S/C', 'N', null, null, null, null, 63.33, null, null, null, 8.71, null, '20/11/2026',
    'GAS Gold', 'Dec26-12M-Acq Gold Standard', null, null, null]);
});

test('UD Upload Version is the injected date, and the default is today', () => {
  assert.equal(at(udUploadSheet([book()], '2026-01-05').aoa[1], 'Version'), '05/01/2026');
  assert.equal(at(udUploadSheet([book()], new Date(2026, 10, 3)).aoa[1], 'Version'), '03/11/2026');
  assert.match(at(udUploadSheet([book()]).aoa[1], 'Version'), /^\d{2}\/\d{2}\/\d{4}$/);
});

test('Gas broker file: gas rows only, in the old gas file\'s shape, at 2 dp', () => {
  const { aoa } = brokerGasSheet([book(), gas({ sale_type: 'all' }), gas({ carbon_offset: true, term_months: 3 })], TODAY);
  assert.equal(aoa.length, 4);
  assert.deepEqual(aoa[1], [
    'Acquisition', 'Dec26-12M-Acq Gold Standard', 'EA', 12, 1000, 10000, '01/12/2026', '31/12/2026',
    '20/11/2026', '27/11/2026', 'Standard', 63.33, 8.71, '20/11/2026']);
  assert.deepEqual([aoa[2][0], aoa[2][1]], ['Renewal', 'Dec26-12M-Ren Gold Standard']);
  assert.equal(aoa[3][3], 3);
  assert.equal(aoa[3][10], 'Carbon Offset');
});

test('no output column name mentions Cost, Margin or TAC', () => {
  for (const name of [...BROKER_HEADER, ...BROKER_GAS_HEADER, ...UD_HEADER]) {
    assert.doesNotMatch(name, /cost|margin|tac/i, name);
  }
});

test('no cost or margin figure leaks into a line', () => {
  const r = book({ cost_tac_pence: 777001, margin_pence: 888002, sell_tac_pence: 999003 });
  for (const v of [...brokerSheet([r]).aoa[1], ...udUploadSheet([r], TODAY).aoa[1],
    ...brokerGasSheet([{ ...r, fuel: 'gas' }], TODAY).aoa[1]]) {
    assert.ok(![777001, 888002, 999003].includes(v));
  }
});

test('workbookFor round trips: sheet name and header row survive a write and a read', () => {
  const rows = [book(), dayNight({ sale_type: 'all' }), gas()];
  for (const [layout, name, header, n] of [
    ['broker', BROKER_SHEET, BROKER_HEADER, 4], ['ud_upload', UD_SHEET, UD_HEADER, 5],
    ['broker_gas', BROKER_GAS_SHEET, BROKER_GAS_HEADER, 2],
  ]) {
    const bytes = workbookFor(XLSX, layout, rows, TODAY);
    assert.ok(bytes instanceof Uint8Array);
    const wb = XLSX.read(bytes, { type: 'array' });
    assert.deepEqual(wb.SheetNames, [name]);
    const back = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    assert.deepEqual(back[0], header);
    assert.equal(back.length, n);
  }
  const back = XLSX.utils.sheet_to_json(
    XLSX.read(workbookFor(XLSX, 'broker', [book()]), { type: 'array' }).Sheets[BROKER_SHEET],
    { header: 1 });
  assert.equal(back[1][12], 31.47);
  assert.equal(back[1][10], '01/12/2026');
  assert.throws(() => workbookFor(XLSX, 'portal', [book()]), /layout/i);
});

test('workbookFor compresses: a large Broker file is a fraction of its stored size, and reads back whole', () => {
  // 2,000 pieces, as both sale types: 4,000 rows. Stored uncompressed, as SheetJS does by default,
  // the same sheet is several times larger; 23/11/2026 a Voltx file was 84 MB, over the 50 MB bucket.
  const rows = Array.from({ length: 2000 }, (_, i) => book({ piece_min_kwh: 1000 + i, piece_max_kwh: 1000 + i }));
  const bytes = workbookFor(XLSX, 'broker', rows, TODAY);
  const { name, aoa } = brokerSheet(rows, TODAY);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const stored = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }).byteLength;
  assert.ok(bytes.byteLength * 2 < stored, `compressed ${bytes.byteLength} against stored ${stored}`);
  const back = XLSX.utils.sheet_to_json(XLSX.read(bytes, { type: 'array' }).Sheets[name], { header: 1 });
  assert.equal(back.length, aoa.length);
});
