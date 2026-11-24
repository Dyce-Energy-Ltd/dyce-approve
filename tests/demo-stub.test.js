// The demo build's stub (tools/preview-stub.js with window.__DEMO__ = true): its Pricing answers are
// stateful, and nothing leaves the page. The stub is run here in a bare vm context with a fake window,
// storage and clock; every name, file and figure is invented.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STUB = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "preview-stub.js"), "utf8");
const PR = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/dna-pricing";

function makeStore() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

// A demo page: fake clock (advance with ctx.tick), storage that can be carried to a "reload", and a
// fetch the stub replaces. realFetchCalls counts any call that reached the page's own fetch.
function demoPage(sessionStorage = makeStore(), localStorage = makeStore()) {
  let clock = Date.parse("2026-11-16T15:00:00Z");
  const realFetchCalls = [];
  const win = { __DEMO__: true, fetch: (u) => { realFetchCalls.push(String(u)); return Promise.resolve(new Response("{}")); } };
  const DateFake = class extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } };
  const ctx = vm.createContext({ window: win, location: { search: "", pathname: "/x" }, sessionStorage, localStorage, Response, URLSearchParams, JSON, Math, Date: DateFake,
    setTimeout: (f) => { f(); return 0; }, console, Promise, Blob, URL });
  vm.runInContext(STUB, ctx);
  return { win, realFetchCalls, sessionStorage, localStorage, tick: (ms) => { clock += ms; },
    async call(body, url = PR) { const r = await win.fetch(url, { method: "POST", body: JSON.stringify({ token: "stubdemo", ...body }) }); return { status: r.status, body: await r.json() }; } };
}
const bySupplier = (files, id, fuel) => files.filter((f) => f.supplierId === id && f.fuel === fuel);
// Gas starts with no band sets, as in dyce-prod on 19/11/2026. This saves one, as Save on the Price
// screen does (band_sets_save with isNew), and returns it as band_sets gives it.
async function gasSet(d, name = "Gas Standard", product = "Standard") {
  const gas = (await d.call({ op: "band_sets", fuel: "gas" })).body;
  const bands = gas.ladder.bands.map((b, i) => ({ ...b, marginMilliPencePerKwh: 300 - i * 30, standingSharePct: 0 }));
  const sv = await d.call({ op: "band_sets_save", reason: "demo", sets: [{ name, fuel: "gas", product, isNew: true, costPerMeterPence: 800, ladderId: gas.ladder.ladderId, bands }] });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  const after = (await d.call({ op: "band_sets", fuel: "gas" })).body;
  return { ladder: after.ladder, set: after.bandSets.find((s) => s.name === name) };
}

test("the demo signs in with no sign-in screen and answers no call from outside the page", async () => {
  const d = demoPage();
  assert.equal(d.localStorage.getItem("dyce.hub.token"), "stubdemo");
  assert.deepEqual(JSON.parse(d.localStorage.getItem("dyce.hub.where")), { tool: "pricing", item: "files" });
  const me = await d.call({ op: "call", action: "me" }, "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/comms-web");
  assert.equal(me.body.result.display_name, "Demo Example");
  assert.deepEqual([...me.body.result.ticks].sort(), ["pricing.load", "pricing.publish", "pricing.set", "pricing.view"]);
  await assert.rejects(() => d.win.fetch("https://example.test/anything"));
  assert.deepEqual(d.realFetchCalls, [], "fetch is replaced: no call reaches the page's own fetch");
});

test("the start state is the story's five files and one failed load", async () => {
  const d = demoPage();
  const ov = (await d.call({ op: "overview" })).body;
  assert.deepEqual(ov.files.map((f) => f.supplierId + " " + f.fuel + " " + f.state).sort(),
    ["jellyfish gas awaiting_bandings", "jellyfish gas replaced", "voltx electricity live", "yu electricity awaiting_bandings", "yu gas awaiting_bandings"]);
  assert.equal(ov.loadFailures.length, 1);
  assert.match(ov.loadFailures[0].reason, /not found/);
});

