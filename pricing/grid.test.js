import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMargin, parseShare, formatMargin, midpointAnnualPounds, makeGrid, addColumn, setCells, shiftCells,
  copyColumn, pasteBlock, changedNames, problems, carryToLadder, toSavePayload, toPreviewItems,
  selectionProblem, chartScale, dragValue, marginSplit, DAYS_PER_YEAR, setCostPerMeter, editedNames, firstGap, isComplete,
  chartAxis, CHART_MAX, toggleChartPick, syncChartPicks, changedCellCount, cellFacts, reviewLines, midpointText, bandRange,
  forSupplier, repeatedProductType, newConfigNames, currentConfig, defaultConfigName, liveChoice,
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
  assert.equal(g2.columns[0].stale, true);
  assert.deepEqual(changedNames(g2), [], 'a stale set is changed only once edited');
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
  assert.deepEqual(Object.keys(p.sets[0]), ['name', 'fuel', 'product', 'costPerMeterPence', 'isNew', 'ladderId', 'bands', 'supplierId']);
  assert.equal(p.sets[0].supplierId, null, 'a product for every supplier sends null');
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
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'all' }, { name: 'Gold Voltx', saleType: 'acquisition' }], f), 'Two products of product type Gold are chosen for acquisition. Choose one product per product type.');
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'acquisition' }, { name: 'Gold Voltx', saleType: 'renewal' }], f), null);
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'acquisition' }, { name: 'Gold', saleType: 'acquisition' }], f), 'Two products of product type Gold are chosen for acquisition. Choose one product per product type.');
  assert.equal(selectionProblem([{ name: 'Gold', saleType: 'renewal' }, { name: 'Gold Voltx', saleType: 'all' }], f), 'Two products of product type Gold are chosen for renewal. Choose one product per product type.');
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

const NEW_LADDER = [
  { bandIndex: 0, eacMinKwh: 0, eacMaxKwh: 1499 },
  { bandIndex: 1, eacMinKwh: 1500, eacMaxKwh: 1999 },
  { bandIndex: 2, eacMinKwh: 2000, eacMaxKwh: 2999 },
];
const staleGrid = () => makeGrid(NEW_LADDER, [
  set('Old', 'Gold', 1000, 40, { ladderCurrent: false }),
  Object.assign(set('Fresh', 'Silver', 800, 30), { bands: NEW_LADDER.map((b, i) => ({ ...b, marginMilliPencePerKwh: 800 + i * 100, standingSharePct: 30 })) }),
], 'electricity');

test('a stale set does not block saving another set', () => {
  let g = staleGrid();
  assert.deepEqual(changedNames(g), []);
  g = setCells(g, [at('Fresh', 1)], 'margin', 950);
  assert.deepEqual(changedNames(g), ['Fresh']);
  assert.deepEqual(problems(g).filter(p => p.name === 'Fresh'), []);
  const payload = toSavePayload(g, changedNames(g), 'why');
  assert.deepEqual(payload.sets.map(s => s.name), ['Fresh']);
});

test('editing a stale set makes it changed and its blank bands are problems', () => {
  let g = setCells(staleGrid(), [at('Old', 0)], 'margin', 1100);
  assert.deepEqual(changedNames(g), ['Old']);
  const blanks = problems(g).filter(p => p.name === 'Old');
  assert.deepEqual(blanks.map(p => p.bandIndex + ':' + p.message), ['1:This band has no margin.', '1:This band has no standing charge share.']);
  g = setCostPerMeter(staleGrid(), 'Old', 99);
  assert.deepEqual(changedNames(g), ['Old']);
});

