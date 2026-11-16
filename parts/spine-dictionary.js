  // The Spine Dictionary: every spine view and what each of its columns means, from the comments
  // Phil Brook's spine files put on the views, read from the spine-dictionary function every time
  // the tab opens (no copy is kept between opens). The function answers {ok, views: [{name,
  // description, columns: [{name, description}]}]}, views by name and columns in table order. The
  // views go in the side menu under "Views" after it answers, as DNA Viewer adds an account's
  // sections; picking one draws it from this module's memory without asking again. The search box
  // sits at the top of every page of the tab and searches every view. Every value
  // from the function goes into the page as text (el's text, textContent), never as HTML. Nothing
  // goes into storage or the address bar: the hub keeps only the tool and menu item
  // (dyce.hub.where). sdGen is bumped on sign-out (reset) and on every opening, so an answer that
  // arrives after either is dropped rather than drawn; g, the hub's gen, drops one after a move to
  // another tool or menu item.
  // Inlined into hub.html's script by build.py (the SPINE_DICTIONARY_JS include), after the
  // helpers (SpineDictLib), so it uses the hub's token, me, gen, TOOLS, el, $, say, showSignIn and
  // setCrumb.
  const SD = (() => {
    const SD_ENDPOINT = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/spine-dictionary";
    const FAILED = "The dictionary could not be loaded. Try again shortly.";
    const { friendly, firstLine, search } = SpineDictLib;
    // current: the view shown, or null for All views.
    let sdGen = 0, hubGen = -1, root = null, parts = null, views = null, current = null;

    // ---------- the function. A signedOut answer ends the session as api() does. A refusal (403)
    // shows the function's own sentence; anything else is the one load failure sentence.
    async function call() {
      const t = token;
      let res, j;
      try {
        res = await fetch(SD_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "dictionary", token: t }), signal: AbortSignal.timeout(30000) });
        j = await res.json();
      } catch { throw { message: FAILED }; }
      if (!j || typeof j !== "object") throw { message: FAILED };
      if (res.status === 401 && j.signedOut) { if (t && token === t) showSignIn("Your session has ended. Sign in again."); throw { signedOut: true, message: "Your session has ended. Sign in again." }; }
      if (res.status === 403 && typeof j.error === "string" && j.error) throw { message: j.error };
      if (!res.ok || j.ok !== true) throw { message: FAILED };
      return j;
    }
    const still = (n) => n === sdGen && hubGen === gen && !!me && !!root && root.isConnected;
    // The views as the page uses them: a name each, a comment or null, and named columns with an
    // explanation or null. null when the answer holds no list of views.
    function clean(list) {
      if (!Array.isArray(list)) return null;
      const text = (v) => (typeof v === "string" && v.trim() ? v : null);
      return list.filter((v) => v && typeof v === "object" && typeof v.name === "string" && v.name)
        .map((v) => ({ name: v.name, description: text(v.description),
          columns: (Array.isArray(v.columns) ? v.columns : []).filter((c) => c && typeof c === "object" && typeof c.name === "string" && c.name)
            .map((c) => ({ name: c.name, description: text(c.description) })) }));
    }

    // ---------- the tab: the search box at the top (shown once the views have come), the heading,
    // a message line, the page, the footer
    function build() {
      const box = el("input", { type: "search", id: "sdSearch", autocomplete: "off", spellcheck: "false" });
      const find = el("div", { class: "field sd-search", hidden: true }, el("label", { for: "sdSearch", text: "Search all columns" }), box);
      const h1 = el("h1", { tabindex: "-1" }, "Spine ", el("em", { text: "Dictionary" }));
      const msg = el("div", { class: "msg", role: "status", "aria-live": "polite", hidden: true });
      const body = el("section", { class: "sd-body" });
      const r = el("div", { id: "sd" }, find, h1, msg, body,
        el("footer", { class: "foot", text: "Data class: Amber. The descriptions come from Phil Brook's spine files." }));
      box.addEventListener("input", drawPage);
      parts = { find, box, h1, msg, body };
      return r;
    }

    async function show(item, g) {
      hubGen = g; views = null; current = null;
      const n = ++sdGen;
      root = build(); $("main").append(root);
      say(parts.msg, "Loading…"); root.setAttribute("aria-busy", "true");
      try {
        const r = await call();
        if (!still(n)) return;
        const v = clean(r.views);
        if (!v) throw { message: FAILED };
        views = v;
        say(parts.msg, "");
        drawMenu();
        parts.find.hidden = false;
        drawPage();
      } catch (err) {
        if (still(n) && !(err && err.signedOut)) say(parts.msg, (err && err.message) || FAILED, true);
      } finally { if (still(n)) root.removeAttribute("aria-busy"); }
    }

    // The views in the side menu, under the hub's own All views item.
    function drawMenu() {
      const menu = $("sidemenu");
      for (const x of [...menu.querySelectorAll("[data-sd]")]) x.remove();
      menu.append(el("div", { class: "menu-group", "data-sd": "", text: "Views" }));
      for (const v of views) {
        const b = el("button", { type: "button", class: "menu-item", "data-sd": "", "data-sd-view": v.name, text: friendly(v.name) });
        b.addEventListener("click", () => pick(v.name, false));
        menu.append(b);
      }
    }
    // Marks the menu item for a view, and no other (the hub marked All views when the tab opened).
    function mark(name) {
      for (const b of $("sidemenu").querySelectorAll("button[data-item], button[data-sd-view]")) {
        if (b.dataset.sdView === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      }
    }
    const nameButton = (v, cls) => {
      const b = el("button", { type: "button", class: cls, text: friendly(v.name) });
      b.addEventListener("click", () => pick(v.name, true));
      return b;
    };

    // ---------- what the page shows: while the search box holds a search, the matches across every
    // view grouped under their view; otherwise the view the person is on (current), or All views.
    // Clearing the search returns to that page. Nothing is asked of the function.
    function drawPage() {
      if (!views || !parts) return;
      const query = parts.box.value;
      if (query.trim()) drawResults(query);
      else if (current) drawView(views.find((x) => x.name === current));
      else drawAll();
    }
    function title() { parts.h1.replaceChildren("Spine ", el("em", { text: "Dictionary" })); }
    // All views: each view's name and first line.
    function drawAll() {
      const { body } = parts;
      title(); body.textContent = "";
      if (!views.length) { body.append(el("p", { class: "empty", text: "There are no views yet." })); return; }
      body.append(el("div", { class: "list sd-views" }, ...views.map((v) =>
        el("div", { class: "row" }, el("div", {}, nameButton(v, "t"), el("div", { class: "d" }, firstLine(v.description) || el("span", { class: "sd-none", text: "No description yet" })))))));
    }
    function drawResults(query) {
      const { body } = parts;
      title(); body.textContent = "";
      const results = el("div", { class: "sd-results" });
      body.append(results);
      const found = search(views, query);
      if (!found.length) { results.append(el("p", { class: "empty", text: "Nothing matches that search." })); return; }
      for (const { view, columns } of found) {
        results.append(el("section", { class: "sd-match" },
          el("h2", {}, nameButton(view, "sd-link")),
          firstLine(view.description) ? el("p", { class: "stand", text: firstLine(view.description) }) : null,
          columns.length ? table(columns) : null));
      }
    }

    // ---------- a view: its name, its first line, then each column and what it means. Picking one
    // (from the menu or a name on the page) empties the search box.
    function pick(name, byLink) {
      const v = views && views.find((x) => x.name === name);
      if (!v || !root || !root.isConnected) return;
      current = v.name;
      parts.box.value = "";
      drawView(v);
      mark(v.name);
      setCrumb(TOOLS.find((x) => x.id === "spine_dictionary"), { label: friendly(v.name), group: "Views" });
      if (byLink) { parts.h1.focus({ preventScroll: true }); if (root.getBoundingClientRect().top < 0) root.scrollIntoView(); }
    }
    function drawView(v) {
      const { body, h1 } = parts;
      h1.textContent = friendly(v.name);
      body.textContent = "";
      const first = firstLine(v.description);
      body.append(el("p", { class: "stand sd-first" }, first || el("span", { class: "sd-none", text: "No description yet" })));
      body.append(v.columns.length ? table(v.columns) : el("p", { class: "empty", text: "This view has no columns." }));
    }
    function table(columns) {
      return el("div", { class: "grid-wrap" }, el("table", { class: "ticks sd-table" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Column" }), el("th", { scope: "col", text: "What it means" }))),
        el("tbody", {}, ...columns.map((c) => el("tr", {},
          el("td", { class: "sd-col", text: c.name }),
          el("td", { class: "sd-what" }, c.description == null ? el("span", { class: "sd-none", text: "No description yet" }) : c.description))))));
    }

    // On sign-out nothing from the function stays: showSignIn has emptied #main and the side menu,
    // and answers on their way are dropped.
    function reset() { sdGen++; root = null; parts = null; views = null; current = null; }
    return { show, reset };
  })();
