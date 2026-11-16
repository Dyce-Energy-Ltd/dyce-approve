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
  const items = [{ label: "Gold", product: "Gold", saleType: "all", costPerMeterPence: gold.costPerMeterPence, bands: gold.bands }];
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
  const bs = (await d.call({ op: "band_sets", fuel: "gas" })).body.bandSets[0];
  const items = [{ label: bs.name, product: bs.product, saleType: "all", costPerMeterPence: bs.costPerMeterPence, bands: bs.bands }];
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
  const set = (await d.call({ op: "band_sets", fuel: "electricity" })).body.bandSets.find((s) => s.name === "Standard");
  const hist0 = (await d.call({ op: "band_set_history", fuel: "electricity", name: "Standard" })).body.versions.length;
  const bands = set.bands.map((b) => ({ ...b, marginMilliPencePerKwh: b.marginMilliPencePerKwh + 100 }));
  const sv = await d.call({ op: "band_sets_save", reason: "demo", sets: [{ name: "Standard", fuel: "electricity", product: "Standard", isNew: false, costPerMeterPence: set.costPerMeterPence, bands }] });
  assert.equal(sv.status, 200, JSON.stringify(sv.body));
  assert.equal((await d.call({ op: "band_set_history", fuel: "electricity", name: "Standard" })).body.versions.length, hist0 + 1);
  const bu = await d.call({ op: "bundle_save", fuel: "electricity", name: "Demo bundle", members: ["Standard", "Gold"] });
  assert.equal(bu.status, 200);
  assert.ok((await d.call({ op: "band_sets", fuel: "electricity" })).body.bundles.some((b) => b.name === "Demo bundle"));
  const yu = (await d.call({ op: "overview" })).body.files.find((f) => f.supplierId === "yu" && f.fuel === "electricity");
  const price = async (b) => (await d.call({ op: "preview_selection", fileId: yu.supplierFileId, region: "10", usages: [2000], items: [{ label: "Standard", product: "Standard", saleType: "acquisition", costPerMeterPence: 1500, bands: b }] })).body.rows.find((r) => r.which === "proposed" && r.termMonths === 12).unitRatePence2dp;
  assert.ok((await price(bands)) > (await price(set.bands)));
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