// Final review A2: a stale set with every band carried must be savable, or Apply refuses it for ever.
const FULL_LADDER = [
  { bandIndex: 0, eacMinKwh: 0, eacMaxKwh: 1499 },
  { bandIndex: 1, eacMinKwh: 1500, eacMaxKwh: 1999 },
  { bandIndex: 2, eacMinKwh: 2000, eacMaxKwh: 4999 },
];
test('a stale set with no blank band counts as changed and saves its carried values', () => {
  // Gold's old bands start at 0, 1000, 2000, ...: 0 and 2000 carry; 1500 has no old band.
  const old = set('Old', 'Gold', 1000, 40, { ladderCurrent: false });
  old.bands = [{ bandIndex: 0, eacMinKwh: 0, eacMaxKwh: 1499, marginMilliPencePerKwh: 1000, standingSharePct: 40 },
    { bandIndex: 1, eacMinKwh: 1500, eacMaxKwh: 2999, marginMilliPencePerKwh: 1100, standingSharePct: 35 },
    { bandIndex: 2, eacMinKwh: 2000, eacMaxKwh: 9999, marginMilliPencePerKwh: 1200, standingSharePct: 30 }];
  const g = makeGrid(FULL_LADDER, [old, set('Fresh', 'Silver', 800, 30, { bands: FULL_LADDER.map((b, i) => ({ ...b, marginMilliPencePerKwh: 800 + i, standingSharePct: 30 })) })], 'electricity', 'ladder-3');
  assert.equal(g.columns[0].stale, true);
  assert.deepEqual(g.columns[0].margins, [1000, 1100, 1200]);
  assert.deepEqual(changedNames(g), ['Old'], 'complete and stale: changed, so the next Save saves it');
  assert.deepEqual(editedNames(g), [], 'but nobody has edited it');
  assert.deepEqual(problems(g), []);
  const p = toSavePayload(g, changedNames(g), 'Carried to the new ladder');
  assert.deepEqual(p.sets.map(s => [s.name, s.isNew, s.ladderId]), [['Old', false, 'ladder-3']]);
  assert.deepEqual(p.sets[0].bands.map(b => [b.bandIndex, b.marginMilliPencePerKwh, b.standingSharePct]), [[0, 1000, 40], [1, 1100, 35], [2, 1200, 30]]);
});

test('a stale set with a blank band stays unchanged until edited, and is never in editedNames', () => {
  const g = staleGrid();
  assert.equal(g.columns[0].stale, true);
  assert.ok(g.columns[0].margins.includes(null));
  assert.deepEqual(changedNames(g), []);
  assert.deepEqual(editedNames(g), []);
  const g2 = setCells(g, [at('Old', 1)], 'margin', 1150);
  assert.deepEqual(changedNames(g2), ['Old']);
  assert.deepEqual(editedNames(g2), ['Old']);
});

// Final review A3: the ladder the grid was made from goes with every save and every preview item.
test('makeGrid keeps the ladderId; saves and preview items carry it', () => {
  let g = makeGrid(LADDER, [set('Gold', 'Gold', 1000, 40)], 'gas', 'ladder-7');
  assert.equal(g.ladderId, 'ladder-7');
  g = addColumn(setCells(g, [at('Gold', 0)], 'margin', 1500), { name: 'New', product: 'Standard', costPerMeterPence: 4, fromName: 'Gold' });
  assert.equal(g.ladderId, 'ladder-7', 'edits keep it');
  assert.deepEqual(toSavePayload(g, ['Gold', 'New'], 'r').sets.map(s => s.ladderId), ['ladder-7', 'ladder-7']);
  assert.deepEqual(toPreviewItems(g, [{ name: 'Gold', saleType: 'all' }, { name: 'New', saleType: 'renewal' }]).map(i => i.ladderId), ['ladder-7', 'ladder-7']);
  assert.equal(makeGrid(LADDER, [], 'gas').ladderId, null, 'none given: null');
});

// The Price screen (19/11/2026): a blank new band set stays blank, and the preview waits until every
// band of every chosen band set has a margin and a share. firstGap names the first one to fill.
test('firstGap and isComplete: a blank new set stays blank until filled, margins before shares', () => {
  let g = makeGrid(LADDER, [], 'gas', 'ladder-1');
  assert.equal(g.columns.length, 0);
  assert.equal(g.bands.length, LADDER.length, 'no products: the ladder still gives the rows');
  assert.equal(firstGap(g), null);
  g = addColumn(g, { name: 'Gas One', product: 'Standard', costPerMeterPence: 800 });
  assert.ok(g.columns[0].margins.every(v => v == null) && g.columns[0].shares.every(v => v == null), 'nothing is filled in');
  assert.deepEqual(firstGap(g), { name: 'Gas One', layer: 'margin' });
  assert.equal(isComplete(g.columns[0]), false);
  const all = LADDER.map(b => at('Gas One', b.bandIndex));
  g = setCells(g, all.slice(0, -1), 'margin', 300);
  assert.deepEqual(firstGap(g), { name: 'Gas One', layer: 'margin' }, 'one band still blank');
  g = setCells(g, all, 'margin', 300);
  assert.deepEqual(firstGap(g), { name: 'Gas One', layer: 'share' }, 'then the shares');
  g = setCells(g, all, 'share', 0);
  assert.equal(firstGap(g), null);
  assert.equal(isComplete(g.columns[0]), true);
  assert.deepEqual(problems(g), []);
  // The first blank set in grid order is named, not a later one.
  g = addColumn(addColumn(g, { name: 'B', product: 'Gold', costPerMeterPence: 0 }), { name: 'C', product: 'Silver', costPerMeterPence: 0, fromName: 'Gas One' });
  assert.deepEqual(firstGap(g), { name: 'B', layer: 'margin' });
  assert.equal(isComplete(g.columns[2]), true, 'a copy of a full set is full');
});

