// Broker price book and UD Upload files for the DNA Hub Pricing tab.
//
// After a price run is published, the page writes two workbooks from the stored price book
// (pricing.price_book rows, as the dna-pricing function's book_rows returns them), in the layouts of
// the old tool's files of 23/09/2026. Brokers and Methodia load these into their own systems, so the
// header rows and the shapes of the values must not change.
//
//   brokerSheet(rows)            {name: 'Broker Flat-File', aoa}   20 columns, electricity
//   udUploadSheet(rows)          {name: 'UD_Upload_NHH', aoa}      32 columns, electricity NHH only
//   workbookFor(XLSX, layout, rows)  Uint8Array of an .xlsx; layout is 'broker' or 'ud_upload'
//
// XLSX is the vendored SheetJS, passed in by the caller (the page and the Node tests each bring
// their own copy; this module imports nothing and reads no global).
//
// Rules, from the design (5.9) and PRICING_INTEGRATION.md section 7:
//   - Rates are the binding 2 dp figures (the *_pence_2dp columns), never the milli-pence ones.
//   - Never cost, margin or annual cost. Only sell columns are read, and no header names one.
//   - A sale_type 'all' row gives an Acquisition line and a Renewal line, each with its own tariff
//     name. An 'acquisition' or 'renewal' row gives one line. A line whose name is missing is
//     refused with an error (never dropped quietly).
//   - Broker keeps half hourly rows (Capacity_Rate filled). UD Upload is electricity non half
//     hourly only, so it skips HH rows.
//   - GAS ROWS ARE IN NEITHER FILE for now: no gas layout has been supplied.
//   - UD Upload leaves the start dates, quote dates and Utility blank, as on 23/09/2026.
//
// NOT CONFIRMED against a Methodia or broker file: the RateStructure words for the two evening
// structures. The 23/09/2026 files hold only 'Standard' and 'Day Night'. The evening words below
// are Yu's own spellings (PRICING_INTEGRATION.md section 5.3) and need a person to confirm them.

export const BROKER_SHEET = 'Broker Flat-File';
export const UD_SHEET = 'UD_Upload_NHH';

export const BROKER_HEADER = [
  'Type', 'Tariff ID', 'ProfileClass', 'Area Code', 'ratestructure', 'LLF_Band', 'EAC Min',
  'EAC Max', 'Tariff Code', 'Term', 'Start Date', 'End Date', 'Single Rate', 'Day Rate',
  'Night Rate', 'Evening/Weekend Rate', 'Standing charge electricity', 'Capacity_Rate',
  'Metering_Charge', 'Green',
];

export const UD_HEADER = [
  'Amr', 'Band', 'BrokerId', 'ContractDuration', 'DayRate', 'DnoId', 'EveningWeekendRate',
  'ExitZone', 'FixedContractEndDate', 'GreenEnergy', 'Ldz', 'MaximumAnnualConsumption',
  'MaximumContractStartDate', 'MaximumCreditScore', 'MaximumValidQuoteDate',
  'MinimumAnnualConsumption', 'MinimumContractStartDate', 'MinimumCreditScore',
  'MinimumValidQuoteDate', 'NightRate', 'PaymentMethod', 'ProductName', 'ProfileClass',
  'RateStructure', 'SaleType', 'SetUplift', 'StandingCharge', 'StandingChargeType',
  'TariffInformation1', 'UnitRate', 'Utility', 'Version',
];

const RATE_STRUCTURE = {
  single: 'Standard',
  day_night: 'Day Night',
  evening_weekend: 'EveningAndWeekend',          // unconfirmed, see the header
  evening_weekend_night: 'EveningWeekendAndNight', // unconfirmed, see the header
};

const LLF_GROUP = { nda: 'NDA', lv: 'LV', lv_sub: 'LV Sub', hv: 'HV' };

const blank = (v) => v === null || v === undefined || v === '';

