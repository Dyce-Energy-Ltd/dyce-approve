// A check of the Commission Engine tab in the preview hub (preview/hub.html, with
// tools/preview-stub.js). tests/test_build.py builds the preview, puts this file at the end of the
// page, opens it in a headless browser signed in through the stub (?as= in the address, the last
// place set to the tab's Runs) and reads the answer this writes into a pre element with the id
// "result". It is not part of any page the hub serves.
//
// ?as=admin: the tab sits between Dashboard Pool and DNA Admin; the side menu is Monthly run with
// Lines, Exceptions, Decisions and Runs; Runs draws its table and the wrong usage month's warning;
// a link opens a run and marks Runs in the menu; Lines draws its totals and filter box; the Broker
// search hides names that do not match and never a ticked one, asking nothing of the function;
// ticking two Outcome choices sends both (a repeated parameter); a line opens; Exceptions draws its
// tiles and items, and the hostile broker name stays text; the Decisions filter and a decision; an
// answer that arrives after a later move is dropped; nothing but the hub's token and last place is
// stored and the address does not change; a refusal shows its sentence; sign-out empties the tab.
// ?as=viewer: no commission tick, so no tab, and no commission page is asked for.
(() => {
  const PAGES = ["/runs", "/run", "/lines", "/line", "/exceptions", "/decisions", "/decision"];
  const REFUSAL = "You do not have access to this. Ask Phil Brook to add it in DNA Admin.";
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
  function done() { const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify({ as, results }); document.body.append(pre); }

  async function admin() {
    if (!(await until(() => heading() === "Runs"))) { check("Runs is drawn", false, (text("#main") || document.body.textContent).slice(0, 300)); return; }
    // The tab and the side menu.
    const tabs = $$("#tabs button[data-tool]").map((b) => b.dataset.tool);
    check("the tab sits between Dashboard Pool and DNA Admin", tabs.indexOf("dashboard_pool") + 1 === tabs.indexOf("commission") && tabs.indexOf("commission") + 1 === tabs.indexOf("dna_admin"), tabs.join(","));
    check("the tab is labelled and selected", text('#tabs button[data-tool="commission"]') === "Commission Engine" && $('#tabs button[data-tool="commission"]').getAttribute("aria-current") === "true");
    const side = $$("#sidemenu > *").map((n) => n.textContent.trim());
    check("the side menu is Monthly run: Lines, Exceptions, Decisions, Runs", JSON.stringify(side) === JSON.stringify(["Monthly run", "Lines", "Exceptions", "Decisions", "Runs"]), JSON.stringify(side));
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
    check("sign-out empties the tab", !$("#ce") && $$("#tabs button[data-tool]").length === 0 && $("#sidemenu").childElementCount === 0 && $("#app").hidden);
  }

  async function viewer() {
    await until(() => $("#tabs button[data-tool]"));
    await sleep(800);
    check("no Commission Engine tab without a commission tick", !$('#tabs button[data-tool="commission"]'), $$("#tabs button").map((b) => b.textContent).join(","));
    check("no commission page is asked for", pageCalls().length === 0, JSON.stringify(pageCalls()));
    check("the hub falls back to the person's first tool", !$("#ce"));
  }

  (as === "viewer" ? viewer() : admin()).catch((e) => check("the check ran to the end", false, e && e.stack)).finally(done);
})();
