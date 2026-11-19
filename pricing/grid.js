// Grid model for the Pricing tab's margins screen and workspace (v2, spec 4.3 to 4.5, 4.7).
//
// Pure functions, no DOM. A grid is a plain object and every function returns a new one:
//   { fuel, ladderId, bands: [{bandIndex, eacMinKwh, eacMaxKwh}],
//     columns: [{ name, product, costPerMeterPence, priceConfigId, isNew, stale,
//                 margins: [milli-pence or null, one per band], shares: [percent or null],
//                 saved: { margins, shares } }] }
// Margins are whole milli-pence per kWh (1.234p is 1234). Shares are percentages, at most 2 decimals.
// `saved` is what the database held when the grid was made; a column is changed when it differs.
// A column saved against an older ladder is `stale`: its margins are carried to the current ladder
// (carryToLadder), blanks where bands were split or merged, and stays marked stale. A stale column
// with no blank band counts as changed, so the next Save saves it again on the current ladder with
// the carried values (without that it could never be saved again, and Apply would refuse it for
// ever). A stale column with a blank band counts as changed only once a person edits one of its
// cells or its cost per meter; then problems() applies. editedNames() is what a person has edited,
// without the stale columns that are changed only because they are complete.
// ladderId is the band ladder the grid was made from; every save and preview sends it, so the
// database can refuse margins edited against a ladder that has since changed.

const MARGIN_MIN = 10; // 0.01p, the smallest margin a drag or a shift will give.

function text(t) {
  return String(t == null ? '' : t).trim();
}

// Decimal text to an integer count of 10^-places units, without floating point.
function scaled(str, places) {
  const parts = str.split('.');
  const frac = parts[1] || '';
  return Number(parts[0] + (frac + '0'.repeat(places)).slice(0, places));
}

export function parseMargin(input) {
  let t = text(input).replace(/p$/i, '').trim();
  if (t === '') return { error: 'Enter a margin.' };
  if (t.includes(',')) return { error: 'Use a full stop for decimals.' };
  if (/^-/.test(t)) return { error: 'The margin must be above zero.' };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { error: 'Enter the margin as a number, such as 1.234.' };
  if (t.startsWith('.')) t = '0' + t;
  const decimals = t.includes('.') ? t.split('.')[1].length : 0;
  if (decimals > 3) return { error: 'Use at most 3 decimal places.' };
  const value = scaled(t, 3);
  if (!(value > 0)) return { error: 'The margin must be above zero.' };
  if (!Number.isSafeInteger(value)) return { error: 'That margin is too large.' };
  return { value };
}

export function parseShare(input) {
  const t = text(input).replace(/%$/, '').trim();
  if (t === '') return { error: 'Enter a share.' };
  if (t.includes(',')) return { error: 'Use a full stop for decimals.' };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { error: 'Enter the share as a number, such as 40.' };
  const decimals = t.includes('.') ? t.split('.')[1].length : 0;
  if (decimals > 2) return { error: 'Use at most 2 decimal places.' };
  const value = Number(t);
  if (value < 0 || value > 100) return { error: 'The share must be between 0 and 100.' };
  return { value };
}

export function formatMargin(milli) {
  if (milli == null) return '';
  const whole = Math.trunc(milli / 1000);
  const frac = String(Math.abs(milli % 1000)).padStart(3, '0').replace(/0+$/, '');
  return frac ? whole + '.' + frac : String(whole);
}

// A display figure for the strip under each margin, not a price: annual margin at the band midpoint.
export function midpointAnnualPounds(milli, eacMinKwh, eacMaxKwh) {
  if (milli == null || eacMinKwh == null || eacMaxKwh == null) return null;
  return Math.round(milli / 1000 * ((eacMinKwh + eacMaxKwh) / 2) / 100);
}

// The pricing database's annual figures use a 365 day year, so the p/day share is over 365 days.
export const DAYS_PER_YEAR = 365;

