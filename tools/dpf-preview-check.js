// A check of the DPF figures tab in the preview hub (preview/hub.html, with tools/preview-stub.js).
// tests/test_build.py builds the preview, puts this file at the end of the page, opens it in a
// headless browser signed in through the stub (?as= in the address), starting in DPF figures >
// Months, and reads the answer this writes into a pre element with the id "result". It is not part
// of any page the hub serves.
//
// ?as=dpfsign (Carl Example, all three ticks): the grid (items down, actuals then plan, twelve
// months across, values in their units, who entered each on hover, each month's status); typing
// into the grid (a box per figure, the unsaved count, Esc and Enter, year and sign-off held while a
// change waits) and Save changes (one dpf_save a month, only the changed values, source form); a
// bad value stopped in the page; sign off with the fingerprint from dpf_state; a change to the
// signed-off month clearing the sign-off; a sign-off refused when someone else changed a figure
// meanwhile; Undo sign-off needing a reason; the Dyce template (laid out as the grid) downloaded
// from the Months bar, filled in and chosen again (its figures come into the grid as unsaved
// changes, nothing sent; Save changes sends them with source template and the file name, and a
// figure typed over one of them with source form); a bad file and a file for another year listing
// their problem and loading nothing; History.
// ?as=dpfenter (View and Enter): typing and the template, no sign-off controls. ?as=dpfview (View
// only): no boxes, template or sign-off controls. ?as=viewer (no DPF tick): no tab, no dpf_ call.
// ?as=admin: every tick, so every control.
(() => {
  const q = new URLSearchParams(location.search);
  const as = q.get("as") || "admin";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? "" : String(detail ?? "") });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(f, tries) {
    for (let i = 0; i < (tries || 100); i++) { let v = null; try { v = f(); } catch { v = null; } if (v) return v; await sleep(50); }
    return null;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const button = (text, r) => $$("button", r).find((b) => b.textContent.trim() === text);
  const text = (s) => ($(s) ? $(s).textContent : "");
  const calls = (action) => window.__stub.calls.filter((c) => c.action === action);
  const last = (action) => { const c = calls(action); return c.length ? c[c.length - 1] : null; };
  const M = (i) => window.__stub.dpfMonth(i);
  const cell = (code, m) => $(`#dpf tr[data-code="${code}"] td[data-month="${m}"]`);
  const status = (m) => text(`#dpf tr.dpf-status td[data-month="${m}"]`);
  const act = (m) => $(`#dpf tr.dpf-acts td[data-month="${m}"] button`);
  const box = (code, m) => $(`#dpf tr[data-code="${code}"] td[data-month="${m}"] input.dpf-in`);
  // What a cell shows: its box's value when the person can type, its text when they cannot.
  const shows = (code, m) => { const b = box(code, m); return b ? b.value : (cell(code, m) ? cell(code, m).textContent : ""); };
  const pendingText = () => text("#dpfPending");
  const key = (input, k, shift) => input.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: !!shift, bubbles: true }));
  const msg = () => text("#dpf > .msg");
  const menu = () => $$("#sidemenu button[data-item]").map((b) => b.textContent).join(",");
  const type = (input, v) => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); };
  const setFile = (input, bytes, name) => {
    const dt = new DataTransfer(); dt.items.add(new File([bytes], name)); input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const serial = (iso) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, 1) - Date.UTC(1899, 11, 30)) / 86400000;
  const ddmmyyyy = /^\d{2}\/\d{2}\/\d{4}$/;
  function done() { const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify({ as, results }); document.body.append(pre); }

  async function grid() {
    if (!(await until(() => $("#dpf table.dpf-grid tbody tr[data-code]")))) { check("the grid is drawn", false, text("#main").slice(0, 300)); return false; }
    const rows = $$("#dpf table.dpf-grid tbody tr[data-code]").map((r) => r.dataset.code);
    check("13 items, actuals then plan", rows.length === 13 && rows[0] === "cost_of_sales_gbp" && rows[6] === "plan_gm_gbp", rows.join(","));
    check("group rows Actuals and Plan", $$("#dpf tr.dpf-group th").map((t) => t.textContent).join(",") === "Actuals,Plan");
    const heads = $$("#dpf table.dpf-grid thead th").map((t) => t.textContent);
    check("twelve months, June first", heads.length === 13 && /^Jun \d{4}$/.test(heads[1]) && /^May \d{4}$/.test(heads[12]), heads.join(","));
    check("the year line", /^June \d{4} to May \d{4}$/.test(text("#dpfYear")), text("#dpfYear"));
    const typing = !!box("opex_gbp", M(0));
    check("GBP with pence", shows("opex_gbp", M(0)) === "£118,250.50", shows("opex_gbp", M(0)));
    check("GBP whole pounds", shows("cost_of_sales_gbp", M(0)) === "£412,000", shows("cost_of_sales_gbp", M(0)));
    check("MWh (the unit in the row when typing)", shows("plan_volume_mwh", M(0)) === (typing ? "158,400.25" : "158,400.25 MWh"), shows("plan_volume_mwh", M(0)));
    check("score to 1 place, count, percentage", shows("trustpilot_score", M(0)) === "4.6" && shows("trustpilot_new_reviews", M(0)) === "18" && shows("plan_bad_debt_pct", M(0)) === "0.5%",
      [shows("trustpilot_score", M(0)), shows("trustpilot_new_reviews", M(0)), shows("plan_bad_debt_pct", M(0))].join(" "));
    check("a missing figure shows a dash", cell("trustpilot_score", M(2)).classList.contains("gap") && (typing ? box("trustpilot_score", M(2)).value === "" && box("trustpilot_score", M(2)).placeholder === "–" : cell("trustpilot_score", M(2)).textContent === "–"));
    const title = cell("opex_gbp", M(0)).getAttribute("title") || "";
    check("who entered it on hover", /^Entered by eli\.example@dyce-energy\.co\.uk, \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}, Dyce template$/.test(title), title);
    check("June signed off, with who and when", /^Signed offby carl\.example@dyce-energy\.co\.uk on \d{2}\/\d{2}\/\d{4}$/.test(status(M(0))), status(M(0)));
    check("July ready to sign", status(M(1)) === "Ready to sign", status(M(1)));
    check("August 3 missing, September 13", status(M(2)) === "3 missing" && status(M(3)) === "13 missing", status(M(2)) + " | " + status(M(3)));
    return true;
  }

  async function signer() {
    if (!(await grid())) return;
    check("menu Months and History", menu() === "Months,History", menu());
    check("Sign off on the ready month only", act(M(1)) && act(M(1)).textContent === "Sign off" && !act(M(2)) && !act(M(3)));
    check("Undo sign-off on the signed month", act(M(0)) && act(M(0)).textContent === "Undo sign-off");

    // Type into July and save one change.
    check("a box for every figure", $$("#dpf input.dpf-in").length === 13 * 12 && pendingText() === "No unsaved changes." && button("Save changes", $("#dpf")).disabled, $$("#dpf input.dpf-in").length + " | " + pendingText());
    const opex = box("opex_gbp", M(1));
    check("the box holds the value held", opex.value === "£119,900", opex.value);
    type(opex, "121,000");
    check("the change is counted and marked", pendingText() === "1 unsaved change." && cell("opex_gbp", M(1)).classList.contains("chg") && !button("Save changes", $("#dpf")).disabled, pendingText());
    check("year and sign-off wait while a change is unsaved", $('#dpf [data-dpf="next"]').disabled && act(M(1)).disabled && act(M(0)).disabled);
    button("Save changes", $("#dpf")).click();
    await until(() => /^Saved /.test(msg()));
    const save = last("dpf_save");
    check("Save changes sends only the changed value, source form", save && save.args.month === M(1) && JSON.stringify(save.args.values) === '{"opex_gbp":121000}' && save.args.source === "form" && save.status === 200, JSON.stringify(save && save.args));
    check("the new value shows and nothing waits", box("opex_gbp", M(1)).value === "£121,000" && pendingText() === "No unsaved changes." && !cell("opex_gbp", M(1)).classList.contains("chg"), msg() + " | " + pendingText());

    // Enter moves down the month; Esc puts a figure back.
    const os = box("overheads_gbp", M(1));
    os.focus(); key(os, "Enter");
    check("Enter moves to the next figure of the month", document.activeElement === box("opex_gbp", M(1)), document.activeElement && document.activeElement.dataset.code);
    key(box("opex_gbp", M(1)), "Enter", true);
    check("Shift+Enter moves back up", document.activeElement === os, document.activeElement && document.activeElement.dataset.code);
    const was = os.value;
    type(os, "1"); key(os, "Escape");
    check("Esc puts the figure back", os.value === was && pendingText() === "No unsaved changes.", os.value + " | " + pendingText());

    // A value outside its check is marked and stopped in the page; nothing is sent.
    const before = calls("dpf_save").length;
    const scoreWas = box("trustpilot_score", M(1)).value;
    type(box("trustpilot_score", M(1)), "7");
    check("a bad value is marked", cell("trustpilot_score", M(1)).classList.contains("bad") && box("trustpilot_score", M(1)).getAttribute("aria-invalid") === "true");
    button("Save changes", $("#dpf")).click();
    await sleep(200);
    check("a bad value is listed with its month and not sent", /^Jul \d{4}, Trustpilot score at month end: must be from 0 to 5\.$/.test(msg()) && calls("dpf_save").length === before, msg());
    button("Discard", $("#dpf .dpf-savebar")).click();
    await sleep(50);
    check("Discard puts every box back", scoreWas !== "" && box("trustpilot_score", M(1)).value === scoreWas, scoreWas + " | " + box("trustpilot_score", M(1)).value);
    check("Discard leaves nothing waiting", pendingText() === "No unsaved changes." && !$("#dpf td.bad"), pendingText());

    // Two months in one Save: one dpf_save each, in month order.
    const b2 = calls("dpf_save").length;
    type(box("trustpilot_score", M(3)), "4.1");
    type(box("trustpilot_score", M(2)), "4.2");
    check("two changes waiting", pendingText() === "2 unsaved changes.", pendingText());
    button("Save changes", $("#dpf")).click();
    await until(() => calls("dpf_save").length === b2 + 2 && /^Saved 2 figures/.test(msg()));
    const two = calls("dpf_save").slice(b2);
    check("one dpf_save a month, in month order", two.length === 2 && two[0].args.month === M(2) && two[1].args.month === M(3) && JSON.stringify(two[0].args.values) === '{"trustpilot_score":4.2}', JSON.stringify(two.map((c) => c.args)));
    check("the message names both months", /^Saved 2 figures: Aug \d{4}, Sep \d{4}\.$/.test(msg()), msg());

    // Sign off July with the fingerprint from the state.
    const fp = last("dpf_save").answer.result.months[1].fingerprint;
    act(M(1)).click();
    await until(() => /^Signed off/.test(status(M(1))));
    const so = last("dpf_sign_off");
    check("Sign off sends the month's fingerprint", so && so.args.month === M(1) && so.args.fingerprint === fp && so.status === 200, JSON.stringify(so && so.args));
    check("July now signed off by Carl", /carl\.example/.test(status(M(1))), status(M(1)));

    // Changing a figure in a signed-off month clears its sign-off.
    type(box("overheads_gbp", M(1)), "97200");
    button("Save changes", $("#dpf")).click();
    await until(() => status(M(1)) === "Ready to sign");
    check("a change clears the sign-off", status(M(1)) === "Ready to sign" && /cleared its sign-off/.test(msg()), status(M(1)) + " | " + msg());

    // Someone else changes a figure: the fingerprint the page holds is stale, so Sign off is refused.
    window.__stub.dpfChange(M(1), "overheads_gbp", 97300);
    act(M(1)).click();
    await until(() => /have changed since you opened them/.test(msg()));
    check("a stale fingerprint is refused with the database's sentence", /have changed since you opened them/.test(msg()) && last("dpf_sign_off").status === 400, msg());
    await until(() => shows("overheads_gbp", M(1)) === "£97,300");
    check("the year is read again after the refusal", shows("overheads_gbp", M(1)) === "£97,300", shows("overheads_gbp", M(1)));
    act(M(1)).click();
    await until(() => /^Signed off/.test(status(M(1))));
    check("signing off again with the fresh fingerprint works", /^Signed off/.test(status(M(1))), status(M(1)));

    // Undo sign-off needs a reason.
    act(M(0)).click();
    const reason = await until(() => $("#dpfReason"));
    const unsBefore = calls("dpf_unsign").length;
    button("Undo sign-off", $("#dpf .dpf-ask")).click();
    await sleep(100);
    check("a blank reason is stopped in the page", /Give a reason/.test(text("#dpf .dpf-ask .msg")) && calls("dpf_unsign").length === unsBefore, text("#dpf .dpf-ask"));
    reason.value = "Invented reason for the preview.";
    button("Undo sign-off", $("#dpf .dpf-ask")).click();
    await until(() => status(M(0)) === "Ready to sign");
    check("Undo sign-off sends the reason", last("dpf_unsign") && last("dpf_unsign").args.reason === "Invented reason for the preview." && status(M(0)) === "Ready to sign", JSON.stringify(last("dpf_unsign")));

    await template();
    await history();
  }

  async function template() {
    const tIn = $("#dpfTemplate");
    check("the template sits beside Save changes", tIn && button("Download template", $("#dpf .dpf-savebar")) && button("Choose file", $("#dpf .dpf-savebar")), text("#dpf .dpf-savebar"));
    if (!tIn) return;
    // Download template: the page builds the workbook; the Blob is caught as it is handed over, and
    // the link's click is caught too (a real download holds a headless browser open).
    let blob = null, saved = null;
    const make = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { blob = b; return make.call(URL, b); };
    HTMLAnchorElement.prototype.click = function () { saved = this.getAttribute("download"); };
    button("Download template", $("#dpf")).click();
    await until(() => blob && saved);
    URL.createObjectURL = make; HTMLAnchorElement.prototype.click = click;
    check("Download template makes an .xlsx named for the year", blob && blob.size > 1000 && /^dpf-figures-\d{4}-\d{2}\.xlsx$/.test(saved || ""), (blob && blob.size) + " " + saved);
    if (!blob) return;
    const X = PR_XLSX;
    const wb = X.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    const ws = wb.Sheets["DPF figures"];
    const aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const mm = (iso) => iso.slice(5, 7) + "/" + iso.slice(0, 4);
    const rowOf = (code) => aoa.findIndex((r) => r[0] === code), colOf = (iso) => aoa[0].indexOf(mm(iso));
    const months12 = Array.from({ length: 12 }, (_, i) => mm(M(i)));
    check("the template: one sheet laid out as the grid", wb.SheetNames.join() === "DPF figures" && aoa[0].join() === ["Item code", "Item", "Unit", ...months12].join() && aoa.length === 1 + 2 + 13
      && aoa[1][1] === "Actuals" && aoa[2][0] === "cost_of_sales_gbp" && aoa.some((r) => r[1] === "Plan"), aoa[0] && aoa[0].join());
    check("the template holds the values held", aoa[rowOf("opex_gbp")][colOf(M(0))] === 118250.5 && aoa[rowOf("trustpilot_score")][colOf(M(4))] == null, JSON.stringify(aoa[rowOf("opex_gbp")]));

    // Fill in two October figures and choose the file: they come into the grid, nothing is sent.
    aoa[rowOf("opex_gbp")][colOf(M(4))] = 130000;
    aoa[rowOf("trustpilot_score")][colOf(M(4))] = 4.4;
    const back = X.utils.book_new(); X.utils.book_append_sheet(back, X.utils.aoa_to_sheet(aoa), "DPF figures");
    const s0 = calls("dpf_save").length;
    setFile(tIn, new Uint8Array(X.write(back, { type: "array", bookType: "xlsx" })), "dpf-template.xlsx");
    await until(() => /^Loaded /.test(msg()));
    check("the message says what came in", /^Loaded \d+ figures from dpf-template\.xlsx, 2 different from what is held\. Check them in the table, then press Save changes\.$/.test(msg()), msg());
    check("the file's figures are in the grid, marked", box("opex_gbp", M(4)).value === "£130,000" && cell("opex_gbp", M(4)).classList.contains("chg") && box("trustpilot_score", M(4)).value === "4.4", box("opex_gbp", M(4)).value + " | " + box("trustpilot_score", M(4)).value);
    check("figures the same as held are not changes", pendingText() === "2 unsaved changes." && !cell("opex_gbp", M(0)).classList.contains("chg"), pendingText());
    check("nothing is saved before Save changes", calls("dpf_save").length === s0, calls("dpf_save").length);

    // Type over one of them, then save: the file's figure goes as template, the typed one as form.
    type(box("trustpilot_score", M(4)), "4.5");
    button("Save changes", $("#dpf")).click();
    await until(() => calls("dpf_save").length === s0 + 2 && /^Saved /.test(msg()));
    const two = calls("dpf_save").slice(s0);
    check("Save sends the file's figure with source template and the file name", two[0] && two[0].args.month === M(4) && two[0].args.source === "template" && two[0].args.source_file === "dpf-template.xlsx" && JSON.stringify(two[0].args.values) === '{"opex_gbp":130000}', JSON.stringify(two[0] && two[0].args));
    check("and the figure typed over it with source form", two[1] && two[1].args.source === "form" && !two[1].args.source_file && JSON.stringify(two[1].args.values) === '{"trustpilot_score":4.5}', JSON.stringify(two[1] && two[1].args));
    check("nothing waits after the save", pendingText() === "No unsaved changes." && box("opex_gbp", M(4)).value === "£130,000", pendingText());

    // A bad file: its problem is said, nothing comes in.
    setFile($("#dpfTemplate"), new TextEncoder().encode("Item code,Item," + mm(M(3)) + "\ntrustpilot_score,,9\nopex_gbp,,5\n"), "bad.csv");
    await until(() => /^bad\.csv/.test(msg()));
    check("a bad file is listed and nothing is loaded", /^bad\.csv: 1 problem, so nothing was loaded\. Cell C2: \d{2}\/\d{4}, Trustpilot score at month end: must be from 0 to 5\.$/.test(msg()) && pendingText() === "No unsaved changes.", msg());
    // A file for another year: refused, nothing comes in.
    const later = mm(M(0)).slice(0, 3) + (+M(0).slice(0, 4) + 1);
    setFile($("#dpfTemplate"), new TextEncoder().encode("Item code,Item," + later + "\nopex_gbp,,5\n"), "next.csv");
    await until(() => /^next\.csv/.test(msg()));
    check("a file for another year is refused", /outside June \d{4} to May \d{4} shown here/.test(msg()) && pendingText() === "No unsaved changes.", msg());
  }

  async function history() {
    window.showTool("dpf", "history");
    const sel = await until(() => $("#dpfHistMonth"));
    sel.value = M(1); sel.dispatchEvent(new Event("change", { bubbles: true }));
    await until(() => last("dpf_history") && last("dpf_history").args.month === M(1) && $("#dpf .list .row"));
    const rows = $$("#dpf .list .row .t").map((t) => t.textContent);
    check("History lists the month's changes, newest first", rows[0] === "OPEX: £119,900 to £121,000" || rows.includes("OPEX: £119,900 to £121,000"), rows.slice(0, 6).join(" | "));
    check("History shows a cleared sign-off", rows.includes("Sign-off cleared"), rows.join(" | "));
  }

  async function enterOnly() {
    if (!(await grid())) return;
    check("menu Months and History", menu() === "Months,History", menu());
    check("every figure is a box, with the template", $$("#dpf input.dpf-in").length === 13 * 12 && !!$("#dpf .dpf-savebar") && !!button("Download template") && !!button("Choose file"));
    check("no sign-off controls without the tick", !$("#dpf tr.dpf-acts") && !button("Sign off") && !button("Undo sign-off"));
    type(box("trustpilot_score", M(2)), "4.3");
    button("Save changes", $("#dpf")).click();
    await until(() => /^Saved /.test(msg()));
    check("an enterer saves a figure", last("dpf_save") && last("dpf_save").status === 200 && box("trustpilot_score", M(2)).value === "4.3", msg());
    check("still no sign-off controls", !$("#dpf tr.dpf-acts"));
  }

  async function viewOnly() {
    if (!(await grid())) return;
    check("menu Months and History", menu() === "Months,History", menu());
    check("no boxes, no save bar and no template", !$("#dpf input") && !$("#dpf .dpf-savebar") && !button("Download template") && !button("Choose file"));
    check("no sign-off controls", !$("#dpf tr.dpf-acts") && !button("Sign off"));
    check("nothing was written", !calls("dpf_save").length && !calls("dpf_upload").length);
  }

  async function noTick() {
    await until(() => $("#tabs button"));
    await sleep(500);
    check("no DPF figures tab without View", !$('#tabs button[data-tool="dpf"]'), text("#tabs"));
    check("no dpf_ action is asked", !window.__stub.calls.some((c) => /^dpf_/.test(c.action || "")));
  }

  async function admin() {
    if (!(await grid())) return;
    check("admin: menu and every control", menu() === "Months,History" && $$("#dpf input.dpf-in").length === 13 * 12 && !!$("#dpf tr.dpf-acts"), menu());
    // Sign-out drops the tab's figures from the page.
    $("#signOutBtn").click();
    await sleep(100);
    check("sign-out empties the tab", !$("#dpf") && !$("#tabs button[data-tool]"));
  }

  (async () => {
    try {
      if (as === "dpfsign") await signer();
      else if (as === "dpfenter") await enterOnly();
      else if (as === "dpfview") await viewOnly();
      else if (as === "viewer") await noTick();
      else await admin();
    } catch (e) { check("the check ran", false, String(e && e.stack || e)); }
    done();
  })();
})();