// ---------- The Margins page's look (Phil Brook's mockup, 19/11/2026)

test('the On chart row takes four products at most', () => {
  assert.equal(CHART_MAX, 4);
  let picks = [];
  for (const n of ['A', 'B', 'C', 'D']) {
    const r = toggleChartPick(picks, n);
    assert.equal(r.refused, false);
    picks = r.picks;
  }
  assert.deepEqual(picks.map(p => p.slot), [0, 1, 2, 3], 'each in its own slot');
  const fifth = toggleChartPick(picks, 'E');
  assert.equal(fifth.refused, true, 'a fifth is refused');
  assert.equal(fifth.picks, picks, 'and nothing changes');
  // Untick one: the freed slot goes to the next one ticked.
  picks = toggleChartPick(picks, 'B').picks;
  assert.deepEqual(picks.map(p => p.name), ['A', 'C', 'D']);
  picks = toggleChartPick(picks, 'E').picks;
  assert.deepEqual(picks.find(p => p.name === 'E'), { name: 'E', slot: 1 });
  assert.equal(toggleChartPick(picks, 'F').refused, true);
});

test('the chart starts with the first four and keeps in step with the grid', () => {
  let s = syncChartPicks([], ['A', 'B', 'C', 'D', 'E', 'F'], null);
  assert.deepEqual(s.picks.map(p => p.name), ['A', 'B', 'C', 'D'], 'the first four, never more');
  // Unticked by the person: a later sync does not tick it again.
  let picks = toggleChartPick(s.picks, 'B').picks;
  s = syncChartPicks(picks, ['A', 'B', 'C', 'D', 'E', 'F'], s.seen);
  assert.deepEqual(s.picks.map(p => p.name), ['A', 'C', 'D']);
  // A band set new to the grid joins while there is room; one that has left the grid leaves the chart.
  s = syncChartPicks(s.picks, ['A', 'C', 'D', 'E', 'F', 'G'], s.seen);
  assert.deepEqual(s.picks.map(p => p.name), ['A', 'C', 'D', 'G']);
  s = syncChartPicks(s.picks, ['C', 'D', 'G', 'H', 'I'], s.seen);
  assert.deepEqual(s.picks.map(p => p.name), ['C', 'D', 'G', 'H']);
  assert.ok(s.picks.length <= 4);
});

test('chartAxis: round gridlines a little above the largest margin', () => {
  const a = chartAxis([760, 600, null], 164);
  assert.equal(a.top, 1000);
  assert.deepEqual(a.ticks, [0, 250, 500, 750, 1000]);
  assert.equal(a.toY(1000), 0);
  assert.equal(a.toY(0), 164);
  assert.equal(dragValue(a, 82), 500, 'dragValue takes the axis as it takes chartScale');
  assert.equal(chartAxis([], 100).top, 100, 'an empty chart still has a scale');
  assert.ok(chartAxis([3000], 100).top >= 3450);
});

test('changedCellCount counts the cells that differ from what was saved', () => {
  let g = grid0();
  assert.equal(changedCellCount(g), 0);
  g = setCells(g, [at('Gold', 0), at('Gold', 1)], 'margin', 5000);
  g = setCells(g, [at('Silver', 0)], 'share', 12);
  assert.equal(changedCellCount(g), 3);
  g = setCells(g, [at('Gold', 0)], 'share', 12);
  assert.equal(changedCellCount(g), 3, 'a cell with both layers changed counts once');
  g = addColumn(g, { name: 'New', product: 'Gold', costPerMeterPence: 0 });
  assert.equal(changedCellCount(g), 3, 'a blank new product has no changed cells yet');
  g = setCells(g, [at('New', 2)], 'margin', 300);
  assert.equal(changedCellCount(g), 4);
});