// How the annual margin at a band's midpoint splits between the standing charge (p/day) and the unit
// rate (p/kWh), from the margin (milli-pence per kWh) and the standing share (percent). Display
// arithmetic, not a price. Figures are not rounded; the caller formats them.
export function marginSplit(milli, eacMinKwh, eacMaxKwh, sharePct) {
  if (milli == null || sharePct == null || eacMinKwh == null || eacMaxKwh == null) return null;
  const mid = (eacMinKwh + eacMaxKwh) / 2;
  const annualPence = milli * mid / 1000;
  const standingPence = annualPence * sharePct / 100;
  const unitPence = annualPence - standingPence;
  return {
    midpointKwh: mid, annualPounds: annualPence / 100, standingPounds: standingPence / 100, unitPounds: unitPence / 100,
    standingPencePerDay: standingPence / DAYS_PER_YEAR, unitPencePerKwh: unitPence / mid,
  };
}

function blank(n) { return new Array(n).fill(null); }

function sortedBands(bands) {
  return (bands || []).slice().sort((a, b) => a.bandIndex - b.bandIndex);
}

// Keep margin and share where a new band has the same lower bound as an old one, else null.
export function carryToLadder(oldBands, newLadderBands) {
  const byMin = new Map();
  for (const b of oldBands || []) byMin.set(b.eacMinKwh, b);
  return newLadderBands.map((nb, i) => {
    const old = byMin.get(nb.eacMinKwh);
    return {
      bandIndex: nb.bandIndex != null ? nb.bandIndex : i,
      eacMinKwh: nb.eacMinKwh,
      eacMaxKwh: nb.eacMaxKwh,
      marginMilliPencePerKwh: old && old.marginMilliPencePerKwh != null ? old.marginMilliPencePerKwh : null,
      standingSharePct: old && old.standingSharePct != null ? old.standingSharePct : null,
    };
  });
}

function columnFromSet(set, ladderBands) {
  const stale = set.ladderCurrent === false;
  const src = stale ? carryToLadder(set.bands, ladderBands) : sortedBands(set.bands);
  const byIndex = new Map(src.map(b => [b.bandIndex, b]));
  const pick = key => ladderBands.map(lb => {
    const b = byIndex.get(lb.bandIndex);
    return b && b[key] != null ? b[key] : null;
  });
  const margins = pick('marginMilliPencePerKwh');
  const shares = pick('standingSharePct');
  return {
    name: set.name, product: set.product, costPerMeterPence: set.costPerMeterPence,
    priceConfigId: set.priceConfigId == null ? null : set.priceConfigId,
    isNew: false, stale,
    margins, shares,
    saved: { margins: margins.slice(), shares: shares.slice(), costPerMeterPence: set.costPerMeterPence },
  };
}

// ladderBands: the band_sets op's ladder.bands. bandSets: its bandSets array. fuel is optional and is
// sent back with each set on save. ladderId is the band_sets op's ladder.ladderId, sent back with
// each saved set and each preview item.
export function makeGrid(ladderBands, bandSets, fuel, ladderId) {
  const bands = sortedBands(ladderBands).map(b => ({
    bandIndex: b.bandIndex, eacMinKwh: b.eacMinKwh, eacMaxKwh: b.eacMaxKwh,
  }));
  return {
    fuel: fuel == null ? null : fuel,
    ladderId: ladderId == null ? null : ladderId,
    bands,
    columns: (bandSets || []).map(s => columnFromSet(s, bands)),
  };
}

function withColumns(grid, columns) { return Object.assign({}, grid, { columns }); }

function colIndex(grid, name) {
  const i = grid.columns.findIndex(c => c.name === name);
  if (i < 0) throw new Error('No product called ' + name + ' in the grid.');
  return i;
}

function bandPos(grid, bandIndex) {
  const i = grid.bands.findIndex(b => b.bandIndex === bandIndex);
  if (i < 0) throw new Error('No band ' + bandIndex + ' in the ladder.');
  return i;
}

export function addColumn(grid, spec) {
  if (grid.columns.some(c => c.name === spec.name)) {
    throw new Error('There is already a product called ' + spec.name + ' in the grid.');
  }
  const n = grid.bands.length;
  let margins = blank(n), shares = blank(n);
  if (spec.fromName != null) {
    const from = grid.columns[colIndex(grid, spec.fromName)];
    margins = from.margins.slice();
    shares = from.shares.slice();
  }
  const col = {
    name: spec.name, product: spec.product, costPerMeterPence: spec.costPerMeterPence,
    priceConfigId: null, isNew: true, stale: false, margins, shares,
    saved: { margins: blank(n), shares: blank(n), costPerMeterPence: null },
  };
  return withColumns(grid, grid.columns.concat([col]));
}

