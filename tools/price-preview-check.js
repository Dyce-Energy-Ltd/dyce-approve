// A check of the Price screen in the preview hub (preview/hub.html, with tools/preview-stub.js).
// tests/test_build.py builds the preview, puts this file at the end of the page, opens it in a
// headless browser signed in through the stub (?as= in the address), starting in Pricing > Supplier
// files, and reads the answer this writes into a pre element with the id "result". It is not part
// of any page the hub serves. Every name and figure is the stub's, invented.
//
// ?as=pricing (all four Pricing ticks): Price on the gas file, where gas has no band sets, shows the
// gas ladder's bands with no columns and New band set; a blank new band set stays blank and the
// preview waits until every band is filled, then shows; Save calls band_sets_save and bundle_save
// and never apply, and the screen comes back with the band set ticked and the preview showing. On
// the electricity file a name already used by a band set or a product configuration is refused, a new band set
// can be kept for one sale type, and Apply with a new unsaved band set saves it, then applies it.
// ?as=pricingview (View only): the same gas file shows the bands, and no New band set or Save.
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
  const text = () => (pr() ? pr().textContent : "");
  const button = (label, r) => $$("button", r || pr()).find((b) => b.textContent.trim() === label) || null;
  const inputFor = (label, r) => { const l = $$("label", r || pr()).find((x) => x.textContent.trim() === label); return l ? document.getElementById(l.htmlFor) : null; };
  const set = (input, v) => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); };
  const calls = () => window.__stub.calls.map((c) => c.op);
  const previewMsg = () => { const h = $$("#pr h2.sect").find((x) => x.textContent === "Preview"); return h ? h.nextElementSibling.querySelector(".msg") : null; };
  const pivot = () => $("#pr table.pivot");
  // The chosen products, as listed under the two dropdowns (of one sale type's chooser when given).
  const chosen = (box) => $$("ul.picklist li", box || $("#pr .chooserbox")).map((li) => li.dataset.name);
  const pickIn = (box, label) => { const f = $$(".field", box).find((x) => x.querySelector("label").textContent === label); return f ? f.querySelector("select") : null; };
  const choose = (sel, text) => { const o = [...sel.options].find((x) => x.textContent === text); sel.value = o ? o.value : ""; sel.dispatchEvent(new Event("change", { bubbles: true })); return !!o; };
  const gridHeads = () => $$("#pr table.grid th.colh button").map((b) => b.textContent);
  const newCard = () => $$("#pr .card.white").find((c) => { const h = c.querySelector("h2"); return h && h.textContent === "New product"; }) || null;
  const dialogCard = (title) => $$("#pr .card.white").find((c) => { const h = c.querySelector("h2"); return h && h.textContent === title; }) || null;
  function done() { const p = document.createElement("pre"); p.id = "result"; p.textContent = JSON.stringify({ as, results }); document.body.append(p); }
  // The whole Margins mockup layout with no band sets, as on the Margins screen (Phil Brook, 20/11/2026).
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

  async function openFile(name) {
    const row = await until(() => $$("#pr table.prt tbody tr").find((tr) => tr.textContent.includes(name)));
    if (!row) return false;
    const b = $$("button", row).find((x) => /^(Price|Reprice)$/.test(x.textContent.trim()));
    if (!b) return false;
    b.click();
    return !!(await until(() => $$("#pr h2.sect").some((h) => h.textContent === "Margins")));
  }
  async function addSet(name, product, from, cost, useFor) {
    button("New product").click();
    const card = await until(newCard);
    if (!card) return null;
    set(inputFor("Name", card), name);
    if (from) set(inputFor("Start from", card), from);
    if (product) set(inputFor("Product type", card), product);
    set(inputFor("Cost per meter, £ a year", card), cost);
    if (useFor) set(inputFor("Use for", card), useFor);
    button("Add to the grid", card).click();
    await sleep(50);
    return card;
  }
  const newMsg = () => { const b = button("New product"); return b ? b.parentElement.nextElementSibling : null; };
  async function setColumn(name, layer, value) {
    if (layer === "share") button("Standing charge share, %").click(); else button("Margin, p/kWh").click();
    await sleep(20);
    const head = $$("#pr table.grid th.colh button").find((b) => b.textContent === name);
    head.click(); await sleep(20);
    set($('#pr .gridbar input[aria-label="Value"]'), value);
    button("Set to value", $("#pr .gridbar")).click();
    await sleep(20);
  }

  async function pricing() {
    // ---- gas: no band sets
    if (!(await openFile("Gamma_gas_example_06112026.xlsx"))) { check("the gas file opens", false, text().slice(0, 400)); return; }
    const rows = $$("#pr table.grid tbody tr");
    check("no products: the grid shows the gas ladder's five bands as rows", rows.length === 5 && $$("#pr table.grid th.colh").length === 0, rows.length);
    check("no products: the grid says to add one", text().includes("No gas products yet. Add one with New product above."), text().slice(0, 600));
    check("no products: the choice says where to add one", text().includes("No gas products yet. Add one with New product under Margins below."));
    check("New product and Save are offered", !!button("New product") && !!button("Save"));
    check("the margins hint names both routes", text().includes("Change margins here. Save keeps them without changing any price; Apply saves them and puts the prices live."));
    emptyLayout("gas", 5, true, "");

    const before = calls().length;
    await addSet("Gas One", "Standard", "", "8");
    const heads = $$("#pr table.grid th.colh button").map((b) => b.textContent);
    check("the blank product is in the grid", heads.join() === "Gas One", heads.join());
    check("blank stays blank: every cell is empty", $$('#pr table.grid td[data-name="Gas One"]').every((td) => td.textContent.startsWith("–")), $$("#pr table.grid td").map((t) => t.textContent).join("|"));
    check("the new product is chosen", chosen().includes("Gas One"), chosen().join());
    await sleep(800);
    check("blank: the preview waits with a plain line naming it", previewMsg() && !previewMsg().hidden && previewMsg().textContent === "Fill every band of Gas One to see the preview." && !previewMsg().classList.contains("refused"), previewMsg() && previewMsg().textContent);
    check("blank: no preview is asked for", !calls().slice(before).includes("preview_selection"), calls().slice(before).join());
    check("blank: Save and Apply are greyed out", button("Save").disabled && button("Apply").disabled);

    await addSet("Gas One", "Standard", "", "8");
    check("a name already in the grid is refused", newMsg() && newMsg().textContent === "There is already a product called Gas One in the grid.", newMsg() && newMsg().textContent);
    button("Cancel", newCard()).click();

    await setColumn("Gas One", "margin", "0.3");
    await sleep(800);
    check("margins filled: the preview waits for the shares", previewMsg().textContent === "Fill the standing charge share of every band of Gas One to see the preview.", previewMsg().textContent);
    check("still no preview asked for", !calls().slice(before).includes("preview_selection"));
    await setColumn("Gas One", "share", "0");
    check("every band filled: the preview shows", !!(await until(pivot)), previewMsg() && previewMsg().textContent);
    check("the preview item is the unsaved product", (() => { const c = window.__stub.calls.filter((x) => x.op === "preview_selection").pop(); return c && c.args.items.length === 1 && c.args.items[0].label === "Gas One" && c.args.items[0].bands.every((b) => b.marginMilliPencePerKwh === 300 && b.standingSharePct === 0); })());
    check("filled: Save is offered", !button("Save").disabled, button("Save").parentElement.parentElement.textContent);

    const atSave = calls().length;
    button("Save").click();
    const dlg = await until(() => dialogCard("Save"));
    check("Save asks for the reason and lists the new product", dlg && dlg.textContent.includes("New product, saved under its name: Gas One.") && !!inputFor("Reason for the change", dlg), dlg && dlg.textContent);
    check("not from a configuration: save the changed products, or a new product configuration", !!$("#prHowVer") && $("#prHowVer").checked && !!$("#prHowNew") && !$("#prHowUpd"));
    set(inputFor("Reason for the change", dlg), "First gas margins");
    button("Save products", dlg).click();
    const saidMsg = await until(() => { const m = $("#pr > .msg"); return m && !m.hidden && m.textContent.startsWith("Saved") ? m.textContent : null; });
    check("Save says what it saved, in words", saidMsg === "Saved Gas One version 1. No price has changed.", saidMsg || $("#pr > .msg").textContent);
    const made = calls().slice(atSave);
    check("Save calls band_sets_save, and never apply", made.includes("band_sets_save") && !made.includes("bundle_save") && !made.includes("apply"), made.join());
    const sv = window.__stub.calls.filter((c) => c.op === "band_sets_save").pop();
    check("the new product is saved as new under its name", sv && sv.args.sets.length === 1 && sv.args.sets[0].isNew === true && sv.args.sets[0].name === "Gas One" && sv.args.reason === "First gas margins");
    check("after Save the product is still chosen", !!(await until(() => chosen().includes("Gas One"))), chosen().join());
    check("after Save the preview shows again", !!(await until(pivot)));
    check("after Save the product is saved, not changed", !text().includes("Changed, not saved yet"), text().slice(0, 300));
    // Name the choice as a product configuration where you work, with a supplier (Phil Brook, 19/11/2026).
    const cfgBox = $("#pr .cfgsave");
    check("the name box and supplier are under the dropdowns", cfgBox && !!inputFor("Name", cfgBox) && inputFor("Supplier", cfgBox).options[0].textContent === "None (all suppliers)" && inputFor("Supplier", cfgBox).value === "");
    set(inputFor("Name", cfgBox), "Gas range"); set(inputFor("Supplier", cfgBox), "gamma");
    const atCfg = calls().length;
    button("Save as product configuration", cfgBox).click();
    const cfgSaid = await until(() => { const m = $("#pr > .msg"); return m && !m.hidden && m.textContent.startsWith("Product configuration") ? m.textContent : null; });
    check("the name box saves the choice as a product configuration", cfgSaid === "Product configuration Gas range saved, for Gamma Example Gas.", cfgSaid || $("#pr > .msg").textContent);
    const bsv = window.__stub.calls.filter((c) => c.op === "bundle_save").pop();
    check("it carries the chosen supplier and the chosen products", bsv && bsv.args.name === "Gas range" && bsv.args.supplierId === "gamma" && bsv.args.members.join() === "Gas One" && !calls().slice(atCfg).includes("band_sets_save"), JSON.stringify(bsv && bsv.args));
    check("after it the product configuration is chosen", await until(() => { const c = pickIn($("#pr .chooser"), "Product configuration"); return c && c.options[c.selectedIndex].textContent === "Gas range"; }));

    // ---- electricity: names already used, and a new band set for one sale type
    button("Back to files").click();
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("the electricity file opens", false); return; }
    await addSet("Core range", "", "", "15");
    check("a product configuration's name is refused", newMsg().textContent === "There is already a product or product configuration with that name.", newMsg().textContent);
    button("Cancel", newCard()).click();
    await addSet("Gold", "", "", "15");
    check("a saved product's name is refused", newMsg().textContent === "There is already a product called Gold in the grid.", newMsg().textContent);
    button("Cancel", newCard()).click();
    // ---- the two dropdowns (Phil Brook, 19/11/2026): a configuration loads its products, a product is added
    const box = () => $("#pr .chooser");
    check("two dropdowns side by side: Product configuration and Product", !!$("#pr .pickpair") && !!pickIn(box(), "Product configuration") && !!pickIn(box(), "Product"));
    check("the Product configuration dropdown has None", pickIn(box(), "Product configuration").options[0].textContent === "None");
    choose(pickIn(box(), "Product configuration"), "Core range"); await sleep(50);
    check("choosing a product configuration loads its products", chosen().join() === "Standard,Gold,Silver", chosen().join());
    check("the grid follows the choice", gridHeads().join() === "Standard,Gold,Silver", gridHeads().join());
    // Alpha's file: only what is Alpha's or for every supplier. Advanced Saver and Advanced range are
    // Beta's; Gold is Alpha's; Standard, Silver, Gold renewal and Core range are for every supplier.
    const cfgOffered = () => [...pickIn(box(), "Product configuration").options].slice(1).map((o) => o.textContent);
    check("supplier filter: no other supplier's product configuration", !cfgOffered().includes("Advanced range") && cfgOffered().includes("Core range"), cfgOffered().join());
    const offered = () => [...pickIn(box(), "Product").options].slice(1).map((o) => o.value);
    check("supplier filter: Beta's product is not offered, untagged ones are", offered().join() === "Gold renewal", offered().join());
    choose(pickIn(box(), "Product"), "Gold renewal (Gold)"); await sleep(50);
    check("choosing a product adds it", chosen().join() === "Standard,Gold,Silver,Gold renewal" && gridHeads().includes("Gold renewal"), chosen().join());
    check("adding a product keeps the configuration it started from", (() => { const c = pickIn(box(), "Product configuration"); return c.options[c.selectedIndex].textContent === "Core range"; })() && box().textContent.includes("Started from Core range."));
    button("Remove", $('#pr ul.picklist li[data-name="Gold"]')).click(); await sleep(50);
    check("Remove takes a product out of the choice and the grid", chosen().join() === "Standard,Silver,Gold renewal" && !gridHeads().includes("Gold"), chosen().join() + " | " + gridHeads().join());
    choose(pickIn(box(), "Product configuration"), "Core range"); await sleep(50);
    check("a product configuration replaces the choice", chosen().join() === "Standard,Gold,Silver", chosen().join());
    // The region by name alone; the code stays the value.
    const regionField = $$("#pr .field").find((f) => f.querySelector("label").textContent === "Region");
    const ropts = regionField ? [...regionField.querySelector("select").options] : [];
    check("region names show without their code", ropts.length > 0 && ropts.every((o) => o.textContent && !o.textContent.startsWith(o.value + " ")) && ropts.some((o) => o.textContent !== o.value), ropts.map((o) => o.value + "=" + o.textContent).join());
    // Chart and grid on one screen at 1440x900 (tests/test_build.py opens the window at that size),
    // and the chart's plot at least 1.4 times its old height (about 166 pixels at that width).
    if (await until(pivot)) {
      $("#pr .gridrow").scrollIntoView(); await sleep(50);
      const rowsNow = $$("#pr table.grid tbody tr"), lastRow = rowsNow[rowsNow.length - 1].getBoundingClientRect(), chartRect = $("#pr .chartcard").getBoundingClientRect();
      const gl = $$("#pr svg.chart .gl").map((l) => l.getBoundingClientRect().top), plot = Math.max(...gl) - Math.min(...gl);
      // A 1440 by 900 window leaves a page about 1424 by 805 in headless Chrome, which is stricter than a 1440 by 900 page.
      check("layout: the page is about 1440 wide and at most 900 high", innerWidth >= 1420 && innerWidth <= 1440 && innerHeight >= 780 && innerHeight <= 900, innerWidth + "x" + innerHeight);
      check("layout: the chart and the last band row are both on screen", chartRect.top >= 0 && chartRect.bottom <= innerHeight && lastRow.bottom <= innerHeight, chartRect.top + " " + chartRect.bottom + " " + lastRow.bottom);
      check("layout: the chart's plot is at least 1.4 times its old height", plot >= 233, plot);
    } else check("the preview shows for the layout check", false);
    $("#prSame").click(); await sleep(50);
    const [acq0, ren0] = $$("#pr .chooser");
    check("kept apart: a pair of dropdowns for each sale type", acq0 && ren0 && acq0.dataset.side === "acq" && ren0.dataset.side === "ren" && !!pickIn(acq0, "Product configuration") && !!pickIn(ren0, "Product"));
    check("kept apart: renewal starts as a copy of the choice", chosen(ren0).join() === "Standard,Gold,Silver", chosen(ren0).join());
    button("Remove", ren0.querySelector('li[data-name="Silver"]')).click(); await sleep(50);
    const [acq1, ren1] = $$("#pr .chooser");
    check("kept apart: a change for renewal changes renewal only", chosen(ren1).join() === "Standard,Gold" && chosen(acq1).join() === "Standard,Gold,Silver", chosen(acq1).join() + " | " + chosen(ren1).join());
    await addSet("Gold renewal two", "", "Gold", "15", "renewal");
    const [acqBox, renBox] = $$("#pr .chooser");
    check("kept apart: the new product is chosen for renewal only", acqBox && renBox && chosen(renBox).includes("Gold renewal two") && !chosen(acqBox).includes("Gold renewal two"));

    // ---- Save as a new product configuration, then Update it (Phil Brook, 19/11/2026)
    button("Back to files").click();
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("the electricity file opens for the configuration saves", false); return; }
    choose(pickIn(box(), "Product configuration"), "Core range"); await until(pivot);
    await setColumn("Gold", "margin", "0.8");
    button("Save").click();
    const sdlg = await until(() => dialogCard("Save"));
    check("from a configuration: Update it, or save as a new product configuration", sdlg && $("#prHowUpd") && $("#prHowUpd").checked && sdlg.textContent.includes("Update Core range") && !!$("#prHowNew") && !$("#prHowVer"), sdlg && sdlg.textContent.slice(0, 400));
    $("#prHowNew").click(); await sleep(20);
    set(inputFor("Product configuration name", sdlg), "Aggressive Pricing"); set(inputFor("Supplier", sdlg), "alpha");
    set(inputFor("Reason for the change", sdlg), "Sharper Gold for Alpha");
    const atNew = calls().length;
    button("Save products", sdlg).click();
    const newSaid = await until(() => { const m = $("#pr > .msg"); return m && !m.hidden && m.textContent.startsWith("Saved") ? m.textContent : null; });
    check("Save as a new product configuration says what it saved", newSaid === "Saved Aggressive Pricing Gold version 1. Product configuration Aggressive Pricing saved. No price has changed.", newSaid || $("#pr > .msg").textContent);
    const nsv = window.__stub.calls.slice(atNew).filter((c) => c.op === "band_sets_save").pop(), nbs = window.__stub.calls.slice(atNew).filter((c) => c.op === "bundle_save").pop();
    check("the changed product is saved as a new product named <configuration> <product type>, with the supplier", nsv && nsv.args.sets.length === 1 && nsv.args.sets[0].name === "Aggressive Pricing Gold" && nsv.args.sets[0].isNew === true && nsv.args.sets[0].product === "Gold" && nsv.args.sets[0].supplierId === "alpha" && nsv.args.sets[0].bands.every((b) => b.marginMilliPencePerKwh === 800), JSON.stringify(nsv && nsv.args.sets.map((x) => [x.name, x.isNew, x.supplierId])));
    check("the new configuration holds the new product and the unchanged ones", nbs && !nbs.args.bundleId && nbs.args.name === "Aggressive Pricing" && nbs.args.supplierId === "alpha" && nbs.args.members.slice().sort().join() === "Aggressive Pricing Gold,Silver,Standard", JSON.stringify(nbs && nbs.args));
    const after = await until(() => { const c = window.__stub.calls.slice(atNew).filter((x) => x.op === "band_sets").pop(); return c && c.answer ? c.answer : null; });
    const core = after && after.bundles.find((b) => b.name === "Core range");
    check("the configuration it started from is not changed", core && core.members.join() === "Standard,Gold,Silver" && after.bandSets.find((b) => b.name === "Gold").version === 3, JSON.stringify(core));
    check("after it the choice is the new configuration", await until(() => chosen().slice().sort().join() === "Aggressive Pricing Gold,Silver,Standard"), chosen().join());
    button("Remove", $('#pr ul.picklist li[data-name="Silver"]')).click(); await sleep(50);
    button("Save").click();
    const udlg = await until(() => dialogCard("Save"));
    check("Update is offered for the configuration the choice came from", udlg && $("#prHowUpd") && $("#prHowUpd").checked && udlg.textContent.includes("Update Aggressive Pricing"), udlg && udlg.textContent.slice(0, 300));
    const atUpd = calls().length;
    button("Save products", udlg).click();
    const updSaid = await until(() => { const m = $("#pr > .msg"); return m && !m.hidden && m.textContent.startsWith("Product configuration Aggressive Pricing updated") ? m.textContent : null; });
    check("Update says what it did", updSaid === "Product configuration Aggressive Pricing updated. No price has changed.", updSaid || $("#pr > .msg").textContent);
    const ubs = window.__stub.calls.slice(atUpd).filter((c) => c.op === "bundle_save").pop();
    check("Update sets the configuration to the products chosen now, keeping its supplier", ubs && nbs && ubs.args.bundleId === nbs.answer.bundleId && ubs.args.name === "Aggressive Pricing" && ubs.args.supplierId === "alpha" && ubs.args.members.slice().sort().join() === "Aggressive Pricing Gold,Standard" && !calls().slice(atUpd).includes("band_sets_save"), JSON.stringify(ubs && ubs.args));

    // ---- Apply with a new unsaved band set: saved first, then applied
    button("Back to files").click();
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("the electricity file opens again", false); return; }
    await addSet("Standard two", "", "Standard", "15");
    check("a copy starts full and previews", !!(await until(pivot)));
    const atApply = calls().length;
    button("Apply").click();
    const adlg = await until(() => dialogCard("Apply"));
    check("Apply lists the new product", adlg && adlg.textContent.includes("New product, saved under its name: Standard two."), adlg && adlg.textContent);
    set(inputFor("Reason for the change", adlg), "New standard set");
    if ($("#prRead")) $("#prRead").click();
    button("Apply prices", adlg).click();
    const applied = await until(() => { const m = $("#pr > .msg"); return m && m.textContent.startsWith("Applied") ? m.textContent : null; });
    check("Apply finishes", !!applied, $("#pr > .msg").textContent + " | " + adlg.textContent);
    const made2 = calls().slice(atApply), saved = window.__stub.calls.filter((c) => c.op === "band_sets_save").pop(), ap = window.__stub.calls.filter((c) => c.op === "apply").pop();
    check("Apply saves the new product, then applies", made2.indexOf("band_sets_save") >= 0 && made2.indexOf("band_sets_save") < made2.indexOf("apply"), made2.join());
    check("Apply uses the saved product", saved && ap && saved.args.sets[0].name === "Standard two" && saved.args.sets[0].isNew === true && ap.args.selections.length === 1 && ap.args.selections[0].priceConfigId === saved.answer.saved[0].priceConfigId, JSON.stringify(ap && ap.args));
  }

  async function view() {
    if (!(await openFile("Gamma_gas_example_06112026.xlsx"))) { check("the gas file opens", false, text().slice(0, 400)); return; }
    check("view only: the grid shows the gas ladder's bands", $$("#pr table.grid tbody tr").length === 5);
    check("view only: the grid says who can add a product", text().includes("No gas products yet. Someone with the Set tick can add one."));
    check("view only: no New product and no Save", !button("New product") && !button("Save") && !button("Save products"));
    check("view only: no Apply", !button("Apply"));
    emptyLayout("gas", 5, false, "view only ");
  }

  (async () => {
    try {
      if (!(await until(() => window.__stub && pr() && $$("#pr table.prt").length))) check("the files list is drawn", false, document.body.textContent.slice(0, 300));
      else if (as === "pricingview") await view();
      else await pricing();
    } catch (e) { check("the check ran", false, String(e && e.stack || e)); }
    done();
  })();
})();