test("apply moves the file to applying, then live; the Voltx file is untouched; the book fills", async () => {
  const d = demoPage();
  const bs = (await d.call({ op: "band_sets", fuel: "electricity" })).body;
  const gold = bs.bandSets.find((s) => s.name === "Gold");
  const yu = (await d.call({ op: "overview" })).body.files.find((f) => f.supplierId === "yu" && f.fuel === "electricity");
  const items = [{ label: "Gold", product: "Gold", saleType: "all", costPerMeterPence: gold.costPerMeterPence, ladderId: bs.ladder.ladderId, bands: gold.bands }];
  const pv = (await d.call({ op: "preview_selection", fileId: yu.supplierFileId, region: "10", usages: [2000], items })).body;
  assert.equal(pv.attention.length, 2);
  assert.deepEqual(Object.keys(pv.attention[0]).sort(), ["detail", "issue", "product", "rangeMaxKwh", "rangeMinKwh", "rateCount", "saleType"]);
  const liveBefore = (await d.call({ op: "book_live" })).body.live.length;
  const ap = await d.call({ op: "apply", fileId: yu.supplierFileId, selections: [{ priceConfigId: gold.priceConfigId, saleType: "all" }], attentionSeen: pv.attentionCount, fingerprint: pv.fingerprint });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  let files = (await d.call({ op: "overview" })).body.files;
  assert.equal(bySupplier(files, "yu", "electricity")[0].state, "applying");
  assert.equal((await d.call({ op: "book_live" })).body.live.length, liveBefore, "no rows until the build is done");
  d.tick(5000);
  files = (await d.call({ op: "overview" })).body.files;
  assert.equal(bySupplier(files, "yu", "electricity")[0].state, "live");
  assert.equal(bySupplier(files, "voltx", "electricity")[0].state, "live");
  assert.equal(bySupplier(files, "yu", "gas")[0].state, "awaiting_bandings", "another file of the same supplier is untouched");
  const live = (await d.call({ op: "book_live" })).body.live.filter((x) => x.supplier_id === "yu");
  assert.deepEqual(live.map((x) => x.sale_type).sort(), ["acquisition", "renewal"]);
  const rows = (await d.call({ op: "book_rows", priceRunId: live[0].price_run_id })).body.rows;
  assert.equal(rows.length, 12);
  assert.ok(rows.every((r) => r.supplier_id === "yu" && r.product === "Gold"));
});

test("an older file of the same supplier and fuel turns replaced when the newer one goes live", async () => {
  const d = demoPage();
  const jf = (await d.call({ op: "overview" })).body.files.filter((f) => f.supplierId === "jellyfish");
  const newer = jf.find((f) => f.state === "awaiting_bandings");
  const { ladder, set: bs } = await gasSet(d), gas = { ladder };
  const items = [{ label: bs.name, product: bs.product, saleType: "all", costPerMeterPence: bs.costPerMeterPence, ladderId: gas.ladder.ladderId, bands: bs.bands }];
  const pv = (await d.call({ op: "preview_selection", fileId: newer.supplierFileId, region: "EA", usages: [20000], items })).body;
  assert.equal(pv.attentionCount, 0);
  const ap = await d.call({ op: "apply", fileId: newer.supplierFileId, selections: [{ priceConfigId: bs.priceConfigId, saleType: "all" }], attentionSeen: 0, fingerprint: pv.fingerprint });
  assert.equal(ap.status, 200);
  d.tick(5000);
  const files = (await d.call({ op: "overview" })).body.files;
  assert.deepEqual(files.filter((f) => f.supplierId === "jellyfish").map((f) => f.state).sort(), ["live", "replaced"]);
});

test("saves make new versions, bundles are added, and the preview moves with the margins", async () => {
  const d = demoPage();
  const el = (await d.call({ op: "band_sets", fuel: "electricity" })).body, ladderId = el.ladder.ladderId;
  const set = el.bandSets.find((s) => s.name === "Standard");
  const hist0 = (await d.call({ op: "band_set_history", fuel: "electricity", name: "Standard" })).body.versions.length;
  const bands = set.bands.map((b) => ({ ...b, marginMilliPencePerKwh: b.marginMilliPencePerKwh + 100 }));
  const sv = await d.call({ op: "band_sets_save", reason: "demo", sets: [{ name: "Standard", fuel: "electricity", product: "Standard", isNew: false, costPerMeterPence: set.costPerMeterPence, ladderId, bands }] });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  assert.equal((await d.call({ op: "band_set_history", fuel: "electricity", name: "Standard" })).body.versions.length, hist0 + 1);
  const bu = await d.call({ op: "bundle_save", fuel: "electricity", name: "Demo bundle", members: ["Standard", "Gold"] });
  assert.equal(bu.status, 200);
  assert.ok((await d.call({ op: "band_sets", fuel: "electricity" })).body.bundles.some((b) => b.name === "Demo bundle"));
  const yu = (await d.call({ op: "overview" })).body.files.find((f) => f.supplierId === "yu" && f.fuel === "electricity");
  const price = async (b) => (await d.call({ op: "preview_selection", fileId: yu.supplierFileId, region: "10", usages: [2000], items: [{ label: "Standard", product: "Standard", saleType: "acquisition", costPerMeterPence: 1500, ladderId, bands: b }] })).body.rows.find((r) => r.which === "proposed" && r.termMonths === 12).unitRatePence2dp;
  assert.ok((await price(bands)) > (await price(set.bands)));
});

