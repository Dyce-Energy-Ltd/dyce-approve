// A check of the Spine Dictionary tab in the preview hub (preview/hub.html, with
// tools/preview-stub.js). tests/test_build.py builds the preview, puts this file at the end of the
// page, opens it in a headless browser signed in through the stub (?as= in the address, the last
// place set to the tab's All views) and reads the answer this writes into a pre element with the id
// "result". It is not part of any page the hub serves.
//
// ?as=admin: the tab sits between Commission Engine and DNA Admin; the side menu is All views, then
// the Views group with the stub's three views by their friendly names, added after the function
// answers; All views lists the three with their first lines ("No description yet" in the muted grey for the one with no comment, which its page shows too); the search ("ldz", any case) narrows
// to one view and its matching column, asking nothing of the function, and clearing it brings the
// list back; a view picked in the menu draws its table, "No description yet" in the muted grey for
// the undescribed column, and the description that looks like HTML as text, moving the menu mark
// and asking nothing; the same search box sits at the top of a view page, finds a column in another
// view, and clearing it returns to the view; a view's name in All views opens it too; opening the tab again asks again; a
// failed or malformed answer shows the load failure sentence; an answer that arrives after a move to
// another tool is dropped; nothing new is stored and the address does not change; with the tick
// removed on the server side, opening again shows the refusal sentence; with the session ended,
// opening again shows the sign-in.
// ?as=dictionary: Dee Example, the tick alone: the one tab, and the three views.
// ?as=viewer: no tick, so no tab and no call to the function.
(() => {
  const SD = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/spine-dictionary";
  const REFUSAL = "You do not have access to this. Ask Phil Brook to add it in DNA Admin.";
  const FAILED = "The dictionary could not be loaded. Try again shortly.";
  const NAMES = ["Example broker", "Example contract", "Example postcode ldz"];
  const NODESC = "No description yet";
  const FIRST = ["One row per example broker, with its trading name.", NODESC, "One row per example postcode, with its gas zone."];
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
  const calls = () => window.__stub.calls.filter((c) => c.op === "dictionary");
  const side = () => $$("#sidemenu > *").map((n) => n.textContent.trim());
  const marked = () => $$("#sidemenu [aria-current]").map((n) => n.textContent.trim());
  const viewButton = (name) => $$("#sidemenu button[data-sd-view]").find((b) => b.textContent === name);
  const allViews = () => $('#sidemenu button[data-item="all"]');
  const tabs = () => $$("#tabs button[data-tool]").map((b) => b.dataset.tool);
  const listDrawn = () => $$("#sd .sd-views .row").length === 3 && viewButton("Example broker");
  function type(value) { const s = $("#sd input[type=search]"); s.value = value; s.dispatchEvent(new Event("input", { bubbles: true })); }
  // WCAG contrast of two rgb() colours.
  function contrast(a, b) {
    const lum = (c) => {
      const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  }
  function storageKeys() { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k.sort(); }
  function done() { const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify({ as, results }); document.body.append(pre); }

  async function admin() {
    if (!(await until(listDrawn))) { check("All views is drawn", false, (text("#main") || document.body.textContent).slice(0, 300)); return; }
    // The tab and the side menu.
    const t = tabs();
    check("the tab sits between Commission Engine and DNA Admin", t.indexOf("commission") >= 0 && t.indexOf("commission") + 1 === t.indexOf("spine_dictionary") && t.indexOf("spine_dictionary") + 1 === t.indexOf("dna_admin"), t.join(","));
    check("the tab is labelled and selected", text('#tabs button[data-tool="spine_dictionary"]') === "Spine Dictionary" && $('#tabs button[data-tool="spine_dictionary"]').getAttribute("aria-current") === "true");
    check("the side menu is All views, then the Views group with the three views", JSON.stringify(side()) === JSON.stringify(["All views", "Views", ...NAMES]), JSON.stringify(side()));
    check("the views are menu items", $$("#sidemenu button.menu-item[data-sd-view]").length === 3);
    check("All views is marked", JSON.stringify(marked()) === '["All views"]', JSON.stringify(marked()));
    check("the line above the content says All views", text("#crumb") === "Spine Dictionary / All views", text("#crumb"));
    check("one call, the dictionary op with the token alone", calls().length === 1 && JSON.stringify(calls()[0].args) === "{}" && calls()[0].status === 200, JSON.stringify(calls()));

    // All views: the search box at the top, then each view with its first line.
    const atTop = () => { const f = $("#sd") && $("#sd").firstElementChild; return !!(f && !f.hidden && f.querySelector("input[type=search]")); };
    check("the search box comes first", atTop());
    check("the search box has its label", $("#sd input[type=search]") && $("#sd input[type=search]").labels.length === 1 && $("#sd input[type=search]").labels[0].textContent === "Search all columns", $("#sd input[type=search]") && $("#sd input[type=search]").labels[0] && $("#sd input[type=search]").labels[0].textContent);
    const rows = $$("#sd .sd-views .row").map((r) => [r.querySelector(".t").textContent, r.querySelector(".d").textContent]);
    check("All views lists the three with their first lines", JSON.stringify(rows) === JSON.stringify(NAMES.map((n, i) => [n, FIRST[i]])), JSON.stringify(rows));
    const noneRow = $$("#sd .sd-views .row")[1].querySelector(".d .sd-none");
    check("a view with no comment says No description yet in the muted grey, at 4.5:1 or more", noneRow && noneRow.textContent === NODESC && getComputedStyle(noneRow).color === "rgb(91, 107, 114)" && contrast(getComputedStyle(noneRow).color, "rgb(255, 255, 255)") >= 4.5, noneRow && getComputedStyle(noneRow).color);
    check("each view's name is a button", $$("#sd .sd-views .row .t").every((b) => b.localName === "button" && b.type === "button"));
    check("the footer", text("#sd footer") === "Data class: Amber. The descriptions come from Phil Brook's spine files.", text("#sd footer"));
    check("the heading is the tool's", text("#sd h1") === "Spine Dictionary", text("#sd h1"));

    // The search: matches grouped under their view, nothing asked of the function.
    type("ldz");
    const groups = () => $$("#sd .sd-match");
    check("searching ldz narrows to one view", groups().length === 1 && text("#sd .sd-match h2") === "Example postcode ldz", groups().map((g) => g.textContent).join(" | "));
    const cols = () => $$("#sd .sd-match tbody tr").map((r) => r.cells[0].textContent);
    check("with its ldz column", JSON.stringify(cols()) === '["ldz"]', JSON.stringify(cols()));
    check("the list makes way for the matches", !$("#sd .sd-views"));
    type("LDZ");
    check("the search ignores case", groups().length === 1 && JSON.stringify(cols()) === '["ldz"]');
    type("broker");
    check("broker matches two views", JSON.stringify(groups().map((g) => g.querySelector("h2").textContent)) === JSON.stringify(["Example broker", "Example contract"]), groups().map((g) => g.textContent).join(" | "));
    type("zzz");
    check("no match says so", groups().length === 0 && text("#sd .sd-results") === "Nothing matches that search.", text("#sd .sd-results"));
    type("");
    check("clearing the search brings the list back", listDrawn() && groups().length === 0);
    check("the search asks nothing of the function", calls().length === 1, calls().length);

    // A view picked in the menu.
    viewButton("Example broker").click();
    await until(() => text("#sd h1") === "Example broker");
    check("a view is drawn", text("#sd h1") === "Example broker", text("#sd h1"));
    check("with its first line only", text("#sd .sd-first") === FIRST[0], text("#sd .sd-first"));
    const heads = $$("#sd table thead th").map((th) => th.textContent);
    check("the table is Column and What it means", JSON.stringify(heads) === '["Column","What it means"]', JSON.stringify(heads));
    const table = $$("#sd table tbody tr").map((r) => [r.cells[0].textContent, r.cells[1].textContent]);
    check("the columns in table order", JSON.stringify(table.map((r) => r[0])) === '["broker_id","broker_name","added_on"]', JSON.stringify(table));
    check("text that looks like HTML stays text", table[1] && table[1][1] === "Holds <b>bold</b> text" && !$("#sd tbody b"), JSON.stringify(table[1]));
    const none = $("#sd tbody tr:nth-child(3) .sd-none");
    check("an undescribed column says No description yet", none && none.textContent === "No description yet" && table[2][1] === "No description yet", JSON.stringify(table[2]));
    if (none) {
      const colour = getComputedStyle(none).color;
      check("in the hub's muted grey", colour === "rgb(91, 107, 114)", colour);
      check("at 4.5:1 or more on white", contrast(colour, "rgb(255, 255, 255)") >= 4.5, contrast(colour, "rgb(255, 255, 255)"));
    }
    check("the menu mark moves to the view", JSON.stringify(marked()) === '["Example broker"]', JSON.stringify(marked()));
    check("the line above the content names the view", text("#crumb") === "Spine Dictionary / Views / Example broker", text("#crumb"));
    check("picking a view asks nothing of the function", calls().length === 1, calls().length);

    // A view with no comment: its page says No description yet in the first line, in the muted grey.
    viewButton("Example contract").click();
    await until(() => text("#sd h1") === "Example contract");
    const firstNone = $("#sd .sd-first .sd-none");
    check("a view page with no comment says No description yet", firstNone && text("#sd .sd-first") === NODESC && getComputedStyle(firstNone).color === "rgb(91, 107, 114)", text("#sd .sd-first"));
    viewButton("Example broker").click();
    await until(() => text("#sd h1") === "Example broker");

    // The same search box at the top of a view page: it searches every view, and clearing it
    // returns to the view the person was on, asking nothing of the function.
    check("a view page has the search box at the top", atTop() && $("#sd input[type=search]").value === "");
    type("ldz");
    check("searching from a view finds a column in another view", groups().length === 1 && text("#sd .sd-match h2") === "Example postcode ldz" && JSON.stringify(cols()) === '["ldz"]', groups().map((g) => g.textContent).join(" | "));
    check("the matches replace the view's table", !$("#sd .sd-first") && $$("#sd table").length === 1);
    type("");
    const back = $$("#sd table tbody tr").map((r) => r.cells[0].textContent);
    check("clearing the search returns to the view", text("#sd h1") === "Example broker" && text("#sd .sd-first") === FIRST[0] && JSON.stringify(back) === '["broker_id","broker_name","added_on"]' && groups().length === 0, text("#sd h1") + " " + JSON.stringify(back));
    check("the view stays marked and named above the content", JSON.stringify(marked()) === '["Example broker"]' && text("#crumb") === "Spine Dictionary / Views / Example broker", JSON.stringify(marked()) + " " + text("#crumb"));
    type("space");
    $("#sd .sd-match h2 button").click();
    await until(() => text("#sd h1") === "Example postcode ldz");
    check("a match's view name opens that view and empties the box", text("#sd h1") === "Example postcode ldz" && $("#sd input[type=search]").value === "" && JSON.stringify(marked()) === '["Example postcode ldz"]', text("#sd h1"));
    viewButton("Example broker").click();
    check("searching from a view asks nothing of the function", calls().length === 1, calls().length);
    viewButton("Example postcode ldz").click();
    await until(() => text("#sd h1") === "Example postcode ldz");
    check("another view, without asking again", text("#sd h1") === "Example postcode ldz" && JSON.stringify(marked()) === '["Example postcode ldz"]' && calls().length === 1, text("#sd h1") + " " + calls().length);

    // All views again: the tab asks again, every time it opens.
    allViews().click();
    await until(() => calls().length === 2 && listDrawn());
    check("All views asks again", calls().length === 2 && listDrawn() && JSON.stringify(marked()) === '["All views"]', calls().length + " " + JSON.stringify(marked()));
    check("the Views group is drawn once", side().filter((s) => s === "Views").length === 1 && $$("#sidemenu button[data-sd-view]").length === 3, JSON.stringify(side()));
    // A view's name in All views opens it.
    $$("#sd .sd-views .row .t").find((b) => b.textContent === "Example contract").click();
    await until(() => text("#sd h1") === "Example contract");
    check("a name in All views opens its view", text("#sd h1") === "Example contract" && JSON.stringify(marked()) === '["Example contract"]', text("#sd h1"));
    check("focus goes to the view's heading", document.activeElement === $("#sd h1"));
    check("still no new call", calls().length === 2, calls().length);

    // Storage and the address.
    check("only the hub's token and last place are stored", JSON.stringify(storageKeys()) === JSON.stringify(["dyce.hub.token", "dyce.hub.where"]), storageKeys().join(","));
    check("the last place is the tool and All views", localStorage.getItem("dyce.hub.where") === JSON.stringify({ tool: "spine_dictionary", item: "all" }), localStorage.getItem("dyce.hub.where"));
    check("nothing in sessionStorage", sessionStorage.length === 0);
    check("the address is unchanged", location.hash === "");

    // A failed answer, a malformed one and no answer: the load failure sentence, no Views group.
    const realFetch = window.fetch;
    for (const [what, answer] of [["a server error", () => Promise.resolve(new Response('{"ok":false,"error":"boom"}', { status: 500 }))],
      ["a malformed answer", () => Promise.resolve(new Response('{"ok":true,"views":"none"}', { status: 200 }))],
      ["no answer", () => Promise.reject(new TypeError("Failed to fetch"))]]) {
      window.fetch = (u, init) => (String(u) === SD ? answer() : realFetch(u, init));
      allViews().click();
      await until(() => $("#sd > .msg.refused"));
      check(what + " shows the load failure sentence", text("#sd > .msg") === FAILED && !$("#sidemenu button[data-sd-view]") && !$("#sd .sd-views"), text("#sd > .msg"));
    }
    window.fetch = realFetch;

    // An answer that arrives after a move to another tool is dropped.
    window.__stub.delay.dictionary = 1500;
    allViews().click();
    await sleep(100);
    window.__stub.delay.dictionary = 0;
    $('#tabs button[data-tool="dna_admin"]').click();
    await sleep(2200);
    check("a late answer is dropped", !$("#sd") && !$("#sidemenu button[data-sd-view]") && $('#tabs button[data-tool="dna_admin"]').getAttribute("aria-current") === "true", side().join(","));

    // The tick removed on the server side: opening again shows the refusal.
    window.__stub.untick("spine_dictionary.view");
    $('#tabs button[data-tool="spine_dictionary"]').click();
    await until(() => $("#sd > .msg.refused"));
    check("a refusal shows its sentence", text("#sd > .msg") === REFUSAL && $("#sd > .msg").classList.contains("refused"), text("#sd > .msg"));
    check("and no views", !$("#sidemenu button[data-sd-view]") && !$("#sd .sd-views"));

    // The session ended on the server side: opening again shows the sign-in.
    window.__stub.endSession();
    allViews().click();
    await until(() => !$("#signin").hidden);
    check("an ended session shows the sign-in", !$("#signin").hidden && $("#app").hidden && text("#siMsg") === "Your session has ended. Sign in again.", text("#siMsg"));
    check("and empties the tab", !$("#sd") && $$("#tabs button[data-tool]").length === 0 && $("#sidemenu").childElementCount === 0 && $("#crumb").hidden);
  }

  async function dictionary() {
    if (!(await until(listDrawn))) { check("All views is drawn", false, (text("#main") || document.body.textContent).slice(0, 300)); return; }
    check("the one tab is the Spine Dictionary", JSON.stringify(tabs()) === '["spine_dictionary"]', tabs().join(","));
    check("the three views", JSON.stringify(side()) === JSON.stringify(["All views", "Views", ...NAMES]), JSON.stringify(side()));
  }

  async function viewer() {
    await until(() => $("#tabs button[data-tool]"));
    await sleep(800);
    check("no Spine Dictionary tab without the tick", !$('#tabs button[data-tool="spine_dictionary"]'), tabs().join(","));
    check("no call to the function", calls().length === 0, JSON.stringify(calls()));
    check("the hub falls back to the person's first tool", !$("#sd"));
  }

  (as === "viewer" ? viewer() : as === "dictionary" ? dictionary() : admin()).catch((e) => check("the check ran to the end", false, e && e.stack)).finally(done);
})();
