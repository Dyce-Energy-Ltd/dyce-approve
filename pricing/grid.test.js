import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMargin, parseShare, formatMargin, midpointAnnualPounds, makeGrid, addColumn, setCells, shiftCells,
  copyColumn, pasteBlock, changedNames, problems, carryToLadder, toSavePayload, toPreviewItems,
  selectionProblem, chartScale, dragValue, marginSplit, DAYS_PER_YEAR, setCostPerMeter,
} from './grid.js';

// Invented figures only.
const LADDER = [0, 1, 2, 3, 4, 5, 6].map(i => ({ bandIndex: i, eacMinKwh: i * 1000, eacMaxKwh: i * 1000 + 999 }));
const set = (name, product, m, s, extra) => Object.assign({
  name, priceConfigId: 10, version: 1, product, costPerMeterPence: 5, ladderCurrent: true, savedBy: 'x', savedAt: 'y',
  bands: LADDER.map((b, i) => ({ ...b, marginMilliPencePerKwh: m + i * 100, standingSharePct: s })),
}, extra);
const grid0 = () => makeGrid(LADDER, [set('Gold', 'Gold', 1000, 40), set('Silver', 'Silver', 800, 30)], 'electricity');
const at = (name, bandIndex) => ({ name, bandIndex });

test('parseMargin', () => {
  assert.deepEqual(parseMargin('1.234'), { value: 1234 });
  assert.deepEqual(parseMargin(' 1.2p '), { value: 1200 });
  assert.deepEqual(parseMargin('2'), { value: 2000 });
  assert.deepEqual(parseMargin('1.005'), { value: 1005 });
  assert.equal(parseMargin('1,234').error, 'Use a full stop for decimals.');
  assert.ok(parseMargin('1.2345').error);
  assert.ok(parseMargin('0').error);
  assert.ok(parseMargin('0.000').error);
  assert.ok(parseMargin('-1').error);
  assert.ok(parseMargin('abc').error);
  assert.ok(parseMargin('').error);
});

test('parseShare', () => {
  assert.deepEqual(parseShare('40'), { value: 40 });
  assert.deepEqual(parseShare('40%'), { value: 40 });
  assert.deepEqual(parseShare('12.5'), { value: 12.5 });
  assert.deepEqual(parseShare('0'), { value: 0 });
  assert.deepEqual(parseShare('100'), { value: 100 });
  assert.ok(parseShare('100.5').error);
  assert.ok(parseShare('-1').error);
  assert.ok(parseShare('1.234').error);
  assert.ok(parseShare('x').error);
});

test('formatMargin and midpoint', () => {
  assert.equal(formatMargin(1234), '1.234');
  assert.equal(formatMargin(1200), '1.2');
  assert.equal(formatMargin(2000), '2');
  assert.equal(formatMargin(null), '');
  // 1.2p x 5,000 kWh midpoint, pence to pounds: 60
  assert.equal(midpointAnnualPounds(1200, 4000, 6000), 60);
  assert.equal(midpointAnnualPounds(1234, 0, 999), Math.round(1.234 * 499.5 / 100));
  assert.equal(midpointAnnualPounds(null, 0, 10), null);
});

test('makeGrid keys columns by name and carries a stale ladder', () => {
  const g = grid0();
  assert.deepEqual(g.columns.map(c => c.name), ['Gold', 'Silver']);
  assert.equal(g.columns[0].margins[2], 1200);
  assert.equal(g.columns[0].shares[0], 40);
  assert.deepEqual(changedNames(g), []);
  const newLadder = [
    { bandIndex: 0, eacMinKwh: 0, eacMaxKwh: 1499 },
    { bandIndex: 1, eacMinKwh: 1500, eacMaxKwh: 1999 },
    { bandIndex: 2, eacMinKwh: 2000, eacMaxKwh: 2999 },
  ];
  const g2 = makeGrid(newLadder, [set('Gold', 'Gold', 1000, 40, { ladderCurrent: false })]);
  assert.deepEqual(g2.columns[0].margins, [1000, null, 1200]);
  assert.deepEqual(changedNames(g2), ['Gold']);
});

test('addColumn blank and copied; changedNames', () => {
  let g = addColumn(grid0(), { name: 'New', product: 'Standard', costPerMeterPence: 4 });
  assert.deepEqual(g.columns[2].margins, new Array(7).fill(null));
  assert.deepEqual(changedNames(g), ['New']);
  g = addColumn(grid0(), { name: 'Copy', product: 'Gold', costPerMeterPence: 4, fromName: 'Gold' });
  assert.deepEqual(g.columns[2].margins, grid0().columns[0].margins);
  assert.equal(g.columns[2].isNew, true);
  assert.throws(() => addColumn(grid0(), { name: 'Gold', product: 'Gold', costPerMeterPence: 1 }));
});

