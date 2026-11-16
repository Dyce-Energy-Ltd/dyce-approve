  // The Commission Engine's pages come from the commission-engine function as HTML it has already
  // escaped: {title, html}, with links as href="/<path>?<query>" and filter forms as
  // <form action="/<path>" method="get"> (ruling R6). The page shows that HTML only after
  // dvSanitise(), the DNA Viewer's allowlist sanitiser, and turns its links and forms into page
  // calls to the function: nothing navigates the hub away and no form is submitted by the browser
  // (form-action 'none'). Only the function's pages are followed (PAGES, compared exactly);
  // DNA Viewer's own paths are not widened. Every parameter may repeat (?outcome=Yes&outcome=Maybe),
  // so a query is sent as {name: [values]}. Nothing from these pages goes into storage or the
  // address bar: the hub keeps only the tool and menu item (dyce.hub.where). ceGen is bumped on
  // sign-out (reset) and on every move inside the tab, so an answer that arrives after either is
  // dropped rather than drawn; g, the hub's gen, drops one after a move to another tool or item.
  //
  // Piece 2 (deciding). A form with method="post" is sent as the function's act op,
  // {action, fields}, the action named by the form's path (ACT) and every field kept with its
  // repeats; the Lines grid's Decision dropdown saves Yes picked with the mouse or touch on change,
  // and waits for Save (or Enter) after No or a change from the keyboard. The function answers {go, message}:
  // the page goes to go and shows message, as text in the message line. When go is the page already
  // shown, it is drawn again where it was, and focus goes back to the row whose dropdown saved. A
  // refusal shows its sentence and draws the page shown again, in place. While a call is on its way
  // every control on the page is disabled by the DOM (the sanitiser drops a disabled attribute).
  // Inlined into hub.html's script by build.py (the COMMISSION_JS include), so it uses the hub's token, me,
  // gen, where, TOOLS, el, $, say, explain, showSignIn, setCrumb, keepWhere and dvSanitise.
  const CE = (() => {
    const CE_ENDPOINT = "https://rlpnbwjppylhcpybpqim.supabase.co/functions/v1/commission-engine";
    // The function's pages (core.ts PAGE_PIECE). A link or form to any other address is not followed.
    const PAGES = new Set(["/runs", "/run", "/lines", "/line", "/exceptions", "/decisions", "/decision", "/decide", "/set-broker", "/choose-broker", "/resolve"]);
    // A form that posts is an act call; its path names the action. /uplift is a form action only, never a page.
    const ACT = { "/decide": "decide", "/uplift": "enter_uplift", "/set-broker": "set_broker", "/choose-broker": "choose_broker", "/resolve": "resolve" };
    // The side menu item each page sits under, and the page each item opens.
    const ITEM = { "/runs": "runs", "/run": "runs", "/lines": "lines", "/line": "lines", "/exceptions": "exceptions",
      "/decisions": "decisions", "/decision": "decisions", "/decide": "lines", "/set-broker": "exceptions",
      "/choose-broker": "exceptions", "/resolve": "exceptions" };
    const START = { lines: "/lines", exceptions: "/exceptions", decisions: "/decisions", runs: "/runs" };
    // What the function counts as blank in a reason (pystr.ts BLANK_CHARACTERS, the laptop's
    // decisions.BLANK_CHARACTERS), and the laptop's sentence for a No without one (deciding.ts).
    const BLANK = " \u00a0\t\r\n";
    const NO_REASON = "Withholding payment needs a stated reason. This is the row that stops a broker being paid, and a blank reason is the one decision nobody can review later.";
    let ceGen = 0, hubGen = -1, root = null, parts = null, shown = null;

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
    // The act action a form's path names, or null: a bare path, compared exactly.
    function actionOf(href) {
      let u;
      try { u = new URL(href, "https://ce.invalid"); } catch { return null; }
      if (u.origin !== "https://ce.invalid" || u.search || u.hash || !Object.hasOwn(ACT, u.pathname)) return null;
      return ACT[u.pathname];
    }
    // A page as an address the function reads back (the dropdown's next), and as a key that is the
    // same however the parameters are ordered (is go the page shown?).
    function hrefOf(t) {
      const p = new URLSearchParams();
      for (const k of Object.keys(t.query)) for (const v of t.query[k]) p.append(k, v);
      const q = p.toString();
      return q ? t.path + "?" + q : t.path;
    }
    function keyOf(t) {
      const p = new URLSearchParams();
      for (const k of Object.keys(t.query).sort()) for (const v of t.query[k]) p.append(k, v);
      return t.path + "?" + p.toString();
    }
    // Blank as the function counts it: nothing left once the five characters are taken off both ends.
    function blank(v) {
      let a = 0, b = v.length;
      while (a < b && BLANK.includes(v[a])) a++;
      while (b > a && BLANK.includes(v[b - 1])) b--;
      return a === b;
    }

    // ---------- the tab: the heading, a message line, the page, the footer
    function build() {
      const msg = el("div", { class: "msg", role: "status", "aria-live": "polite", hidden: true });
      const body = el("section", { class: "ce-body" });
      const r = el("div", { id: "ce" }, el("h1", {}, "Commission ", el("em", { text: "Engine" })), msg, body,
        el("footer", { class: "ce-foot", text: "Data class: Red. Source: dyce-prod, the commission tables. Decisions, uplifts, brokers and resolutions you save here are written to dyce-prod straight away." }));
      parts = { msg, body };
      r.addEventListener("click", onClick);
      r.addEventListener("auxclick", (e) => { const a = e.target.closest("a"); if (a && body.contains(a)) e.preventDefault(); });
      r.addEventListener("submit", onSubmit);
      r.addEventListener("input", onInput);
      r.addEventListener("change", onChange);
      r.addEventListener("keydown", onKeydown);
      r.addEventListener("pointerdown", onPoint);
      r.addEventListener("mousedown", onPoint);
      return r;
    }

    function show(item, g) {
      hubGen = g; ceGen++;
      root = build(); $("main").append(root);
      go({ path: START[item] || "/lines", query: Object.create(null) }, false);
    }

    // Asks for a page and draws it. moved: a link or form asked for it, so focus goes to its heading.
    // after (an act's answer): the sentence to show once the page is drawn, refused or not, and,
    // when the page is the one shown before, where it was (keep) and the row to focus (line).
    async function go(t, moved, after) {
      const n = ++ceGen;
      say(parts.msg, "Loading…"); root.setAttribute("aria-busy", "true");
      try {
        const r = await call("page", { path: t.path, query: t.query });
        if (!still(n)) return;
        say(parts.msg, after ? after.text : "", !!(after && after.refused));
        draw(r.page, t);
        if (after && after.keep) back(after.keep, after.line);
        else if (moved) {
          const h = parts.body.querySelector("h2");
          if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
          if (root.getBoundingClientRect().top < 0) root.scrollIntoView();
        }
      } catch (err) {
        if (still(n) && !(err && err.signedOut)) {
          // The page shown stays; after an act its controls are freed and its sentence is kept.
          if (after) free();
          say(parts.msg, after && after.text ? after.text + " " + explain(err) : explain(err), true);
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
      shown = t;
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

    // ---------- acting: the act op, the controls held while it is on its way, and back where it was
    const controls = () => parts.body.querySelectorAll("input, select, button");
    // Every control on the page held, or freed. By the DOM: the sanitiser lets no disabled through.
    function hold() { for (const c of controls()) c.disabled = true; }
    function free() { for (const c of controls()) c.disabled = false; }
    // Where the page is: the window's scroll and each wide table's.
    function place() { return { y: window.scrollY, x: [...parts.body.querySelectorAll(".ce-scroll")].map((s) => s.scrollLeft) }; }
    function back(keep, line) {
      window.scrollTo(window.scrollX, keep.y);
      [...parts.body.querySelectorAll(".ce-scroll")].forEach((s, i) => { if (i < keep.x.length) s.scrollLeft = keep.x[i]; });
      const s = line ? parts.body.querySelector(`.ce-decide[data-line="${CSS.escape(line)}"] select`) : null;
      const h = parts.body.querySelector("h2");
      if (s) s.focus({ preventScroll: true });
      else if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    // Sends one action. line: the row whose dropdown sent it, focused again when the page comes back.
    async function act(action, fields, line) {
      const from = shown;
      if (!from) return;
      const n = ++ceGen;
      const keep = place();
      hold(); root.setAttribute("aria-busy", "true");
      say(parts.msg, "Saving…");
      let r;
      try {
        r = await call("act", { action, fields });
      } catch (err) {
        if (!still(n) || (err && err.signedOut)) return;
        // Refused: the sentence, and the page shown drawn again where it was.
        go(from, false, { text: explain(err), refused: true, keep, line });
        return;
      }
      if (!still(n)) return;
      const message = typeof r.message === "string" ? r.message : "";
      const t = target(typeof r.go === "string" ? r.go : "") || from;
      // The page shown, or the form's own next on the same path: the function writes next as "this
      // page" with run=<month> first (exceptions.ts herePath), while the menu opened it with no query.
      const own = fields.next && fields.next.length ? target(fields.next[0]) : null;
      const same = keyOf(t) === keyOf(from) || (!!own && t.path === from.path && keyOf(own) === keyOf(t));
      go(t, !same, { text: message, keep: same ? keep : null, line: same ? line : null });
    }

    // The Lines grid's Decision dropdown (Phil Brook, 16/11/2026): a nameless select in a
    // .ce-decide holding the line (data-line) and the decision the page showed (data-seen, blank when
    // undecided). The value it was drawn with is the option drawn selected.
    const drawnValue = (s) => { const o = [...s.options].find((x) => x.defaultSelected); return o ? o.value : ""; };
    function decide(box, pay, reason) {
      const line = box.getAttribute("data-line") || "";
      act("decide", { seen: [line + ":" + (box.getAttribute("data-seen") || "")], decided_pay: [pay], reason: [reason], next: [hrefOf(shown)] }, line);
    }
    // Save (or Enter): Yes as it is; No with its reason, stopped here when the reason is blank.
    function save(box) {
      const s = box.querySelector("select");
      const i = box.querySelector(".ce-decide-reason input");
      if (!s || s.value === drawnValue(s)) return;
      if (s.value === "Yes") { decide(box, "Yes", ""); return; }
      if (s.value !== "No") return;
      const reason = i ? i.value : "";
      if (blank(reason)) { say(parts.msg, NO_REASON, true); if (i) i.focus(); return; }
      decide(box, "No", reason);
    }
    // How each select was last worked: "pointer" (mouse, pen or touch) or "key". Chrome and Edge on
    // Windows fire change on every arrow key on a closed select, so a keyboard user passing Yes on
    // the way to No must not write Yes (ruling, 16/11/2026). Unknown counts as the keyboard.
    const how = new WeakMap();
    function onPoint(e) {
      const s = e.target && e.target.closest ? e.target.closest("select") : null;
      if (s && parts && parts.body.contains(s)) how.set(s, "pointer");
    }
    // Yes picked with the mouse or touch is saved at once (Phil Brook, 16/11/2026). Yes reached from
    // the keyboard shows Save and waits for it (or Enter). No shows the reason box, focused, and
    // waits. The value it was drawn with puts the row back as drawn.
    function onChange(e) {
      const s = e.target;
      if (!parts || s.tagName !== "SELECT" || !parts.body.contains(s)) return;
      const box = s.closest(".ce-decide[data-ce-decide]");
      if (!box) return;
      const by = how.get(s);
      how.delete(s);
      const why = box.querySelector(".ce-decide-reason");
      const i = why ? why.querySelector("input") : null;
      if (i) i.hidden = false;
      if (s.value === drawnValue(s)) { if (why) why.hidden = true; return; }
      if (s.value === "No") {
        if (why) why.hidden = false;
        if (i) i.focus();
        return;
      }
      if (s.value !== "Yes") return;
      if (by === "pointer") { if (why) why.hidden = true; decide(box, "Yes", ""); return; }
      if (why) why.hidden = false;
      if (i) i.hidden = true;
    }
    // A key on a row's select marks it as worked from the keyboard; Enter there, or in the row's
    // reason box, saves the row. Enter never sends the bulk form the grid sits in.
    function onKeydown(e) {
      const i = e.target;
      if (!parts || !i.closest || !parts.body.contains(i)) return;
      const box = i.closest(".ce-decide[data-ce-decide]");
      if (!box) return;
      if (i.tagName === "SELECT") how.set(i, "key");
      if (e.key !== "Enter" || !(i.tagName === "SELECT" || i.closest(".ce-decide-reason"))) return;
      e.preventDefault();
      save(box);
    }

    // ---------- links, forms and the Broker list's search
    function onClick(e) {
      if (!parts) return;
      const b = e.target.closest("button[data-ce-save]");
      if (b && parts.body.contains(b)) { const box = b.closest(".ce-decide[data-ce-decide]"); if (box) save(box); return; }
      const a = e.target.closest("a");
      if (!a || !parts.body.contains(a)) return;
      e.preventDefault();
      const t = target(a.getAttribute("data-dv-href") || "");
      if (t) go(t, true);
    }
    // A form is read as the browser would send it, each ticked box and every repeat kept, with the
    // button that sent it (the bulk form's Yes or No). A get form asks for a page; a post form is an
    // act call. (Enter in a row's reason box is taken by onKeydown, so it never sends the bulk form.)
    function onSubmit(e) {
      const f = e.target;
      if (!parts || !parts.body.contains(f)) return;
      e.preventDefault();
      const fields = Object.create(null);
      for (const [k, v] of new FormData(f, e.submitter || null)) if (typeof v === "string") addTo(fields, k, v);
      const method = f.getAttribute("method");
      if (method === "post") {
        const action = actionOf(f.getAttribute("action") || "");
        if (action) act(action, fields, null);
        return;
      }
      const t = target(f.getAttribute("action") || "");
      if (!t || method !== "get") return;
      go({ path: t.path, query: fields }, true);
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
    function reset() { ceGen++; root = null; parts = null; shown = null; }
    return { show, reset };
  })();