test('cellFacts: what the Cell detail panel shows for one band', () => {
  let g = grid0();
  const band = g.bands[1];
  let rows = cellFacts(g.columns[0], band, 1);
  const v = (k) => (rows.find(r => r.k === k) || {}).v;
  assert.equal(v('Saved margin'), '1.100 p/kWh');
  assert.equal(v('New margin'), undefined, 'no new margin until it changes');
  assert.equal(v('Annual margin at midpoint, saved'), midpointText(1100, band.eacMinKwh, band.eacMaxKwh));
  assert.equal(v('Standing charge share'), '40%');
  const mid = (band.eacMinKwh + band.eacMaxKwh) / 2;
  assert.equal(v('Added to the standing charge'), (1100 * mid / 1000 * 0.4 / 365).toFixed(3) + ' p/day');
  assert.equal(v('Added to each unit rate'), (1.1 * 0.6).toFixed(3) + ' p/kWh');
  assert.equal(v('Cost per meter'), '£0.05 a year');
  assert.equal(v('Product type'), 'Gold');
  g = setCells(g, [at('Gold', 1)], 'margin', 1500);
  rows = cellFacts(g.columns[0], band, 1);
  assert.equal(v('New margin'), '1.500 p/kWh');
  assert.equal(v('Annual margin at midpoint, new'), midpointText(1500, band.eacMinKwh, band.eacMaxKwh));
  g = addColumn(g, { name: 'Blank', product: 'Silver', costPerMeterPence: 700 });
  rows = cellFacts(g.columns[2], band, 1);
  assert.equal(v('Saved margin'), undefined, 'a new product has nothing saved');
  assert.equal(v('New margin'), 'none yet');
  assert.equal(v('Added to each unit rate'), undefined, 'no split without a margin and a share');
});

test('reviewLines: the changes of one product, in words', () => {
  let g = setCells(grid0(), [at('Gold', 0)], 'margin', 1250);
  g = setCells(g, [at('Gold', 2)], 'share', 35);
  const lines = reviewLines(g, 'Gold');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith(bandRange(g.bands[0]) + ' kWh: 1.000 to 1.250 p/kWh, annual margin at midpoint '));
  assert.equal(lines[1], bandRange(g.bands[2]) + ' kWh: standing charge share 40% to 35%');
  g = setCostPerMeter(g, 'Silver', 900);
  assert.equal(reviewLines(g, 'Silver')[0], 'Cost per meter £0.05 to £9.00 a year');
  g = addColumn(g, { name: 'New', product: 'Gold', costPerMeterPence: 1500, fromName: 'Silver' });
  const nl = reviewLines(g, 'New');
  assert.equal(nl[0], 'New product, cost per meter £15.00 a year.');
  assert.equal(nl.length, 1 + g.bands.length);
});

// ---------- An optional supplier on products and product configurations (Phil Brook, 19/11/2026)

test('the supplier is kept on columns, given to new ones, and sent on save', () => {
  let g = makeGrid(LADDER, [set('Gold', 'Gold', 1000, 40, { supplierId: 'yu' }), set('Silver', 'Silver', 800, 30)], 'electricity');
  assert.equal(g.columns[0].supplierId, 'yu');
  assert.equal(g.columns[1].supplierId, null);
  g = addColumn(g, { name: 'Voltx Gold', product: 'Gold', costPerMeterPence: 0, fromName: 'Gold', supplierId: 'voltx' });
  g = addColumn(g, { name: 'Any', product: 'Silver', costPerMeterPence: 0 });
  assert.equal(g.columns[2].supplierId, 'voltx', 'a copy takes the supplier it is given, not its source');
  assert.equal(g.columns[3].supplierId, null);
  const p = toSavePayload(g, ['Gold', 'Voltx Gold', 'Any'], 'r');
  assert.deepEqual(p.sets.map(x => x.supplierId), ['yu', 'voltx', null]);
});