test('setCells, shiftCells and copyColumn return new state', () => {
  const g = grid0();
  const g2 = setCells(g, [at('Gold', 0), at('Gold', 1)], 'margin', 2222);
  assert.deepEqual(g2.columns[0].margins.slice(0, 3), [2222, 2222, 1200]);
  assert.equal(g.columns[0].margins[0], 1000);
  assert.deepEqual(changedNames(g2), ['Gold']);
  const g3 = shiftCells(g, [at('Silver', 0)], 'margin', -5000);
  assert.equal(g3.columns[1].margins[0], 10);
  const g4 = shiftCells(g, [at('Gold', 0)], 'share', 70);
  assert.equal(g4.columns[0].shares[0], 100);
  const g5 = copyColumn(g, 'Gold', 'Silver');
  assert.deepEqual(g5.columns[1].margins, g.columns[0].margins);
  assert.equal(g5.columns[1].product, 'Silver');
  assert.deepEqual(changedNames(g5), ['Silver']);
  // setting a cell back to its saved value is not a change
  const g6 = setCells(g2, [at('Gold', 0)], 'margin', 1000);
  assert.deepEqual(changedNames(g6), ['Gold']);
  assert.deepEqual(changedNames(setCells(g6, [at('Gold', 1)], 'margin', 1100)), []);
});

test('pasteBlock: Excel tabs, p and %, blank cell, trailing newline', () => {
  const g = grid0();
  const r = pasteBlock(g, at('Gold', 0), '1.2p\t\n0.9p\t40%', 'margin');
  assert.deepEqual(r.errors, []);
  assert.equal(r.grid.columns[0].margins[0], 1200);
  assert.equal(r.grid.columns[0].margins[1], 900);
  assert.equal(r.grid.columns[1].margins[0], 800); // blank cell leaves the value
  assert.equal(r.grid.columns[1].margins[1], 40000); // % is stripped, so 40 is read as 40p
  const crlf = pasteBlock(g, at('Gold', 0), '1.5\r\n1.6\r\n', 'margin');
  assert.deepEqual(crlf.errors, []);
  assert.deepEqual(crlf.grid.columns[0].margins.slice(0, 3), [1500, 1600, 1200]);
  const sh = pasteBlock(g, at('Gold', 0), '55%\t45', 'share');
  assert.equal(sh.grid.columns[0].shares[0], 55);
  assert.equal(sh.grid.columns[1].shares[0], 45);
});

test('pasteBlock reports bad values and extra rows', () => {
  const g = grid0();
  const r = pasteBlock(g, at('Gold', 0), '1.1\t1.2\n1.3\t1.4\n1,234\t0\n', 'margin');
  assert.deepEqual(r.errors, ['Row 3, column 1: Use a full stop for decimals.', 'Row 3, column 2: The margin must be above zero.']);
  assert.equal(r.grid.columns[0].margins[2], 1200); // skipped, kept
  const nine = pasteBlock(g, at('Gold', 0), Array.from({ length: 9 }, (_, i) => '1.' + i).join('\n'), 'margin');
  assert.deepEqual(nine.errors, ['Pasted 9 rows; the ladder has 7 bands.']);
  assert.equal(nine.grid.columns[0].margins[6], 1600);
});

test('problems', () => {
  let g = addColumn(grid0(), { name: 'N', product: 'Standard', costPerMeterPence: 1 });
  const p = problems(g);
  assert.equal(p.length, 14);
  assert.deepEqual(p[0], { name: 'N', bandIndex: 0, message: 'This band has no margin.' });
  g = setCells(g, [at('Gold', 0)], 'margin', 0);
  assert.ok(problems(g).some(x => x.name === 'Gold' && x.bandIndex === 0));
  g = setCells(g, [at('Silver', 3)], 'share', 101);
  assert.ok(problems(g).some(x => x.name === 'Silver' && x.bandIndex === 3));
  assert.deepEqual(problems(grid0()), []);
});

test('carryToLadder keeps values where the lower bound matches', () => {
  const old = LADDER.map((b, i) => ({ ...b, marginMilliPencePerKwh: 1000 + i, standingSharePct: 20 + i }));
  const out = carryToLadder(old, [
    { bandIndex: 0, eacMinKwh: 0, eacMaxKwh: 499 },
    { bandIndex: 1, eacMinKwh: 500, eacMaxKwh: 1999 },
    { bandIndex: 2, eacMinKwh: 2000, eacMaxKwh: 2999 },
  ]);
  assert.deepEqual(out.map(b => b.marginMilliPencePerKwh), [1000, null, 1002]);
  assert.deepEqual(out.map(b => b.standingSharePct), [20, null, 22]);
  assert.equal(out[1].eacMinKwh, 500);
});

