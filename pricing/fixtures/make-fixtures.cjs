// Writes the invented fixtures. Every value here is made up; only the header rows are the
// suppliers' real ones. Run: node pricing/fixtures/make-fixtures.cjs
const fs = require('fs');
const path = require('path');
const XLSX = require('../../vendor/xlsx.full.min.js');

const here = __dirname;
const N = null;

function sheetFrom(rows, firstCol) {
  const ws = {};
  let maxC = 0;
  rows.forEach((r, i) => r.forEach((v, j) => {
    if (v === null || v === undefined) return;
    const addr = XLSX.utils.encode_cell({ r: i, c: j + firstCol });
    ws[addr] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) };
    maxC = Math.max(maxC, j + firstCol);
  }));
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: maxC } });
  return ws;
}
function save(name, sheetName, rows, firstCol) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(rows, firstCol || 0), sheetName);
  fs.writeFileSync(path.join(here, name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

const ELEC_HEAD = ['Broker_ID', 'Production_Date', 'Utility', 'DNO_ID', 'Profile_Class', 'Rate_Structure',
  'LLF_Band', 'Sale_Type', 'Contract_Duration', 'Minimum_Annual_Consumption', 'Maximum_Annual_Consumption',
  'Minimum_kVa', 'Maximum_kVa', 'Minimum_Contract_Start_Date', 'Maximum_Contract_Start_Date',
  'Minimum_Valid_Quote_Date', 'Maximum_Valid_Quote_Date', 'Product_Name', 'Green_Energy',
  'Minimum_Credit_Score', 'Maximum_Credit_Score', 'Standing_Charge', 'Standard_Rate', 'Day_Rate',
  'Night_Rate', 'Evening_And_Weekend_Rate', 'Capacity_Rate', 'Metering_Charge'];

// Voltx: blank rows above, headers on row 5, blank first column, dates as DD-MM-YYYY text.
const vx = (dno, pc, llf, term, from, to, name, green, sc, std, day, night) =>
  ['Dyce', '01-01-2030', 'Electricity', dno, pc, 'NHH', llf, N, term, N, N, N, N, from, to, N, N, name,
    green, N, N, sc, std, day, night, N, N, N];
save('voltx_elec_v1.xlsx', 'SS Base Rates (RAW DATA)', [
  [], [], [], [],
  ELEC_HEAD,
  vx(10, '03', 'Band 1', 12, '01-02-2030', '15-02-2030', 'Test Fixed', 'FALSE', 50.5, 27.914, N, N),
  vx(11, '04', 'Band 2', 24, '01-02-2030', '15-02-2030', 'Test Fixed', 'TRUE', 60.25, N, 22.115000000000002, 20.257),
  vx(23, '03', 'Band 4', 36, '01-02-2030', '15-02-2030', 'Test Green', 'TRUE', 70, 25.521, N, N),
], 1);

// Yu electricity: headers on row 1, sheet Dyce, Excel serial dates (47150 = 01/02/2029, in the invented future).
const yu = (dno, rs, llf, term, lo, hi, kmin, kmax, name, green, sc, std, day, night, ew, cap) =>
  ['Dyce', 47100, 'Electricity', dno, N, rs, llf, N, term, lo, hi, kmin, kmax, 47150, 47160, 47100, 47170,
    name, green, N, N, sc, std, day, night, ew, cap, N];
save('yu_elec_v1.xlsx', 'Dyce', [
  ELEC_HEAD,
  yu(12, 'Standard', 'NDA Band 1', 12, 1000, 300000, N, N, 'Test Std', 'FALSE', 40.5, 22.528, N, N, N, N),
  yu(13, 'HH', 'HV Band 1', 24, 0, 5000000, 0, 100, 'Test HH', 'FALSE', 100.757, N, 18.563, 12.25, N, 3.125),
  yu(14, 'EveningAndWeekend', 'LV Band 2', 36, 1000, 300000, N, N, 'Test EW', 'TRUE', 45.037, N, 39.007, N, 19.521, N),
  yu(15, 'EveningWeekendAndNight', 'LV Sub Band 3', 12, 1000, 300000, N, N, 'Test EWN', 'FALSE', 48.037, N, 39.013, 14.037, 17.037, N),
], 0);

// Yu gas
const GAS_HEAD = ['Broker_ID', 'Production_Date', 'Utility', 'LDZ', 'Exit_Zone', 'Sale_Type', 'Contract_Duration',
  'Minimum_Annual_Consumption', 'Maximum_Annual_Consumption', 'Minimum_Contract_Start_Date',
  'Maximum_Contract_Start_Date', 'Minimum_Valid_Quote_Date', 'Maximum_Valid_Quote_Date', 'Product_Name',
  'Carbon_Offset', 'Minimum_Credit_Score', 'Maximum_Credit_Score', 'Standing_Charge', 'Unit_Rate'];
const yg = (ldz, ez, term, lo, hi, name, co, sc, ur) =>
  ['Dyce', 47100, 'Gas', ldz, ez, N, term, lo, hi, 47150, 47160, 47100, 47170, name, co, N, N, sc, ur];
save('yu_gas_v1.xlsx', 'Dyce', [
  GAS_HEAD,
  yg('XA', 'XA1', 12, 1000, 24999, 'Test Gas', 'FALSE', 30.507, 7.292),
  yg('XB', N, 24, 25000, 49999, 'Test Gas', 'TRUE', 31.264, 6.875),
  yg('XC', 'XC2', 36, 450000, 731999, 'Test Gas', 'FALSE', 35, 5.5),
], 0);

// Jellyfish CSVs: headers on row 1, dd/mm/yyyy text dates, 0 for a rate the structure does not have.
const JE_HEAD = 'id,name,region,meterType,profileClass,standingCharge,allOrDayUnitRate,nightRate,eveningWeekendRate,minAq,maxAq,effectiveFrom,effectiveTo,term';
fs.writeFileSync(path.join(here, 'jellyfish_elec_v1.csv'), [
  JE_HEAD,
  '9000001,Test Product (v1),_A,DAY,3,50.5,24.521,0,0,1,300000,01/10/2030,31/08/2031,12',
  '9000002,Test Product (v1),_B,E7,4,50.5,25.257,20.146,0,1,300000,01/10/2030,31/08/2031,24',
  '9000003,Test Product (v1),_P,EWN,4,55.037,26.037,21.037,23.514,1,300000,01/10/2030,31/08/2031,6',
].join('\n') + '\n');
// Jellyfish electricity from 16/11/2026: the old columns plus the tariff and NDA band columns (header as
// in the 19/11/2026 file). Codes as Jellyfish write them; prices invented.
fs.writeFileSync(path.join(here, 'jellyfish_elec_v1_nda.csv'), [
  'id,name,region,meterType,profileClass,standingCharge,allOrDayUnitRate,nightRate,eveningWeekendRate,minAq,maxAq,effectiveFrom,effectiveTo,term,volumeTolerencePercentage,distributorMpid,tariffIdentifierType,tariffIdentifier,lineLossFactorClass,duosTariffId,tnuosResidualBand',
  '9200001,Test Product (v1),_A,DAY,3,65.01,30.292,0,0,0,10000,01/10/2030,31/10/2030,12,20,EELC,LLFC,201,201,,LV_NoMIC_1',
  '9200002,Test Product (v1),_A,DAY,3,65.01,29.936,0,0,0,10000,01/10/2030,31/10/2030,12,20,EELC,DUOS_TARIFF_ID,201,,201,LV_NoMIC_1',
  '9200003,Test Product (v1),_A,DAY,3,100,30.439,0,0,0,10000,01/10/2030,31/10/2030,12,20,EELC,LLFC,202,202,,LV_NoMIC_2',
  '9200004,Test Product (v1),_A,DAY,3,100,30.439,0,0,0,10000,01/10/2030,31/10/2030,12,20,SOUT,LLFC,A67,A67,,LV_NoMIC_2',
  '9200005,Test Product (v1),_B,DAY,3,171.56,30.5,0,0,0,10000,01/10/2030,31/10/2030,12,20,EMEB,DUOS_TARIFF_ID,N13,,N13,LV_NoMIC_3',
  '9200006,Test Product (v1),_B,EW,4,171.56,30.5,0,25.1,0,10000,01/10/2030,31/10/2030,12,20,EMEB,DUOS_TARIFF_ID,N13,,N13,LV_NoMIC_3',
  '9200007,Test Product (v1),_A,DAY,3,406.83,30.292,0,0,0,10000,01/10/2030,31/10/2030,3,20,EELC,LLFC,204,204,,LV_NoMIC_4',
  '9200008,Test Product (v1),_H,DAY,3,171.56,31.2,0,0,0,10000,01/10/2030,31/10/2030,12,20,SOUT,DUOS_TARIFF_ID,H08,,H08,LV_NoMIC_3',
  '9200009,Test Product (v1),_H,DAY,3,171.56,30.9,0,0,0,10000,01/10/2030,31/10/2030,12,20,SOUT,LLFC,H07,H07,,LV_NoMIC_3',
  '9200010,Test Product (v1),_A,DAY,3,65.01,30.292,0,0,0,10000,01/10/2030,31/10/2030,24,20,EELC,LLFC,201,201,,HV_1',
].join('\n') + '\n');
const JG_HEAD = 'id,name,region,standingCharge,unitRate,minAq,maxAq,effectiveFrom,effectiveTo,term';
fs.writeFileSync(path.join(here, 'jellyfish_gas_v1.csv'), [
  JG_HEAD,
  '9100001,Test Product (v1),XA,22.528,8.257,1,10000,01/10/2030,31/08/2031,6',
  '9100002,Test Product (v1),XB,40.757,7.507,10001,20000,01/10/2030,31/08/2031,12',
  '9100003,Test Product (v1),XC,58.037,6.139,20001,293000,02/10/2030,31/08/2031,36',
].join('\n') + '\n');
console.log('fixtures written');