// Cost per meter in whole pence. It is saved with the band set's margins as an unsaved change like any edit.
export function setCostPerMeter(grid, name, pence) {
  if (!Number.isSafeInteger(pence) || pence < 0) throw new Error('The cost per meter must be a whole number of pence, zero or more.');
  const columns = grid.columns.slice();
  const i = colIndex(grid, name);
  columns[i] = Object.assign({}, columns[i], { costPerMeterPence: pence });
  return withColumns(grid, columns);
}

function layerKey(layer) {
  if (layer === 'margin') return 'margins';
  if (layer === 'share') return 'shares';
  throw new Error('Layer must be margin or share.');
}

function mapCells(grid, cells, layer, fn) {
  const key = layerKey(layer);
  const columns = grid.columns.slice();
  const copied = new Set();
  for (const cell of cells) {
    const ci = colIndex(grid, cell.name);
    const bi = bandPos(grid, cell.bandIndex);
    if (!copied.has(ci)) {
      columns[ci] = Object.assign({}, columns[ci], { [key]: columns[ci][key].slice() });
      copied.add(ci);
    }
    columns[ci][key][bi] = fn(columns[ci][key][bi]);
  }
  return withColumns(grid, columns);
}

export function setCells(grid, cells, layer, value) {
  return mapCells(grid, cells, layer, () => value);
}

// delta is milli-pence for the margin layer and percentage points for the share layer. Empty cells
// stay empty.
export function shiftCells(grid, cells, layer, delta) {
  if (layer === 'margin') {
    return mapCells(grid, cells, layer, v => (v == null ? v : Math.max(MARGIN_MIN, v + delta)));
  }
  return mapCells(grid, cells, layer, v => (v == null ? v : Math.min(100, Math.max(0, Math.round((v + delta) * 100) / 100))));
}

// Copies both layers; the target keeps its own product and cost per meter.
export function copyColumn(grid, fromName, toName) {
  const from = grid.columns[colIndex(grid, fromName)];
  const ti = colIndex(grid, toName);
  const columns = grid.columns.slice();
  columns[ti] = Object.assign({}, columns[ti], { margins: from.margins.slice(), shares: from.shares.slice() });
  return withColumns(grid, columns);
}

// Rows are separated by a newline (CRLF too) and cells by a tab, as Excel copies them. A trailing
// newline is not a row. p, % and spaces are stripped; a blank cell leaves the value.
export function pasteBlock(grid, start, pasted, layer) {
  const key = layerKey(layer);
  const parse = layer === 'margin' ? parseMargin : parseShare;
  const errors = [];
  const rows = String(pasted == null ? '' : pasted).split(/\r\n|\n|\r/);
  if (rows.length && rows[rows.length - 1] === '') rows.pop();
  const si = colIndex(grid, start.name);
  const sb = bandPos(grid, start.bandIndex);
  const columns = grid.columns.slice();
  const copied = new Set();
  let wide = 0;
  rows.forEach((row, r) => {
    row.split('\t').forEach((raw, c) => {
      const t = raw.replace(/[p%\s]/gi, '');
      if (t === '') return;
      const bi = sb + r, ci = si + c;
      if (bi >= grid.bands.length) return;
      if (ci >= grid.columns.length) { wide = Math.max(wide, c + 1); return; }
      const res = parse(t);
      if (res.error) { errors.push('Row ' + (r + 1) + ', column ' + (c + 1) + ': ' + res.error); return; }
      if (!copied.has(ci)) {
        columns[ci] = Object.assign({}, columns[ci], { [key]: columns[ci][key].slice() });
        copied.add(ci);
      }
      columns[ci][key][bi] = res.value;
    });
  });
  if (sb + rows.length > grid.bands.length) {
    errors.push('Pasted ' + rows.length + ' rows; the ladder has ' + grid.bands.length + ' bands.');
  }
  if (wide) {
    errors.push('Pasted ' + wide + ' columns; there are only ' + (grid.columns.length - si) + ' products from ' + start.name + ' onwards.');
  }
  return { grid: withColumns(grid, columns), errors };
}

