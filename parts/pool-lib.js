/* Pure helpers for the Dashboard Pool tab of the DNA Hub. Loaded inline in the page and by the
   Node tests. No DOM access here. */
(function (root) {
  "use strict";
  const DASH = "–";
  const VERDICTS = ["keep", "maybe", "drop", "pass"];
  const VERDICT_LABEL = {keep: "Keep", maybe: "Maybe", drop: "Drop", pass: "Pass"};
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function group(n, dp) {
    return n.toLocaleString("en-GB", {minimumFractionDigits: dp, maximumFractionDigits: dp});
  }

  function ukDateTime(iso) {
    if (iso === null || iso === undefined || iso === "") return DASH;
    const s = String(iso);
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s) && s.includes("T")) {
      const d = new Date(s);
      if (!isNaN(d)) {
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(d);
        const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
        return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
      }
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : "");
  }

  function fmt(value, format) {
    if (value === null || value === undefined || value === "") return DASH;
    switch (format) {
      case "int":
        return isNum(value) ? group(Math.round(value), 0) : String(value);
      case "gbp": {
        if (!isNum(value)) return String(value);
        const a = Math.abs(value);
        return (value < 0 ? "-£" : "£") + (a >= 1000 ? group(Math.round(a), 0) : group(a, 2));
      }
      case "kwh": {
        if (!isNum(value)) return String(value);
        const a = Math.abs(value);
        if (a >= 1e6) return group(value / 1e6, 1) + " GWh";
        if (a >= 1e4) return group(value / 1e3, 0) + " MWh";
        return group(Math.round(value), 0) + " kWh";
      }
      case "pct":
        return isNum(value) ? group(value, 1) + "%" : String(value);
      case "days":
        if (!isNum(value)) return String(value);
        return group(value, value % 1 ? 1 : 0) + (value === 1 ? " day" : " days");
      case "minutes": {
        if (!isNum(value)) return String(value);
        const m = Math.round(value);
        if (m < 60) return m + " min";
        return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
      }
      case "ppkwh":
        return isNum(value) ? group(value, 3) + "p/kWh" : String(value);
      case "ppday":
        return isNum(value) ? group(value, 3) + "p/day" : String(value);
      case "date": {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value);
      }
      case "datetime":
        return ukDateTime(value);
      case "month": {
        const m = /^(\d{4})-(\d{2})/.exec(String(value));
        return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(value);
      }
      case "top":
        if (!Array.isArray(value)) return String(value);
        return value.length ? value.slice(0, 3).map(x => String(x.label)).join(", ") : DASH;
      default:
        return String(value);
    }
  }

  function axisLabel(label) {
    const s = String(label);
    let m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m) return `${MONTHS[+m[2] - 1]} ${m[1].slice(2)}`;
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return `${m[3]}/${m[2]}`;
    return s;
  }

  const AUDIENCE_SHORT = {
    wall: "Wallboard", app_all: "App: everyone", app_sales: "App: Sales", app_ops: "App: Operations",
    app_cs: "App: Customer service", app_finance: "App: Finance", app_mgmt: "App: Management only",
  };

  const forBoard = (votes, board) => (Array.isArray(votes) ? votes : []).filter(v => v && v.board === board);

  function tally(votes, board) {
    const t = {keep: 0, maybe: 0, drop: 0, pass: 0, voters: []};
    for (const v of forBoard(votes, board)) {
      if (!VERDICTS.includes(v.verdict)) continue;
      t[v.verdict]++;
      t.voters.push(Object.assign({}, v, {audiences: Array.isArray(v.audiences) ? v.audiences : []}));
    }
    return t;
  }

  function audienceCounts(votes, board, codes) {
    const c = Object.fromEntries(codes.map(k => [k, 0]));
    for (const v of forBoard(votes, board)) {
      if ((v.verdict === "keep" || v.verdict === "maybe") && Array.isArray(v.audiences)) {
        for (const a of new Set(v.audiences)) if (a in c) c[a]++;
      }
    }
    return c;
  }

  function suggestedAudiences(counts) {
    const max = Math.max(0, ...Object.values(counts));
    return max === 0 ? [] : Object.keys(counts).filter(k => counts[k] === max);
  }

  // Votes the decider still sees as current (the server sets current for the decider only).
  function votedCount(votes, board) {
    return forBoard(votes, board).filter(v => v.current === true).length;
  }

  function changedSinceDecided(votes, decision) {
    if (!decision || !decision.decided_at) return false;
    const at = Date.parse(decision.decided_at);
    return forBoard(votes, decision.board).some(v => Date.parse(v.voted_at) > at);
  }

  function myMark(votes, email, board) {
    const v = forBoard(votes, board).find(x => x.email === email);
    return v && VERDICTS.includes(v.verdict) ? v.verdict : null;
  }

  // Boards this person has marked (any verdict, Pass included).
  function reviewedCount(votes, email) {
    const seen = new Set();
    for (const v of Array.isArray(votes) ? votes : []) {
      if (v && v.email === email && VERDICTS.includes(v.verdict)) seen.add(v.board);
    }
    return seen.size;
  }

  function boardAsAt(snapshot, board) {
    const fb = snapshot && snapshot.fallback && snapshot.fallback[board];
    return fb && fb.as_at ? fb.as_at : snapshot.as_at;
  }

  // An unsaved draft wins over the saved vote, so a newer saved vote never overwrites typing.
  function draftFor(drafts, myVote, board) {
    const d = drafts && drafts[board];
    const src = d || myVote || {};
    return {
      verdict: src.verdict || null,
      audiences: Array.isArray(src.audiences) ? src.audiences.slice() : [],
      note: src.note || "",
    };
  }

  // Plain text only. The caller must put it in the page with textContent.
  function voteLine(vote, labels) {
    const names = labels || AUDIENCE_SHORT;
    const aud = (Array.isArray(vote.audiences) ? vote.audiences : []).map(a => names[a] || a);
    const head = `${vote.name}: ${VERDICT_LABEL[vote.verdict] || vote.verdict}` + (aud.length ? ` (${aud.join(", ")})` : "");
    return vote.note ? `${head}. ${vote.note}` : head;
  }

  // opts.toReview: boards I have not marked. opts.awaiting: boards with votes and no decision.
  // opts.changed: decided boards with a vote newer than the decision. opts.area: one area.
  // ctx: {votes, email, decisions}. Sorted by num.
  function filterBoards(boards, opts, ctx) {
    const o = opts || {}, c = ctx || {};
    const decided = new Map((c.decisions || []).map(d => [d.board, d]));
    return boards
      .filter(b => {
        if (o.area && b.area !== o.area) return false;
        if (o.toReview && myMark(c.votes, c.email, b.id) !== null) return false;
        if (o.awaiting && (decided.has(b.id) || votedCount(c.votes, b.id) === 0)) return false;
        if (o.changed && !(decided.has(b.id) && changedSinceDecided(c.votes, decided.get(b.id)))) return false;
        return true;
      })
      .slice()
      .sort((x, y) => x.num - y.num);
  }

  const TEMPLATE_RE = /\{([a-z][a-z0-9_]*)(?::([a-z]+))?\}/g;
  function fillTemplate(tpl, row) {
    return String(tpl || "").replace(TEMPLATE_RE, (m, field, format) => fmt((row || {})[field], format || "text"));
  }

  // Plain words for spine table names in the definitions. The registry keeps the exact names.
  const TABLE_NAMES = {
    entity_quote_option: "quote options", entity_quote: "quote", entity_contract: "contract",
    entity_cot_register: "change of tenancy (CoT)", entity_loss_report: "loss report",
    entity_billing_usage_month: "monthly billing", entity_billing_raw: "billing documents",
    entity_eacaq: "EAC/AQ", entity_mailbox_day: "daily mailbox", entity_mailbox_message: "mailbox messages",
    entity_mailbox_sender: "mailbox senders", entity_commission_run: "commission runs",
    entity_commission_exception: "commission exceptions", entity_commission_audit_issue: "commission audit issues",
    entity_id625_arrears: "ID625 arrears", entity_id625_upfront: "ID625 upfront",
    entity_voltx_commission: "Voltx commission", entity_5yp_by_month: "five-year plan",
    entity_pricing_supplier_file: "supplier price files", entity_deal_field_history: "HubSpot change history",
    entity_hubspot_load: "HubSpot load",
  };
  function tableName(entity) {
    return TABLE_NAMES[entity] || entity.replace(/^entity_/, "").replace(/_/g, " ");
  }
  function plainTables(text) {
    let s = String(text === null || text === undefined ? "" : text);
    s = s.replace(/(?:spine\.)?(entity_[a-z0-9_]*[a-z0-9]) (rows?)(?![a-z0-9_])/g,
      (m, e, r) => `${r} in the ${tableName(e)} table in the spine`);
    s = s.replace(/(?:spine\.)?(entity_[a-z0-9_]*[a-z0-9])/g, (m, e) => `the ${tableName(e)} table in the spine`);
    s = s.replace(/spine\.broker_alias/g, "the broker alias list in the spine");
    // Capitalise the first letter, unless the first word is an identifier such as month_token.
    return s.replace(/^[a-z]/, c => (/^[^\s]*_/.test(s) ? c : c.toUpperCase()));
  }

  const api = {plainTables, DASH, VERDICTS, VERDICT_LABEL, fmt, ukDateTime, axisLabel, tally, audienceCounts,
               suggestedAudiences, votedCount, changedSinceDecided, myMark, reviewedCount, boardAsAt, draftFor,
               voteLine, filterBoards, fillTemplate};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PoolLib = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
