// Broker price book and Powwr UD Upload files for the DNA Hub Pricing tab.
//
// After a price run is published, the page writes workbooks from the stored price book
// (pricing.price_book rows, as the dna-pricing function's book_rows returns them). Brokers and
// Methodia load these into their own systems, so the header rows and the shapes of the values must
// not change.
//
//   brokerSheet(rows)               {name: 'Broker Flat-File', aoa}     20 columns, electricity, laid out
//                                   from the old tool's file of 23/09/2026 (unchanged)
//   brokerGasSheet(rows, today)     {name: 'Gas Broker Pricing', aoa}   14 columns, gas only
//   udUploadSheet(rows, today)      {name: 'Template', aoa}             35 columns, both fuels
//   workbookFor(XLSX, layout, rows, today)  Uint8Array of an .xlsx; layout is 'broker', 'broker_gas'
//                                   or 'ud_upload'
//
// The gas broker file and the UD Upload layout follow Chris Beardsmore's files of 18/11/2026 to
// 20/11/2026 (Dyce_DY4_Gas_Gold_18.11.26, DY4_Gas_Gold_UD_Upload_181126 and
// Dyce_DY4_Elec_Gold_UD_Upload_20.11.26). `today` is the date the file is written (a Date or
// 'YYYY-MM-DD'; default now) and fills the Version column, so tests can fix it.
//
// XLSX is the vendored SheetJS, passed in by the caller (the page and the Node tests each bring
// their own copy; this module imports nothing and reads no global).
//
// Rules, from the design (5.9) and PRICING_INTEGRATION.md section 7:
//   - Rates are the binding 2 dp figures (the *_pence_2dp columns), never the milli-pence ones.
//     Chris's files carry 3 dp; we keep 2 dp on purpose.
//   - Never cost, margin or annual cost. Only sell columns are read, and no header names one.
//   - A sale_type 'all' row gives an Acquisition line and a Renewal line, each with its own tariff
//     name. An 'acquisition' or 'renewal' row gives one line. A line whose name is missing is
//     refused with an error (never dropped quietly).
//   - Broker (electricity) keeps half hourly rows (Capacity_Rate filled) and every term. The gas
//     broker file keeps every term too (Chris's broker file also holds 3 months).
//   - UD Upload is electricity non half hourly plus all gas rows. It leaves out any term under 6
//     months: Powwr cannot take shorter terms (Phil Brook, 20/11/2026; Chris's Powwr files hold 6,
//     12, 24 and 36 only).
//   - UD Upload dates (contract start, valid quote) are written as DD/MM/YYYY text, as in Chris's gas
//     file; his electricity UD file holds them as Excel date-times.
//
// NOT CONFIRMED against a Methodia or broker file:
//   - The RateStructure words for the two evening structures. The 23/09/2026 files hold only
//     'Standard' and 'Day Night'. The evening words below are Yu's own spellings
//     (PRICING_INTEGRATION.md section 5.3) and need a person to confirm them.
//   - The ' Band N' suffix on the UD Upload RateStructure for non single structures. Chris's file
//     shows 'Standard Band 1'; we add the suffix to every electricity structure that has an LLF
//     band number.
//   - The 'Carbon Offset' word in the gas broker file's Carbon_Offset column. Chris's file shows
//     only 'Standard'.

export const BROKER_SHEET = 'Broker Flat-File';
export const BROKER_GAS_SHEET = 'Gas Broker Pricing';
export const UD_SHEET = 'Template';

export const BROKER_HEADER = [
  'Type', 'Tariff ID', 'ProfileClass', 'Area Code', 'ratestructure', 'LLF_Band', 'EAC Min',
  'EAC Max', 'Tariff Code', 'Term', 'Start Date', 'End Date', 'Single Rate', 'Day Rate',
  'Night Rate', 'Evening/Weekend Rate', 'Standing charge electricity', 'Capacity_Rate',
  'Metering_Charge', 'Green',
];

export const BROKER_GAS_HEADER = [
  'Type', 'Tariff ID', 'Ldz', 'ContractDuration', 'AQ Min', 'AQ Max', 'MinimumContractStartDate',
  'MaximumContractStartDate', 'MinimumValidQuoteDate', 'MaximumValidQuoteDate', 'Carbon_Offset',
  'StandingCharge', 'UnitRate', 'Version',
];

export const UD_HEADER = [
  'BrokerId', 'Utility', 'DnoId', 'ProfileClass', 'RateStructure', 'Ldz', 'ExitZone', 'SaleType',
  'ContractDuration', 'MinimumAnnualConsumption', 'MaximumAnnualConsumption',
  'MinimumContractStartDate', 'MaximumContractStartDate', 'MinimumValidQuoteDate',
  'MaximumValidQuoteDate', 'PaymentMethod', 'ProductName', 'StandingChargeType', 'GreenEnergy',
  'Amr', 'MinimumCreditScore', 'MaximumCreditScore', 'SetUplift', 'StandingCharge', 'DayRate',
  'NightRate', 'EveningWeekendRate', 'UnitRate', 'FixedContractEndDate', 'Version',
  'TariffInformation1', 'TariffInformation2', 'TariffInformation3', 'TariffInformation4',
  'TariffInformation5',
];

