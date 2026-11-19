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
  // The whole mockup layout with no band sets (Phil Brook, 20/11/2026: dyce-prod has none yet): the
  // switches (greyed out), the selection bar, the chart card with axes over the bands, the grid's
  // corner cells and a row per band, New band set in the grid with the Set tick, and the Cell detail.
  function emptyLayout(fuel, bands, canSet, tag) {
    const segs = $$("#pr .mk-ctl").map((c) => c.querySelector(".lab").textContent);
    check(tag + "empty: the Columns and Showing switches show, greyed out", segs.includes("Columns") && segs.includes("Showing") && button("By product configuration").disabled && button("Margin, p/kWh").disabled, segs.join());
    check(tag + "empty: the selection bar shows Selected: nothing, greyed out", $("#pr .gridbar") && !$("#pr .gridbar").hidden && $("#pr .gridbar .selt").textContent === "Selected: nothing" && button("Select all", $("#pr .gridbar")).disabled);
    const card = $("#pr .chartcard");
    check(tag + "empty: the chart card shows its title and axes over the bands", card && !card.hidden && card.querySelector(".ct-title").textContent === "Margin curve, " + fuel + ": p/kWh by band (kWh a year)" && $$("#pr svg.chart text.axt.ta-m").length === bands && $$("#pr svg.chart .gl").length === 5, card && card.textContent.slice(0, 200));
    check(tag + "empty: the chart says to add a product", card && !!card.querySelector(".legend") && card.querySelector(".legend").textContent === (canSet ? "No products to plot yet. Add one with New product." : "No products to plot yet. Someone with the Set tick can add one."), card && card.textContent);
    check(tag + "empty: the grid keeps its corner cells and a row per band", $("#pr table.grid .corner3") && $("#pr table.grid .corner3").textContent === "On chart (up to 4)" && $("#pr table.grid .corner2").textContent === "Band, kWh a year" && $$("#pr table.grid tbody tr").length === bands);
    check(tag + "empty: New product is in the grid only with the Set tick", canSet ? !!button("New product", $("#pr table.grid")) : !$$("#pr table.grid button").some((b) => b.textContent === "New product"));
    check(tag + "empty: the Cell detail asks for a click", $("#pr aside.detail") && !$("#pr aside.detail").hidden && $("#pr aside.detail").textContent.includes("Click a cell to see what it earns at the band midpoint"));
  }

  async function common() {
    const heads = $$("#pr table.grid th.colh button").map((b) => b.textContent);
    check("the electricity grid shows the five products", heads.length === 5, heads.join());
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
    check("Cell detail names the product, fuel and band", $("#pr aside.detail .dt-title").textContent === "Gold · Electricity" && $("#pr aside.detail .dt-band").textContent.startsWith("3,001 to 12,500 kWh a year, midpoint 7,750.5 kWh"), aside().textContent.slice(0, 200));
    check("Cell detail gives the margin and what it earns at the midpoint", kv("Saved margin") === "0.620 p/kWh" && kv("Annual margin at midpoint, saved") === "£48.05", kv("Saved margin") + " " + kv("Annual margin at midpoint, saved"));
    check("Cell detail splits it between standing charge and unit rate", /p\/day$/.test(kv("Added to the standing charge") || "") && /p\/kWh$/.test(kv("Added to each unit rate") || ""));
    check("Cell detail gives the cost per meter and product", kv("Cost per meter") === "£15.00 a year" && kv("Product type") === "Gold");
    check("Cell detail gives the product's supplier", kv("Supplier") === "Alpha Example Power", kv("Supplier"));
    const vers = await until(() => { const v = $$("#pr aside.detail .ver"); return v.length ? v : null; });
    check("Versions of this product are listed, newest first", vers && vers.length === 3 && vers[0].textContent.startsWith("Version 3") && vers[0].textContent.includes("current"), vers && vers.map((v) => v.textContent).join(" | "));
    check("the cell picked is marked", cell("Gold", 2).classList.contains("sel"));
    check("Selected names the cell", $("#pr .gridbar .selt").textContent === "Selected: Gold, 3,001 to 12,500");
    // Chart and grid on one screen at 1440x900 (tests/test_build.py opens the window at that size): with
    // the grid's row at the top of the window, the chart and the last band row are above the foot bar,
    // and the plot is at least 1.4 times its old height (about 166 pixels at that width).
    $("#pr .gridrow").scrollIntoView(); await sleep(50);
    const rowsNow = $$("#pr table.grid tbody tr"), lastRow = rowsNow[rowsNow.length - 1].getBoundingClientRect(), chartRect = $("#pr .chartcard").getBoundingClientRect();
    const footBar = $("#pr .savebar"), floor = footBar ? footBar.getBoundingClientRect().top : innerHeight;
    const gl = $$("#pr svg.chart .gl").map((l) => l.getBoundingClientRect().top), plot = Math.max(...gl) - Math.min(...gl);
    // A 1440 by 900 window leaves a page about 1424 by 805 in headless Chrome, which is stricter than a 1440 by 900 page.
    check("layout: the page is about 1440 wide and at most 900 high", innerWidth >= 1420 && innerWidth <= 1440 && innerHeight >= 780 && innerHeight <= 900, innerWidth + "x" + innerHeight);
    check("layout: the chart and the last band row are both on screen", chartRect.top >= 0 && chartRect.bottom <= floor && lastRow.bottom <= floor, chartRect.top + " " + chartRect.bottom + " " + lastRow.bottom + " " + floor);
    check("layout: the chart sits beside the grid", Math.abs(chartRect.top - $("#pr .gridwrap").getBoundingClientRect().top) < 2);
    check("layout: the chart's plot is at least 1.4 times its old height", plot >= 233, plot);
    return vers;
  }

  async function pricing() {
    const vers = await common();
    check("Restore as a new change on the older versions only", vers && !button("Restore as a new change", vers[0]) && !!button("Restore as a new change", vers[2]));
    check("nothing changed yet: Review changes is greyed out", button("Review changes").disabled && button("Discard changes").disabled);
    button("Restore as a new change", vers[2]).click(); await sleep(50);
    check("the restored version is back as a change", cell("Gold", 2).classList.contains("chg") && cell("Gold", 2).querySelector(".cv").textContent === "0.560", cell("Gold", 2).textContent);
    const footText = $("#pr .savebar .t").textContent;
    check("the foot counts the changed cells and products", footText === "6 changed cells in 1 product, not saved yet", footText);
    button("Review changes").click(); await sleep(50);
    const rv = $("#pr .review");
    check("Review changes lists the product and its bands", rv && !rv.hidden && rv.textContent.includes("Gold · Electricity") && rv.textContent.includes("3,001 to 12,500 kWh: 0.620 to 0.560 p/kWh, annual margin at midpoint £48.05 to £43.40"), rv && rv.textContent.slice(0, 400));
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
    check("Manage products keeps New product", !!button("New product"));
    button("New product").click();
    check("New product opens its form", !!(await until(() => button("Add to the grid"))));
    const supOf = (card) => { const f = $$(".field", card).find((x) => x.querySelector("label").textContent === "Supplier"); return f ? f.querySelector("select") : null; };
    const formCard = (title) => $$("#pr .card.white").find((c) => c.querySelector("h2") && c.querySelector("h2").textContent === title);
    const nsup = supOf(formCard("New product"));
    check("New product has an optional Supplier, None by default", nsup && nsup.value === "" && nsup.options[0].textContent === "None (all suppliers)" && [...nsup.options].some((o) => o.textContent === "Alpha Example Power"));
    // Gas has no band sets: its ladder's bands still show. Leaving with a change is refused first.
    button("Gas").click(); await sleep(50);
    check("leaving with unsaved changes is refused", $("#pr > .msg").textContent.startsWith("You have unsaved changes to Silver."), $("#pr > .msg").textContent);
    button("Discard changes").click();
    await until(() => button("Review changes") && button("Review changes").disabled);
    button("New product configuration").click();
    const bcard = await until(() => formCard("Product configuration"));
    check("New product configuration has an optional Supplier", bcard && supOf(bcard) && supOf(bcard).value === "");
    const pick = bcard && $$(".field", bcard).find((x) => x.querySelector("label").textContent === "Product configuration").querySelector("select");
    if (pick) { pick.value = [...pick.options].find((o) => o.textContent === "Advanced range").value; pick.dispatchEvent(new Event("change", { bubbles: true })); }
    check("editing a product configuration shows its supplier", bcard && supOf(bcard).value === "beta", bcard && supOf(bcard).value);
    button("Gas").click();
    const rows = await until(() => { const r = $$("#pr table.grid tbody tr"); return r.length === 5 && !$$("#pr table.grid th.colh").length ? r : null; });
    check("Gas: the ladder's five bands show with no products", !!rows);
    emptyLayout("gas", 5, true, "Gas ");
    check("Gas empty: the foot shows", $("#pr .savebar") && $("#pr .savebar .t").textContent === "No unsaved changes.");
    button("New product", $("#pr table.grid")).click();
    check("Gas empty: the grid's New product opens the form", !!(await until(() => button("Add to the grid"))));
  }

  async function view() {
    const vers = await common();
    check("view only: no Restore", vers && !vers.some((v) => button("Restore as a new change", v)));
    check("view only: no Manage, Review or Shift", !$$("#pr summary").some((s) => s.textContent === "Manage products") && !button("Review changes") && !button("Shift by value"));
    button("Gas").click();
    const rows = await until(() => { const r = $$("#pr table.grid tbody tr"); return r.length === 5 && !$$("#pr table.grid th.colh").length ? r : null; });
    check("view only, Gas: the ladder's five bands show", !!rows);
    emptyLayout("gas", 5, false, "view only, Gas ");
    check("view only, Gas: the grid says who can add a product", $("#pr .gridwrap").textContent.includes("No gas products yet. Someone with the Set tick can add one."));
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
