  // The Commission Engine's pages come from the commission-engine function as HTML it has already
  // escaped: {title, html}, with links as href="/<path>?<query>" and filter forms as
  // <form action="/<path>" method="get"> (ruling R6). The page shows that HTML only after
  // dvSanitise(), the DNA Viewer's allowlist sanitiser, and turns its links and forms into page
  // calls to the function: nothing navigates the hub away and no form is submitted by the browser
  // (form-action 'none'). Only the function's seven pages are followed (PAGES, compared exactly);
  // DNA Viewer's own paths are not widened. Every parameter may repeat (?outcome=Yes&outcome=Maybe),
  // so a query is sent as {name: [values]}. Nothing from these pages goes into storage or the
  // address bar: the hub keeps only the tool and menu item (dyce.hub.where). ceGen is bumped on
  // sign-out (reset) and on every move inside the tab, so an answer that arrives after either is
  // dropped rather than drawn; g, the hub's gen, drops one after a move to another tool or item.
  // Inlined into hub.html's script by build.py (the COMMISSION_JS include), so it uses the hub's token, me,
  // gen, where, TOOLS, el, $, say, explain, showSignIn, setCrumb, keepWhere and dvSanitise.
  const CE = (() => {
    const CE_ENDPOINT = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/commission-engine";
    // The function's pages (core.ts PAGE_PIECE). A link or form to any other address is not followed.
    const PAGES = new Set(["/runs", "/run", "/lines", "/line", "/exceptions", "/decisions", "/decision"]);
    // The side menu item each page sits under, and the page each item opens.
    const ITEM = { "/runs": "runs", "/run": "runs", "/lines": "lines", "/line": "lines", "/exceptions": "exceptions",
      "/decisions": "decisions", "/decision": "decisions" };
    const START = { lines: "/lines", exceptions: "/exceptions", decisions: "/decisions", runs: "/runs" };
    let ceGen = 0, hubGen = -1, root = null, parts = null;

    // ---------- the function. A signedOut answer ends the session as api() does.
    async function call(op, fields) {
      const t = token;
      let res, j;
      try {
        res = await fetch(CE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, token: t, ...fields }), signal: AbortSignal.timeout(30000) });
        j = await res.json();
      } catch { throw { message: "The server did not answer. Check your connection and try again." }; }
      if (!j || typeof j !== "object") throw { message: "Unexpected answer from the server." };
      if (res.status === 401 && j.signedOut) { if (t && token === t) showSignIn("Your session has ended. Sign in again."); throw { signedOut: true, message: "Your session has ended. Sign in again." }; }
      if (!j.ok) throw { message: j.error || "Something went wrong." };
      return j;
    }
    const still = (n) => n === ceGen && hubGen === gen && !!me && !!root && root.isConnected;
    // A list of values under each name. No prototype, so a parameter called __proto__ is just a name.
    function addTo(query, k, v) { if (!query[k]) query[k] = []; query[k].push(v); }
    // A page address as the function takes it: one of PAGES, and every value of every parameter.
    function target(href) {
      let u;
      try { u = new URL(href, "https://ce.invalid"); } catch { return null; }
      if (u.origin !== "https://ce.invalid" || !PAGES.has(u.pathname)) return null;
      const query = Object.create(null);
      for (const [k, v] of u.searchParams) addTo(query, k, v);
      return { path: u.pathname, query };
    }

    // ---------- the tab: the heading, a message line, the page, the footer
    function build() {
      const msg = el("div", { class: "msg", role: "status", "aria-live": "polite", hidden: true });
      const body = el("section", { class: "ce-body" });
      const r = el("div", { id: "ce" }, el("h1", {}, "Commission ", el("em", { text: "Engine" })), msg, body,
        el("footer", { class: "ce-foot", text: "Data class: Red. Source: dyce-prod, the commission tables. Nothing on these pages changes a run, a line or a decision." }));
      parts = { msg, body };
      r.addEventListener("click", onClick);
      r.addEventListener("auxclick", (e) => { const a = e.target.closest("a"); if (a && body.contains(a)) e.preventDefault(); });
      r.addEventListener("submit", onSubmit);
      r.addEventListener("input", onInput);
      return r;
    }

    function show(item, g) {
      hubGen = g; ceGen++;
      root = build(); $("main").append(root);
      go({ path: START[item] || "/lines", query: Object.create(null) }, false);
    }

    // Asks for a page and draws it. moved: a link or form asked for it, so focus goes to its heading.
    async function go(t, moved) {
      const n = ++ceGen;
      say(parts.msg, "Loading…"); root.setAttribute("aria-busy", "true");
      try {
        const r = await call("page", { path: t.path, query: t.query });
        if (!still(n)) return;
        say(parts.msg, "");
        draw(r.page, t);
        if (moved) {
          const h = parts.body.querySelector("h2");
          if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
          if (root.getBoundingClientRect().top < 0) root.scrollIntoView();
        }
      } catch (err) {
        if (still(n) && !(err && err.signedOut)) {
          say(parts.msg, explain(err), true);
          if (moved && parts.msg.getBoundingClientRect().top < 0) parts.msg.scrollIntoView();
        }
      } finally { if (still(n)) root.removeAttribute("aria-busy"); }
    }

    // The title names the page region; the page's own h2 is its heading.
    function draw(page, t) {
      const p = (page && typeof page === "object") ? page : {};
      const { body } = parts;
      body.textContent = "";
      body.setAttribute("aria-label", String(p.title ?? ""));
      body.append(dvSanitise(String(p.html ?? "")));
      // A wide table scrolls in its own box rather than widening the page.
      for (const t of [...body.querySelectorAll("table")]) { const w = el("div", { class: "ce-scroll" }); t.replaceWith(w); w.append(t); }
      const cur = ITEM[t.path];
      for (const b of $("sidemenu").querySelectorAll("button[data-item]")) { if (b.dataset.item === cur) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
      // A link or form that moved the page under another menu item (a line's run, a decision's
      // line): the line above the content and the last place follow it, as showTool would set them.
      if (cur !== where.item) {
        const tool = TOOLS.find((x) => x.id === "commission");
        const it = tool && tool.items.find((x) => x.id === cur);
        if (it) { keepWhere(tool, it); setCrumb(tool, it); }
      }
    }

    // ---------- links, forms and the Broker list's search
    function onClick(e) {
      const a = e.target.closest("a");
      if (!a || !parts || !parts.body.contains(a)) return;
      e.preventDefault();
      const t = target(a.getAttribute("data-dv-href") || "");
      if (t) go(t, true);
    }
    // A filter form is read as the browser would send it, each ticked box and every repeat kept.
    // These pages have no form that posts.
    function onSubmit(e) {
      const f = e.target;
      if (!parts || !parts.body.contains(f)) return;
      e.preventDefault();
      const t = target(f.getAttribute("action") || "");
      if (!t || f.getAttribute("method") !== "get") return;
      const query = Object.create(null);
      for (const [k, v] of new FormData(f)) if (typeof v === "string") addTo(query, k, v);
      go({ path: t.path, query }, true);
    }
    // As the laptop's filter box: typing hides the names that do not match and never hides or
    // unticks a ticked one. Nothing is asked of the function.
    function onInput(e) {
      const s = e.target;
      if (!parts || !s.classList || !s.classList.contains("ce-filter-search") || !parts.body.contains(s)) return;
      const box = s.closest(".ce-filter"); if (!box) return;
      const words = s.value.trim().toLowerCase();
      for (const c of box.querySelectorAll(".ce-filter-choice")) {
        const tick = c.querySelector('input[type="checkbox"]');
        c.hidden = !!words && !(tick && tick.checked) && !c.textContent.toLowerCase().includes(words);
      }
    }

    // On sign-out nothing from these pages stays: showSignIn has emptied #main and the side menu,
    // and answers on their way are dropped.
    function reset() { ceGen++; root = null; parts = null; }
    return { show, reset };
  })();