// Final review A7: canApply follows the database (the newest finished file, whatever its state), so the
// demo offers "Price this file" on a Live newest file, and pricing it again replaces its live set.
test("the newest finished file can be priced whatever its state; an older or loading one cannot", async () => {
  const d = demoPage();
  const files = (await d.call({ op: "overview" })).body.files;
  const can = (id, fuel) => files.filter((f) => f.supplierId === id && f.fuel === fuel).map((f) => f.state + " " + f.canApply).sort();
  assert.deepEqual(can("voltx", "electricity"), ["live true"]);
  assert.deepEqual(can("jellyfish", "gas"), ["awaiting_bandings true", "replaced false"]);
  const voltx = files.find((f) => f.supplierId === "voltx" && f.fuel === "electricity");
  const el = (await d.call({ op: "band_sets", fuel: "electricity" })).body, silver = el.bandSets.find((s) => s.name === "Silver");
  const items = [{ label: "Silver", product: "Silver", saleType: "all", costPerMeterPence: silver.costPerMeterPence, ladderId: el.ladder.ladderId, bands: silver.bands }];
  const pv = (await d.call({ op: "preview_selection", fileId: voltx.supplierFileId, region: "10", usages: [2000], items })).body;
  const ap = await d.call({ op: "apply", fileId: voltx.supplierFileId, selections: [{ priceConfigId: silver.priceConfigId, saleType: "all" }], attentionSeen: pv.attentionCount, fingerprint: pv.fingerprint });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  d.tick(5000);
  const live = (await d.call({ op: "book_live" })).body.live.filter((x) => x.supplier_id === "voltx" && x.fuel === "electricity");
  assert.deepEqual(live.map((x) => x.product + " " + x.sale_type).sort(), ["Silver acquisition", "Silver renewal"], "the whole live set is replaced");
  const old = files.find((f) => f.supplierId === "jellyfish" && f.state === "replaced");
  const { ladder: gasLadder, set: gs } = await gasSet(d), gas = { ladder: gasLadder };
  const refused = await d.call({ op: "preview_selection", fileId: old.supplierFileId, region: "EA", usages: [20000], items: [{ label: gs.name, product: gs.product, saleType: "all", costPerMeterPence: gs.costPerMeterPence, ladderId: gas.ladder.ladderId, bands: gs.bands }] });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /^Only the newest file of that supplier and fuel can be priced: Jellyfish_gas_demo_13112026\.xlsx\.$/);
});

// Final review S2 and A3: a save or preview edited against a ladder that has since changed is refused.
test("a save or a preview against a ladder that is no longer current is refused", async () => {
  const d = demoPage();
  const el = (await d.call({ op: "band_sets", fuel: "electricity" })).body, set = el.bandSets.find((s) => s.name === "Standard");
  const yu = (await d.call({ op: "overview" })).body.files.find((f) => f.supplierId === "yu" && f.fuel === "electricity");
  const same = el.ladder.bands.map((b) => ({ eacMinKwh: b.eacMinKwh, eacMaxKwh: b.eacMaxKwh }));
  const unchanged = await d.call({ op: "ladder_save", fuel: "electricity", reason: "demo", bands: same });
  assert.deepEqual([unchanged.status, unchanged.body.error], [400, "The ladder is the same as the current one. Nothing was saved."]);
  const wider = same.map((b, i) => (i === same.length - 1 ? { ...b, eacMaxKwh: b.eacMaxKwh + 1000 } : b));
  const lad = await d.call({ op: "ladder_save", fuel: "electricity", reason: "demo", bands: wider });
  assert.equal(lad.status, 200);
  const sentence = "The electricity band ladder has changed since this screen was opened. Open it again.";
  const sv = await d.call({ op: "band_sets_save", reason: "demo", sets: [{ name: "Standard", fuel: "electricity", product: "Standard", isNew: false, costPerMeterPence: set.costPerMeterPence, ladderId: el.ladder.ladderId, bands: set.bands }] });
  assert.deepEqual([sv.status, sv.body.error], [400, sentence]);
  const pv = await d.call({ op: "preview_selection", fileId: yu.supplierFileId, region: "10", usages: [2000], items: [{ label: "Standard", product: "Standard", saleType: "all", costPerMeterPence: 1500, ladderId: el.ladder.ladderId, bands: set.bands }] });
  assert.deepEqual([pv.status, pv.body.error], [400, sentence]);
  const none = await d.call({ op: "preview_selection", fileId: yu.supplierFileId, region: "10", usages: [2000], items: [{ label: "Standard", product: "Standard", saleType: "all", costPerMeterPence: 1500, bands: set.bands }] });
  assert.deepEqual([none.status, none.body.error], [400, "The band ladder is not valid."]);
});

