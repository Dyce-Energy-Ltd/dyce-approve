  // ---------- DPF figures: the monthly figures the DPF score needs that no other source gives
  // (costs, OPEX, plan targets, Trustpilot, bad debt), typed in or loaded from the Dyce template
  // (design 2026-11-26-dpf-figures-design.md, Phil Brook). Saving a figure is its approval: there is
  // no separate sign-off (Phil Brook, 27/11/2026). Months shows a
  // financial year (June to May) as a grid with each month's status, typed into directly by anyone
  // holding dpf.enter, with the Dyce template (laid out as the grid) downloaded and read back into
  // the grid beside Save changes (Phil Brook, 27/11/2026). Nothing is saved before Save changes.
  // History lists one month's changes. It calls the dpf_* actions of comms.web_call, which
  // check every tick again (dpf.view, dpf.enter), so hiding a control is tidiness.
  // The pure logic (template, workbooks, formats, checks) is dpf/import.js, inlined as DPF_IMPORT;
  // SheetJS is the Pricing tab's PR_XLSX. Inlined into hub.html's script by build.py (the DPF_JS
  // include), so it uses the hub's api, me, gen, ticks, el, $, say, explain and when. Nothing is
  // kept in browser storage: the figures are held in this module's memory and dropped on sign-out.
  const DPF = (() => {
    const I = DPF_IMPORT, X = PR_XLSX;
    // plan_workbook is kept so History still names figures saved by the old workbook uploads.
    const SOURCE_WORDS = { form: "typed in", template: "Dyce template", plan_workbook: "plan workbook" };
    const FY_FIRST = 2024, FY_LAST = 2030; // months allowed: 06/2024 to 05/2031
    const MAX_BYTES = 25 * 1024 * 1024;
    // items: dpf_items, once a session. states: fy_start_year -> the newest dpf_state answer. fy:
    // the year shown. typed: the Months table's boxes as typed, by "YYYY-MM-01|code"; fromFile: the
    // boxes filled from a template, by the same key, holding the file's name (saved with source
    // template). sess is bumped on sign-out, view on every show, so an answer that arrives after
    // either is not drawn.
    let items = null, states = {}, fy = null, typed = {}, fromFile = {}, busy = false;
    let sess = 0, view = 0, hubGen = -1, item = "months", root = null, parts = null, histMonth = null;
    const live = () => hubGen === gen && !!me && !!root && root.isConnected;
    const onView = (n, s0) => n === view && s0 === sess && live();
    const mine = (s) => (s && s.me) || {};
    const canEnter = () => { const s = states[fy]; return s && s.me ? mine(s).can_enter === true : ticks().includes(DPF_ENTER); };
    const sorted = () => I.sortItems(items || []);
    const byCode = (code) => (items || []).find((x) => x.code === code) || null;
    const thisMonth = () => I.monthOf(new Date());
    const nowFy = () => Math.min(FY_LAST, Math.max(FY_FIRST, I.fyStartOf(thisMonth())));
    const monthOfState = (iso) => { const s = states[I.fyStartOf(iso)]; return s ? (s.months || []).find((m) => m.month === iso) || null : null; };
    // A dpf_state answer (dpf_save answers one too).
    function take(s) {
      if (s && typeof s === "object" && Array.isArray(s.months) && Number.isInteger(s.fy_start_year)) states[s.fy_start_year] = s;
      else if (s && s.state) take(s.state);
    }
    async function state(y) { const s = await api("dpf_state", y == null ? {} : { fy_start_year: y }); take(s); return s; }
    async function ensureItems() {
      if (items) return;
      const r = await api("dpf_items");
      items = Array.isArray(r && r.items) ? r.items : [];
    }
    const who = (e) => (e && e.by ? `${e.by}, ${when(e.at)}${e.source ? ", " + (SOURCE_WORDS[e.source] || e.source) : ""}` : "");

    // ---------- the tool: heading, a line, a message line and the screen
    function show(it, g) {
      hubGen = g; item = it === "history" ? "history" : "months";
      const n = ++view, s0 = sess;
      typed = {}; fromFile = {}; busy = false;
      const msg = el("div", { class: "msg", role: "status", "aria-live": "polite", hidden: true, style: "margin-top:14px" });
      const body = el("div");
      const stand = item === "history" ? "Every change to a month's figures, newest first, at most 200. Times are UK time."
        : "The figures the DPF score needs each month: costs, OPEX, the plan targets, Trustpilot and bad debt. Saving a figure approves it: there is no separate sign-off.";
      root = el("div", { id: "dpf" }, el("h1", {}, "DPF ", el("em", { text: "figures" })), el("p", { class: "stand", text: stand }), msg, body);
      parts = { msg, body };
      $("main").append(root);
      say(msg, "Loading…");
      (async () => {
        try {
          await ensureItems();
          if (!onView(n, s0)) return;
          if (item === "history") { say(msg, ""); drawHistory(n, s0); return; }
          // The first time, the database chooses the year (the one holding today).
          const s = await state(fy);
          if (!onView(n, s0)) return;
          if (fy == null) fy = s && Number.isInteger(s.fy_start_year) ? s.fy_start_year : nowFy();
          say(msg, "");
          drawMonths();
        } catch (err) { if (onView(n, s0) && !(err && err.signedOut)) say(msg, explain(err), true); }
      })();
    }
    function redraw() { if (!live() || !parts) return; if (item === "months") drawMonths(); }

    // ---------- Months: the financial year as a grid
    function yearBar(onMove) {
      const prev = el("button", { type: "button", class: "btn ghost small dpf-step", "data-dpf": "prev", "aria-label": "Previous year", title: "Previous year", text: "\u2039", disabled: fy <= FY_FIRST || busy });
      const next = el("button", { type: "button", class: "btn ghost small dpf-step", "data-dpf": "next", "aria-label": "Next year", title: "Next year", text: "\u203a", disabled: fy >= FY_LAST || busy });
      prev.addEventListener("click", () => onMove(fy - 1));
      next.addEventListener("click", () => onMove(fy + 1));
      return el("div", { class: "dpf-year" }, prev, el("h2", { id: "dpfYear", text: I.fyLabel(fy) }), next);
    }
    async function moveYear(y) {
      const n = view, s0 = sess;
      fy = y; typed = {}; fromFile = {};
      if (!states[y]) {
        say(parts.msg, "Loading…");
        try { await state(y); } catch (err) { if (onView(n, s0) && !(err && err.signedOut)) say(parts.msg, explain(err), true); return; }
        if (!onView(n, s0)) return;
      }
      say(parts.msg, ""); drawMonths();
    }

    function drawMonths() {
      const s = states[fy], body = parts.body;
      body.textContent = "";
      if (!s) { body.append(el("p", { class: "empty", text: "This year could not be read." })); return; }
      const its = sorted(), months = Array.isArray(s.months) ? s.months : [], enter = canEnter();
      body.append(el("div", { class: "dpf-toolbar" }, yearBar(moveYear), enter ? saveBar() : null));
      // Each month's heading carries its status: complete, or how many figures are missing, with a
      // thin line filling as figures arrive. The current month is marked.
      const now = thisMonth(), total = its.length || 1;
      const head = el("tr", {}, el("th", { scope: "col", class: "dpf-item dpf-corner", text: "Item" }));
      for (const m of months) {
        const st = I.monthStatus(m), missing = Array.isArray(m.missing) ? m.missing.length : 0;
        const share = Math.max(0, Math.min(100, Math.round((1 - missing / total) * 100)));
        head.append(el("th", { scope: "col", class: "dpf-m " + st.kind + (m.month === now ? " now" : ""), "data-month": m.month },
          el("span", { class: "dpf-mname", text: I.monthName(m.month) }),
          el("span", { class: "dpf-mstate", text: st.text, title: m.month === now ? "This month" : null }),
          el("span", { class: "dpf-meter", "aria-hidden": "true" }, el("span", { style: `width:${share}%` }))));
      }
      const tb = el("tbody");
      for (const kind of ["actual", "plan"]) {
        const group = its.filter((x) => (x.kind === "plan" ? "plan" : "actual") === kind);
        if (!group.length) continue;
        tb.append(el("tr", { class: "dpf-group" }, el("th", { scope: "colgroup", colspan: String(months.length + 1) },
          el("span", { text: kind === "plan" ? "Plan" : "Actuals" }))));
        for (const it of group) {
          const tr = el("tr", { "data-code": it.code }, el("th", { scope: "row", class: "dpf-item" }, el("span", { text: String(it.label) }), " ", el("span", { class: "dpf-unit", text: String(it.unit ?? "") })));
          for (const m of months) {
            const v = (m.figures || {})[it.code], has = v != null;
            const e = (m.entered || {})[it.code];
            const tip = has ? (who(e) ? "Entered by " + who(e) : null) : "Not entered";
            const td = el("td", { class: "dpf-v" + (has ? "" : " gap") + (m.month === now ? " now" : ""), "data-month": m.month, title: tip });
            if (enter) td.append(cellBox(it, m, td));
            else td.textContent = has ? I.formatValue(it, v) : "–";
            tr.append(td);
          }
          tb.append(tr);
        }
      }
      const cols = el("colgroup", {}, el("col", { class: "dpf-col-item" }), ...months.map(() => el("col")));
      body.append(el("div", { class: "grid-wrap dpf-wrap" }, el("table", { class: "dpf-grid" }, cols, el("thead", {}, head), tb)));
      refreshBar();
    }

    // One box per figure. What is typed is kept in typed["YYYY-MM-01|code"] until Save changes or
    // Discard, so drawing the grid again (after a refusal) keeps it.
    function cellBox(it, m, td) {
      const key = m.month + "|" + it.code, held = (m.figures || {})[it.code];
      const input = el("input", { type: "text", inputmode: "decimal", autocomplete: "off", class: "dpf-in", "data-month": m.month, "data-code": it.code,
        "aria-label": `${it.label}, ${I.monthName(m.month)}`, placeholder: "–", disabled: busy });
      input.value = Object.prototype.hasOwnProperty.call(typed, key) ? typed[key] : I.inputValue(it, held);
      const mark = () => {
        const has = Object.prototype.hasOwnProperty.call(typed, key);
        const v = has ? I.parseNumber(typed[key]) : null;
        const bad = has && (Number.isNaN(v) || (v !== null && !!I.checkValue(it, v)));
        const changed = has && !bad && (v === null ? held != null : Number(held) !== v || held == null);
        td.classList.toggle("chg", changed);
        td.classList.toggle("bad", bad);
        input.setAttribute("aria-invalid", bad ? "true" : "false");
      };
      input.addEventListener("input", () => { typed[key] = input.value; delete fromFile[key]; mark(); refreshBar(); });
      // On the way in the whole figure is selected, so typing replaces it (Phil Brook, 27/11/2026). A
      // click would otherwise drop the caret where it landed, so the mouseup after a focus is ignored.
      let fresh = false;
      input.addEventListener("focus", () => { input.select(); fresh = true; });
      input.addEventListener("mouseup", (e) => { if (fresh) { e.preventDefault(); fresh = false; } });
      // On the way out a typed figure is written as its row shows figures: a pound sign and
      // thousands for GBP, a % for a percentage. Anything that is not a number is left as typed,
      // and marked.
      input.addEventListener("blur", () => {
        fresh = false;
        if (!Object.prototype.hasOwnProperty.call(typed, key)) return;
        const v = I.parseNumber(input.value);
        if (v === null || Number.isNaN(v)) return;
        const shown = I.inputValue(it, v);
        if (shown !== input.value) { input.value = shown; typed[key] = shown; }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { delete typed[key]; delete fromFile[key]; input.value = I.inputValue(it, held); mark(); refreshBar(); e.preventDefault(); return; }
        if (e.key !== "Enter") return;
        e.preventDefault();
        const boxes = [...parts.body.querySelectorAll(`input.dpf-in[data-month="${m.month}"]`)];
        const next = boxes[boxes.indexOf(input) + (e.shiftKey ? -1 : 1)];
        if (next) { next.focus(); next.select(); }
      });
      mark();
      return input;
    }

    // What the table would save: each month's changed figures (as the month form sends them) and
    // the problems, each named with its month, stopped in the page before anything is sent.
    function gridChanges() {
      const byMonth = {}, problems = [];
      const typedBy = {};
      for (const [key, v] of Object.entries(typed)) {
        const [iso, code] = key.split("|");
        (typedBy[iso] = typedBy[iso] || {})[code] = v;
      }
      for (const iso of Object.keys(typedBy).sort()) {
        const m = monthOfState(iso) || { figures: {} };
        const r = I.formChanges(items, m.figures || {}, typedBy[iso]);
        for (const p of r.problems) problems.push(`${I.monthName(iso)}, ${p}`);
        if (Object.keys(r.values).length) byMonth[iso] = r.values;
      }
      return { byMonth, problems };
    }
    const pending = () => { const g = gridChanges(); return Object.values(g.byMonth).reduce((n, v) => n + Object.keys(v).length, 0) + g.problems.length; };

    // The bar above the table: how many changes are waiting, Save changes and Discard, then the
    // template: Download template (the year shown, with the figures held) and Choose file (a filled-in
    // template, read into the table). While any change waits, the year cannot be moved.
    function saveBar() {
      const count = el("span", { class: "dpf-pending", id: "dpfPending" });
      const save = el("button", { type: "button", class: "btn small", "data-dpf": "save", text: "Save changes" });
      const discard = el("button", { type: "button", class: "btn ghost small", "data-dpf": "discard", text: "Discard" });
      const dl = el("button", { type: "button", class: "btn ghost small", "data-dpf": "download", text: "Download template" });
      const file = el("input", { type: "file", id: "dpfTemplate", accept: ".xlsx,.csv", hidden: true });
      const choose = el("button", { type: "button", class: "btn ghost small", "data-dpf": "choose", text: "Choose file" });
      save.addEventListener("click", saveGrid);
      discard.addEventListener("click", () => { typed = {}; fromFile = {}; say(parts.msg, ""); drawMonths(); });
      dl.addEventListener("click", () => downloadTemplate(dl));
      choose.addEventListener("click", () => file.click());
      file.addEventListener("change", () => loadTemplate(file));
      return el("div", { class: "dpf-savebar" },
        el("span", { class: "dpf-tpl" }, dl, choose, file),
        el("span", { class: "dpf-commit" }, count, discard, save));
    }
    function refreshBar() {
      if (!parts) return;
      const n = pending(), bar = parts.body.querySelector(".dpf-savebar");
      if (bar) {
        const p = bar.querySelector(".dpf-pending");
        p.textContent = n === 0 ? "No unsaved changes." : n === 1 ? "1 unsaved change." : `${n} unsaved changes.`;
        p.classList.toggle("has", n > 0);
        for (const b of bar.querySelectorAll('[data-dpf="save"], [data-dpf="discard"]')) b.disabled = busy || n === 0;
        for (const b of bar.querySelectorAll('[data-dpf="download"], [data-dpf="choose"]')) b.disabled = busy;
      }
      for (const b of parts.body.querySelectorAll('[data-dpf="prev"], [data-dpf="next"]')) {
        const edge = (b.dataset.dpf === "prev" && fy <= FY_FIRST) || (b.dataset.dpf === "next" && fy >= FY_LAST);
        b.disabled = busy || n > 0 || edge;
        b.title = n > 0 ? "Save or discard your changes first." : "";
      }
    }

    // Save changes: dpf_save a month at a time, in month order, each with only its changed figures:
    // those filled from a template with source template and the file's name, those typed with
    // source form, so History says which. A refusal stops it there: the months before are saved,
    // that month and those after keep what was typed, and the database's sentence shows.
    async function saveGrid() {
      if (busy) return;
      const g = gridChanges();
      if (g.problems.length) { say(parts.msg, g.problems.join(" "), true); return; }
      const months = Object.keys(g.byMonth).sort();
      if (!months.length) { typed = {}; say(parts.msg, "Nothing has changed."); drawMonths(); return; }
      const n = view, s0 = sess, saved = [];
      let total = 0, at = null;
      busy = true; say(parts.msg, "Saving…"); redraw();
      try {
        for (const iso of months) {
          at = iso;
          // One save for each file the month's figures came from, then one for the typed ones.
          const groups = new Map();
          for (const [code, v] of Object.entries(g.byMonth[iso])) {
            const f = fromFile[iso + "|" + code] || "";
            if (!groups.has(f)) groups.set(f, {});
            groups.get(f)[code] = v;
          }
          let c = 0;
          for (const [f, values] of [...groups].sort((a, b) => (a[0] === "") - (b[0] === ""))) {
            const r = await api("dpf_save", f ? { month: iso, values, source: "template", source_file: f } : { month: iso, values, source: "form" });
            if (s0 !== sess) return;
            take(r);
            c += Number.isInteger(r && r.changed) ? r.changed : Object.keys(values).length;
          }
          total += c;
          for (const key of Object.keys(typed)) if (key.startsWith(iso + "|")) { delete typed[key]; delete fromFile[key]; }
          saved.push(I.monthName(iso));
        }
        busy = false;
        if (n === view && live()) {
          say(parts.msg, `Saved ${total} ${total === 1 ? "figure" : "figures"}: ${saved.join(", ")}.`);
          redraw();
        }
      } catch (err) {
        if (s0 !== sess) return;
        busy = false;
        if (err && err.signedOut) return;
        if (n === view && live()) say(parts.msg, (saved.length ? `Saved ${saved.join(", ")}. ` : "") + `${I.monthName(at)} was not saved: ${explain(err)}`, true);
        try { await state(fy); } catch { /* the refusal is already shown */ }
        if (n === view && live()) redraw();
      }
    }

    // ---------- The Dyce template, on the Months screen
    async function bytesOf(input) {
      const f = input.files && input.files[0];
      if (!f) return null;
      if (f.size > MAX_BYTES) return { name: f.name, problem: "The file is larger than 25 MB." };
      return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
    }

    async function downloadTemplate(button) {
      const n = view, s0 = sess, y = fy;
      button.disabled = true; say(parts.msg, "");
      try {
        const s = await state(y);
        if (!onView(n, s0)) return;
        const bytes = I.buildTemplate(X, items, Array.isArray(s.months) ? s.months : I.fyMonths(y));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const a = el("a", { href: url, download: `dpf-figures-${y}-${String((y + 1) % 100).padStart(2, "0")}.xlsx`, hidden: true });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { if (onView(n, s0) && !(err && err.signedOut)) say(parts.msg, explain(err), true); }
      finally { button.disabled = busy; }
    }

    // A filled-in template, read into the table as unsaved changes: every problem listed and
    // nothing loaded if there is one; a blank cell leaves the figure as it is; a figure equal to the
    // one held changes nothing. The figures are then checked and saved with Save changes.
    async function loadTemplate(input) {
      const n = view, s0 = sess;
      const f = await bytesOf(input);
      input.value = "";
      if (!f || !onView(n, s0)) return;
      if (f.problem) { say(parts.msg, f.problem, true); return; }
      const read = I.readTemplate(X, f.bytes, f.name, items);
      const year = read.problems.length ? read : I.rowsForYear(read.rows, fy);
      if (year.problems.length) {
        const k = year.problems.length;
        say(parts.msg, `${f.name}: ${k} ${k === 1 ? "problem" : "problems"}, so nothing was loaded. ` + year.problems.join(" "), true);
        return;
      }
      let differ = 0;
      for (const r of year.rows) {
        const key = r.month + "|" + r.code, it = byCode(r.code), m = monthOfState(r.month) || { figures: {} };
        const held = (m.figures || {})[r.code];
        if (held == null || Number(held) !== r.value) differ++;
        typed[key] = I.inputValue(it, r.value);
        fromFile[key] = f.name;
      }
      drawMonths();
      say(parts.msg, `Loaded ${year.rows.length} ${year.rows.length === 1 ? "figure" : "figures"} from ${f.name}, ${differ} different from what is held. Check them in the table, then press Save changes.`);
    }

    // ---------- History: one month's changes
    function drawHistory(n0, s00) {
      const body = parts.body; body.textContent = "";
      const sel = el("select", { id: "dpfHistMonth" });
      for (let y = FY_FIRST; y <= FY_LAST; y++) for (const iso of I.fyMonths(y)) sel.append(el("option", { value: iso, text: I.monthName(iso) }));
      const start = thisMonth();
      sel.value = histMonth || (I.inRange(start) ? start : I.MONTH_MAX);
      const list = el("div", { class: "list" });
      body.append(el("div", { class: "field dpf-upyear" }, el("label", { for: "dpfHistMonth", text: "Month" }), sel), el("div", { class: "section" }, list));
      const load = async () => {
        const n = view, s0 = sess, iso = sel.value;
        histMonth = iso; loading(list);
        let r;
        try { r = await api("dpf_history", { month: iso }); } catch (err) { if (onView(n, s0) && !(err && err.signedOut)) { list.textContent = ""; say(parts.msg, explain(err), true); } return; }
        if (!onView(n, s0) || sel.value !== iso) return;
        say(parts.msg, "");
        const cs = Array.isArray(r && r.changes) ? r.changes : [];
        list.textContent = "";
        if (!cs.length) { list.append(el("div", { class: "empty", text: `No changes recorded for ${I.monthName(iso)}.` })); return; }
        for (const c of cs) {
          const it = byCode(c.item_code) || { label: c.label || c.item_code, unit: "" };
          const f = (v) => (v == null ? "" : I.formatValue(it, v));
          const what = !c.item_code ? (c.note || "Month changed")
            : c.old_value == null ? `${it.label}: ${f(c.new_value)} entered`
            : c.new_value == null ? `${it.label}: cleared (was ${f(c.old_value)})`
            : `${it.label}: ${f(c.old_value)} to ${f(c.new_value)}`;
          const how = [c.changed_by, when(c.changed_at), c.source ? (SOURCE_WORDS[c.source] || c.source) + (c.source_file ? ` (${c.source_file})` : "") : null].filter(Boolean).join(", ");
          list.append(el("div", { class: "row" }, el("div", {}, el("div", { class: "t", text: what }), el("div", { class: "d", text: how }),
            c.item_code && c.note ? el("div", { class: "d", text: c.note }) : null)));
        }
      };
      sel.addEventListener("change", load);
      load();
    }

    // On sign-out nothing read or typed here stays in the page: showSignIn has emptied #main and the
    // side menu; answers on their way are dropped.
    function reset() { sess++; view++; items = null; states = {}; fy = null; typed = {}; fromFile = {}; busy = false; histMonth = null; root = null; parts = null; }
    return { show, reset };
  })();