function same(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// A new set, or a cost, margins or shares that differ from what was saved.
export function isEdited(c) {
  return c.isNew || c.costPerMeterPence !== c.saved.costPerMeterPence || !same(c.margins, c.saved.margins) || !same(c.shares, c.saved.shares);
}

const complete = list => list.every(v => v != null);

// Edited, or saved against an older ladder with every band carried (final review A2).
export function isChanged(c) {
  return isEdited(c) || (!!c.stale && complete(c.margins) && complete(c.shares));
}

// The band sets the next Save saves.
export function changedNames(grid) {
  return grid.columns.filter(isChanged).map(c => c.name);
}

// The band sets a person has edited: leaving with these unsaved loses work.
export function editedNames(grid) {
  return grid.columns.filter(isEdited).map(c => c.name);
}

// Every band has a margin and a standing charge share.
export function isComplete(c) {
  return complete(c.margins) && complete(c.shares);
}

// The first band set with a blank band, and the layer that is blank (margin before share), or null.
// A blank new band set stays blank: nothing is filled in for the person.
export function firstGap(grid) {
  for (const c of grid.columns) {
    if (!complete(c.margins)) return { name: c.name, layer: 'margin' };
    if (!complete(c.shares)) return { name: c.name, layer: 'share' };
  }
  return null;
}

export function problems(grid) {
  const out = [];
  for (const c of grid.columns) {
    grid.bands.forEach((b, i) => {
      const m = c.margins[i], s = c.shares[i];
      if (m == null) out.push({ name: c.name, bandIndex: b.bandIndex, message: 'This band has no margin.' });
      else if (!Number.isInteger(m) || m <= 0) out.push({ name: c.name, bandIndex: b.bandIndex, message: 'The margin must be above zero.' });
      if (s == null) out.push({ name: c.name, bandIndex: b.bandIndex, message: 'This band has no standing charge share.' });
      else if (!(s >= 0 && s <= 100)) out.push({ name: c.name, bandIndex: b.bandIndex, message: 'The share must be between 0 and 100.' });
    });
  }
  return out;
}

function bandsFor(grid, c) {
  return grid.bands.map((b, i) => ({
    bandIndex: b.bandIndex, eacMinKwh: b.eacMinKwh, eacMaxKwh: b.eacMaxKwh,
    marginMilliPencePerKwh: c.margins[i], standingSharePct: c.shares[i],
  }));
}

// The band_sets_save request body: {reason, sets: [{name, fuel, product, costPerMeterPence, isNew,
// ladderId, bands}]}.
export function toSavePayload(grid, names, reason) {
  const sets = names.map(n => {
    const c = grid.columns[colIndex(grid, n)];
    return {
      name: c.name, fuel: grid.fuel, product: c.product,
      costPerMeterPence: c.costPerMeterPence, isNew: !!c.isNew, ladderId: grid.ladderId, bands: bandsFor(grid, c),
    };
  });
  return { reason, sets };
}

// The preview_selection items: [{label, product, saleType, costPerMeterPence, ladderId, bands}].
export function toPreviewItems(grid, picks) {
  return picks.map(p => {
    const c = grid.columns[colIndex(grid, p.name)];
    return {
      label: c.name, product: c.product, saleType: p.saleType,
      costPerMeterPence: c.costPerMeterPence, ladderId: grid.ladderId, bands: bandsFor(grid, c),
    };
  });
}

// The database's rule: one product per product type for each sale type, 'all' counting as both.
export function selectionProblem(picks, productOf) {
  const seen = { acquisition: new Set(), renewal: new Set() };
  const dup = { acquisition: null, renewal: null };
  for (const p of picks) {
    const product = productOf(p.name);
    const types = p.saleType === 'all' ? ['acquisition', 'renewal'] : [p.saleType];
    for (const t of types) {
      if (!seen[t]) continue;
      if (seen[t].has(product)) { if (dup[t] == null) dup[t] = product; } else seen[t].add(product);
    }
  }
  for (const t of ['acquisition', 'renewal']) {
    if (dup[t] != null) return 'Two products of product type ' + dup[t] + ' are chosen for ' + t + '. Choose one product per product type.';
  }
  return null;
}

// Chart helpers: y runs down the page, 0 at the top. The top of the scale is a little above the
// largest value so the highest point is not on the edge.
export function chartScale(milliValues, heightPx) {
  const vals = (milliValues || []).filter(v => v != null && isFinite(v));
  const top = Math.max(MARGIN_MIN, vals.length ? Math.max.apply(null, vals) : 0) * 1.1;
  return {
    toY: milli => heightPx * (1 - milli / top),
    fromY: y => top * (1 - y / heightPx),
  };
}

// A dragged point to a margin: nearest 10 milli-pence (0.01p), never below 10.
export function dragValue(scale, y) {
  return Math.max(MARGIN_MIN, Math.round(scale.fromY(y) / 10) * 10);
}

// ---------- The Margins page's look (Phil Brook's mockup, 19/11/2026): the chart's axis, the On chart
// row, the changed-cell count, the cell detail and the review lines. Display only, never a price.

// The chart's top is four round steps, a little above the largest margin, so the five gridlines read
// as round figures (0, 0.25, 0.50, 0.75, 1.00 p/kWh, for example). toY and fromY work as chartScale's,
// so dragValue takes either.
const AXIS_STEPS = [25, 50, 100, 125, 250, 500, 1000, 1250, 2500, 5000, 10000, 25000, 50000];
export function chartAxis(milliValues, heightPx) {
  const vals = (milliValues || []).filter(v => v != null && isFinite(v));
  const want = Math.max(MARGIN_MIN, vals.length ? Math.max.apply(null, vals) : 0) * 1.15;
  const step = AXIS_STEPS.find(s => s * 4 >= want) || Math.ceil(want / 4 / 50000) * 50000;
  const top = step * 4;
  return {
    top, ticks: [0, 1, 2, 3, 4].map(k => k * step),
    toY: milli => heightPx * (1 - milli / top),
    fromY: y => top * (1 - y / heightPx),
  };
}

// The chart shows at most four band sets, each in its own slot (line, colour and marker shape).
export const CHART_MAX = 4;

function freeSlot(picks, max) {
  for (let s = 0; s < max; s++) if (!picks.some(p => p.slot === s)) return s;
  return -1;
}

// Tick or untick a band set in the On chart row. A fifth is refused: { picks, refused: true }.
export function toggleChartPick(picks, name, max) {
  const cap = max || CHART_MAX;
  if (picks.some(p => p.name === name)) return { picks: picks.filter(p => p.name !== name), refused: false };
  if (picks.length >= cap) return { picks, refused: true };
  return { picks: picks.concat([{ name, slot: freeSlot(picks, cap) }]), refused: false };
}

// Keeps the ticks in step with the grid's columns (names, in the order shown): a band set that has
// left the grid leaves the chart, and one the grid has not shown before is ticked while there is room.
// So the chart starts with the first four, and a band set added later joins it if fewer are ticked.
export function syncChartPicks(picks, names, seen, max) {
  const cap = max || CHART_MAX;
  const known = new Set(names);
  let out = (picks || []).filter(p => known.has(p.name));
  for (const n of names) {
    if (seen && seen.has(n)) continue;
    if (out.length >= cap) break;
    if (!out.some(p => p.name === n)) out = out.concat([{ name: n, slot: freeSlot(out, cap) }]);
  }
  return { picks: out, seen: new Set(names) };
}

// Cells whose margin or share differs from what was saved (every filled cell of a new band set).
export function changedCellCount(grid) {
  let n = 0;
  for (const c of grid.columns) {
    for (let i = 0; i < grid.bands.length; i++) {
      if (c.isNew) { if (c.margins[i] != null || c.shares[i] != null) n++; continue; }
      if (c.margins[i] !== c.saved.margins[i] || c.shares[i] !== c.saved.shares[i]) n++;
    }
  }
  return n;
}

const GBP2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const kwh = n => Number(n).toLocaleString('en-GB');
const m3 = milli => (milli / 1000).toFixed(3);
const midPounds = (milli, b) => milli / 1000 * ((b.eacMinKwh + b.eacMaxKwh) / 2) / 100;
// The annual margin at the band midpoint to the penny, as the strip under each margin shows it.
export function midpointText(milli, eacMinKwh, eacMaxKwh) {
  if (milli == null || eacMinKwh == null || eacMaxKwh == null) return '';
  return GBP2.format(midPounds(milli, { eacMinKwh, eacMaxKwh }));
}
export function bandRange(b) { return kwh(b.eacMinKwh) + ' to ' + kwh(b.eacMaxKwh); }

// The Cell detail panel's rows for one band of one band set, as [{k, v}]: the margin (saved, and new
// when changed), what it earns a year at the band midpoint, the standing charge share and how the
// margin splits between the standing charge and the unit rate, the cost per meter and the product.
export function cellFacts(col, band, bi) {
  const rows = [];
  const m = col.margins[bi], s = col.shares[bi];
  const sm = col.isNew ? null : col.saved.margins[bi], ss = col.isNew ? null : col.saved.shares[bi];
  const mChanged = col.isNew || m !== sm, sChanged = col.isNew || s !== ss;
  if (!col.isNew) rows.push({ k: 'Saved margin', v: sm == null ? 'none' : m3(sm) + ' p/kWh' });
  if (mChanged) rows.push({ k: 'New margin', v: m == null ? 'none yet' : m3(m) + ' p/kWh' });
  if (!col.isNew && sm != null) rows.push({ k: 'Annual margin at midpoint, saved', v: GBP2.format(midPounds(sm, band)) });
  if (mChanged && m != null) rows.push({ k: 'Annual margin at midpoint, new', v: GBP2.format(midPounds(m, band)) });
  rows.push({ k: 'Standing charge share', v: (s == null ? 'none yet' : s + '%') + (!col.isNew && sChanged ? ' (saved ' + (ss == null ? 'none' : ss + '%') + ')' : '') });
  const sp = marginSplit(m, band.eacMinKwh, band.eacMaxKwh, s);
  if (sp) {
    rows.push({ k: 'Added to the standing charge', v: sp.standingPencePerDay.toFixed(3) + ' p/day' });
    rows.push({ k: 'Added to each unit rate', v: sp.unitPencePerKwh.toFixed(3) + ' p/kWh' });
  }
  const cost = col.costPerMeterPence, savedCost = col.saved.costPerMeterPence;
  rows.push({ k: 'Cost per meter', v: (cost == null ? 'none' : GBP2.format(cost / 100) + ' a year') + (!col.isNew && cost !== savedCost && savedCost != null ? ' (saved ' + GBP2.format(savedCost / 100) + ')' : '') });
  rows.push({ k: 'Product type', v: String(col.product == null ? '' : col.product) });
  return rows;
}

// What the Review changes panel lists for one changed band set, a sentence a line.
export function reviewLines(grid, name) {
  const c = grid.columns[colIndex(grid, name)];
  const out = [];
  if (c.isNew) {
    out.push('New product, cost per meter ' + (c.costPerMeterPence == null ? 'not given' : GBP2.format(c.costPerMeterPence / 100) + ' a year') + '.');
    grid.bands.forEach((b, i) => {
      out.push(bandRange(b) + ' kWh: ' + (c.margins[i] == null ? 'no margin' : m3(c.margins[i]) + ' p/kWh') + ', standing charge share ' + (c.shares[i] == null ? 'none' : c.shares[i] + '%'));
    });
    return out;
  }
  if (c.costPerMeterPence !== c.saved.costPerMeterPence) {
    out.push('Cost per meter ' + (c.saved.costPerMeterPence == null ? 'none' : GBP2.format(c.saved.costPerMeterPence / 100)) + ' to ' + GBP2.format(c.costPerMeterPence / 100) + ' a year');
  }
  grid.bands.forEach((b, i) => {
    const om = c.saved.margins[i], nm = c.margins[i], os = c.saved.shares[i], ns = c.shares[i];
    if (om !== nm) {
      out.push(bandRange(b) + ' kWh: ' + (om == null ? 'none' : m3(om)) + ' to ' + (nm == null ? 'none' : m3(nm)) + ' p/kWh, annual margin at midpoint ' +
        (om == null ? 'none' : GBP2.format(midPounds(om, b))) + ' to ' + (nm == null ? 'none' : GBP2.format(midPounds(nm, b))));
    }
    if (os !== ns) out.push(bandRange(b) + ' kWh: standing charge share ' + (os == null ? 'none' : os + '%') + ' to ' + (ns == null ? 'none' : ns + '%'));
  });
  if (!out.length && c.stale) out.push('Made on an older ladder. Every band carried over, so saving moves it to the current ladder.');
  return out;
}