test("the state lasts for the tab: a reload from the same session storage carries on", async () => {
  const d = demoPage();
  const yu = (await d.call({ op: "overview" })).body.files.find((f) => f.supplierId === "yu" && f.fuel === "electricity");
  await d.call({ op: "bundle_save", fuel: "electricity", name: "Kept bundle", members: ["Standard"] });
  const d2 = demoPage(d.sessionStorage, d.localStorage);
  assert.ok((await d2.call({ op: "band_sets", fuel: "electricity" })).body.bundles.some((b) => b.name === "Kept bundle"));
  assert.ok(yu);
  const fresh = demoPage();
  assert.ok(!(await fresh.call({ op: "band_sets", fuel: "electricity" })).body.bundles.some((b) => b.name === "Kept bundle"));
});

test("the price check answers a live run's prices by term and sale type, and nothing for a run that is not live", async () => {
  const d = demoPage();
  const live = (await d.call({ op: "book_live" })).body.live;
  const run = live[0].price_run_id, sales = live.filter((x) => x.price_run_id === run).map((x) => x.sale_type).sort();
  const r = await d.call({ op: "book_check", priceRunId: run, region: "23", usages: [10000] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([...new Set(r.body.rows.map((x) => x.termMonths))], [12, 24, 36]);
  assert.deepEqual([...new Set(r.body.rows.map((x) => x.saleType))].sort(), sales);
  assert.ok(r.body.rows.every((x) => x.sellAnnualPence === Math.round(x.unitRatePence2dp * 10000 + x.standingChargePence2dp * 365)));
  assert.deepEqual((await d.call({ op: "book_check", priceRunId: "00000000-0000-4000-8000-000000000000", region: "23", usages: [10000] })).body.rows, []);
  assert.equal((await d.call({ op: "book_check", priceRunId: run, region: "23", usages: [0] })).status, 400);
});

// The Price screen (Phil Brook, 19/11/2026): with no gas band sets there is still a ladder to band
// against; a band set made there and saved, with a bundle, changes no file and no live price.
test("gas starts with no band sets; saving a new one and a bundle changes no file and no live price", async () => {
  const d = demoPage();
  const gas0 = (await d.call({ op: "band_sets", fuel: "gas" })).body;
  assert.deepEqual([gas0.bandSets.length, gas0.bundles.length], [0, 0]);
  assert.equal(gas0.ladder.bands.length, 5, "the gas ladder is there to band against");
  const files0 = (await d.call({ op: "overview" })).body.files, live0 = (await d.call({ op: "book_live" })).body.live;
  const yuGas = files0.find((f) => f.supplierId === "yu" && f.fuel === "gas");
  const { ladder, set } = await gasSet(d, "Gas Gold", "Gold");
  assert.equal(set.version, 1);
  const bu = await d.call({ op: "bundle_save", fuel: "gas", name: "Gas range", members: ["Gas Gold"] });
  assert.equal(bu.status, 200, JSON.stringify(bu.body));
  assert.deepEqual((await d.call({ op: "overview" })).body.files.map((f) => f.state), files0.map((f) => f.state), "no file changed state");
  assert.deepEqual((await d.call({ op: "book_live" })).body.live, live0, "no live price changed");
  const pv = await d.call({ op: "preview_selection", fileId: yuGas.supplierFileId, region: "EA", usages: [20000], items: [{ label: set.name, product: set.product, saleType: "all", costPerMeterPence: set.costPerMeterPence, ladderId: ladder.ladderId, bands: set.bands }] });
  assert.equal(pv.status, 200, JSON.stringify(pv.body));
  assert.ok(pv.body.rows.length > 0);
  // A second new band set or a bundle by a name already used is refused, as the database refuses it.
  const again = await d.call({ op: "band_sets_save", reason: "demo", sets: [{ name: "Gas range", fuel: "gas", product: "Standard", isNew: true, costPerMeterPence: 0, ladderId: ladder.ladderId, bands: set.bands }] });
  assert.deepEqual([again.status, again.body.error], [400, "There is already a band set or bundle with that name."]);
});