// Postgres numerics arrive as text ('31.47'); a null stays null.
function num(v) {
  if (blank(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Not a number in the price book: ${String(v)}`);
  return n;
}

// 'YYYY-MM-DD' (a date column) or a Date or an ISO timestamp, written DD/MM/YYYY.
function ddmmyyyy(v) {
  if (blank(v)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v instanceof Date ? v.toISOString() : String(v));
  if (!m) throw new Error(`Not a date in the price book: ${String(v)}`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function rateStructure(row) {
  const w = RATE_STRUCTURE[row.rate_structure];
  if (!w) throw new Error(`Unknown rate structure in the price book: ${String(row.rate_structure)}`);
  return w;
}

// 'NDA Band 1' for the Broker file, 'Band 1' for UD Upload.
function bandNumber(row) {
  return blank(row.llf_band_number) ? null : `Band ${num(row.llf_band_number)}`;
}
function llfBand(row) {
  if (blank(row.llf_band_group) || blank(row.llf_band_number)) return null;
  const g = LLF_GROUP[row.llf_band_group];
  if (!g) throw new Error(`Unknown LLF band group in the price book: ${String(row.llf_band_group)}`);
  return `${g} ${bandNumber(row)}`;
}

// The lines a book row gives: [saleTypeWord, tariffName]. An 'all' row gives two.
function lines(row) {
  const want = { all: ['Acquisition', 'Renewal'], acquisition: ['Acquisition'], renewal: ['Renewal'] }[row.sale_type];
  if (!want) throw new Error(`Unknown sale type in the price book: ${String(row.sale_type)}`);
  return want.map((word) => {
    const name = word === 'Acquisition' ? row.tariff_name_acquisition : row.tariff_name_renewal;
    if (blank(name)) {
      throw new Error(`The price book row ${String(row.product_key)} has no tariff name for ${word}.`);
    }
    return [word, name];
  });
}

const isElectricity = (r) => r.fuel === 'electricity';
const isHalfHourly = (r) => r.meter_type === 'hh';

function brokerLine(r, word, name) {
  return [
    word, name, num(r.profile_class), num(r.dno_id), rateStructure(r), llfBand(r),
    num(r.piece_min_kwh), num(r.piece_max_kwh), r.tariff_code, `${num(r.term_months)} Months`,
    ddmmyyyy(r.contract_start_earliest), ddmmyyyy(r.contract_start_latest),
    num(r.sell_unit_rate_single_pence_2dp), num(r.sell_unit_rate_day_pence_2dp),
    num(r.sell_unit_rate_night_pence_2dp), num(r.sell_unit_rate_ew_pence_2dp),
    num(r.sell_standing_charge_pence_2dp), num(r.sell_capacity_rate_pence_2dp),
    null, r.green_energy ? 'Green' : 'Standard',
  ];
}

function udLine(r, word, name) {
  const out = Object.fromEntries(UD_HEADER.map((h) => [h, null]));
  Object.assign(out, {
    Band: bandNumber(r),
    ContractDuration: num(r.term_months),
    DayRate: num(r.sell_unit_rate_day_pence_2dp),
    DnoId: num(r.dno_id),
    EveningWeekendRate: num(r.sell_unit_rate_ew_pence_2dp),
    GreenEnergy: r.green_energy ? 1 : 0,
    MaximumAnnualConsumption: num(r.piece_max_kwh),
    MinimumAnnualConsumption: num(r.piece_min_kwh),
    NightRate: num(r.sell_unit_rate_night_pence_2dp),
    ProductName: name,
    ProfileClass: num(r.profile_class),
    RateStructure: rateStructure(r),
    SaleType: word,
    StandingCharge: num(r.sell_standing_charge_pence_2dp),
    TariffInformation1: r.tariff_code,
    UnitRate: num(r.sell_unit_rate_single_pence_2dp),
  });
  return UD_HEADER.map((h) => out[h]);
}

function build(header, rows, keep, make) {
  const aoa = [header];
  for (const r of rows) {
    if (!keep(r)) continue;
    for (const [word, name] of lines(r)) aoa.push(make(r, word, name));
  }
  return aoa;
}

export function brokerSheet(rows) {
  return { name: BROKER_SHEET, aoa: build(BROKER_HEADER, rows, isElectricity, brokerLine) };
}

export function udUploadSheet(rows) {
  return {
    name: UD_SHEET,
    aoa: build(UD_HEADER, rows, (r) => isElectricity(r) && !isHalfHourly(r), udLine),
  };
}

const LAYOUTS = { broker: brokerSheet, ud_upload: udUploadSheet };

export function workbookFor(XLSX, layout, rows) {
  const make = LAYOUTS[layout];
  if (!make) throw new Error(`Unknown output layout: ${String(layout)}. Use broker or ud_upload.`);
  const { name, aoa } = make(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
