/* Dashboard screen renderer. One fixed 1920 x 1080 screen per board, drawn identically in the
   decision app, the live app and on the office screens. Every piece of text goes in as a text
   node. Depends on window.PoolLib. */
(function (root) {
  "use strict";
  const L = root.PoolLib;
  const TONE = {crit: "--crit", warn: "--warn", ok: "--ok", info: "--info", neutral: "--neutral-edge", ink: "--ink", muted: "--muted"};
  const tone = t => `var(${TONE[t] || "--ink"})`;
  const arr = v => (Array.isArray(v) ? v : []);
  const num = v => Number(v) || 0;
  const fill = (tpl, row) => L.fillTemplate(tpl || "", row);

  function el(tag, cls, ...kids) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids.flat()) {
      if (k === null || k === undefined || k === false) continue;
      n.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
    return n;
  }
  const title = (c, row) => el("h3", "dsec", fill(c.title, row));
  const empty = () => el("p", "dnote", "No rows for this period.");

  function hero(c, row) {
    const card = el("div", "dcard", title(c, row));
    const fig = el("div", "dhero", L.fmt(row[c.field], c.format));
    fig.style.color = tone(c.tone);
    card.append(fig);
    if (c.note) card.append(el("p", "dnote", fill(c.note, row)));
    if (c.second) {
      const s = el("div", "dhero dsm", L.fmt(row[c.second.field], c.second.format), el("span", "dunit", c.second.label));
      s.style.color = tone(c.second.tone);
      card.append(el("div", "dspacer"), s);
    }
    return card;
  }

  function figures(c, row) {
    const g = el("div", "dfigs");
    c.items.forEach(i => {
      const v = el("div", "dfig", L.fmt(row[i.field], i.format));
      v.style.color = tone(i.tone);
      g.append(el("div", "", v, el("div", "dlab", i.label)));
    });
    return el("div", "dcard", title(c, row), g);
  }

  function stack(c, row) {
    const all = arr(row[c.field]);
    const toneOf = d => (c.tones || {})[d.label] || "neutral";
    const bar = el("div", "dstack");
    all.filter(d => num(d.value) > 0).forEach(d => {
      const s = el("span");
      s.style.flex = `${num(d.value)} 1 0`;
      s.style.background = tone(toneOf(d));
      bar.append(s);
    });
    if (!bar.children.length) bar.append(el("span", "dempty", "No rows for this period."));
    const leg = el("div", "dlegend");
    all.forEach(d => {
      const sw = el("i");
      sw.style.background = tone(toneOf(d));
      leg.append(el("span", "", sw, `${d.label === null || d.label === undefined ? L.DASH : d.label} · ${L.fmt(d.value, c.format || "int")}`));
    });
    return el("div", "dcard", title(c, row), bar, leg);
  }

  function columns(c, row) {
    const data = arr(row[c.field]);
    const series = c.series;
    const mode = c.mode || "stack";
    const total = d => (mode === "stack" ? series.reduce((a, s) => a + num(d[s.key]), 0) : Math.max(...series.map(s => num(d[s.key]))));
    const posSum = d => series.reduce((a, s) => a + Math.max(0, num(d[s.key])), 0);
    const negSum = d => series.reduce((a, s) => a + Math.min(0, num(d[s.key])), 0);
    const drawn = [];
    data.forEach(d => {
      if (mode === "stack") drawn.push(posSum(d), negSum(d));
      else series.forEach(s => drawn.push(num(d[s.key])));
    });
    const hi = Math.max(0, ...drawn), lo = Math.min(0, ...drawn);
    const span = (hi - lo) || 1;
    // With negatives, keep 12% clear at the foot so labels under the deepest bar do not meet the axis labels.
    const off = lo < 0 ? 12 : 0, K = lo < 0 ? 75 : 85;
    const zero = off + (-lo / span) * K;
    const hgt = v => (Math.abs(num(v)) / span) * K;
    const isNull = v => v === null || v === undefined;
    const bar = (v, color, cls) => {
      if (isNull(v)) return null;
      const h = hgt(v), neg = num(v) < 0;
      const b = el("div", "dbar" + (cls ? " " + cls : "") + (neg ? " dneg" : ""));
      b.style.height = `${h}%`; b.style.bottom = `${neg ? zero - h : zero}%`; b.style.background = color;
      return b;
    };
    // below = true puts the label under the bar, clamped so it never leaves the plot.
    const label = (text, v, below) => {
      const neg = below === undefined ? num(v) < 0 : below;
      const h = hgt(v), t = el("div", "dval", text);
      t.style.bottom = neg ? `max(0px, calc(${zero}% - ${h}% - 30px))` : `calc(${zero}% + ${h}% + 6px)`;
      return t;
    };
    const zeroLine = () => { const z = el("div", "dzero"); z.style.bottom = `${zero}%`; return z; };
    const cols = el("div", "dcols");
    data.forEach(d => {
      const plot = el("div", "dplot");
      if (lo < 0) plot.append(zeroLine());
      if (mode === "group") {
        const g = el("div", "dgroup");
        series.forEach(s => { const gi = el("div", "dgi"); const bb = bar(d[s.key], tone(s.tone)); if (bb) gi.append(bb); gi.append(label(L.fmt(d[s.key], c.format), d[s.key])); g.append(gi); });
        plot.append(g);
      } else if (mode === "part") {
        const b0 = bar(d[series[0].key], tone(series[0].tone));
        if (b0) plot.append(b0);
        series.slice(1).forEach(s => { const bp = bar(d[s.key], tone(s.tone), "dpart"); if (bp) plot.append(bp); });
        plot.append(label(L.fmt(d[series[0].key], c.format), d[series[0].key]));
      } else {
        // Positive parts stack up from the zero line, negative parts stack down from it.
        const t = total(d), pos = posSum(d), neg = negSum(d);
        [[pos, "dstk", v => v > 0], [neg, "dstk dstkneg", v => v < 0]].forEach(([sum, cls, keep]) => {
          if (!sum) return;
          const b = bar(sum, "transparent", cls);
          series.forEach(s => { if (!keep(num(d[s.key]))) return; const seg = el("div"); seg.style.flex = `${Math.abs(num(d[s.key]))} 1 0`; seg.style.background = tone(s.tone); b.append(seg); });
          plot.append(b);
        });
        const allNull = series.every(s => isNull(d[s.key]));
        plot.append(label(allNull ? L.DASH : L.fmt(t, c.format), t < 0 ? neg : pos, t < 0));
      }
      cols.append(el("div", "dcol", plot, el("div", "daxis", L.axisLabel(d.label))));
    });
    const card = el("div", "dcard", title(c, row), data.length ? cols : empty());
    if (series.length > 1) {
      const leg = el("div", "dlegend");
      series.forEach(s => { const sw = el("i"); sw.style.background = tone(s.tone); leg.append(el("span", "", sw, s.label)); });
      card.append(leg);
    }
    return card;
  }

  function bars(c, row) {
    const key = c.value || "value";
    const all = arr(row[c.field]);
    const data = all.slice(0, 10);
    // Draw from a zero point so negative values extend left of it.
    const vals = data.map(d => num(d[key]));
    const neg = Math.min(0, ...vals), pos = Math.max(0, ...vals);
    const range = (pos - neg) || 1, zeroPct = -neg / range * 100;
    const list = el("div", "dbars" + (data.length > 9 ? " ddense" : ""));
    data.forEach(d => {
      const v = num(d[key]);
      const f = el("span", "dfill");
      f.style.left = `${v >= 0 ? zeroPct : zeroPct - Math.abs(v) / range * 100}%`;
      f.style.width = `${Math.abs(v) / range * 100}%`;
      f.style.background = tone(c.tone || "ink");
      const track = el("span", "dtrack", f);
      if (neg < 0) { const z = el("span", "dtick"); z.style.left = `${zeroPct}%`; track.append(z); }
      list.append(el("div", "dbrow", el("span", "dblab", d.label === null || d.label === undefined ? L.DASH : String(d.label)), track, el("span", "dbval", L.fmt(d[key], c.format))));
    });
    const card = el("div", "dcard", title(c, row), data.length ? list : empty());
    if (all.length > 10) card.append(el("p", "dnote", `and ${all.length - 10} more`));
    return card;
  }

  function table(c, row) {
    const data = arr(row[c.field]);
    const t = el("table", "dtable");
    const hr = el("tr");
    c.columns.forEach(col => hr.append(el("th", "", col.label)));
    t.append(hr);
    data.slice(0, 10).forEach(d => {
      const tr = el("tr");
      c.columns.forEach(col => tr.append(el("td", col.format === "text" ? "" : "dn",
        col.key === "label" && col.format === "text" ? L.axisLabel(d.label === null || d.label === undefined ? L.DASH : d.label) : L.fmt(d[col.key], col.format))));
      t.append(tr);
    });
    const card = el("div", "dcard", title(c, row), data.length ? t : empty());
    if (data.length > 10) card.append(el("p", "dnote", `and ${data.length - 10} more`));
    return card;
  }

  function meter(c, row) {
    const v = Number(row[c.field]);
    const f = el("span");
    f.style.width = `${isFinite(v) ? Math.max(0, Math.min(100, v)) : 0}%`;
    f.style.background = tone(c.tone || "ink");
    const card = el("div", "dcard", title(c, row), el("div", "dhero dsm", L.fmt(row[c.field], c.format)), el("div", "dmeter", f));
    if (c.note) card.append(el("p", "dnote", fill(c.note, row)));
    return card;
  }

  const CARDS = {hero, figures, stack, columns, bars, table, meter};

  function render(board, row, ctx) {
    row = row || {};
    const s = el("div", "dscreen");
    const logo = document.createElement("img");
    logo.className = "dlogo"; logo.src = ctx.logo; logo.alt = "Dyce Energy";
    s.append(el("div", "dtop", logo, el("h2", "dtitle", board.title), el("div", "dclock", el("b", "", ctx.time), ctx.date)));
    const strip = el("div", "dqs" + (board.questions.length > 2 ? " dq3" : ""));
    board.questions.forEach((q, i) => {
      const a = L.fmt(row[q.answer.field], q.answer.format);
      strip.append(el("div", "dq", el("span", "dqn", "Q" + (i + 1)), el("p", "dqt", q.q), el("span", "dqa" + (a.length > 12 ? " dlong" : ""), a)));
    });
    const grid = el("div", "dgrid");
    grid.style.gridTemplateRows = board.screen.rows.length === 1 ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)";
    board.screen.rows.forEach(r => r.forEach(c => {
      const card = CARDS[c.type](c, row);
      card.style.gridColumn = `span ${c.span}`;
      if (c.attention) card.append(el("div", "dspacer"), el("div", "dattn", el("b", "", "Needs attention: "), fill(c.attention, row)));
      if (c.footnote) {
        if (!c.attention) card.append(el("div", "dspacer"));
        card.append(el("p", "dnote dfoot-note", fill(c.footnote, row)));
      }
      grid.append(card);
    }));
    s.append(strip, grid, el("div", "dfoot", el("span", "", ctx.asat), el("span", "", `${ctx.area} · ${board.title}`)));
    if (ctx.rotation) s.append(el("div", "dprog"));
    const wrap = el("div", "dwrap", s);
    return wrap;
  }

  function fit(wrap) {
    const s = wrap.firstElementChild;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const k = Math.min(w / 1920, h / 1080) || 0;
    s.style.transform = `translate(${(w - 1920 * k) / 2}px, ${(h - 1080 * k) / 2}px) scale(${k})`;
  }
  function fitAll(rootEl) { (rootEl || document).querySelectorAll(".dwrap").forEach(fit); }

  function figuresTable(board, row) {
    row = row || {};
    const box = el("div", "figtables");
    board.screen.rows.flat().forEach(c => {
      box.append(el("h4", "", fill(c.title, row)));
      if (c.type === "hero") {
        box.append(el("p", "", L.fmt(row[c.field], c.format) + (c.second ? ` · ${c.second.label}: ${L.fmt(row[c.second.field], c.second.format)}` : "")));
      } else if (c.type === "meter") {
        box.append(el("p", "", L.fmt(row[c.field], c.format)));
      } else if (c.type === "figures") {
        box.append(el("p", "", c.items.map(i => `${i.label}: ${L.fmt(row[i.field], i.format)}`).join(" · ")));
      } else {
        const cols = c.type === "table" ? c.columns
          : c.type === "columns" ? [{key: "label", label: "", format: "text"}].concat(c.series.map(s => ({key: s.key, label: s.label, format: c.format})))
          : [{key: "label", label: "", format: "text"}, {key: c.value || "value", label: "", format: c.format || "int"}];
        const t = el("table");
        const hr = el("tr");
        cols.forEach(x => hr.append(el("th", "", x.label)));
        t.append(hr);
        arr(row[c.field]).forEach(d => {
          const tr = el("tr");
          cols.forEach(x => tr.append(el("td", x.format === "text" ? "" : "n", x.key === "label" ? L.axisLabel(d.label === null || d.label === undefined ? L.DASH : d.label) : L.fmt(d[x.key], x.format))));
          t.append(tr);
        });
        box.append(t);
      }
      if (c.attention) box.append(el("p", "", fill(c.attention, row)));
      if (c.footnote) box.append(el("p", "", fill(c.footnote, row)));
    });
    return box;
  }

  root.DashScreen = {render, fit, fitAll, figuresTable};
})(typeof globalThis !== "undefined" ? globalThis : this);