// Powwr cannot take a term shorter than this many months.
export const UD_MIN_TERM_MONTHS = 6;

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

// The write date as DD/MM/YYYY: a Date (its local day) or 'YYYY-MM-DD'.
function writeDate(today) {
  if (today instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(today.getDate())}/${p(today.getMonth() + 1)}/${today.getFullYear()}`;
  }
  return ddmmyyyy(today);
}

function rateStructure(row) {
  const w = RATE_STRUCTURE[row.rate_structure];
  if (!w) throw new Error(`Unknown rate structure in the price book: ${String(row.rate_structure)}`);
  return w;
}

// 'Band 1', or null when the row has no band number.
function bandNumber(row) {
  return blank(row.llf_band_number) ? null : `Band ${num(row.llf_band_number)}`;
}
// 'NDA Band 1' for the Broker file.
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
const isGas = (r) => r.fuel === 'gas';
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

function brokerGasLine(r, word, name, version) {
  return [
    word, name, r.ldz, num(r.term_months), num(r.piece_min_kwh), num(r.piece_max_kwh),
    ddmmyyyy(r.contract_start_earliest), ddmmyyyy(r.contract_start_latest),
    ddmmyyyy(r.quote_valid_from), ddmmyyyy(r.quote_valid_until),
    r.carbon_offset ? 'Carbon Offset' : 'Standard',  // 'Carbon Offset' unconfirmed, see the header
    num(r.sell_standing_charge_pence_2dp), num(r.sell_unit_rate_single_pence_2dp), version,
  ];
}

function udLine(r, word, name, version) {
  const gasRow = isGas(r);
  const band = gasRow ? null : bandNumber(r);
  const out = Object.fromEntries(UD_HEADER.map((h) => [h, null]));
  Object.assign(out, {
    BrokerId: 'Dyce',
    Utility: gasRow ? 'Gas' : 'Electricity',
    DnoId: gasRow ? null : num(r.dno_id),
    ProfileClass: gasRow ? null : num(r.profile_class),
    RateStructure: band ? `${rateStructure(r)} ${band}` : rateStructure(r),
    Ldz: gasRow ? r.ldz : null,
    SaleType: word,
    ContractDuration: num(r.term_months),
    MinimumAnnualConsumption: num(r.piece_min_kwh),
    MaximumAnnualConsumption: num(r.piece_max_kwh),
    MinimumContractStartDate: ddmmyyyy(r.contract_start_earliest),
    MaximumContractStartDate: ddmmyyyy(r.contract_start_latest),
    MinimumValidQuoteDate: ddmmyyyy(r.quote_valid_from),
    MaximumValidQuoteDate: ddmmyyyy(r.quote_valid_until),
    PaymentMethod: 'Direct Debit',
    ProductName: r.product_name,
    StandingChargeType: 'With S/C',
    GreenEnergy: r.green_energy ? 'Y' : 'N',
    StandingCharge: num(r.sell_standing_charge_pence_2dp),
    DayRate: num(r.sell_unit_rate_day_pence_2dp),
    NightRate: num(r.sell_unit_rate_night_pence_2dp),
    EveningWeekendRate: num(r.sell_unit_rate_ew_pence_2dp),
    UnitRate: num(r.sell_unit_rate_single_pence_2dp),
    Version: version,
    TariffInformation1: r.tariff_code,
    TariffInformation2: name,
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

export function brokerGasSheet(rows, today = new Date()) {
  const v = writeDate(today);
  return {
    name: BROKER_GAS_SHEET,
    aoa: build(BROKER_GAS_HEADER, rows, isGas, (r, w, n) => brokerGasLine(r, w, n, v)),
  };
}

export function udUploadSheet(rows, today = new Date()) {
  const v = writeDate(today);
  const keep = (r) => (isElectricity(r) ? !isHalfHourly(r) : isGas(r))
    && num(r.term_months) >= UD_MIN_TERM_MONTHS;
  return { name: UD_SHEET, aoa: build(UD_HEADER, rows, keep, (r, w, n) => udLine(r, w, n, v)) };
}

const LAYOUTS = { broker: brokerSheet, broker_gas: brokerGasSheet, ud_upload: udUploadSheet };

export function workbookFor(XLSX, layout, rows, today = new Date()) {
  const make = LAYOUTS[layout];
  if (!make) {
    throw new Error(`Unknown output layout: ${String(layout)}. Use broker, broker_gas or ud_upload.`);
  }
  const { name, aoa } = make(rows, today);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