test('forSupplier: no supplier is every supplier', () => {
  assert.equal(forSupplier({ supplierId: null }, 'yu'), true);
  assert.equal(forSupplier({}, 'yu'), true);
  assert.equal(forSupplier({ supplierId: 'yu' }, 'yu'), true);
  assert.equal(forSupplier({ supplierId: 'voltx' }, 'yu'), false);
});

test('repeatedProductType: one product per product type in a configuration', () => {
  const type = { Gold: 'Gold', 'Gold renewal': 'Gold', Silver: 'Silver' };
  assert.equal(repeatedProductType(['Gold', 'Silver'], n => type[n]), null);
  assert.equal(repeatedProductType(['Gold', 'Silver', 'Gold renewal'], n => type[n]), 'Gold');
});

test('newConfigNames: <configuration name> <product type>, refused in plain words when taken', () => {
  const gold = { name: 'Gold', product: 'Gold' }, std = { name: 'Standard', product: 'Standard' };
  assert.deepEqual(newConfigNames('Aggressive Pricing', [gold, std], new Set(['Gold', 'Standard'])),
    [{ from: 'Gold', name: 'Aggressive Pricing Gold' }, { from: 'Standard', name: 'Aggressive Pricing Standard' }]);
  assert.deepEqual(newConfigNames('Aggressive Pricing', [], new Set()), []);
  assert.equal(newConfigNames('Aggressive Pricing', [gold], new Set(['Aggressive Pricing Gold'])).error,
    'There is already a product called Aggressive Pricing Gold. Choose another name for the product configuration.');
  assert.match(newConfigNames('Aggressive Pricing', [gold, { name: 'Gold renewal', product: 'Gold' }], new Set()).error, /^Two changed products are Gold/);
  assert.match(newConfigNames('x'.repeat(57), [gold], new Set()).error, /longer than 60 characters/);
});

// The Price screen opens on the current product configuration (Phil Brook, 20/11/2026). Which products
// are live cannot be read from the dna-pricing ops, so "current" is the most recently saved active
// configuration for the file's supplier, else for every supplier; a configuration's date is the newest
// save among its members.
test('currentConfig: the supplier first, then every supplier, the most recently saved', () => {
  const sets = [
    { name: 'A', savedAt: '2026-11-10T09:00:00Z' }, { name: 'B', savedAt: '2026-11-12T09:00:00Z' },
    { name: 'C', savedAt: '2026-11-18T09:00:00Z' }, { name: 'D', savedAt: '2026-11-19T09:00:00Z' },
  ];
  const bundles = [
    { bundleId: 1, name: 'Old Yu', supplierId: 'yu', members: ['A'] },
    { bundleId: 2, name: 'Yu', supplierId: 'yu', members: ['A', 'B'] },
    { bundleId: 3, name: 'Voltx', supplierId: 'voltx', members: ['D'] },
    { bundleId: 4, name: 'Everyone', supplierId: null, members: ['C'] },
    { bundleId: 5, name: 'Everyone older', supplierId: null, members: ['A'] },
  ];
  assert.equal(currentConfig(bundles, sets, 'yu').bundle.name, 'Yu');
  assert.equal(currentConfig(bundles, sets, 'yu').scope, 'supplier');
  assert.equal(currentConfig(bundles, sets, 'jellyfish').bundle.name, 'Everyone');
  assert.equal(currentConfig(bundles, sets, 'jellyfish').scope, 'all');
  assert.equal(currentConfig([], sets, 'yu'), null);
  // A configuration with no member left among the products is skipped.
  assert.equal(currentConfig([{ bundleId: 9, name: 'Gone', supplierId: 'yu', members: ['Z'] }], sets, 'yu'), null);
  // A tie keeps the first in the order given.
  assert.equal(currentConfig([{ bundleId: 7, name: 'P', supplierId: null, members: ['A'] }, { bundleId: 8, name: 'Q', supplierId: null, members: ['A'] }], sets, 'yu').bundle.name, 'P');
});

