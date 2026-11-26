// A check of the Commission Engine tab in the preview hub (preview/hub.html, with
// tools/preview-stub.js). tests/test_build.py builds the preview, puts this file at the end of the
// page, opens it in a headless browser signed in through the stub (?as= in the address, the last
// place set to the tab's Runs) and reads the answer this writes into a pre element with the id
// "result". It is not part of any page the hub serves.
//
// ?as=admin: the tab sits after Dashboard Pool and Pricing, just before DNA Admin; the side menu is Monthly run with
// Lines, Exceptions, Decisions and Runs; Runs draws its table and the wrong usage month's warning;
// a link opens a run and marks Runs in the menu; Lines draws its totals and filter box; the Broker
// search hides names that do not match and never a ticked one, asking nothing of the function;
// ticking two Outcome choices sends both (a repeated parameter); a line opens, the line above the
// content and the last place staying on Lines; the line's run link moves both, and the menu mark,
// to Runs; Exceptions draws its
// tiles and items, and the hostile broker name stays text; the Decisions filter and a decision; an
// answer that arrives after a later move is dropped; nothing but the hub's token and last place is
// stored and the address does not change; a refusal shows its sentence; sign-out empties the tab.
// Deciding (piece 2), as Admin Example, who holds Decide: the footer says what is written; the Lines
// dropdown sends Yes at once (the controls held by the DOM while it is on its way, the page redrawn
// where it was and focus back on the row's select), shows the reason for No without sending, hides
// it again at the first value, stops a blank reason with the laptop's sentence, saves with Save or
// Enter (the reason as typed, the bulk form around the grid not submitted), and a refusal shows its
// sentence and redraws the page in place; the bulk form sends the ticked lines and the button's Yes,
// and the Decide page's form posts every field as an act call; each Exceptions control (Pay, Hold
// refused, Enter uplift, Choose broker, Set broker refused then saved, Resolve) posts its form's
// fields under its action and the page goes where the answer says with its message as text.
// ?as=viewer: no commission tick, so no tab, and no commission page is asked for.
// ?as=ceview: View only, so Lines and Exceptions draw no decide control and nothing is sent.
// ?as=cedecide: Decide only, so the menu is Lines and Exceptions, and both open with their controls.
// Keyboard (ruling, 16/11/2026): a Yes reached by an arrow key waits for Save or Enter; a Yes picked
// with the mouse is sent at once; a save from the menu-opened Exceptions page keeps its place.
// Building (piece 3), as Admin Example, who holds Build: Availability sits last under Monthly run and
// draws its Build and Load buttons; its SharePoint folders open in a new tab without an opener and
// nothing else named outside the hub opens; Build goes to the build's page, which is asked for again
// every 3 seconds, silently, until the build has finished; Load goes to the load's page, asked for
// every 10 seconds until every load has ended, its GitHub run links opening outside; a refused Load
// shows its sentence and stays; Rebuild on Exceptions goes to a build that stays live, which is never
// asked for while an ask is on its way, is no longer asked for once the person leaves, and stops being
// asked for after 15 minutes. ?as=ceview sees Availability without Build or Load; ?as=cedecide has no
// Availability; ?as=cebuild (Build only) has Availability alone, and signing out stops a live build's
// page being asked for.
(() => {
  const PAGES = ["/runs", "/run", "/lines", "/line", "/exceptions", "/decisions", "/decision", "/decide", "/set-broker",
    "/choose-broker", "/resolve", "/availability", "/availability-month", "/build-job", "/load-job"];
  const REFUSAL = "You do not have access to this. Ask Phil Brook to add it in DNA Admin.";
  const FOOT = "Data class: Red. Source: dyce-prod, the commission tables. Decisions, uplifts, brokers and resolutions you save here are written to dyce-prod straight away.";
  const NO_REASON = "Withholding payment needs a stated reason. This is the row that stops a broker being paid, and a blank reason is the one decision nobody can review later.";
  const HOSTILE = "<img src=x onerror=alert(1)>";
  const CRUMB = "Commission Engine / Monthly run / ";
  const q = new URLSearchParams(location.search);
  const as = q.get("as") || "admin";
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? "" : String(detail ?? "") });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(f, tries) {
    for (let i = 0; i < (tries || 80); i++) { let v = null; try { v = f(); } catch { v = null; } if (v) return v; await sleep(50); }
    return null;
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const text = (s) => ($(s) ? $(s).textContent.trim() : "");
  const heading = () => text("#ce .ce-body h2");
  const menu = (id) => $(`#sidemenu button[data-item="${id}"]`);
  const current = () => ($("#sidemenu button[aria-current=page]") || {}).dataset;
  const pageCalls = () => window.__stub.calls.filter((c) => c.op === "page" && c.args && PAGES.includes(c.args.path));
  const lastCall = () => { const c = pageCalls(); return c.length ? c[c.length - 1] : null; };
  const link = (href) => $$("#ce .ce-body a").find((a) => a.getAttribute("data-dv-href") === href);
  const visible = (el) => !el.hidden && el.offsetParent !== null;
  const acts = () => window.__stub.calls.filter((c) => c.op === "act");
  const lastAct = () => { const a = acts(); return a.length ? a[a.length - 1] : null; };
  const msg = () => text("#ce > .msg");
  const refused = () => $("#ce > .msg").classList.contains("refused");
  const sorted = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  // Building (piece 3): the calls for one job's page, and how far apart they were asked for.
  const jobCalls = (path, id) => pageCalls().filter((c) => c.args.path === path && JSON.stringify(c.args.query) === JSON.stringify({ id: [id] }));
  const gaps = (cs) => cs.slice(1).map((c, i) => Math.round(c.at - cs[i].at));
  const heads = () => $$("#ce .ce-table thead th").map((th) => th.textContent.trim());
  const submitForm = (action, month) => {
    const f = $$(`#ce form[method="post"][action="${action}"]`).find((x) => (x.querySelector('input[name="month"]') || {}).value === month);
    if (f) f.querySelector('button[type="submit"]').click();
    return !!f;
  };
  function done() { const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify({ as, results }); document.body.append(pre); }

  async function admin() {
    if (!(await until(() => heading() === "Runs"))) { check("Runs is drawn", false, (text("#main") || document.body.textContent).slice(0, 300)); return; }
    // The tab and the side menu.
    const tabs = $$("#tabs button[data-tool]").map((b) => b.dataset.tool);
    check("the tab sits after Dashboard Pool and Pricing, just before DNA Admin", tabs.indexOf("dashboard_pool") >= 0 && tabs.indexOf("dashboard_pool") < tabs.indexOf("pricing") && tabs.indexOf("pricing") + 1 === tabs.indexOf("commission") && tabs.indexOf("commission") + 1 === tabs.indexOf("dna_admin"), tabs.join(","));
    check("the tab is labelled and selected", text('#tabs button[data-tool="commission"]') === "Commission Engine" && $('#tabs button[data-tool="commission"]').getAttribute("aria-current") === "true");
    const side = $$("#sidemenu > *").map((n) => n.textContent.trim());
    check("the side menu is Monthly run: Lines, Exceptions, Decisions, Runs, Availability", JSON.stringify(side) === JSON.stringify(["Monthly run", "Lines", "Exceptions", "Decisions", "Runs", "Availability"]), JSON.stringify(side));
    check("Runs is marked", current() && current().item === "runs");
    check("the heading is the tool's", text("#ce > h1") === "Commission Engine");

    // Runs: the table, the warning and the critical badge with its word.
    check("five runs", $$("#ce .ce-table tbody tr").length === 5 && text("#ce .ce-count") === "5 runs", text("#ce .ce-count"));
    check("the wrong usage month's warning", /^The Mar26 run records its usage month as 'February 2026', but a run's usage month is the run month itself/.test(text("#ce .ce-warning")), text("#ce .ce-warning"));
    const badge = $$("#ce .ce-badge").find((b) => b.textContent === "Should be March 2026");
    check("the badge carries its state and its word", badge && badge.classList.contains("ce-badge--critical"));
    check("each table scrolls in its own box", $$("#ce table").every((t) => t.parentElement.classList.contains("ce-scroll")));
    check("links carry no address", $$("#ce .ce-body a").every((a) => a.getAttribute("href") === "#"));

    // A run.
    link("/run?id=11111111-1111-4111-8111-111111111111").click();
    await until(() => heading() === "June26 revision 2");
    check("a link opens the run", heading() === "June26 revision 2", heading());
    check("the call carries the path and the id as a list", lastCall() && lastCall().args.path === "/run" && JSON.stringify(lastCall().args.query) === '{"id":["11111111-1111-4111-8111-111111111111"]}', JSON.stringify(lastCall()));
    check("focus goes to the page's heading", document.activeElement === $("#ce .ce-body h2"));
    check("Runs stays marked", current() && current().item === "runs");
    check("the line above the content says Runs", text("#crumb") === CRUMB + "Runs", text("#crumb"));
    check("the source files", /ID625 June 2026 example\.xlsx/.test(text("#ce .ce-body")));

    // Lines.
    menu("lines").click();
    await until(() => heading() === "Lines" && $("#ce .ce-filter-box"));
    check("Lines is drawn", heading() === "Lines" && current().item === "lines", heading());
    check("the totals bar's three tiles", JSON.stringify($$("#ce .ce-total-label").map((n) => n.textContent)) === JSON.stringify(["Run", "Selected by these filters", "Payable on this run"]));
    check("nineteen lines", text("#ce .ce-count") === "19 lines", text("#ce .ce-count"));
    check("the month is June26", $('#ce select[name="run"]').value === "June26");
    const brokerBox = $('#ce .ce-filter[data-key="broker"]');
    check("the Broker filter has its search", brokerBox && $(".ce-filter-search", brokerBox));
    if (brokerBox) {
      const search = $(".ce-filter-search", brokerBox);
      const choices = () => $$(".ce-filter-choice", brokerBox);
      const shown = () => choices().filter(visible).map((c) => c.textContent.trim());
      const before = window.__stub.calls.length;
      search.value = "neill"; search.dispatchEvent(new Event("input", { bubbles: true }));
      check("typing hides the names that do not match", JSON.stringify(shown()) === JSON.stringify(["O'Neill & Co"]), JSON.stringify(shown()));
      const example = choices().find((c) => c.textContent.trim() === "Example Brokers Ltd");
      example.querySelector("input").checked = true;
      search.value = "zzz"; search.dispatchEvent(new Event("input", { bubbles: true }));
      check("a ticked name is never hidden", JSON.stringify(shown()) === JSON.stringify(["Example Brokers Ltd"]), JSON.stringify(shown()));
      check("the search asks nothing of the function", window.__stub.calls.length === before);
      example.querySelector("input").checked = false;
      search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true }));
      check("clearing the search shows every name", shown().length === choices().length && choices().length >= 4, shown().length + " of " + choices().length);
    }
    // Two Outcome choices: both sent, as a repeated parameter, with the month.
    for (const v of ["Yes", "Maybe"]) $(`#ce .ce-filter[data-key="outcome"] input[value="${v}"]`).click();
    $$("#ce .ce-filter-acts button").find((b) => b.textContent === "Apply").click();
    await until(() => /\(2\)/.test(text('#ce .ce-filter[data-key="outcome"] .ce-filter-title')));
    const sent = lastCall();
    check("both ticks are sent, with the month", sent && sent.args.path === "/lines" && JSON.stringify(sent.args.query.outcome) === '["Yes","Maybe"]' && JSON.stringify(sent.args.query.run) === '["June26"]', JSON.stringify(sent && sent.args));
    check("the filter shows its count", /Outcome \(2\)/.test(text('#ce .ce-filter[data-key="outcome"] .ce-filter-title')), text('#ce .ce-filter[data-key="outcome"] .ce-filter-title'));
    check("both stay ticked", $$('#ce .ce-filter[data-key="outcome"] input:checked').map((i) => i.value).join(",") === "Yes,Maybe");
    // A line.
    link("/line?id=501").click();
    await until(() => heading() === "yu YU-9100000001-2026-06");
    check("a line opens", heading() === "yu YU-9100000001-2026-06" && current().item === "lines", heading());
    check("the line above the content stays on Lines", text("#crumb") === CRUMB + "Lines", text("#crumb"));
    check("the last place stays on Lines", localStorage.getItem("dyce.hub.where") === JSON.stringify({ tool: "commission", item: "lines" }), localStorage.getItem("dyce.hub.where"));
    // The line's run: a link that moves the page under another menu item.
    link("/run?id=11111111-1111-4111-8111-111111111111").click();
    await until(() => heading() === "June26 revision 2");
    check("the line's run link marks Runs", heading() === "June26 revision 2" && current() && current().item === "runs", heading());
    check("the line above the content follows to Runs", text("#crumb") === CRUMB + "Runs", text("#crumb"));
    check("the last place follows to Runs", localStorage.getItem("dyce.hub.where") === JSON.stringify({ tool: "commission", item: "runs" }), localStorage.getItem("dyce.hub.where"));

    // Exceptions.
    menu("exceptions").click();
    await until(() => heading() === "June26 exceptions");
    check("Exceptions is drawn", heading() === "June26 exceptions" && current().item === "exceptions", heading());
    check("the tiles", $$("#ce .ce-tile").length === 7 && text("#ce .ce-tile .ce-fig") === "5/17", $$("#ce .ce-tile").length + " " + text("#ce .ce-tile .ce-fig"));
    check("the items, drawn open", $$("#ce .ce-item").length > 10 && $$("#ce .ce-item-body").length === $$("#ce .ce-item").length);
    check("the Kind filter comes first", ($("#ce .ce-filter") || { dataset: {} }).dataset.key === "kind");
    check("the hostile broker name is text", !$("#ce img") && /<img src=x onerror=alert\(1\)>/.test(text("#ce .ce-body")));

    // Decisions: the filter and a decision.
    menu("decisions").click();
    await until(() => heading() === "Decisions");
    check("Decisions is drawn", heading() === "Decisions" && text("#ce .ce-count") === "4 decisions", text("#ce .ce-count"));
    $('#ce select[name="decided_pay"]').value = "Yes";
    $$("#ce .ce-filters button").find((b) => b.textContent === "Filter").click();
    await until(() => text("#ce .ce-count") === "2 decisions");
    check("the Decisions filter", text("#ce .ce-count") === "2 decisions" && JSON.stringify(lastCall().args.query) === '{"decided_pay":["Yes"]}', JSON.stringify(lastCall().args));
    link("/decision?id=7003").click();
    await until(() => heading() === "Decision 7003");
    check("a decision opens", heading() === "Decision 7003" && current().item === "decisions", heading());

    await decider();
    await building();

    // An answer that arrives after a later move is dropped.
    window.__stub.delay.page = 1500;
    menu("lines").click();
    await sleep(100);
    window.__stub.delay.page = 0;
    menu("runs").click();
    await sleep(2200);
    check("a late answer is dropped", heading() === "Runs" && current().item === "runs", heading());

    // Storage and the address.
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    check("only the hub's token and last place are stored", JSON.stringify(keys.sort()) === JSON.stringify(["dyce.hub.token", "dyce.hub.where"]), keys.join(","));
    check("the last place is the tool and item only", localStorage.getItem("dyce.hub.where") === JSON.stringify({ tool: "commission", item: "runs" }), localStorage.getItem("dyce.hub.where"));
    check("nothing in sessionStorage", sessionStorage.length === 0);
    check("the address is unchanged", location.hash === "");

    // A refusal: the tick removed on the server side.
    window.__stub.untick("commission.view");
    menu("decisions").click();
    await until(() => $("#ce > .msg.refused"));
    check("a refusal shows its sentence", text("#ce > .msg") === REFUSAL && $("#ce > .msg").classList.contains("refused"), text("#ce > .msg"));

    // Sign-out empties the tab.
    $("#signOutBtn").click();
    await sleep(300);
    check("sign-out empties the tab", !$("#ce") && $$("#tabs button[data-tool]").length === 0 && $("#sidemenu").childElementCount === 0 && $("#app").hidden && $("#crumb").hidden);
  }

  async function decider() {
    check("the footer says what is written", text("#ce .ce-foot") === FOOT, text("#ce .ce-foot"));
    const row = (line) => $(`#ce .ce-decide[data-line="${line}"]`);
    const select = (line) => $("select", row(line));
    const reason = (line) => $(".ce-decide-reason", row(line));
    // A choice made with the mouse (pointerdown and mousedown on the select first), and one made
    // from the keyboard (an arrow key's keydown first, as Chrome and Edge fire change per arrow).
    const pick = (line, v) => {
      const s = select(line);
      s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); s.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      s.value = v; s.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const key = (line, v) => {
      const s = select(line);
      s.focus();
      s.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      s.value = v; s.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const idle = () => !$("#ce").getAttribute("aria-busy");
    const controls = () => $$("#ce .ce-body select, #ce .ce-body input, #ce .ce-body button");

    menu("lines").click();
    await until(() => heading() === "Lines" && row("501"));
    check("each line of an open run has the dropdown", $$("#ce .ce-decide").length === 19, $$("#ce .ce-decide").length);
    check("the dropdown and its reason box carry no name", $$("#ce .ce-decide select, #ce .ce-decide input").every((c) => !c.name));
    check("an undecided line starts at Undecided, a decided one at its decision", select("501").value === "" && select("503").value === "Yes" && select("513").value === "No");
    check("the reason box starts hidden", $$("#ce .ce-decide-reason").every((r) => r.hidden));
    check("the grid sits in the bulk form", !!$("#ce form.ce-bulk") && $$('#ce form.ce-bulk input[name="line"]').length === 19);

    // Yes on an undecided line: sent at once, the controls held by the DOM while it is on its way.
    select("501").scrollIntoView({ block: "center" });
    const y = window.scrollY;
    window.__stub.delay.decide = 700;
    let n = acts().length;
    pick("501", "Yes");
    await until(() => acts().length > n);
    check("the controls are held while the call is on its way", controls().length > 20 && controls().every((c) => c.disabled), controls().filter((c) => !c.disabled).length);
    check("Yes sends decide with the line and the head it showed, at once", lastAct() && lastAct().action === "decide" &&
      JSON.stringify(lastAct().args.fields) === JSON.stringify({ seen: ["501:"], decided_pay: ["Yes"], reason: [""], next: ["/lines"] }), JSON.stringify(lastAct()));
    await until(() => msg() === "1 line marked Yes." && !$("#ce").getAttribute("aria-busy"));
    delete window.__stub.delay.decide;
    check("the answer's message is shown", msg() === "1 line marked Yes." && !refused(), msg());
    check("the page it went to was asked for", lastCall().args.path === "/lines" && JSON.stringify(lastCall().args.query) === "{}", JSON.stringify(lastCall()));
    check("the page is redrawn where it was", y > 0 && Math.abs(window.scrollY - y) <= 2, y + " then " + window.scrollY);
    check("focus goes back to the row's select", document.activeElement === select("501"), document.activeElement && document.activeElement.outerHTML.slice(0, 80));
    check("the controls are free again", controls().every((c) => !c.disabled));

    // From the keyboard (ruling, 16/11/2026): Yes waits for Save or Enter, so arrowing past Yes
    // on the way to No writes nothing.
    n = acts().length;
    key("504", "Yes");
    check("Yes from the keyboard sends nothing and shows Save, without the reason box", acts().length === n &&
      !reason("504").hidden && $("input", reason("504")).hidden && visible($("button[data-ce-save]", reason("504"))));
    check("focus stays on the select", document.activeElement === select("504"));
    key("504", "");
    check("back to the first value hides Save again", reason("504").hidden && acts().length === n);
    key("504", "Yes");
    const onSelect = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    select("504").dispatchEvent(onSelect);
    await until(() => acts().length > n);
    check("Enter on the select saves the keyboard's Yes", onSelect.defaultPrevented && lastAct() &&
      JSON.stringify(lastAct().args.fields) === JSON.stringify({ seen: ["504:"], decided_pay: ["Yes"], reason: [""], next: ["/lines"] }), JSON.stringify(lastAct() && lastAct().args));
    await until(() => idle() && msg() === "1 line marked Yes.");
    n = acts().length;
    key("514", "Yes");
    check("Yes from the keyboard waits", acts().length === n);
    $("button[data-ce-save]", reason("514")).click();
    await until(() => acts().length > n);
    check("Save sends the keyboard's Yes", JSON.stringify(lastAct().args.fields) === JSON.stringify({ seen: ["514:"], decided_pay: ["Yes"], reason: [""], next: ["/lines"] }), JSON.stringify(lastAct().args));
    await until(() => idle() && msg() === "1 line marked Yes.");
    n = acts().length;
    key("502", "No");
    check("No from the keyboard shows the reason box and focuses it, sending nothing", !reason("502").hidden && !$("input", reason("502")).hidden &&
      document.activeElement === $("input", reason("502")) && acts().length === n);
    key("502", "");
    check("and the first value hides it", reason("502").hidden && acts().length === n);

    // No: the reason box, and nothing sent until it is saved.
    n = acts().length;
    pick("502", "No");
    check("No shows the reason box and focuses it, sending nothing", !reason("502").hidden && document.activeElement === $("input", reason("502")) && acts().length === n);
    pick("502", "");
    check("back to the first value hides the reason box", reason("502").hidden && acts().length === n);
    pick("502", "No");
    $("input", reason("502")).value = " \u00a0\t\r\n";
    $("button[data-ce-save]", reason("502")).click();
    await sleep(200);
    check("a blank reason is stopped in the page with the laptop's sentence", msg() === NO_REASON && refused() && acts().length === n, msg());
    // Enter in the reason box saves the row. Its keydown is prevented, which is what keeps the
    // browser from submitting the bulk form the grid sits in (implicit submission).
    const pagesBefore = pageCalls().length;
    const typed = "Not due " + HOSTILE + " & \"quoted\"";
    $("input", reason("502")).value = typed;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    $("input", reason("502")).dispatchEvent(enter);
    await until(() => acts().length > n);
    check("Enter is taken from the bulk form: its keydown is prevented and no page is asked for", enter.defaultPrevented && pageCalls().length === pagesBefore);
    check("Enter saves No with the reason as typed", enter.defaultPrevented && lastAct() &&
      JSON.stringify(lastAct().args.fields) === JSON.stringify({ seen: ["502:"], decided_pay: ["No"], reason: [typed], next: ["/lines"] }), JSON.stringify(lastAct() && lastAct().args));
    await until(() => msg() === "1 line marked No.");
    check("No is saved, and nothing typed became markup", msg() === "1 line marked No." && !$("#ce img"), msg());

    // A decided line: No with Save carries the head the page showed.
    n = acts().length;
    pick("503", "No");
    $("input", reason("503")).value = "Paid in error last month";
    $("button[data-ce-save]", reason("503")).click();
    await until(() => acts().length > n);
    check("Save sends No with the decided line's head", JSON.stringify(lastAct().args.fields) === JSON.stringify({ seen: ["503:7001"], decided_pay: ["No"], reason: ["Paid in error last month"], next: ["/lines"] }), JSON.stringify(lastAct().args));
    await until(() => msg() === "1 line marked No.");

    // A refusal: the sentence, and the page drawn again in place.
    select("512").scrollIntoView({ block: "center" });
    const y2 = window.scrollY;
    const asked = pageCalls().length;
    pick("512", "Yes");
    await until(() => refused() && pageCalls().length > asked && !$("#ce").getAttribute("aria-busy"));
    check("a refusal shows its sentence", /^Nothing was written\. 1 line changed since this page was rendered/.test(msg()) && refused(), msg());
    check("a refusal redraws the page in place", pageCalls().length === asked + 1 && select("512").value === "" && Math.abs(window.scrollY - y2) <= 2, window.scrollY + " vs " + y2);

    // Bulk: the ticked lines and the button pressed, then the Decide page's form as an act call.
    for (const v of ["501", "502"]) $(`#ce form.ce-bulk input[name="line"][value="${v}"]`).click();
    $('#ce form.ce-bulk button[name="pay"][value="Yes"]').click();
    await until(() => heading() === "Decide 2 lines");
    const bulk = lastCall();
    check("the bulk form sends the ticked lines and the button's value", bulk && bulk.args.path === "/decide" &&
      JSON.stringify((bulk.args.query.line || []).slice().sort()) === '["501","502"]' && JSON.stringify(bulk.args.query.pay) === '["Yes"]' && JSON.stringify(bulk.args.query.run) === '["June26"]', JSON.stringify(bulk && bulk.args));
    check("the Decide page sits under Lines", current() && current().item === "lines");
    n = acts().length;
    $('#ce form[action="/decide"] input[name="reason"]').value = "Checked against the deals";
    $$('#ce form[action="/decide"] button').find((b) => b.textContent === "Confirm 2 lines").click();
    await until(() => acts().length > n);
    check("the Decide form posts every field as decide", lastAct().action === "decide" && sorted(lastAct().args.fields) === sorted({
      seen: ["501:,502:"], next: ["/lines?run=June26&page=1"], run: ["June26"], decided_pay: ["Yes"], reason: ["Checked against the deals"] }), JSON.stringify(lastAct().args));
    await until(() => heading() === "Lines" && msg() === "2 lines marked Yes.");
    check("after it the page goes to the answer's address with its message", heading() === "Lines" && msg() === "2 lines marked Yes." &&
      JSON.stringify(lastCall().args.query) === '{"run":["June26"],"page":["1"]}', JSON.stringify(lastCall().args));

    // Exceptions.
    menu("exceptions").click();
    await until(() => heading() === "June26 exceptions" && $('#ce form[action="/uplift"]'));
    const postForm = (action, field, value) => $$(`#ce form[method="post"][action="${action}"]`).find((f) =>
      !field || (f.querySelector(`input[type="hidden"][name="${field}"]`) || {}).value === value);
    const submitIn = (f) => f.querySelector('button[type="submit"]').click();
    // Pay.
    n = acts().length;
    let f = $$('#ce form[action="/decide"]').find((x) => x.querySelector('input[name="seen"]').value === "505:" && x.querySelector('input[name="decided_pay"]').value === "Yes");
    // The menu opened /exceptions with no query; the form's next is "this page" with run= first.
    check("Exceptions was opened from the menu, with no query", JSON.stringify(lastCall().args.query) === "{}", JSON.stringify(lastCall().args));
    f.scrollIntoView({ block: "center" });
    const yPay = window.scrollY;
    submitIn(f);
    await until(() => acts().length > n);
    check("Pay posts the item's form as decide", lastAct().action === "decide" && sorted(lastAct().args.fields) === sorted({
      seen: ["505:"], decided_pay: ["Yes"], next: ["/exceptions?run=June26"], reason: ["Paid from the deal that is this contract."] }), JSON.stringify(lastAct().args));
    await until(() => idle() && msg() === "1 line marked Yes." && heading() === "June26 exceptions");
    check("then the exceptions page, with the message", msg() === "1 line marked Yes." && JSON.stringify(lastCall().args.query) === '{"run":["June26"]}', msg());
    check("a save from the menu-opened Exceptions page keeps its place", yPay > 0 && Math.abs(window.scrollY - yPay) <= 2, yPay + " then " + window.scrollY);
    // A Pay refused: the sentence, the page in place.
    n = acts().length;
    f = $$('#ce form[action="/decide"]').find((x) => x.querySelector('input[name="seen"]').value === "512:" && x.querySelector('input[name="decided_pay"]').value === "Yes");
    f.scrollIntoView({ block: "center" });
    const y3 = window.scrollY;
    submitIn(f);
    await until(() => acts().length > n && refused() && !$("#ce").getAttribute("aria-busy"));
    check("a refused Pay keeps the page where it was", /^Nothing was written/.test(msg()) && Math.abs(window.scrollY - y3) <= 2, window.scrollY + " vs " + y3);
    // Enter uplift.
    n = acts().length;
    f = postForm("/uplift", "line", "509");
    f.querySelector('input[name="ur"]').value = "1.5";
    f.querySelector('input[name="evidence"]').value = "signed contract, page 2";
    submitIn(f);
    await until(() => acts().length > n);
    check("Enter uplift posts its form as enter_uplift", lastAct().action === "enter_uplift" && sorted(lastAct().args.fields) === sorted({
      line: ["509"], next: ["/exceptions?run=June26"], run: ["June26"], ur: ["1.5"], sc: [""], evidence: ["signed contract, page 2"] }), JSON.stringify(lastAct().args));
    await until(() => /^Uplift saved: 1\.5p per kWh/.test(msg()));
    check("its message", /^Uplift saved: 1\.5p per kWh and 0p per day\./.test(msg()) && !refused(), msg());
    // Choose broker.
    n = acts().length;
    submitIn(postForm("/choose-broker", "exception", "9001"));
    await until(() => acts().length > n);
    check("Choose broker posts its form as choose_broker", lastAct().action === "choose_broker" && sorted(lastAct().args.fields) === sorted({
      exception: ["9001"], next: ["/exceptions?run=June26"], run: ["June26"], broker: ["12"], reason: ["Chosen on the exceptions page: this broker sold the contract."] }), JSON.stringify(lastAct().args));
    await until(() => /^Broker recorded for this contract/.test(msg()));
    check("its message", /^Broker recorded for this contract, and 1 exception resolved\./.test(msg()), msg());
    // Set broker: the page, a refusal naming the hostile broker as text, then saved.
    link("/set-broker?exception=9005&next=%2Fexceptions%3Frun%3DJune26").click();
    await until(() => heading() === "Set the broker for a contract");
    check("Set broker opens its page under Exceptions", heading() === "Set the broker for a contract" && current().item === "exceptions", heading());
    n = acts().length;
    f = postForm("/set-broker");
    f.querySelector('select[name="broker"]').value = "44";
    f.querySelector('input[name="reason"]').value = "On the signed contract";
    submitIn(f);
    await until(() => acts().length > n && refused() && !$("#ce").getAttribute("aria-busy"));
    check("Set broker posts its form as set_broker", lastAct().action === "set_broker" && sorted(lastAct().args.fields) === sorted({
      exception: ["9005"], next: ["/exceptions?run=June26"], run: ["June26"], broker: ["44"], reason: ["On the signed contract"] }), JSON.stringify(lastAct().args));
    check("a refusal naming a hostile broker shows it as text and stays on the page", msg() === "That contract already has a broker: " + HOSTILE + " (44). Nothing was written. If that broker is right, resolve the exception with a note." &&
      !$("#ce img") && heading() === "Set the broker for a contract", msg());
    n = acts().length;
    f = postForm("/set-broker");
    f.querySelector('select[name="broker"]').value = "12";
    f.querySelector('input[name="reason"]').value = "On the signed contract";
    submitIn(f);
    await until(() => acts().length > n && heading() === "June26 exceptions" && /^Broker set for this contract/.test(msg()));
    check("saved, the page goes back to the exceptions with the message", heading() === "June26 exceptions" && /^Broker set for this contract and the exception resolved\./.test(msg()), msg());
    // Resolve.
    link("/resolve?id=9001&next=%2Fexceptions%3Frun%3DJune26").click();
    await until(() => heading() === "Resolve 1 exception");
    check("Resolve opens its page under Exceptions", heading() === "Resolve 1 exception" && current().item === "exceptions", heading());
    n = acts().length;
    f = postForm("/resolve");
    f.querySelector('input[name="resolution"]').value = "Checked with the broker";
    submitIn(f);
    await until(() => acts().length > n);
    check("Resolve posts its form as resolve", lastAct().action === "resolve" && sorted(lastAct().args.fields) === sorted({
      ids: ["9001"], next: ["/exceptions?run=June26"], run: ["June26"], resolution: ["Checked with the broker"] }), JSON.stringify(lastAct().args));
    await until(() => heading() === "June26 exceptions" && msg() === "1 exception marked resolved.");
    check("then the exceptions page, with the message", heading() === "June26 exceptions" && msg() === "1 exception marked resolved.", msg());
    check("every act call was answered by the stub", acts().every((c) => c.status === 200 || c.status === 409), JSON.stringify(acts().map((c) => c.status)));
  }


  async function building() {
    const opened = [];
    window.open = function () { opened.push([...arguments]); return null; };
    menu("availability").click();
    await until(() => heading() === "Month availability");
    check("Availability opens under Monthly run", heading() === "Month availability" && current() && current().item === "availability" && text("#crumb") === CRUMB + "Availability", heading() + " / " + text("#crumb"));
    check("the call carries the path and no query", lastCall().args.path === "/availability" && JSON.stringify(lastCall().args.query) === "{}", JSON.stringify(lastCall().args));
    check("its grid has the Build and Load columns", heads().includes("Build") && heads().includes("Load"), heads().join(","));
    check("its grid scrolls in one box, not two", $$("#ce .ce-scroll .ce-scroll").length === 0 && $$("#ce table").every((t) => t.parentElement.classList.contains("ce-scroll")));
    check("the page itself does not scroll sideways", document.documentElement.scrollWidth <= document.documentElement.clientWidth, document.documentElement.scrollWidth + " > " + document.documentElement.clientWidth);
    const off = $$("#ce .ce-button--off");
    check("a month that cannot be built shows Build greyed, with its reason as a title and as text", off.length > 0 && off.every((b) => b.title && b.nextElementSibling && b.nextElementSibling.classList.contains("ce-visually-hidden")) && !$("#ce [disabled]"));
    check("each mark carries its word as text", $$("#ce .ce-mark").length > 20 && $$("#ce .ce-mark-cell .ce-mark").every((m) => /^(Available|Missing|Check)$/.test(m.textContent)));
    // Outside links: a SharePoint folder opens in a new tab with no opener; nothing else does.
    const sp = $$("#ce .ce-body a[data-external-href]")[0];
    const asked = window.__stub.calls.length;
    if (sp) sp.click();
    check("a SharePoint folder opens in a new tab without an opener", sp && opened.length === 1 && opened[0][0] === sp.getAttribute("data-external-href") && opened[0][1] === "_blank" && opened[0][2] === "noopener", JSON.stringify(opened));
    check("and the page stays, asking nothing", heading() === "Month availability" && window.__stub.calls.length === asked);
    const host = $("#ce .ce-body section");
    for (const bad of ["http://dyceenergy.sharepoint.com/sites/x", "https://github.com.evil.example/Dyce-Energy-Ltd/x", "https://evil.example/",
      "javascript:alert(1)", "https://github.com/someone-else/x/actions/runs/1", "https://user@dyceenergy.sharepoint.com/sites/x",
      "//dyceenergy.sharepoint.com/sites/x", "https://dyceenergy.sharepoint.com:8443/sites/x", "data:text/html,x", ""]) {
      const a = document.createElement("a"); a.setAttribute("href", "#"); a.setAttribute("data-external-href", bad); a.textContent = "x";
      host.append(a); a.click(); a.remove();
    }
    check("any other place named outside the hub is not opened", opened.length === 1, JSON.stringify(opened));

    // Build: the job's page, asked for every 3 seconds until the build has finished, silently.
    let n = acts().length;
    check("June26 can be built", submitForm("/build", "June26"));
    await until(() => heading() === "Build June26");
    check("Build posts the build action with its month", acts().length === n + 1 && lastAct().action === "build" && JSON.stringify(lastAct().args.fields) === '{"month":["June26"]}', JSON.stringify(lastAct()));
    await until(() => msg() === "Build started.");
    check("then the build's page, with the answer's message, under Availability", heading() === "Build June26" && msg() === "Build started." && current().item === "availability", msg());
    check("the live build's page carries the poll marker", !!$("#ce .ce-build-job[data-poll]"));
    const seen = [];
    const watcher = new MutationObserver(() => seen.push(msg() + "|" + $("#ce > .msg").hidden));
    watcher.observe($("#ce > .msg"), { childList: true, characterData: true, subtree: true, attributes: true });
    let busy = false;
    const busyWatch = new MutationObserver(() => { if ($("#ce").getAttribute("aria-busy")) busy = true; });
    busyWatch.observe($("#ce"), { attributes: true, attributeFilter: ["aria-busy"] });
    await until(() => !$("#ce .ce-build-job[data-poll]"), 400);
    const b41 = jobCalls("/build-job", "41");
    check("the build's page is asked for again every 3 seconds until it has finished", b41.length === 4 && gaps(b41).every((g) => g >= 2900 && g < 4500), b41.length + " calls, gaps " + gaps(b41).join(","));
    check("each step drawn in turn", heading() === "Build June26" && /Finished/.test(text("#ce .ce-build-job-table")) && !!link("/lines?run=June26"), text("#ce .ce-build-job-table"));
    await sleep(4000);
    check("and is not asked for once it has finished", jobCalls("/build-job", "41").length === 4, jobCalls("/build-job", "41").length);
    watcher.disconnect(); busyWatch.disconnect();
    check("the asks are silent: the message line and the busy mark never change", seen.length === 0 && !busy && msg() === "Build started.", JSON.stringify(seen) + " busy " + busy);

    // Load: the load's page, asked for every 10 seconds until every load has ended.
    menu("availability").click();
    await until(() => heading() === "Month availability");
    check("June26 can be loaded", submitForm("/load", "June26"));
    await until(() => heading() === "Load June26" && !$("#ce").getAttribute("aria-busy"));
    check("Load posts the load action with its month", lastAct().action === "load" && JSON.stringify(lastAct().args.fields) === '{"month":["June26"]}', JSON.stringify(lastAct()));
    check("then the load's page, with no message, carrying the poll marker", heading() === "Load June26" && msg() === "" && !!$("#ce .ce-load-job[data-poll]"), msg());
    await until(() => !$("#ce .ce-load-job[data-poll]"), 800);
    const l7 = jobCalls("/load-job", "7");
    check("the load's page is asked for again every 10 seconds until every load has ended", l7.length === 3 && gaps(l7).every((g) => g >= 9900 && g < 11500), l7.length + " calls, gaps " + gaps(l7).join(","));
    check("the ended loads, and the month rechecked", /Rechecked June 2026/.test(text("#ce .ce-body")) && $$("#ce .ce-load-job a[data-external-href]").length === 2, text("#ce .ce-body").slice(0, 300));
    const run = $("#ce .ce-load-job a[data-external-href]");
    if (run) run.click();
    check("a GitHub run opens in a new tab without an opener", opened.length === 2 && /^https:\/\/github\.com\/Dyce-Energy-Ltd\/[\w.-]+\/actions\/runs\/\d+$/.test(opened[1][0]) && opened[1][2] === "noopener", JSON.stringify(opened[1]));
    // A refused Load: the sentence, and the page stays.
    menu("availability").click();
    await until(() => heading() === "Month availability");
    check("July26 can be loaded", submitForm("/load", "July26"));
    await until(() => refused() && !$("#ce").getAttribute("aria-busy"));
    check("a refused Load shows its sentence and stays on Availability", /^A load is already running, started at \d\d:\d\d by /.test(msg()) && heading() === "Month availability", msg());

    // Rebuild on Exceptions: a build that stays live.
    menu("exceptions").click();
    await until(() => heading() === "June26 exceptions" && $('#ce .ce-rebuild form[action="/build"]'));
    $('#ce .ce-rebuild button[type="submit"]').click();
    await until(() => heading() === "Build June26" && $("#ce .ce-build-job[data-poll]") && !$("#ce").getAttribute("aria-busy"));
    check("Rebuild posts the build action with its month and goes to the build's page", lastAct().action === "build" && JSON.stringify(lastAct().args.fields) === '{"month":["June26"]}' && current().item === "availability", JSON.stringify(lastAct()));
    // Never asked for while an ask is on its way: each answer is held back 5 seconds.
    window.__stub.delay.page = 5000;
    const from = jobCalls("/build-job", "42").length;
    await sleep(15000);
    delete window.__stub.delay.page;
    const slow = jobCalls("/build-job", "42").slice(from);
    check("an ask is never sent while one is on its way", slow.length >= 2 && gaps(slow).every((g) => g >= 7900), "gaps " + gaps(slow).join(","));
    await sleep(5500);
    window.scrollTo(0, document.documentElement.scrollHeight);
    const y = window.scrollY, before = jobCalls("/build-job", "42").length;
    await until(() => jobCalls("/build-job", "42").length > before);
    await sleep(400);
    check("an ask redraws the page where it was", Math.abs(window.scrollY - y) <= 2 && heading() === "Build June26", y + " then " + window.scrollY);
    // Leaving the page stops the asks.
    await sleep(800);
    menu("lines").click();
    await until(() => heading() === "Lines");
    const left = jobCalls("/build-job", "42").length;
    await sleep(7000);
    check("leaving the page stops the asks", jobCalls("/build-job", "42").length === left, left + " then " + jobCalls("/build-job", "42").length);
    // 15 minutes: the asks stop, and the page says so once.
    menu("exceptions").click();
    await until(() => heading() === "June26 exceptions" && $('#ce .ce-rebuild form[action="/build"]'));
    $('#ce .ce-rebuild button[type="submit"]').click();
    await until(() => heading() === "Build June26" && $("#ce .ce-build-job[data-poll]") && !$("#ce").getAttribute("aria-busy"));
    const realNow = Date.now;
    const shift = 15 * 60 * 1000 + 1000;
    Date.now = () => realNow.call(Date) + shift;
    const at15 = jobCalls("/build-job", "42").length;
    await sleep(7000);
    Date.now = realNow;
    check("after 15 minutes the page is not asked for again", jobCalls("/build-job", "42").length === at15, at15 + " then " + jobCalls("/build-job", "42").length);
    check("and the message line says it stopped checking", msg() === "This page stopped checking after 15 minutes. Open it again to see where it is.", msg());
    menu("runs").click();
    await until(() => heading() === "Runs");
  }

  async function ceview() {
    if (!(await until(() => heading() === "Runs"))) { check("Runs is drawn", false, text("#main").slice(0, 300)); return; }
    menu("lines").click();
    await until(() => heading() === "Lines" && $("#ce .ce-table"));
    check("Lines draws no dropdown, bulk form or tick box for View only", !$("#ce .ce-decide") && !$("#ce form.ce-bulk") && !$('#ce input[name="line"]'));
    check("the footer says what is written", text("#ce .ce-foot") === FOOT, text("#ce .ce-foot"));
    menu("exceptions").click();
    await until(() => heading() === "June26 exceptions");
    check("Exceptions draws no form that posts for View only", heading() === "June26 exceptions" && !$('#ce form[method="post"]') && !link("/set-broker?exception=9005&next=%2Fexceptions%3Frun%3DJune26"));
    menu("availability").click();
    await until(() => heading() === "Month availability");
    check("View opens Availability, with no Build or Load column and no form that posts", heading() === "Month availability" && !heads().includes("Build") && !heads().includes("Load") && !$('#ce form[method="post"]'), heads().join(","));
    check("nothing is sent", acts().length === 0, JSON.stringify(acts()));
  }

  async function viewer() {
    await until(() => $("#tabs button[data-tool]"));
    await sleep(800);
    check("no Commission Engine tab without a commission tick", !$('#tabs button[data-tool="commission"]'), $$("#tabs button").map((b) => b.textContent).join(","));
    check("no commission page is asked for", pageCalls().length === 0, JSON.stringify(pageCalls()));
    check("the hub falls back to the person's first tool", !$("#ce"));
  }

  // Decide alone: the menu is Lines and Exceptions (the last place, Runs, is not open to them, so
  // the tab opens on Lines), and Lines draws its controls.
  async function cedecide() {
    if (!(await until(() => heading() === "Lines" && $("#ce .ce-decide")))) { check("Lines is drawn", false, text("#main").slice(0, 300)); return; }
    const side = $$("#sidemenu > *").map((n) => n.textContent.trim());
    check("the side menu is Monthly run: Lines, Exceptions", JSON.stringify(side) === JSON.stringify(["Monthly run", "Lines", "Exceptions"]), JSON.stringify(side));
    check("Lines is marked and draws the dropdowns", current() && current().item === "lines" && $$("#ce .ce-decide").length === 19);
    menu("exceptions").click();
    await until(() => heading() === "June26 exceptions");
    check("Exceptions opens with its forms", heading() === "June26 exceptions" && !!$('#ce form[method="post"][action="/uplift"]'), heading());
    check("no Decisions, Runs or Availability item", !menu("decisions") && !menu("runs") && !menu("availability"));
  }

  // Build alone: the menu is Availability (the last place, Runs, is not open to them), with its Build
  // and Load buttons; signing out while a build's page is being asked for stops the asks.
  async function cebuild() {
    if (!(await until(() => heading() === "Month availability"))) { check("Availability is drawn", false, text("#main").slice(0, 300)); return; }
    const side = $$("#sidemenu > *").map((n) => n.textContent.trim());
    check("the side menu is Monthly run: Availability", JSON.stringify(side) === JSON.stringify(["Monthly run", "Availability"]), JSON.stringify(side));
    check("Build and Load are drawn", heads().includes("Build") && heads().includes("Load"), heads().join(","));
    check("June26 can be built", submitForm("/build", "June26"));
    await until(() => heading() === "Build June26");
    await until(() => !$("#ce .ce-build-job[data-poll]"), 400);
    check("the build is followed until it has finished", jobCalls("/build-job", "41").length === 4, jobCalls("/build-job", "41").length);
    menu("availability").click();
    await until(() => heading() === "Month availability");
    submitForm("/build", "June26");
    await until(() => heading() === "Build June26" && $("#ce .ce-build-job[data-poll]"));
    await until(() => jobCalls("/build-job", "42").length >= 2, 200);
    // Signed out once the answer is drawn, with the next ask waiting on its timer.
    await sleep(800);
    $("#signOutBtn").click();
    await sleep(300);
    const after = pageCalls().length;
    await sleep(7000);
    check("signing out stops the asks", jobCalls("/build-job", "42").length >= 2 && pageCalls().length === after && !$("#ce"), after + " then " + pageCalls().length);
  }

  (as === "viewer" ? viewer() : as === "ceview" ? ceview() : as === "cedecide" ? cedecide() : as === "cebuild" ? cebuild() : admin()).catch((e) => check("the check ran to the end", false, e && e.stack)).finally(done);
})();
