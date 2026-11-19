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
  const newCard = () => $$("#pr .card.white").find((c) => { const h = c.querySelector("h2"); return h && h.textContent === "New band set"; }) || null;
  const dialogCard = (title) => $$("#pr .card.white").find((c) => { const h = c.querySelector("h2"); return h && h.textContent === title; }) || null;
  function done() { const p = document.createElement("pre"); p.id = "result"; p.textContent = JSON.stringify({ as, results }); document.body.append(p); }
  // The whole Margins mockup layout with no band sets, as on the Margins screen (Phil Brook, 20/11/2026).
  function emptyLayout(fuel, bands, canSet, tag) {
    const segs = $$("#pr .mk-ctl").map((c) => c.querySelector(".lab").textContent);
    check(tag + "empty: the Columns and Showing switches show, greyed out", segs.includes("Columns") && segs.includes("Showing") && button("By product configuration").disabled && button("Margin, p/kWh").disabled, segs.join());
    check(tag + "empty: the selection bar shows Selected: nothing, greyed out", $("#pr .gridbar") && !$("#pr .gridbar").hidden && $("#pr .gridbar .selt").textContent === "Selected: nothing" && button("Select all", $("#pr .gridbar")).disabled);
    const card = $("#pr .chartcard");
    check(tag + "empty: the chart card shows its title and axes over the bands", card && !card.hidden && card.querySelector(".ct-title").textContent === "Margin curve, " + fuel + ": p/kWh by band (kWh a year)" && $$("#pr svg.chart text.axt.ta-m").length === bands && $$("#pr svg.chart .gl").length === 5, card && card.textContent.slice(0, 200));
    check(tag + "empty: the chart says to add a band set", card && !!card.querySelector(".legend") && card.querySelector(".legend").textContent === (canSet ? "No band sets to plot yet. Add one with New band set." : "No band sets to plot yet. Someone with the Set tick can add one."), card && card.textContent);
    check(tag + "empty: the grid keeps its corner cells and a row per band", $("#pr table.grid .corner3") && $("#pr table.grid .corner3").textContent === "On chart (up to 4)" && $("#pr table.grid .corner2").textContent === "Band, kWh a year" && $$("#pr table.grid tbody tr").length === bands);
    check(tag + "empty: New band set is in the grid only with the Set tick", canSet ? !!button("New band set", $("#pr table.grid")) : !$$("#pr table.grid button").some((b) => b.textContent === "New band set"));
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
    button("New band set").click();
    const card = await until(newCard);
    if (!card) return null;
    set(inputFor("Name", card), name);
    if (from) set(inputFor("Start from", card), from);
    if (product) set(inputFor("Product", card), product);
    set(inputFor("Cost per meter, £ a year", card), cost);
    if (useFor) set(inputFor("Use for", card), useFor);
    button("Add to the grid", card).click();
    await sleep(50);
    return card;
  }
  const newMsg = () => { const b = button("New band set"); return b ? b.parentElement.nextElementSibling : null; };
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
    check("no band sets: the grid shows the gas ladder's five bands as rows", rows.length === 5 && $$("#pr table.grid th.colh").length === 0, rows.length);
    check("no band sets: the grid says to add one", text().includes("No gas band sets yet. Add one with New band set above."), text().slice(0, 600));
    check("no band sets: the choice says where to add one", text().includes("No gas band sets yet. Add one with New band set under Margins below."));
    check("New band set and Save are offered", !!button("New band set") && !!button("Save"));
    check("the margins hint names both routes", text().includes("Change margins here. Save keeps them without changing any price; Apply saves them and puts the prices live."));
    emptyLayout("gas", 5, true, "");

    const before = calls().length;
    await addSet("Gas One", "Standard", "", "8");
    const heads = $$("#pr table.grid th.colh button").map((b) => b.textContent);
    check("the blank band set is in the grid", heads.join() === "Gas One", heads.join());
    check("blank stays blank: every cell is empty", $$('#pr table.grid td[data-name="Gas One"]').every((td) => td.textContent.startsWith("–")), $$("#pr table.grid td").map((t) => t.textContent).join("|"));
    const tick = $$("#pr .chooser label.tickrow").find((l) => l.textContent.includes("Gas One"));
    check("the new band set is ticked", tick && tick.querySelector("input").checked);
    await sleep(800);
    check("blank: the preview waits with a plain line naming it", previewMsg() && !previewMsg().hidden && previewMsg().textContent === "Fill every band of Gas One to see the preview." && !previewMsg().classList.contains("refused"), previewMsg() && previewMsg().textContent);
    check("blank: no preview is asked for", !calls().slice(before).includes("preview_selection"), calls().slice(before).join());
    check("blank: Save and Apply are greyed out", button("Save").disabled && button("Apply").disabled);

    await addSet("Gas One", "Standard", "", "8");
    check("a name already in the grid is refused", newMsg() && newMsg().textContent === "There is already a band set called Gas One in the grid.", newMsg() && newMsg().textContent);
    button("Cancel", newCard()).click();

    await setColumn("Gas One", "margin", "0.3");
    await sleep(800);
    check("margins filled: the preview waits for the shares", previewMsg().textContent === "Fill the standing charge share of every band of Gas One to see the preview.", previewMsg().textContent);
    check("still no preview asked for", !calls().slice(before).includes("preview_selection"));
    await setColumn("Gas One", "share", "0");
    check("every band filled: the preview shows", !!(await until(pivot)), previewMsg() && previewMsg().textContent);
    check("the preview item is the unsaved band set", (() => { const c = window.__stub.calls.filter((x) => x.op === "preview_selection").pop(); return c && c.args.items.length === 1 && c.args.items[0].label === "Gas One" && c.args.items[0].bands.every((b) => b.marginMilliPencePerKwh === 300 && b.standingSharePct === 0); })());
    check("filled: Save is offered", !button("Save").disabled, button("Save").parentElement.parentElement.textContent);

    const atSave = calls().length;
    button("Save").click();
    const dlg = await until(() => dialogCard("Save"));
    check("Save asks for the reason and lists the new band set", dlg && dlg.textContent.includes("New band set, saved under its name: Gas One.") && !!inputFor("Reason for the change", dlg), dlg && dlg.textContent);
    set(inputFor("Reason for the change", dlg), "First gas margins");
    $("#prBundle").click();
    set(inputFor("Product configuration name", dlg), "Gas range");
    button("Save band sets", dlg).click();
    const saidMsg = await until(() => { const m = $("#pr > .msg"); return m && !m.hidden && m.textContent.startsWith("Saved") ? m.textContent : null; });
    check("Save says what it saved, in words", saidMsg === "Saved Gas One version 1. Product configuration Gas range saved. No price has changed.", saidMsg || $("#pr > .msg").textContent);
    const made = calls().slice(atSave);
    check("Save calls band_sets_save then bundle_save, and never apply", made.includes("band_sets_save") && made.includes("bundle_save") && made.indexOf("band_sets_save") < made.indexOf("bundle_save") && !made.includes("apply"), made.join());
    const sv = window.__stub.calls.filter((c) => c.op === "band_sets_save").pop();
    check("the new band set is saved as new under its name", sv && sv.args.sets.length === 1 && sv.args.sets[0].isNew === true && sv.args.sets[0].name === "Gas One" && sv.args.reason === "First gas margins");
    const tick2 = await until(() => $$("#pr .chooser label.tickrow").find((l) => l.textContent.includes("Gas One")));
    check("after Save the band set is still ticked", tick2 && tick2.querySelector("input").checked);
    check("after Save the preview shows again", !!(await until(pivot)));
    check("after Save the band set is saved, not changed", !text().includes("Changed, not saved yet"), text().slice(0, 300));
    check("after Save the product configuration can be chosen", $$("#pr .chooser select option").some((o) => o.textContent === "Gas range"));

    // ---- electricity: names already used, and a new band set for one sale type
    button("Back to files").click();
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("the electricity file opens", false); return; }
    await addSet("Core range", "", "", "15");
    check("a product configuration's name is refused", newMsg().textContent === "There is already a band set or product configuration with that name.", newMsg().textContent);
    button("Cancel", newCard()).click();
    await addSet("Gold", "", "", "15");
    check("a saved band set's name is refused", newMsg().textContent === "There is already a band set called Gold in the grid.", newMsg().textContent);
    button("Cancel", newCard()).click();
    $("#prSame").click(); await sleep(50);
    await addSet("Gold renewal two", "", "Gold", "15", "renewal");
    const [acqBox, renBox] = $$("#pr .chooser");
    const ticked = (box, nm) => { const l = $$("label.tickrow", box).find((x) => x.textContent.includes(nm)); return !!(l && l.querySelector("input").checked); };
    check("kept apart: the new band set is ticked for renewal only", acqBox && renBox && ticked(renBox, "Gold renewal two") && !ticked(acqBox, "Gold renewal two"));

    // ---- Apply with a new unsaved band set: saved first, then applied
    button("Back to files").click();
    if (!(await openFile("Alpha_electricity_example_12112026.xlsx"))) { check("the electricity file opens again", false); return; }
    await addSet("Standard two", "", "Standard", "15");
    check("a copy starts full and previews", !!(await until(pivot)));
    const atApply = calls().length;
    button("Apply").click();
    const adlg = await until(() => dialogCard("Apply"));
    check("Apply lists the new band set", adlg && adlg.textContent.includes("New band set, saved under its name: Standard two."), adlg && adlg.textContent);
    set(inputFor("Reason for the change", adlg), "New standard set");
    if ($("#prRead")) $("#prRead").click();
    button("Apply prices", adlg).click();
    const applied = await until(() => { const m = $("#pr > .msg"); return m && m.textContent.startsWith("Applied") ? m.textContent : null; });
    check("Apply finishes", !!applied, $("#pr > .msg").textContent + " | " + adlg.textContent);
    const made2 = calls().slice(atApply), saved = window.__stub.calls.filter((c) => c.op === "band_sets_save").pop(), ap = window.__stub.calls.filter((c) => c.op === "apply").pop();
    check("Apply saves the new band set, then applies", made2.indexOf("band_sets_save") >= 0 && made2.indexOf("band_sets_save") < made2.indexOf("apply"), made2.join());
    check("Apply uses the saved band set", saved && ap && saved.args.sets[0].name === "Standard two" && saved.args.sets[0].isNew === true && ap.args.selections.length === 1 && ap.args.selections[0].priceConfigId === saved.answer.saved[0].priceConfigId, JSON.stringify(ap && ap.args));
  }

  async function view() {
    if (!(await openFile("Gamma_gas_example_06112026.xlsx"))) { check("the gas file opens", false, text().slice(0, 400)); return; }
    check("view only: the grid shows the gas ladder's bands", $$("#pr table.grid tbody tr").length === 5);
    check("view only: the grid says who can add a band set", text().includes("No gas band sets yet. Someone with the Set tick can add one."));
    check("view only: no New band set and no Save", !button("New band set") && !button("Save") && !button("Save band sets"));
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
