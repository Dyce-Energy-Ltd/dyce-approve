// A check of the Margins screen in the preview hub (preview/hub.html, with tools/preview-stub.js), laid
// out as Phil Brook's Margins mockup (19/11/2026). tests/test_build.py builds the preview, puts this file
// at the end of the page, opens it in a headless browser signed in through the stub (?as= in the
// address), starting in Pricing > Margins, and reads the answer this writes into a pre element with the
// id "result". It is not part of any page the hub serves. Every name and figure is the stub's, invented.
//
// ?as=pricing (all four Pricing ticks): the On chart row ticks the first four band sets and takes no
// fifth; unticking one frees a place; the Cell detail asks for a click, then shows the cell's figures and
// the versions of its band set, and Restore as a new change puts an older version back as a change; the
// foot counts the changes; Review changes lists them and its Save, with a reason, saves them through
// band_sets_save; Gas, with no band sets, shows its ladder's bands.
// ?as=pricingview (View only): the same grid, chart and detail, with no Manage, Restore or Review.
(() => {
  const q = new URLSearchParams(location.search);
  const as = q.get("as") || "pricing";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? "" : String(detail ?? "") });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(f, tries) {
    for (let i = 0; i < (tries || 120); i++) { let v = null; try { v = f(); } catch { v = null; } if (v) return v; await sleep(50); }
    return null;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const pr = () => $("#pr");
  const button = (label, r) => $$("button", r || pr()).find((b) => b.textContent.trim() === label) || null;
  const calls = () => window.__stub.calls.map((c) => c.op);
  const aside = () => $("#pr aside.detail");
  const ticks = () => $$("#pr tr.onchart input[type=checkbox]");
  const legend = () => $$("#pr .chartcard .legend .key").map((k) => k.textContent.trim());
  const cell = (name, band) => $('#pr table.grid td.cell[data-name="' + name + '"][data-band="' + band + '"]');
  const kv = (k) => { const row = $$("#pr aside.detail .kv > div").find((d) => d.querySelector(".k").textContent === k); return row ? row.querySelector(".v").textContent : null; };
  function done() { const p = document.createElement("pre"); p.id = "result"; p.textContent = JSON.stringify({ as, results }); document.body.append(p); }

  async function common() {
    const heads = $$("#pr table.grid th.colh button").map((b) => b.textContent);
    check("the electricity grid shows the five band sets", heads.length === 5, heads.join());
    check("the chart sits above the grid", $("#pr .chartcard") && $("#pr .gridrow") && ($("#pr .chartcard").compareDocumentPosition($("#pr .gridrow")) & Node.DOCUMENT_POSITION_FOLLOWING));
    check("the chart title names the fuel", $("#pr .chartcard .ct-title").textContent === "Margin curve, electricity: p/kWh by band (kWh a year)");
    const t = ticks();
    check("On chart: the first four are ticked", t.length === 5 && t.slice(0, 4).every((x) => x.checked) && !t[4].checked, t.map((x) => x.checked).join());
    check("On chart: no fifth while four are ticked", t[4].disabled, t[4].disabled);
    check("the chart draws the four ticked", legend().length === 4 && $$("#pr svg.chart path.ln").length === 4, legend().join());
    t[0].click(); await sleep(30);
    check("unticking one takes it off the chart", legend().length === 3 && !legend().includes(heads[0]), legend().join());
    const t2 = ticks();
    check("unticking one frees a place", !t2[4].disabled);
    t2[4].click(); await sleep(30);
    check("the fifth can then be ticked", legend().length === 4 && legend().includes(heads[4]), legend().join());
    check("and the first can no longer be ticked", ticks()[0].disabled);
    check("Cell detail asks for a click first", aside() && aside().textContent.includes("Click a cell to see what it earns at the band midpoint"), aside() && aside().textContent);
    cell("Gold", 2).click(); await sleep(30);
    check("Cell detail names the band set, fuel and band", $("#pr aside.detail .dt-title").textContent === "Gold · Electricity" && $("#pr aside.detail .dt-band").textContent.startsWith("3,001 to 12,500 kWh a year, midpoint 7,750.5 kWh"), aside().textContent.slice(0, 200));
    check("Cell detail gives the margin and what it earns at the midpoint", kv("Saved margin") === "0.620 p/kWh" && kv("Annual margin at midpoint, saved") === "£48.05", kv("Saved margin") + " " + kv("Annual margin at midpoint, saved"));
    check("Cell detail splits it between standing charge and unit rate", /p\/day$/.test(kv("Added to the standing charge") || "") && /p\/kWh$/.test(kv("Added to each unit rate") || ""));
    check("Cell detail gives the cost per meter and product", kv("Cost per meter") === "£15.00 a year" && kv("Product") === "Gold");
    const vers = await until(() => { const v = $$("#pr aside.detail .ver"); return v.length ? v : null; });
    check("Versions of this band set are listed, newest first", vers && vers.length === 3 && vers[0].textContent.startsWith("Version 3") && vers[0].textContent.includes("current"), vers && vers.map((v) => v.textContent).join(" | "));
    check("the cell picked is marked", cell("Gold", 2).classList.contains("sel"));
    check("Selected names the cell", $("#pr .gridbar .selt").textContent === "Selected: Gold, 3,001 to 12,500");
    return vers;
  }

  async function pricing() {
    const vers = await common();
    check("Restore as a new change on the older versions only", vers && !button("Restore as a new change", vers[0]) && !!button("Restore as a new change", vers[2]));
    check("nothing changed yet: Review changes is greyed out", button("Review changes").disabled && button("Discard changes").disabled);
    button("Restore as a new change", vers[2]).click(); await sleep(50);
    check("the restored version is back as a change", cell("Gold", 2).classList.contains("chg") && cell("Gold", 2).querySelector(".cv").textContent === "0.560", cell("Gold", 2).textContent);
    const footText = $("#pr .savebar .t").textContent;
    check("the foot counts the changed cells and band sets", footText === "6 changed cells in 1 band set, not saved yet", footText);
    button("Review changes").click(); await sleep(50);
    const rv = $("#pr .review");
    check("Review changes lists the band set and its bands", rv && !rv.hidden && rv.textContent.includes("Gold · Electricity") && rv.textContent.includes("3,001 to 12,500 kWh: 0.620 to 0.560 p/kWh, annual margin at midpoint £48.05 to £43.40"), rv && rv.textContent.slice(0, 400));
    check("no cap warning", !rv.textContent.includes("cap"));
    check("Save waits for a reason", button("Save", rv).disabled);
    const reason = $("#prReason");
    reason.value = "Back to the first margins"; reason.dispatchEvent(new Event("input", { bubbles: true }));
    check("a reason allows Save", !button("Save", rv).disabled);
    const before = calls().length;
    button("Save", rv).click();
    const said = await until(() => { const m = $("#pr > .msg"); return m && !m.hidden && m.textContent.startsWith("Saved") ? m.textContent : null; });
    check("Save saves through band_sets_save with the reason", said === "Saved Gold version 4." && calls().slice(before).includes("band_sets_save") && window.__stub.calls.filter((c) => c.op === "band_sets_save").pop().args.reason === "Back to the first margins", said);
    check("after Save nothing is waiting", await until(() => button("Review changes") && button("Review changes").disabled));
    // A blank band stops Save, without a cap check.
    const sv = await until(() => cell("Silver", 1));
    sv.click(); await sleep(20);
    const valIn = $('#pr .gridbar input[aria-label="Value"]');
    valIn.value = "0.2"; valIn.dispatchEvent(new Event("input", { bubbles: true }));
    button("Set to value", $("#pr .gridbar")).click(); await sleep(30);
    check("Set to value changes the selection", cell("Silver", 1).querySelector(".cv").textContent === "0.200");
    check("Manage band sets keeps New band set", !!button("New band set"));
    button("New band set").click();
    check("New band set opens its form", !!(await until(() => button("Add to the grid"))));
    // Gas has no band sets: its ladder's bands still show. Leaving with a change is refused first.
    button("Gas").click(); await sleep(50);
    check("leaving with unsaved changes is refused", $("#pr > .msg").textContent.startsWith("You have unsaved changes to Silver."), $("#pr > .msg").textContent);
    button("Discard changes").click();
    await until(() => button("Review changes") && button("Review changes").disabled);
    button("Gas").click();
    const rows = await until(() => { const r = $$("#pr table.grid tbody tr"); return r.length === 5 && !$$("#pr table.grid th.colh").length ? r : null; });
    check("Gas: the ladder's five bands show with no band sets", !!rows);
  }

  async function view() {
    const vers = await common();
    check("view only: no Restore", vers && !vers.some((v) => button("Restore as a new change", v)));
    check("view only: no Manage, Review or Shift", !$$("#pr summary").some((s) => s.textContent === "Manage band sets") && !button("Review changes") && !button("Shift by value"));
  }

  (async () => {
    try {
      if (!(await until(() => window.__stub && pr() && $$("#pr table.grid th.colh").length))) check("the Margins grid is drawn", false, document.body.textContent.slice(0, 300));
      else if (as === "pricingview") await view();
      else await pricing();
    } catch (e) { check("the check ran", false, String(e && e.stack || e)); }
    done();
  })();
})();
