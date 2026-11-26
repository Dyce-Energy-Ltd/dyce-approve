// A check of the DPF figures tab in the preview hub (preview/hub.html, with tools/preview-stub.js).
// tests/test_build.py builds the preview, puts this file at the end of the page, opens it in a
// headless browser signed in through the stub (?as= in the address), starting in DPF figures >
// Months, and reads the answer this writes into a pre element with the id "result". It is not part
// of any page the hub serves.
//
// ?as=dpfsign (Carl Example, all three ticks): the grid (items down, actuals then plan, twelve
// months across, values in their units, who entered each on hover, each month's status); edit and
// save a month (only the changed value, source form); a bad value stopped in the page; sign off
// with the fingerprint from dpf_state; a change to the signed-off month clearing the sign-off; a
// sign-off refused when someone else changed a figure meanwhile; Undo sign-off needing a reason;
// the Dyce template downloaded, changed and uploaded again (preview, unchanged rows greyed, Save
// sends dpf_upload with source template and the file name); a bad CSV listing its problem and
// blocking Save; Carl's plan workbook and the DPF workbook read into the preview; History.
// ?as=dpfenter (View and Enter): editing and Upload, no sign-off controls. ?as=dpfview (View
// only): no edit, upload or sign-off controls. ?as=viewer (no DPF tick): no tab, no dpf_ call.
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
  const mbtn = (m) => $(`#dpf .dpf-mbtn[data-month="${m}"]`);
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
    check("GBP with pence", cell("opex_gbp", M(0)).textContent === "£118,250.50", cell("opex_gbp", M(0)).textContent);
    check("GBP whole pounds", cell("cost_of_sales_gbp", M(0)).textContent === "£412,000", cell("cost_of_sales_gbp", M(0)).textContent);
    check("MWh", cell("plan_volume_mwh", M(0)).textContent === "158,400.25 MWh", cell("plan_volume_mwh", M(0)).textContent);
    check("score to 1 place, count, percentage", cell("trustpilot_score", M(0)).textContent === "4.6" && cell("trustpilot_new_reviews", M(0)).textContent === "18" && cell("plan_bad_debt_pct", M(0)).textContent === "0.5%");
    check("a missing figure shows a dash", cell("trustpilot_score", M(2)).textContent === "–" && cell("trustpilot_score", M(2)).classList.contains("gap"));
    const title = cell("opex_gbp", M(0)).getAttribute("title") || "";
    check("who entered it on hover", /^Entered by eli\.example@dyce-energy\.co\.uk, \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}, Dyce template$/.test(title), title);
    check("June signed off, with who and when", /^Signed offby carl\.example@dyce-energy\.co\.uk on \d{2}\/\d{2}\/\d{4}$/.test(status(M(0))), status(M(0)));
    check("July ready to sign", status(M(1)) === "Ready to sign", status(M(1)));
    check("August 3 missing, September 13", status(M(2)) === "3 missing" && status(M(3)) === "13 missing", status(M(2)) + " | " + status(M(3)));
    return true;
  }

  async function signer() {
    if (!(await grid())) return;
    check("menu Months, Upload, History", menu() === "Months,Upload,History", menu());
    check("Sign off on the ready month only", act(M(1)) && act(M(1)).textContent === "Sign off" && !act(M(2)) && !act(M(3)));
    check("Undo sign-off on the signed month", act(M(0)) && act(M(0)).textContent === "Undo sign-off");

    // Edit July and save one change.
    mbtn(M(1)).click();
    const opex = await until(() => $("#dpfIn-opex_gbp"));
    check("one box per item, filled with the value held", opex && opex.value === "119900" && $$("#dpf .dpf-edit input").length === 13, opex && opex.value);
    type(opex, "121,000");
    button("Save month", $("#dpf")).click();
    await until(() => /^Saved /.test(msg()));
    const save = last("dpf_save");
    check("Save month sends only the changed value, source form", save && save.args.month === M(1) && JSON.stringify(save.args.values) === '{"opex_gbp":121000}' && save.args.source === "form" && save.status === 200, JSON.stringify(save && save.args));
    check("the new value shows and the edit box closes", cell("opex_gbp", M(1)).textContent === "£121,000" && !$("#dpf .dpf-edit"), msg());

    // A value outside its check is stopped in the page; nothing is sent.
    const before = calls("dpf_save").length;
    mbtn(M(1)).click();
    type(await until(() => $("#dpfIn-trustpilot_score")), "7");
    button("Save month", $("#dpf")).click();
    await sleep(200);
    check("a bad value is listed and not sent", /must be from 0 to 5/.test(text("#dpf .dpf-edit .msg")) && calls("dpf_save").length === before, text("#dpf .dpf-edit .msg"));
    button("Discard", $("#dpf")).click();
    await sleep(50);
    check("Discard closes the box", !$("#dpf .dpf-edit"));

    // Sign off July with the fingerprint from the state.
    const fp = last("dpf_save").answer.result.months[1].fingerprint;
    act(M(1)).click();
    await until(() => /^Signed off/.test(status(M(1))));
    const so = last("dpf_sign_off");
    check("Sign off sends the month's fingerprint", so && so.args.month === M(1) && so.args.fingerprint === fp && so.status === 200, JSON.stringify(so && so.args));
    check("July now signed off by Carl", /carl\.example/.test(status(M(1))), status(M(1)));

    // Changing a figure in a signed-off month clears its sign-off.
    mbtn(M(1)).click();
    type(await until(() => $("#dpfIn-overheads_gbp")), "97200");
    check("the box says saving clears the sign-off", /saving a change clears its sign-off/.test(text("#dpf .dpf-edit")), text("#dpf .dpf-edit .hint"));
    button("Save month", $("#dpf")).click();
    await until(() => status(M(1)) === "Ready to sign");
    check("a change clears the sign-off", status(M(1)) === "Ready to sign" && /sign-off was cleared/.test(msg()), status(M(1)) + " | " + msg());

    // Someone else changes a figure: the fingerprint the page holds is stale, so Sign off is refused.
    window.__stub.dpfChange(M(1), "overheads_gbp", 97300);
    act(M(1)).click();
    await until(() => /have changed since you opened them/.test(msg()));
    check("a stale fingerprint is refused with the database's sentence", /have changed since you opened them/.test(msg()) && last("dpf_sign_off").status === 400, msg());
    await until(() => cell("overheads_gbp", M(1)).textContent === "£97,300");
    check("the year is read again after the refusal", cell("overheads_gbp", M(1)).textContent === "£97,300", cell("overheads_gbp", M(1)).textContent);
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

    await upload();
    await history();
  }

  async function upload() {
    const u0 = calls("dpf_upload").length;
    window.showTool("dpf", "upload");
    const tIn = await until(() => $("#dpfTemplate"));
    if (!tIn) { check("Upload is drawn", false, text("#main").slice(0, 300)); return; }
    check("three routes", $$("#dpf .dpf-card h2").map((h) => h.textContent).join("|") === "Dyce template|Carl's plan workbook|DPF workbook", $$("#dpf .dpf-card h2").map((h) => h.textContent).join("|"));
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
    const at = (iso, code) => aoa.findIndex((r) => r[0] === mm(iso) && r[1] === code);
    check("the template: one sheet, its header, every month and item", wb.SheetNames.join() === "DPF figures" && aoa[0].join() === "Month,Item code,Item,Value" && aoa.length === 1 + 12 * 13, aoa[0] && aoa[0].join());
    check("the template holds the values held", aoa[at(M(0), "opex_gbp")][3] === 118250.5 && aoa[at(M(2), "trustpilot_score")][3] == null, JSON.stringify(aoa[at(M(0), "opex_gbp")]));
    // Change one value and fill one blank, then upload it.
    aoa[at(M(2), "opex_gbp")][3] = 130000;
    aoa[at(M(2), "trustpilot_score")][3] = 4.4;
    const back = X.utils.book_new(); X.utils.book_append_sheet(back, X.utils.aoa_to_sheet(aoa), "DPF figures");
    setFile(tIn, new Uint8Array(X.write(back, { type: "array", bookType: "xlsx" })), "dpf-template.xlsx");
    await until(() => $("#dpfPreview .dpf-count"));
    const lines = $$("#dpfPreview tbody tr");
    const changed = lines.filter((r) => r.classList.contains("chg")).map((r) => r.dataset.code + "@" + r.dataset.month);
    check("the preview: two to change, the rest unchanged and greyed", changed.join() === `opex_gbp@${M(2)},trustpilot_score@${M(2)}` && lines.some((r) => r.classList.contains("same")) && /^2 to change, \d+ unchanged\.$/.test(text("#dpfPreview .dpf-count")), changed.join() + " | " + text("#dpfPreview .dpf-count"));
    const row = lines.find((r) => r.dataset.code === "opex_gbp" && r.dataset.month === M(2));
    check("held and new values", row && row.cells[2].textContent === "£120,400" && row.cells[3].textContent === "£130,000", row && row.textContent);
    check("nothing is saved before Save", calls("dpf_upload").length === u0, calls("dpf_upload").length);
    button("Save 2 changes", $("#dpfPreview")).click();
    await until(() => /^Saved dpf-template\.xlsx/.test(msg()));
    const up = last("dpf_upload");
    check("Save sends dpf_upload with source template and the file name", up && up.args.source === "template" && up.args.source_file === "dpf-template.xlsx" && up.args.rows.length === lines.length && up.status === 200, JSON.stringify(up && { source: up.args.source, file: up.args.source_file, n: up.args.rows.length }));
    check("the answer's counts are said", /2 changed, \d+ unchanged/.test(msg()) && $("#dpfPreview").hidden, msg());

    // A bad CSV: its problem is listed first and Save is blocked.
    setFile($("#dpfTemplate"), new TextEncoder().encode("Month,Item code,Item,Value\n" + mm(M(3)) + ",trustpilot_score,,9\n" + mm(M(3)) + ",opex_gbp,,5\n"), "bad.csv");
    await until(() => $("#dpfPreview .dpf-problems"));
    const blocked = $$("#dpfPreview button").find((b) => /^Save/.test(b.textContent));
    check("a problem is listed and blocks Save", /must be from 0 to 5/.test(text("#dpfPreview .dpf-problems")) && blocked && blocked.disabled, text("#dpfPreview"));
    button("Discard", $("#dpfPreview")).click();

    // Carl's plan workbook, Targets: rows by label, months by the header's dates.
    const months = Array.from({ length: 12 }, (_, i) => M(i));
    const sheet = (lines2) => X.utils.aoa_to_sheet([["Invented plan"], [], [null, "Line", ...months.map(serial)], ...lines2.map(([l, v]) => [null, l, ...months.map((m, i) => v + i)])]);
    const plan = X.utils.book_new();
    X.utils.book_append_sheet(plan, sheet([["Gross Profit", 150000], ["Net Profit (£)", 30000], ["Volume (MWh)", 150000], ["Total Purchases (£)", 1], ["Total Direct Expenses (£)", 1], ["Total Overheads (£)", 1]]), "P&L Forecast");
    X.utils.book_append_sheet(plan, sheet([["OPEX", 110000]]), "Costs");
    setFile($("#dpfPlan"), new Uint8Array(X.write(plan, { type: "array", bookType: "xlsx" })), "Invented plan.xlsx");
    await until(() => $("#dpfPreview .dpf-count"));
    const pl = $$("#dpfPreview tbody tr");
    const gm = pl.find((r) => r.dataset.code === "plan_gm_gbp" && r.dataset.month === M(3));
    check("plan workbook, Targets: four plan lines for twelve months", pl.length === 48 && gm && gm.cells[3].textContent === "£150,003" && !$("#dpfPreview .dpf-problems"), pl.length + " | " + (gm && gm.textContent));
    button("Discard", $("#dpfPreview")).click();

    // The DPF workbook: bad debt and the Trustpilot targets, the count split over 12.
    const dpf = X.utils.book_new();
    X.utils.book_append_sheet(dpf, X.utils.aoa_to_sheet([["SLT"], [null, "Bad Debt Charge", 0.5], [null, "CSAT (Trust Pilot Score)", 4.5], [null, "CSAT (Trust Pilot Count)", 240]]), "SLT Dashboard");
    setFile($("#dpfDpf"), new Uint8Array(X.write(dpf, { type: "array", bookType: "xlsx" })), "Invented DPF.xlsx");
    await until(() => $("#dpfPreview .dpf-count"));
    const dl = $$("#dpfPreview tbody tr");
    const count = dl.find((r) => r.dataset.code === "plan_trustpilot_new_reviews" && r.dataset.month === M(4));
    check("DPF workbook: three targets for twelve months, 240 a year is 20 a month", dl.length === 36 && count && count.cells[3].textContent === "20", dl.length + " | " + (count && count.textContent));
    button("Save " + text("#dpfPreview .dpf-count").split(" ")[0] + " changes", $("#dpfPreview")).click();
    await until(() => /^Saved Invented DPF\.xlsx/.test(msg()));
    check("the DPF workbook is saved as plan_workbook", last("dpf_upload").args.source === "plan_workbook" && last("dpf_upload").args.source_file === "Invented DPF.xlsx", JSON.stringify(last("dpf_upload").args.source));
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
    check("menu Months, Upload, History", menu() === "Months,Upload,History", menu());
    check("months can be opened for editing", $$("#dpf .dpf-mbtn").length === 12);
    check("no sign-off controls without the tick", !$("#dpf tr.dpf-acts") && !button("Sign off") && !button("Undo sign-off"));
    mbtn(M(2)).click();
    type(await until(() => $("#dpfIn-trustpilot_score")), "4.3");
    button("Save month", $("#dpf")).click();
    await until(() => /^Saved /.test(msg()));
    check("an enterer saves a month", last("dpf_save") && last("dpf_save").status === 200 && cell("trustpilot_score", M(2)).textContent === "4.3", msg());
    check("still no sign-off controls", !$("#dpf tr.dpf-acts"));
  }

  async function viewOnly() {
    if (!(await grid())) return;
    check("menu Months and History, no Upload", menu() === "Months,History", menu());
    check("no month opens for editing", !$("#dpf .dpf-mbtn") && !$("#dpf .dpf-edit") && !$("#dpf input"));
    check("no sign-off controls", !$("#dpf tr.dpf-acts") && !button("Sign off"));
    window.showTool("dpf", "upload");
    await sleep(300);
    check("Upload does not open without Enter", !$("#dpfTemplate") && /Months$/.test(text("#crumb")), text("#crumb"));
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
    check("admin: menu and every control", menu() === "Months,Upload,History" && $$("#dpf .dpf-mbtn").length === 12 && !!$("#dpf tr.dpf-acts"), menu());
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