test('toSavePayload and toPreviewItems', () => {
  let g = setCells(grid0(), [at('Gold', 0)], 'margin', 1500);
  g = addColumn(g, { name: 'New', product: 'Standard', costPerMeterPence: 4, fromName: 'Silver' });
  const p = toSavePayload(g, ['Gold', 'New'], 'Autumn review');
  assert.equal(p.reason, 'Autumn review');
  assert.equal(p.sets.length, 2);
  assert.deepEqual(Object.keys(p.sets[0]), ['name', 'fuel', 'product', 'costPerMeterPence', 'isNew', 'bands']);
  assert.equal(p.sets[0].isNew, false);
  assert.equal(p.sets[1].isNew, true);
  assert.equal(p.sets[0].fuel, 'electricity');
  assert.deepEqual(p.sets[0].bands[0], { bandIndex: 0, eacMinKwh: 0, eacMaxKwh: 999, marginMilliPencePerKwh: 1500, standingSharePct: 40 });
  assert.equal(p.sets[0].bands.length, 7);
  const items = toPreviewItems(g, [{ name: 'Gold', saleType: 'all' }, { name: 'Silver', saleType: 'renewal' }]);
  assert.deepEqual(items.map(i => [i.label, i.product, i.saleType, i.costPerMeterPence]), [['Gold', 'Gold', 'all', 5], ['Silver', 'Silver', 'renewal', 5]]);
  assert.equal(items[0].bands[0].marginMilliPencePerKwh, 1500);
});

test('selectionProblem', () => {
  const prod = { 'Gold': 'Gold', 'Gold Voltx': 'Gold', 'Silver': 'Silver' };
  const f = n => prod[n];
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'all' }, { name: 'Gold Voltx', saleType: 'acquisition' }], f), 'Gold is chosen twice for acquisition.');
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'acquisition' }, { name: 'Gold Voltx', saleType: 'renewal' }], f), null);
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'acquisition' }, { name: 'Gold', saleType: 'acquisition' }], f), 'Gold is chosen twice for acquisition.');
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'renewal' }, { name: 'Gold Voltx', saleType: 'all' }], f), 'Gold is chosen twice for renewal.');
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'all' }, { name: 'Silver', saleType: 'all' }], f), null);
  assert.equal(selectionProblem([], f), null);
});

test('chartScale and dragValue', () => {
  const s = chartScale([1000, 2000], 200);
  assert.ok(s.toY(2000) > 0 && s.toY(2000) < s.toY(1000));
  assert.ok(Math.abs(s.fromY(s.toY(1500)) - 1500) < 1e-6);
  assert.equal(dragValue(s, s.toY(1234)), 1230);
  assert.equal(dragValue(s, 1e6), 10);
  assert.equal(dragValue(chartScale([], 100), 0) > 0, true);
});

test('marginSplit', () => {
  assert.equal(DAYS_PER_YEAR, 365);
  // 1.2p/kWh over a 5,000 kWh midpoint is 6,000p a year; a 25% share is 1,500p a year standing.
  const r = marginSplit(1200, 4000, 6000, 25);
  assert.equal(r.midpointKwh, 5000);
  assert.equal(r.annualPounds, 60);
  assert.equal(r.standingPounds, 15);
  assert.equal(r.unitPounds, 45);
  assert.equal(r.unitPencePerKwh, 0.9);
  assert.equal(r.standingPencePerDay, 1500 / 365);
  assert.deepEqual(marginSplit(1200, 4000, 6000, 0), { midpointKwh: 5000, annualPounds: 60, standingPounds: 0, unitPounds: 60, standingPencePerDay: 0, unitPencePerKwh: 1.2 });
  assert.equal(marginSplit(1200, 4000, 6000, 100).unitPencePerKwh, 0);
  assert.equal(marginSplit(null, 4000, 6000, 25), null);
  assert.equal(marginSplit(1200, 4000, 6000, null), null);
});

test('cost per meter is an edit: changed, not mutating, sent on save', () => {
  const g = grid0();
  const g2 = setCostPerMeter(g, 'Gold', 1750);
  assert.equal(g.columns[0].costPerMeterPence, 5);
  assert.equal(g2.columns[0].costPerMeterPence, 1750);
  assert.deepEqual(changedNames(g), []);
  assert.deepEqual(changedNames(g2), ['Gold']);
  assert.equal(toSavePayload(g2, ['Gold'], 'r').sets[0].costPerMeterPence, 1750);
  assert.deepEqual(changedNames(setCostPerMeter(g2, 'Gold', 5)), []);
  assert.throws(() => setCostPerMeter(g, 'Gold', 1.5));
  assert.throws(() => setCostPerMeter(g, 'Gold', -1));
  assert.throws(() => setCostPerMeter(g, 'Nope', 5));
});