test('defaultConfigName: " (2)", " (3)" when the name or a product it would make is taken', () => {
  assert.equal(defaultConfigName('Yu gas 20/11/2026', new Set(), ['Gold']), 'Yu gas 20/11/2026');
  assert.equal(defaultConfigName('Yu gas 20/11/2026', new Set(['Yu gas 20/11/2026']), []), 'Yu gas 20/11/2026 (2)');
  assert.equal(defaultConfigName('Yu gas 20/11/2026', new Set(['Yu gas 20/11/2026', 'Yu gas 20/11/2026 (2)']), []), 'Yu gas 20/11/2026 (3)');
  assert.equal(defaultConfigName('Yu gas 20/11/2026', new Set(['Yu gas 20/11/2026 Gold']), ['Gold']), 'Yu gas 20/11/2026 (2)');
});

// Phil Brook, 20/11/2026: "current" is what is live. book_live names the band set of each live run
// (config_name, config_version, named); the older unnamed runs (named false) are left out.
const liveRow = (product, sale, name, version, extra) => Object.assign({ supplier_id: 'yu', fuel: 'gas', product, sale_type: sale,
  published_at: '2026-11-18T09:30:00+00:00', config_name: name, config_version: version, named: true }, extra);
const LIVE_SETS = [{ name: 'Yu Standard', version: 2 }, { name: 'Yu Gold', version: 1 }, { name: 'Spare', version: 1 }];
const LIVE_BUNDLES = [{ bundleId: 'b1', name: 'Everyone', supplierId: null, members: ['Yu Standard', 'Yu Gold'] },
  { bundleId: 'b2', name: 'Yu', supplierId: 'yu', members: ['Yu Gold', 'Yu Standard'] },
  { bundleId: 'b3', name: 'Voltx', supplierId: 'voltx', members: ['Yu Standard', 'Yu Gold'] }];

test('liveChoice: the live band sets, the same for both sale types, and the configuration holding exactly them', () => {
  const rows = [liveRow('Standard', 'acquisition', 'Yu Standard', 2), liveRow('Standard', 'renewal', 'Yu Standard', 2),
    liveRow('Gold', 'acquisition', 'Yu Gold', 1), liveRow('Gold', 'renewal', 'Yu Gold', 1),
    liveRow('Silver', 'acquisition', null, null, { named: false }),
    liveRow('Standard', 'acquisition', 'Other', 1, { supplier_id: 'voltx' }), liveRow('Standard', 'acquisition', 'Elec', 1, { fuel: 'electricity' })];
  const c = liveChoice(rows, 'yu', 'gas', LIVE_SETS, LIVE_BUNDLES);
  assert.deepEqual(c.acq, ['Yu Standard', 'Yu Gold']);
  assert.deepEqual(c.ren, ['Yu Standard', 'Yu Gold']);
  assert.equal(c.same, true);
  assert.equal(c.bundle.name, 'Yu', "the supplier's own configuration before an every-supplier one");
  assert.deepEqual(c.missing, []);
  assert.deepEqual(c.older, []);
  assert.equal(c.since, '2026-11-18T09:30:00+00:00');
});

test('liveChoice: different per sale type, no configuration matching, a retired band set and an older version', () => {
  const rows = [liveRow('Standard', 'acquisition', 'Yu Standard', 1), liveRow('Standard', 'renewal', 'Yu Standard', 1),
    liveRow('Gold', 'acquisition', 'Yu Gold', 1), liveRow('Saver', 'renewal', 'Gone Saver', 3)];
  const c = liveChoice(rows, 'yu', 'gas', LIVE_SETS, LIVE_BUNDLES);
  assert.deepEqual(c.acq, ['Yu Standard', 'Yu Gold']);
  assert.deepEqual(c.ren, ['Yu Standard']);
  assert.equal(c.same, false);
  assert.equal(c.bundle, null);
  assert.deepEqual(c.missing, ['Gone Saver']);
  assert.deepEqual(c.older, [{ name: 'Yu Standard', live: 1, now: 2 }]);
});

test('liveChoice: null when nothing named is live for the supplier and fuel', () => {
  assert.equal(liveChoice([], 'yu', 'gas', LIVE_SETS, LIVE_BUNDLES), null);
  assert.equal(liveChoice([liveRow('Gold', 'acquisition', null, null, { named: false })], 'yu', 'gas', LIVE_SETS, LIVE_BUNDLES), null);
  assert.equal(liveChoice(null, 'yu', 'gas', LIVE_SETS, LIVE_BUNDLES), null);
});
