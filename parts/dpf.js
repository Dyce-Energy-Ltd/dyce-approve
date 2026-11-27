  // ---------- DPF figures: the monthly figures the DPF score needs that no other source gives
  // (costs, OPEX, plan targets, Trustpilot, bad debt), entered by hand or uploaded, and signed off
  // a month at a time (design 2026-11-26-dpf-figures-design.md, Phil Brook). Months shows a
  // financial year (June to May) as a grid with each month's status, typed into directly by anyone
  // holding dpf.enter (Phil Brook, 27/11/2026); Upload reads the Dyce template (laid out as the grid),
  // Carl's five-year plan workbook or the DPF workbook into a preview and saves nothing before
  // Save; History lists one month's changes. It calls the dpf_* actions of comms.web_call, which
  // check every tick again (dpf.view, dpf.enter, dpf.sign_off), so hiding a control is tidiness.
  // The pure logic (template, workbooks, formats, checks) is dpf/import.js, inlined as DPF_IMPORT;
  // SheetJS is the Pricing tab's PR_XLSX. Inlined into hub.html's script by build.py (the DPF_JS
  // include), so it uses the hub's api, me, gen, ticks, el, $, say, explain and when. Nothing is
  // kept in browser storage: the figures are held in this module's memory and dropped on sign-out.
  const DPF = (() => {
    const I = DPF_IMPORT, X = PR_XLSX;
    const SOURCE_WORDS = { form: "typed in", template: "Dyce template", plan_workbook: "plan workbook" };
    const FY_FIRST = 2024, FY_LAST = 2030; // months allowed: 06/2024 to 05/2031
    const MAX_BYTES = 25 * 1024 * 1024;
    // items: dpf_items, once a session. states: fy_start_year -> the newest dpf_state answer. fy:
    // the year shown. typed: the Months table's boxes as typed, by "YYYY-MM-01|code". asking: the
    // month whose Undo sign-off reason box is open. upl: the Upload screen's preview. sess is bumped
    // on sign-out, view on every show, so an answer that arrives after either is not drawn.
    let items = null, states = {}, fy = null, typed = {}, asking = null, busy = false;
    let sess = 0, view = 0, hubGen = -1, item = "months", root = null, parts = null, upl = null, histMonth = null;
    const live = () => hubGen === gen && !!me && !!root && root.isConnected;
    const onView = (n, s0) => n === view && s0 === sess && live();
    const mine = (s) => (s && s.me) || {};
    const canEnter = () => { const s = states[fy]; return s && s.me ? mine(s).can_enter === true : ticks().includes(DPF_ENTER); };
    const canSign = () => { const s = states[fy]; return s && s.me ? mine(s).can_sign_off === true : ticks().includes(DPF_SIGN); };
    const sorted = () => I.sortItems(items || []);
    const byCode = (code) => (items || []).find((x) => x.code === code) || null;
    const thisMonth = () => I.monthOf(new Date());
    const nowFy = () => Math.min(FY_LAST, Math.max(FY_FIRST, I.fyStartOf(thisMonth())));
    const monthOfState = (iso) => { const s = states[I.fyStartOf(iso)]; return s ? (s.months || []).find((m) => m.month === iso) || null : null; };
    // A dpf_state answer (dpf_save, dpf_sign_off, dpf_unsign and dpf_upload answer one too).
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
      hubGen = g; item = it || "months";
      const n = ++view, s0 = sess;
      typed = {}; asking = null; upl = null; busy = false;
      const msg = el("div", { class: "msg", role: "status", "aria-live": "polite", hidden: true, style: "margin-top:14px" });
      const body = el("div");
      const stand = item === "upload" ? "Load figures from a spreadsheet. Nothing is saved until you have checked the preview and pressed Save."
        : item === "history" ? "Every change to a month's figures and its sign-off, newest first, at most 200. Times are UK time."
        : "The figures the DPF score needs each month: costs, OPEX, the plan targets, Trustpilot and bad debt. A month counts towards the DPF once it is signed off; changing a signed-off month clears its sign-off.";
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
          if (item === "upload") drawUpload(); else drawMonths();
        } catch (err) { if (onView(n, s0) && !(err && err.signedOut)) say(msg, explain(err), true); }
      })();
    }
    // A write: one at a time, its answer taken, the screen drawn again and a line said. A refusal
    // shows the database's sentence; the year is read again so the screen shows what is held now.
    async function write(action, args, done) {
      if (busy) return false;
      const n = view, s0 = sess;
      busy = true; say(parts.msg, "Saving…"); redraw();
      try {
        const r = await api(action, args);
        if (s0 !== sess) return false;
        take(r);
        busy = false;
        if (n === view && live()) { say(parts.msg, done(r)); redraw(); }
        return true;
      } catch (err) {
        if (s0 !== sess) return false;
        busy = false;
        if (err && err.signedOut) return false;
        if (n === view && live()) { say(parts.msg, explain(err), true); redraw(); }
        try { await state(fy); if (n === view && live()) redraw(); } catch { /* the refusal is already shown */ }
        return false;
      }
    }
    function redraw() { if (!live() || !parts) return; if (item === "months") drawMonths(); }

    // ---------- Months: the financial year as a grid
    function yearBar(onMove) {
      const prev = el("button", { type: "button", class: "btn ghost small", "data-dpf": "prev", text: "Previous year", disabled: fy <= FY_FIRST || busy });
      const next = el("button", { type: "button", class: "btn ghost small", "data-dpf": "next", text: "Next year", disabled: fy >= FY_LAST || busy });
      prev.addEventListener("click", () => onMove(fy - 1));
      next.addEventListener("click", () => onMove(fy + 1));
      return el("div", { class: "dpf-year" }, prev, el("h2", { id: "dpfYear", text: I.fyLabel(fy) }), next);
    }
    async function moveYear(y) {
      const n = view, s0 = sess;
      fy = y; typed = {}; asking = null;
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
      const its = sorted(), months = Array.isArray(s.months) ? s.months : [], enter = canEnter(), sign = canSign();
      body.append(yearBar(moveYear));
      if (enter) body.append(saveBar());
      const head = el("tr", {}, el("th", { scope: "col", class: "dpf-item", text: "Item" }));
      for (const m of months) head.append(el("th", { scope: "col", class: "dpf-m", text: I.monthName(m.month) }));
      const tb = el("tbody");
      for (const kind of ["actual", "plan"]) {
        const group = its.filter((x) => (x.kind === "plan" ? "plan" : "actual") === kind);
        if (!group.length) continue;
        tb.append(el("tr", { class: "dpf-group" }, el("th", { scope: "colgroup", colspan: String(months.length + 1), text: kind === "plan" ? "Plan" : "Actuals" })));
        for (const it of group) {
          const tr = el("tr", { "data-code": it.code }, el("th", { scope: "row", class: "dpf-item" }, el("span", { text: String(it.label) }), el("span", { class: "dpf-unit", text: String(it.unit ?? "") })));
          for (const m of months) {
            const v = (m.figures || {})[it.code], has = v != null;
            const e = (m.entered || {})[it.code];
            const tip = has ? (who(e) ? "Entered by " + who(e) : null) : "Not entered";
            const td = el("td", { class: "dpf-v" + (has ? "" : " gap"), "data-month": m.month, title: tip });
            if (enter) td.append(cellBox(it, m, td));
            else td.textContent = has ? I.formatValue(it, v) : "–";
            tr.append(td);
          }
          tb.append(tr);
        }
      }
      const status = el("tr", { class: "dpf-status" }, el("th", { scope: "row", class: "dpf-item", text: "Status" }));
      for (const m of months) {
        const st = I.monthStatus(m);
        status.append(el("td", { class: "dpf-st " + st.kind, "data-month": m.month }, st.kind === "signed" ? el("span", { class: "state", text: "Signed off" }) : null,
          el("div", { text: st.kind === "signed" ? st.text.replace(/^Signed off /, "") : st.text })));
      }
      const foot = el("tfoot", {}, status);
      if (sign) {
        const acts = el("tr", { class: "dpf-acts" }, el("th", { scope: "row", class: "dpf-item", text: "Sign-off" }));
        for (const m of months) {
          const st = I.monthStatus(m), td = el("td", { "data-month": m.month });
          if (st.kind === "ready") {
            const b = el("button", { type: "button", class: "btn small", "data-dpf": "signoff", text: "Sign off", disabled: busy });
            b.addEventListener("click", () => signOff(m));
            td.append(b);
          } else if (st.kind === "signed") {
            const b = el("button", { type: "button", class: "btn ghost small", "data-dpf": "unsign", text: "Undo sign-off", disabled: busy });
            b.addEventListener("click", () => { asking = m.month; drawMonths(); const t = $("dpfReason"); if (t) t.focus(); });
            td.append(b);
          }
          acts.append(td);
        }
        foot.append(acts);
      }
      body.append(el("div", { class: "grid-wrap dpf-wrap" }, el("table", { class: "dpf-grid" }, el("thead", {}, head), tb, foot)),
        el("p", { class: "hint", style: "margin:8px 0 0", text: enter
          ? "Type into the table, then press Save changes. Enter moves down, Esc puts a figure back as it was, and clearing a figure deletes it. Point at a figure to see who entered it."
          : "Point at a figure to see who entered it." }));
      if (asking) body.append(undoBox(asking));
      refreshBar();
    }

    // One box per figure. What is typed is kept in typed["YYYY-MM-01|code"] until Save changes or
    // Discard, so drawing the grid again (a sign-off elsewhere, a refusal) keeps it.
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
      input.addEventListener("input", () => { typed[key] = input.value; mark(); refreshBar(); });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { delete typed[key]; input.value = I.inputValue(it, held); mark(); refreshBar(); e.preventDefault(); return; }
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

    // The bar above the table: how many changes are waiting, Save changes and Discard. While any
    // change waits, the year cannot be moved and no month can be signed off.
    function saveBar() {
      const count = el("span", { class: "dpf-pending", id: "dpfPending" });
      const save = el("button", { type: "button", class: "btn", "data-dpf": "save", text: "Save changes" });
      const discard = el("button", { type: "button", class: "btn ghost", "data-dpf": "discard", text: "Discard" });
      save.addEventListener("click", saveGrid);
      discard.addEventListener("click", () => { typed = {}; say(parts.msg, ""); drawMonths(); });
      return el("div", { class: "dpf-savebar" }, count, save, discard);
    }
    function refreshBar() {
      if (!parts) return;
      const n = pending(), bar = parts.body.querySelector(".dpf-savebar");
      if (bar) {
        bar.querySelector(".dpf-pending").textContent = n === 0 ? "No unsaved changes." : n === 1 ? "1 unsaved change." : `${n} unsaved changes.`;
        for (const b of bar.querySelectorAll("button")) b.disabled = busy || n === 0;
      }
      for (const b of parts.body.querySelectorAll('[data-dpf="prev"], [data-dpf="next"], [data-dpf="signoff"], [data-dpf="unsign"]')) {
        const edge = (b.dataset.dpf === "prev" && fy <= FY_FIRST) || (b.dataset.dpf === "next" && fy >= FY_LAST);
        b.disabled = busy || n > 0 || edge;
        b.title = n > 0 ? "Save or discard your changes first." : "";
      }
    }

    // Save changes: one dpf_save a month, in month order, each with only its changed figures and
    // source form, as History shows them ("typed in"). A refusal stops it there: the months before
    // are saved, that month and those after keep what was typed, and the database's sentence shows.
    async function saveGrid() {
      if (busy) return;
      const g = gridChanges();
      if (g.problems.length) { say(parts.msg, g.problems.join(" "), true); return; }
      const months = Object.keys(g.byMonth).sort();
      if (!months.length) { typed = {}; say(parts.msg, "Nothing has changed."); drawMonths(); return; }
      const n = view, s0 = sess, saved = [];
      let total = 0, cleared = 0, at = null;
      busy = true; say(parts.msg, "Saving…"); redraw();
      try {
        for (const iso of months) {
          at = iso;
          const was = !!(monthOfState(iso) || {}).signed_off;
          const r = await api("dpf_save", { month: iso, values: g.byMonth[iso], source: "form" });
          if (s0 !== sess) return;
          take(r);
          const c = Number.isInteger(r && r.changed) ? r.changed : Object.keys(g.byMonth[iso]).length;
          total += c; if (was && c > 0) cleared++;
          for (const key of Object.keys(typed)) if (key.startsWith(iso + "|")) delete typed[key];
          saved.push(I.monthName(iso));
        }
        busy = false;
        if (n === view && live()) {
          say(parts.msg, `Saved ${total} ${total === 1 ? "figure" : "figures"}: ${saved.join(", ")}.` + (cleared ? ` A change to a signed-off month cleared its sign-off.` : ""));
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

    // Sign off sends the fingerprint of the figures as shown; the database refuses it if any has
    // changed since, or if any is missing.
    function signOff(m) {
      write("dpf_sign_off", { month: m.month, fingerprint: m.fingerprint }, () => `${I.monthName(m.month)} signed off.`);
    }
    function undoBox(iso) {
      const reason = el("textarea", { id: "dpfReason", rows: "2", maxlength: "500" });
      const problems = el("div", { class: "msg refused", role: "alert", hidden: true });
      const go = el("button", { type: "button", class: "btn small", "data-dpf": "unsign-go", text: "Undo sign-off", disabled: busy });
      const cancel = el("button", { type: "button", class: "btn ghost small", text: "Cancel", disabled: busy });
      go.addEventListener("click", async () => {
        const why = reason.value.trim();
        if (!why) { say(problems, "Give a reason for undoing the sign-off.", true); reason.focus(); return; }
        const ok = await write("dpf_unsign", { month: iso, reason: why }, () => `The sign-off of ${I.monthName(iso)} was undone.`);
        if (ok) { asking = null; redraw(); }
      });
      cancel.addEventListener("click", () => { asking = null; drawMonths(); });
      return el("section", { class: "dpf-ask", "aria-labelledby": "dpfAskTitle" },
        el("h2", { id: "dpfAskTitle", text: `Undo the sign-off of ${I.monthName(iso)}` }),
        el("div", { class: "field" }, el("label", { for: "dpfReason", text: "Reason" }), reason),
        problems, el("div", { class: "actions" }, go, cancel));
    }

    // ---------- Upload: three routes into one preview
    function yearSelect(onChange) {
      const sel = el("select", { id: "dpfUpYear" });
      for (let y = FY_FIRST; y <= FY_LAST; y++) sel.append(el("option", { value: String(y), text: I.fyLabel(y) }));
      sel.value = String(fy);
      sel.addEventListener("change", () => onChange(Number(sel.value)));
      return el("div", { class: "field dpf-upyear" }, el("label", { for: "dpfUpYear", text: "Financial year" }), sel);
    }
    // Twelve month ticks for the year, with All and None. pick(iso) says which start ticked.
    function monthPicker(key, pick) {
      const boxes = I.fyMonths(fy).map((iso) => { const cb = el("input", { type: "checkbox", value: iso, "data-month": iso }); cb.checked = !!pick(iso); return cb; });
      const fs = el("fieldset", { class: "dpf-months", "data-picker": key }, el("legend", { text: "Months to take" }),
        ...boxes.map((cb) => el("label", {}, cb, I.monthName(cb.value))));
      const all = el("button", { type: "button", class: "btn ghost small", text: "All" }), none = el("button", { type: "button", class: "btn ghost small", text: "None" });
      const node = el("div", {}, fs, el("div", { class: "actions", style: "margin-top:6px" }, all, none));
      const api_ = { node, chosen: () => boxes.filter((b) => b.checked).map((b) => b.value), onChange: null };
      const fire = () => { if (api_.onChange) api_.onChange(); };
      boxes.forEach((b) => b.addEventListener("change", fire));
      all.addEventListener("click", () => { boxes.forEach((b) => { b.checked = true; }); fire(); });
      none.addEventListener("click", () => { boxes.forEach((b) => { b.checked = false; }); fire(); });
      return api_;
    }
    const fileInput = (id, accept) => el("input", { type: "file", id, accept });
    async function bytesOf(input) {
      const f = input.files && input.files[0];
      if (!f) return null;
      if (f.size > MAX_BYTES) return { name: f.name, problem: "The file is larger than 25 MB." };
      return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
    }

    function drawUpload() {
      const body = parts.body; body.textContent = ""; upl = null;
      body.append(yearSelect((y) => { fy = y; drawUpload(); }));
      const preview = el("section", { class: "dpf-preview", id: "dpfPreview", "aria-labelledby": "dpfPrevTitle", hidden: true });

      // (a) The Dyce template
      const dl = el("button", { type: "button", class: "btn ghost", "data-dpf": "download", text: "Download template" });
      const tIn = fileInput("dpfTemplate", ".xlsx,.csv");
      dl.addEventListener("click", () => downloadTemplate(dl));
      tIn.addEventListener("change", async () => {
        const f = await bytesOf(tIn); if (!f) return;
        if (f.problem) { showPreview(preview, "template", f.name, { rows: [], problems: [f.problem] }); return; }
        showPreview(preview, "template", f.name, I.readTemplate(X, f.bytes, f.name, items));
      });
      const cardA = el("section", { class: "dpf-card", "aria-labelledby": "dpfTplTitle" },
        el("h2", { id: "dpfTplTitle", text: "Dyce template" }),
        el("p", { text: "One sheet, DPF figures, laid out as the Months table: the items down, the year's months across (MM/YYYY), filled with the figures held now. Change or fill in any figure and upload it here. A blank cell leaves that figure as it is; clear a figure on the Months screen." }),
        el("div", { class: "actions" }, dl),
        el("div", { class: "field" }, el("label", { for: "dpfTemplate", text: "Upload template (.xlsx or .csv)" }), tIn));

      // (b) Carl's five-year plan workbook
      const modeT = el("input", { type: "radio", name: "dpfMode", value: "targets", id: "dpfModeT" });
      const modeA = el("input", { type: "radio", name: "dpfMode", value: "actuals", id: "dpfModeA" });
      modeT.checked = true;
      const pPick = monthPicker("plan", () => true);
      const pIn = fileInput("dpfPlan", ".xlsx");
      let pFile = null;
      const readPlan = () => {
        if (!pFile) return;
        if (pFile.problem) { showPreview(preview, "plan_workbook", pFile.name, { rows: [], problems: [pFile.problem] }); return; }
        showPreview(preview, "plan_workbook", pFile.name, I.readPlanWorkbook(X, pFile.bytes, { mode: modeA.checked ? "actuals" : "targets", months: pPick.chosen() }));
      };
      const setMode = () => {
        // Actuals start with the months already over; Targets with the whole year.
        const past = (iso) => iso < thisMonth();
        for (const cb of pPick.node.querySelectorAll("input[type=checkbox]")) cb.checked = modeA.checked ? past(cb.value) : true;
        readPlan();
      };
      modeT.addEventListener("change", setMode); modeA.addEventListener("change", setMode);
      pPick.onChange = readPlan;
      pIn.addEventListener("change", async () => { pFile = await bytesOf(pIn); readPlan(); });
      const cardB = el("section", { class: "dpf-card", "aria-labelledby": "dpfPlanTitle" },
        el("h2", { id: "dpfPlanTitle", text: "Carl's plan workbook" }),
        el("p", { text: "The five-year plan. Targets reads the BASE plan: gross profit, net profit (EBITDA), volume and OPEX. Actuals reads Carl's working copy: cost of sales (total purchases plus total direct expenses), overheads and OPEX. Each line is found by its label in column B and each month by the date in its header row, never by column letter." }),
        el("fieldset", { class: "dpf-mode" }, el("legend", { text: "Read" }),
          el("label", { class: "choice" }, modeT, el("span", {}, el("b", { text: "Targets" }), el("span", { text: "The BASE plan." }))),
          el("label", { class: "choice" }, modeA, el("span", {}, el("b", { text: "Actuals" }), el("span", { text: "Carl's working copy, with the months he has actualised." })))),
        pPick.node,
        el("div", { class: "field" }, el("label", { for: "dpfPlan", text: "Upload the plan workbook (.xlsx)" }), pIn));

      // (c) The DPF workbook
      const dPick = monthPicker("dpf", () => true);
      const dIn = fileInput("dpfDpf", ".xlsx");
      let dFile = null;
      const readDpf = () => {
        if (!dFile) return;
        if (dFile.problem) { showPreview(preview, "plan_workbook", dFile.name, { rows: [], problems: [dFile.problem] }); return; }
        showPreview(preview, "plan_workbook", dFile.name, I.readDpfWorkbook(X, dFile.bytes, { months: dPick.chosen() }));
      };
      dPick.onChange = readDpf;
      dIn.addEventListener("change", async () => { dFile = await bytesOf(dIn); readDpf(); });
      const cardC = el("section", { class: "dpf-card", "aria-labelledby": "dpfDpfTitle" },
        el("h2", { id: "dpfDpfTitle", text: "DPF workbook" }),
        el("p", { text: "The Dyce Performance Framework workbook. Reads the annual targets on SLT Dashboard, column C, each line found by its label in column B: the bad debt target and the Trustpilot score target for every chosen month, and the Trustpilot review count target split evenly over the twelve months." }),
        dPick.node,
        el("div", { class: "field" }, el("label", { for: "dpfDpf", text: "Upload the DPF workbook (.xlsx)" }), dIn));

      body.append(el("div", { class: "dpf-cards" }, cardA, cardB, cardC), preview);
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
      finally { button.disabled = false; }
    }

    // The preview: problems first (they stop the save), then each month and item with the value
    // held and the new one, unchanged ones greyed. The held values are read fresh for every year
    // the rows touch.
    async function showPreview(box, source, name, read) {
      const n = view, s0 = sess, k = {};
      upl = k;
      box.hidden = false; box.textContent = "";
      box.append(el("h2", { id: "dpfPrevTitle", text: `Preview: ${name}` }), el("p", { class: "empty", text: "Reading…" }));
      box.scrollIntoView({ block: "nearest" });
      const years = [...new Set(read.rows.map((r) => I.fyStartOf(r.month)))];
      try { await Promise.all(years.map((y) => state(y))); } catch (err) {
        if (onView(n, s0) && upl === k && !(err && err.signedOut)) { box.lastChild.remove(); box.append(el("div", { class: "msg refused", text: explain(err) })); }
        return;
      }
      if (!onView(n, s0) || upl !== k) return;
      const held = {};
      for (const y of years) for (const m of (states[y] && states[y].months) || []) held[m.month] = m.figures || {};
      const lines = I.previewRows(read.rows, items, held);
      const changed = lines.filter((x) => x.changed).length;
      box.textContent = "";
      box.append(el("h2", { id: "dpfPrevTitle", text: `Preview: ${name}` }));
      if (read.problems.length) {
        box.append(el("div", { class: "msg refused dpf-problems", role: "alert" },
          el("p", { text: `${read.problems.length} ${read.problems.length === 1 ? "problem stops" : "problems stop"} this file being saved:` }),
          el("ul", {}, ...read.problems.map((p) => el("li", { text: p })))));
      }
      if (lines.length) {
        box.append(el("p", { class: "dpf-count", text: `${changed} to change, ${lines.length - changed} unchanged.` }));
        const tb = el("tbody");
        for (const x of lines) {
          tb.append(el("tr", { class: x.changed ? "chg" : "same", "data-month": x.month, "data-code": x.code },
            el("td", { text: I.monthText(x.month) }), el("td", { text: String(x.item.label) }),
            el("td", { class: "n", text: x.held == null ? "–" : I.formatValue(x.item, x.held) }),
            el("td", { class: "n", text: I.formatValue(x.item, x.value) })));
        }
        box.append(el("div", { class: "grid-wrap" }, el("table", { class: "dpf-prev" },
          el("thead", {}, el("tr", {}, el("th", { scope: "col", text: "Month" }), el("th", { scope: "col", text: "Item" }),
            el("th", { scope: "col", class: "n", text: "Held now" }), el("th", { scope: "col", class: "n", text: "New value" }))), tb)));
      }
      const msg = el("div", { class: "msg", role: "status", hidden: true });
      const save = el("button", { type: "button", class: "btn", "data-dpf": "upload-save", text: changed === 1 ? "Save 1 change" : `Save ${changed} changes`,
        disabled: !!read.problems.length || !changed });
      const drop = el("button", { type: "button", class: "btn ghost", "data-dpf": "upload-discard", text: "Discard" });
      drop.addEventListener("click", () => { upl = null; box.textContent = ""; box.hidden = true; for (const i of root.querySelectorAll("input[type=file]")) i.value = ""; });
      save.addEventListener("click", async () => {
        if (save.disabled) return;
        save.disabled = true; drop.disabled = true; say(msg, "Saving…");
        try {
          const r = await api("dpf_upload", { rows: read.rows.map((x) => ({ month: x.month, code: x.code, value: x.value })), source, source_file: name });
          if (s0 !== sess) return;
          // The answer carries the state of the first row's year; any other year is read again when shown.
          states = {}; take(r);
          if (!onView(n, s0) || upl !== k) return;
          const c = Number.isInteger(r && r.changed) ? r.changed : changed, u = Number.isInteger(r && r.unchanged) ? r.unchanged : lines.length - changed;
          upl = null; box.textContent = ""; box.hidden = true;
          for (const i of root.querySelectorAll("input[type=file]")) i.value = "";
          say(parts.msg, `Saved ${name}: ${c} changed, ${u} unchanged. A change to a signed-off month cleared its sign-off.`);
        } catch (err) {
          if (s0 !== sess || (err && err.signedOut)) return;
          say(msg, explain(err), true); save.disabled = false; drop.disabled = false;
        }
      });
      box.append(el("div", { class: "actions", style: "margin-top:14px" }, save, drop), msg);
      if (!lines.length && !read.problems.length) box.append(el("p", { class: "empty", text: "Nothing to save." }));
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
          const what = !c.item_code ? (c.note || "Sign-off changed")
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
    function reset() { sess++; view++; items = null; states = {}; fy = null; typed = {}; asking = null; busy = false; upl = null; histMonth = null; root = null; parts = null; }
    return { show, reset };
  })();
