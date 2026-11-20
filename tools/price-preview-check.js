// A check of the Price screen in the preview hub (preview/hub.html, with tools/preview-stub.js).
// tests/test_build.py builds the preview, puts this file at the end of the page, opens it in a
// headless browser signed in through the stub (?as= in the address), starting in Pricing > Supplier
// files, and reads the answer this writes into a pre element with the id "result". It is not part
// of any page the hub serves. Every name and figure is the stub's, invented.
//
// The screen as Phil Brook asked on 20/11/2026: it opens on the live products (Beta: they are exactly
// the product configuration Advanced range; Delta: no configuration matches, acquisition and renewal
// differ, one live product is retired and one is live at an older version), or, with nothing live
// (Alpha), on the most recently saved product configuration, with the
// grid, chart and preview showing and no product dropdowns; one margin change shows the new product
// configuration's name, dated today; Save makes that configuration and leaves the original as it was;
// Apply with no change applies without saving; More options loads another configuration and keeps
// acquisition and renewal apart. ?as=pricing (all four Pricing ticks) runs all of it, with the gas
// file (no products at all) banded from nothing; ?as=pricingview (View only) sees the configuration,
// grid, chart and preview, and no Save, Apply or name box.
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
  const lastCall = (op, from) => window.__stub.calls.slice(from || 0).filter((c) => c.op === op).pop() || null;
  const previewMsg = () => { const h = $$("#pr h2.sect").find((x) => x.textContent === "Preview"); return h ? h.nextElementSibling.querySelector(".msg") : null; };
  const pivot = () => $("#pr table.pivot");
  const gridHeads = () => $$("#pr table.grid th.colh button").map((b) => b.textContent);
  const cfgLine = () => ($("#pr p.cfgline") || {}).textContent || "";
  const more = () => $("#pr details.prmore");
  const changeBox = () => $("#pr .changebox");
  const nameBox = () => $("#prCfgName");
  const headMsg = () => { const m = $("#pr > .msg"); return m && !m.hidden ? m.textContent : ""; };
  const barMsg = () => { const m = $("#pr .actionbar > div.msg"); return m && !m.hidden ? m.textContent : ""; };
  const newCard = () => $$("#pr .card.white").find((c) => { const h = c.querySelector("h2"); return h && h.textContent === "New product"; }) || null;
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  // The chosen products of one sale type, under More options.
  const chosen = (box) => $$("ul.picklist li", box || $("#pr .chooserbox")).map((li) => li.dataset.name);
  const productSelect = (box) => { const f = $$(".field", box).find((x) => x.querySelector("label").textContent === "Product"); return f ? f.querySelector("select") : null; };
  const choose = (sel, label) => { const o = [...sel.options].find((x) => x.textContent === label); sel.value = o ? o.value : ""; sel.dispatchEvent(new Event("change", { bubbles: true })); return !!o; };
  function done() { const p = document.createElement("pre"); p.id = "result"; p.textContent = JSON.stringify({ as, results }); document.body.append(p); }
  // The whole Margins mockup layout with no products, as on the Margins screen (Phil Brook, 20/11/2026).
  function emptyLayout(fuel, bands, canSet, tag) {
    const segs = $$("#pr .mk-ctl").map((c) => c.querySelector(".lab").textContent);
    check(tag + "empty: the Columns and Showing switches show, greyed out", segs.includes("Columns") && segs.includes("Showing") && button("By product configuration").disabled && button("Margin, p/kWh").disabled, segs.join());
    check(tag + "empty: the selection bar shows Selected: nothing, greyed out", $("#pr .gridbar") && !$("#pr .gridbar").hidden && $("#pr .gridbar .selt").textContent === "Selected: nothing" && button("Select all", $("#pr .gridbar")).disabled);
    const card = $("#pr .chartcard");
    check(tag + "empty: the chart card shows its title and axes over the bands", card && !card.hidden && card.querySelector(".ct-title").textContent === "Margin curve, " + fuel + ": p/kWh by band (kWh a year)" && $$("#pr svg.chart text.axt.ta-m").length === bands && $$("#pr svg.chart .gl").length === 5, card && card.textContent.slice(0, 200));
    check(tag + "empty: the chart says to add a product", card && !!card.querySelector(".legend") && card.querySelector(".legend").textContent === (canSet ? "No products to plot yet. Add one with New product." : "No products to plot yet. Someone with the Set tick can add one."), card && card.textContent);
    check(tag + "empty: the grid keeps its corner cells and a row per band", $("#pr table.grid .corner3") && $("#pr table.grid .corner3").textContent === "On chart (up to 4)" && $("#pr table.grid .corner2").textContent === "Band, kWh a year" && $$("#pr table.grid tbody tr").length === bands);
    check(tag + "empty: New product is in the grid only with the Set tick", canSet ? !!button("New product", $("#pr table.grid")) : !$$("#pr table.grid button").some((b) => b.textContent === "New product"));
  }
  // Phil Brook, 20/11/2026: no product dropdowns on the main view. The region is the one dropdown kept;
  // everything else that chooses products is under More options.
  function cleanMainView(tag) {
    const outside = $$("#pr select").filter((s) => !s.closest("details.prmore") && !s.closest(".card.white"));
    const regionSel = inputFor("Region");
    check(tag + "the only dropdown on the main view is the region", outside.length === 1 && outside[0] === regionSel, outside.map((s) => (s.previousElementSibling || {}).textContent).join("|"));
    check(tag + "no chosen-products list, configuration box or Same tickbox on the main view", !$$("#pr ul.picklist").some((u) => !u.closest("details.prmore")) && !$("#prSame") && !text().includes("Same for acquisition and renewal") && !$("#pr .cfgsave"));
    const top = $("#pr .mk-top"), segs = top ? $$(".mk-ctl .lab", top).map((x) => x.textContent) : [];
    check(tag + "above the grid only the Showing tabs; Columns is under More options", segs.join() === "Showing" && !!$("#pr details.prmore .mk-ctl") && $("#pr details.prmore .mk-ctl .lab").textContent === "Columns", segs.join());
    check(tag + "More options is closed to start", more() && !more().open);
  }

  async function openFile(name) {
    const row = await until(() => $$("#pr table.prt tbody tr").find((tr) => tr.textContent.includes(name)));
    if (!row) return false;
    const b = $$("button", row).find((x) => /^(Price|Reprice)$/.test(x.textContent.trim()));
    if (!b) return false;
    b.click();
    return !!(await until(() => $$("#pr h2.sect").some((h) => h.textContent === "Margins") && $("#pr p.cfgline")));
  }
  async function back() { button("Back to files").click(); await until(() => $$("#pr table.prt tbody tr").length); }
  async function addSet(name, product, from, cost, useFor) {
    button("New product", more()).click();
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
    // ---- Alpha's file: not live, with a product configuration saved for Alpha
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("the Alpha file opens", false, text().slice(0, 400)); return; }
    check("fallback: with nothing live, the most recently saved product configuration, not live yet", cfgLine() === "Current product configuration: Alpha November (not live yet).", cfgLine());
    check("open: its products are in the grid at once", gridHeads().join() === "Standard,Gold", gridHeads().join());
    check("open: the chart draws them", $$("#pr .chartcard .legend .key").length === 2, $("#pr .chartcard .legend") && $("#pr .chartcard .legend").textContent);
    check("open: the preview shows without a click", !!(await until(pivot)), previewMsg() && previewMsg().textContent);
    const pv = lastCall("preview_selection");
    check("open: the preview is for both products, for acquisition and renewal", pv && pv.args.items.map((i) => i.label + ":" + i.saleType).join() === "Standard:all,Gold:all", JSON.stringify(pv && pv.args.items.map((i) => [i.label, i.saleType])));
    cleanMainView("open: ");
    const regionSel = inputFor("Region");
    check("open: the region starts at the first region, by name alone", regionSel && regionSel.value === regionSel.options[0].value && [...regionSel.options].every((o) => !o.textContent.startsWith(o.value + " ")) && regionSel.options[0].textContent === "Eastern", regionSel && [...regionSel.options].map((o) => o.value + "=" + o.textContent).join());
    check("open: no Cell detail until a cell is clicked", $("#pr aside.detail") && $("#pr aside.detail").hidden);
    check("open: no name line and no Save with nothing changed", changeBox() && changeBox().hidden && button("Save").hidden, changeBox() && changeBox().hidden);
    // Chart and grid on one screen at 1440x900 (tests/test_build.py opens the window at that size).
    $("#pr .gridrow").scrollIntoView(); await sleep(50);
    const rowsNow = $$("#pr table.grid tbody tr"), lastRow = rowsNow[rowsNow.length - 1].getBoundingClientRect(), chartRect = $("#pr .chartcard").getBoundingClientRect();
    const gl = $$("#pr svg.chart .gl").map((l) => l.getBoundingClientRect().top), plot = Math.max(...gl) - Math.min(...gl);
    check("layout: the page is about 1440 wide and at most 900 high", innerWidth >= 1420 && innerWidth <= 1440 && innerHeight >= 780 && innerHeight <= 900, innerWidth + "x" + innerHeight);
    check("layout: the chart and the last band row are both on screen", chartRect.top >= 0 && chartRect.bottom <= innerHeight && lastRow.bottom <= innerHeight, chartRect.top + " " + chartRect.bottom + " " + lastRow.bottom);
    check("layout: the chart's plot is at least 1.4 times its old height", plot >= 233, plot);
    $('#pr table.grid td[data-name="Gold"]').click(); await sleep(30);
    check("a cell clicked shows the Cell detail", !$("#pr aside.detail").hidden && $("#pr aside.detail").textContent.includes("Gold"));

    // ---- one margin change: the new configuration's name, dated today
    await setColumn("Gold", "margin", "0.8");
    const dflt = "Alpha Example Power electricity " + today;
    check("a change shows the name line with the dated name", changeBox() && !changeBox().hidden && changeBox().textContent.includes("New product configuration:") && nameBox().value === dflt, nameBox() && nameBox().value);
    check("a change offers Discard changes and Save", !!button("Discard changes") && !button("Save").hidden);
    check("the line says what is saved and that the original is not changed", changeBox().textContent.includes("Changed products are saved as " + dflt + " Gold.") && changeBox().textContent.includes("Alpha November is not changed."), changeBox().textContent);
    check("no Update or New version choice", !text().includes("Update Alpha November") && !text().includes("New version of") && !$("#prHowUpd") && !$("#prHowVer"));
    // A typed name that is taken is refused in a plain sentence.
    set(nameBox(), "Core range");
    const atTaken = calls().length;
    button("Save").click(); await sleep(50);
    check("a typed name already used is refused", barMsg() === "There is already a product or product configuration called Core range. Choose another name.", barMsg());
    check("nothing is saved when the name is refused", !calls().slice(atTaken).some((op) => op === "band_sets_save" || op === "bundle_save"), calls().slice(atTaken).join());
    set(nameBox(), dflt);
    button("Save").click(); await sleep(50);
    check("a reason is asked for", barMsg() === "Give a reason for the changes.", barMsg());
    set(inputFor("Reason for the change"), "Sharper Gold for Alpha");
    const atSave = calls().length;
    button("Save").click();
    const saved = await until(() => headMsg().startsWith("Saved") ? headMsg() : null);
    check("Save says what it saved", saved === "Saved " + dflt + " Gold version 1. Product configuration " + dflt + " saved. No price has changed.", saved || headMsg() + " | " + barMsg());
    const sv = lastCall("band_sets_save", atSave), bsv = lastCall("bundle_save", atSave);
    check("the changed product is saved as a new product <configuration> <product type>, for the file's supplier", sv && sv.args.sets.length === 1 && sv.args.sets[0].name === dflt + " Gold" && sv.args.sets[0].isNew === true && sv.args.sets[0].product === "Gold" && sv.args.sets[0].supplierId === "alpha" && sv.args.sets[0].bands.every((b) => b.marginMilliPencePerKwh === 800), JSON.stringify(sv && sv.args.sets.map((x) => [x.name, x.isNew, x.supplierId])));
    check("the new configuration holds the new product and the unchanged one, for Alpha", bsv && !bsv.args.bundleId && bsv.args.name === dflt && bsv.args.supplierId === "alpha" && bsv.args.members.slice().sort().join() === [dflt + " Gold", "Standard"].sort().join(), JSON.stringify(bsv && bsv.args));
    check("Save never applies", !calls().slice(atSave).includes("apply"));
    const after = await until(() => { const c = lastCall("band_sets", atSave); return c && c.answer ? c.answer : null; });
    const orig = after && after.bundles.find((b) => b.name === "Alpha November");
    check("the original configuration is untouched", orig && orig.members.join() === "Standard,Gold" && after.bandSets.find((b) => b.name === "Gold").version === 3, JSON.stringify(orig));
    check("after Save the screen works from the new configuration", (await until(() => cfgLine() === "Current product configuration: " + dflt + " (saved just now, not live yet)." ? cfgLine() : null)) && gridHeads().slice().sort().join() === [dflt + " Gold", "Standard"].sort().join(), cfgLine() + " | " + gridHeads().join());
    check("after Save there is no change left", changeBox().hidden && button("Save").hidden);
    check("after Save the preview shows again", !!(await until(pivot)));
    // The dated name is taken now, so the next one is numbered.
    await setColumn("Standard", "margin", "0.7");
    check("a name already taken today gets (2)", nameBox().value === dflt + " (2)", nameBox().value);
    button("Discard changes").click();
    check("Discard changes takes the grid back and hides the name line", !!(await until(() => changeBox().hidden && !$$("#pr table.grid td.chg").length)));

    // ---- More options: use a different product configuration, products, acquisition and renewal apart
    more().open = true; await sleep(20);
    const list = $$("#pr details.prmore ul.cfglist li").map((li) => li.textContent);
    check("More options lists Alpha's and every supplier's configurations, not Beta's", list.some((t) => t.startsWith("Alpha November")) && list.some((t) => t.startsWith("Core range")) && !list.some((t) => t.startsWith("Advanced range")), list.join(" | "));
    button("Core range", more()).click();
    await until(() => cfgLine().startsWith("Showing product configuration: Core range"));
    check("Use a different product configuration loads it", cfgLine() === "Showing product configuration: Core range (chosen under More options, not live yet)." && gridHeads().join() === "Standard,Gold,Silver", cfgLine() + " | " + gridHeads().join());
    check("loading one is not a change", changeBox().hidden);
    check("More options stays open after loading", more().open);
    $("#prSep").click(); await sleep(50);
    const [acq0, ren0] = $$("#pr .chooser");
    check("apart: a list for each sale type", acq0 && ren0 && acq0.dataset.side === "acq" && ren0.dataset.side === "ren" && chosen(ren0).join() === "Standard,Gold,Silver", chosen(ren0).join());
    button("Remove", ren0.querySelector('li[data-name="Silver"]')).click(); await sleep(50);
    const [acq1, ren1] = $$("#pr .chooser");
    check("apart: a change for renewal changes renewal only", chosen(ren1).join() === "Standard,Gold" && chosen(acq1).join() === "Standard,Gold,Silver", chosen(acq1).join() + " | " + chosen(ren1).join());
    check("apart: the same products split by sale type is not a new configuration", changeBox().hidden);
    await until(pivot);
    const pv2 = await until(() => { const c = lastCall("preview_selection"); return c && c.args.items.some((i) => i.saleType === "acquisition") ? c : null; });
    check("apart: the preview asks for Silver for acquisition only", pv2 && pv2.args.items.map((i) => i.label + ":" + i.saleType).join() === "Standard:all,Gold:all,Silver:acquisition", JSON.stringify(pv2 && pv2.args.items.map((i) => [i.label, i.saleType])));
    await addSet("Gold renewal two", "", "Gold", "15", "renewal");
    const [acq2, ren2] = $$("#pr .chooser");
    check("apart: a new product can be for renewal only", chosen(ren2).includes("Gold renewal two") && !chosen(acq2).includes("Gold renewal two"), chosen(acq2).join() + " | " + chosen(ren2).join());
    check("adding a product is a change", !changeBox().hidden);
    const offered = [...productSelect(acq2).options].slice(1).map((o) => o.value);
    check("Add a product offers only Alpha's and every supplier's products", !offered.includes("Advanced Saver") && offered.includes("Gold renewal"), offered.join());
    button("Discard changes").click();
    await until(() => changeBox().hidden && !gridHeads().includes("Gold renewal two"));
    check("Discard changes goes back to the configuration loaded", gridHeads().join() === "Standard,Gold,Silver" && changeBox().hidden, gridHeads().join());

    // ---- Delta's file: live products that no product configuration holds, different per sale type
    await back();
    if (!(await openFile("Delta_electricity_example_17112026.xlsx"))) { check("the Delta file opens", false); return; }
    check("mismatch: the line says the live products load, none saved matches, and what the grid cannot show",
      cfgLine() === "Current: the live products (no saved product configuration matches). Live since 18/11/2026. Acquisition and renewal have different products live, so they are kept apart (More options). Also live but no longer a product, so not loaded: Old Saver. Standard is live at version 2; the grid shows version 3, saved since.", cfgLine());
    check("mismatch: the live products are in the grid, not the older unnamed run", gridHeads().join() === "Standard,Silver", gridHeads().join());
    check("per sale type: acquisition and renewal open kept apart", $("#prSep") && $("#prSep").checked && (() => { const [a, r] = $$("#pr .chooser"); return a && r && chosen(a).join() === "Standard,Silver" && chosen(r).join() === "Standard"; })(), $$("#pr .chooser").map((c) => chosen(c).join()).join(" | "));
    const dpv = await until(() => { const c = lastCall("preview_selection"); return c && c.args.items.some((i) => i.label === "Silver") ? c : null; });
    check("per sale type: the preview asks for Silver for acquisition only", dpv && dpv.args.items.map((i) => i.label + ":" + i.saleType).join() === "Standard:all,Silver:acquisition", JSON.stringify(dpv && dpv.args.items.map((i) => [i.label, i.saleType])));
    check("mismatch: opening is not a change", changeBox().hidden && button("Save").hidden);
    await setColumn("Silver", "margin", "0.7");
    check("mismatch: a change gives the dated name", !changeBox().hidden && nameBox().value === "Delta Example Energy electricity " + today && !changeBox().textContent.includes("is not changed."), nameBox().value + " | " + changeBox().textContent);
    button("Discard changes").click();
    check("mismatch: Discard changes goes back to the live products, still kept apart", !!(await until(() => changeBox().hidden && !$$("#pr table.grid td.chg").length && gridHeads().join() === "Standard,Silver" && $("#prSep").checked && cfgLine().startsWith("Current: the live products"))), cfgLine() + " | " + gridHeads().join());

    // ---- Beta's file: live, Apply with no change applies without saving
    await back();
    if (!(await openFile("Beta_electricity_example_10112026.xlsx"))) { check("the Beta file opens", false); return; }
    check("live: the configuration holding exactly the live products is named, with the date", cfgLine() === "Current product configuration: Advanced range (live since 11/11/2026).", cfgLine());
    check("live: its products are in the grid, for acquisition and renewal alike", gridHeads().join() === "Standard,Advanced Saver" && !$("#prSep").checked, gridHeads().join());
    await until(pivot);
    await until(() => !button("Apply").disabled);
    if ($("#prRead")) $("#prRead").click();
    const atApply = calls().length;
    button("Apply").click();
    const applied = await until(() => headMsg().startsWith("Applied") ? headMsg() : null);
    check("Apply with no change finishes", !!applied, headMsg() + " | " + barMsg());
    const made = calls().slice(atApply), ap = lastCall("apply", atApply);
    check("Apply with no change saves nothing", made.includes("apply") && !made.includes("band_sets_save") && !made.includes("bundle_save"), made.join());
    const ids = after && after.bandSets.filter((b) => b.name === "Standard" || b.name === "Advanced Saver").map((b) => b.priceConfigId).sort().join();
    check("Apply uses the configuration's saved products as they are", ap && ap.args.selections.map((x) => x.priceConfigId).sort().join() === ids && ap.args.selections.every((x) => x.saleType === "all"), JSON.stringify(ap && ap.args.selections));

    // ---- gas: no products at all, banded from nothing; Apply with a change saves a new configuration first
    await back();
    if (!(await openFile("Gamma_gas_example_06112026.xlsx"))) { check("the gas file opens", false, text().slice(0, 400)); return; }
    check("no products: the line says so", cfgLine() === "No gas products yet. Add one with New product in the grid.", cfgLine());
    check("no products: the grid shows the gas ladder's five bands", $$("#pr table.grid tbody tr").length === 5 && !$$("#pr table.grid th.colh").length);
    emptyLayout("gas", 5, true, "");
    const before = calls().length;
    button("New product", $("#pr table.grid")).click();
    check("the grid's New product opens the form under More options", !!(await until(() => newCard() && newCard().closest("details.prmore") && more().open)));
    button("Cancel", newCard()).click();
    await addSet("Gas One", "Standard", "", "8");
    check("blank stays blank: every cell is empty", gridHeads().join() === "Gas One" && $$('#pr table.grid td[data-name="Gas One"]').every((td) => td.textContent.startsWith("–")), gridHeads().join());
    await sleep(800);
    check("blank: the preview waits with a plain line naming it", previewMsg() && !previewMsg().hidden && previewMsg().textContent === "Fill every band of Gas One to see the preview.", previewMsg() && previewMsg().textContent);
    check("blank: no preview is asked for", !calls().slice(before).includes("preview_selection"), calls().slice(before).join());
    check("blank: Save and Apply are greyed out", button("Save").disabled && button("Apply").disabled);
    await addSet("Gas One", "Standard", "", "8");
    check("a name already in the grid is refused", text().includes("There is already a product called Gas One in the grid."));
    button("Cancel", newCard()).click();
    await setColumn("Gas One", "margin", "0.3");
    await setColumn("Gas One", "share", "0");
    check("every band filled: the preview shows", !!(await until(pivot)), previewMsg() && previewMsg().textContent);
    const gdflt = "Gamma Example Gas gas " + today;
    check("the new configuration's name is dated today", nameBox().value === gdflt && changeBox().textContent.includes("Gas One is saved under its own name."), nameBox().value + " | " + changeBox().textContent);
    set(inputFor("Reason for the change"), "First gas margins");
    const atGas = calls().length;
    button("Save").click();
    const gsaved = await until(() => headMsg().startsWith("Saved") ? headMsg() : null);
    check("gas: Save says what it saved", gsaved === "Saved Gas One version 1. Product configuration " + gdflt + " saved. No price has changed.", gsaved || barMsg());
    const gsv = lastCall("band_sets_save", atGas), gbs = lastCall("bundle_save", atGas);
    check("gas: the new product keeps its name; the configuration is for Gamma", gsv && gsv.args.sets.map((x) => x.name + ":" + x.isNew).join() === "Gas One:true" && gbs && gbs.args.name === gdflt && gbs.args.supplierId === "gamma" && gbs.args.members.join() === "Gas One", JSON.stringify([gsv && gsv.args.sets.map((x) => x.name), gbs && gbs.args]));
    check("gas: after Save the line names it", (await until(() => cfgLine() === "Current product configuration: " + gdflt + " (saved just now, not live yet)." ? 1 : null)) === 1, cfgLine());
    await until(pivot);
    const atEdit = calls().length;
    await setColumn("Gas One", "margin", "0.35");
    // The preview is made again after the change; Apply waits for it.
    await until(() => window.__stub.calls.slice(atEdit).some((c) => c.op === "preview_selection" && c.answer) && previewMsg().hidden);
    await until(() => !button("Apply").disabled);
    set(inputFor("Reason for the change"), "Gas a touch higher");
    if ($("#prRead")) $("#prRead").click();
    const atGasApply = calls().length;
    button("Apply").click();
    const gApplied = await until(() => headMsg().startsWith("Applied") ? headMsg() : null);
    check("Apply with a change finishes", !!gApplied, headMsg() + " | " + barMsg());
    const made2 = calls().slice(atGasApply), gsv2 = lastCall("band_sets_save", atGasApply), gbs2 = lastCall("bundle_save", atGasApply), gap = lastCall("apply", atGasApply);
    check("Apply with a change saves the new configuration, then applies", made2.indexOf("band_sets_save") >= 0 && made2.indexOf("bundle_save") > made2.indexOf("band_sets_save") && made2.indexOf("apply") > made2.indexOf("bundle_save"), made2.join());
    check("Apply with a change uses the new product", gsv2 && gsv2.args.sets[0].name === gdflt + " (2) Standard" && gbs2 && gbs2.args.name === gdflt + " (2)" && gap && gap.args.selections.length === 1 && gap.args.selections[0].priceConfigId === gsv2.answer.saved[0].priceConfigId, JSON.stringify([gsv2 && gsv2.args.sets.map((x) => x.name), gbs2 && gbs2.args.name, gap && gap.args.selections]));
  }

  async function view() {
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("view only: the Alpha file opens", false, text().slice(0, 400)); return; }
    check("view only: the current configuration shows", cfgLine() === "Current product configuration: Alpha November (not live yet)." && gridHeads().join() === "Standard,Gold", cfgLine());
    check("view only: the chart and the preview show", $$("#pr .chartcard .legend .key").length === 2 && !!(await until(pivot)));
    cleanMainView("view only: ");
    check("view only: no Save, Apply or name box", !button("Save") && !button("Apply") && !nameBox() && !button("Discard changes"));
    check("view only: no New product or product lists under More options", !button("New product") && !$("#prSep") && !$("#pr .chooserbox ul"));
    more().open = true;
    button("Core range", more()).click();
    check("view only: another configuration can still be looked at", !!(await until(() => cfgLine().startsWith("Showing product configuration: Core range") && gridHeads().join() === "Standard,Gold,Silver")));
    await back();
    if (!(await openFile("Gamma_gas_example_06112026.xlsx"))) { check("view only: the gas file opens", false); return; }
    check("view only: the grid shows the gas ladder's bands", $$("#pr table.grid tbody tr").length === 5);
    check("view only: the grid says who can add a product", text().includes("No gas products yet. Someone with the Set tick can add one."));
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
