// Render the Commission Engine's pages into tools/preview-stub.js, for the hub's preview.
//
//     node tools/ce-preview-pages.mjs <function folder>
//
// <function folder> is supabase/functions/commission-engine in a dyce-spine checkout. The pages are
// drawn by that function's own views (page.ts VIEWS), run here in Node over a stand-in database
// holding invented values only: the invented run of the function's golden/fixtures.json
// ("exceptions": its lines, exceptions, deals, brokers and billing findings), and the runs,
// customers and decisions below, made up for the preview. Nothing connects to a database or reads
// a credential. Each request's answer, or its refusal (a 404 sentence), becomes one entry of the
// stub's CE_PAGES; requests that give the same page share an entry. The lines between the BEGIN and
// END markers in the stub are replaced; nothing else in it changes. Run it again when the views or
// the fixtures change. Node 24 runs the function's .ts modules as they are.
//
// Piece 2 (deciding): every page is drawn twice, for a person who can decide (the stub's Admin
// Example, as Phil Brook before sign-off) and for one who can only view; where the two differ, each
// entry says which it is for ("who"). The deciding pages (/decide, /set-broker, /choose-broker,
// /resolve) are drawn for the decider, at the addresses the drawn Lines and Exceptions pages link and
// submit to, so the preview follows them, and so are the pages their forms go back to. CE_SAY holds
// the function's own sentences (deciding.ts) for the stub's act answers, made here so the stub does
// not copy them by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STUB = join(dirname(fileURLToPath(import.meta.url)), 'preview-stub.js');
const BEGIN = '  // BEGIN COMMISSION ENGINE PAGES';
const END = '  // END COMMISSION ENGINE PAGES';
const NOW = new Date('2026-11-13T10:00:00Z');

if (process.argv.length !== 3) {
  console.error('usage: node tools/ce-preview-pages.mjs <dyce-spine>/supabase/functions/commission-engine');
  process.exit(2);
}
const folder = resolve(process.argv[2]);
const load = (name) => import(pathToFileURL(join(folder, name)).href);
const { VIEWS } = await load('page.ts');
const { UserError } = await load('core.ts');
const { LINES_PAGE_SIZE } = await load('db.ts');
const { dealsFromRows, makeResolver } = await load('exceptions-data.ts');
const { lineMatches, searchTerms } = await load('filters.ts');
const { sumDec } = await load('format.ts');
const say = await load('deciding.ts');
const FIX = JSON.parse(readFileSync(join(folder, 'golden', 'fixtures.json'), 'utf8')).exceptions;

const copy = (v) => JSON.parse(JSON.stringify(v));

// Who the pages are drawn for: the stub's Admin Example, who can decide, and someone who can only view.
const DECIDER = { email: 'admin.example@dyce-energy.co.uk', canDecide: true };
const VIEWER = { email: 'cy.example@dyce-energy.co.uk', canDecide: false };

// ---- the invented runs: June26 is the fixtures' run; Mar26 records the wrong usage month.
const JUNE = '11111111-1111-4111-8111-111111111111';
const run = (o) => ({ consumption_month: null, id625_source_month: null, source_files: [], built_by: 'builder',
  approved_by: null, approved_at: null, ...o });
const RUNS = [
  run({ run_id: JUNE, month_token: 'June26', revision: 2, consumption_month: 'June 2026', id625_source_month: '2026-06-15',
    status: 'draft', built_at: '2026-07-02T09:30:00.000Z',
    source_files: [{ name: 'ID625 June 2026 example.xlsx', size: 48211, sha256: '5f0c0a7e1c9b4d2a8e6f3b1d0c9a8e7f6d5c4b3a2918f7e6d5c4b3a291807f6e' }] }),
  run({ run_id: '11111111-1111-4111-8111-111111111110', month_token: 'June26', revision: 1, consumption_month: 'June 2026',
    id625_source_month: '2026-06-15', status: 'in_review', built_at: '2026-07-01T16:05:00.000Z' }),
  run({ run_id: '22222222-2222-4222-8222-222222222222', month_token: 'May26', revision: 1, consumption_month: 'May 2026',
    id625_source_month: '2026-05-15', status: 'approved', built_at: '2026-06-02T10:00:00.000Z',
    approved_by: 'ana@example.test', approved_at: '2026-06-05T14:10:00.000Z' }),
  run({ run_id: '33333333-3333-4333-8333-333333333333', month_token: 'Apr26', revision: 1, consumption_month: 'April 2026',
    id625_source_month: '2026-04-15', status: 'sent', built_at: '2026-05-01T09:15:00.000Z',
    approved_by: 'ana@example.test', approved_at: '2026-05-06T11:00:00.000Z' }),
  run({ run_id: '44444444-4444-4444-8444-444444444444', month_token: 'Mar26', revision: 1, consumption_month: 'February 2026',
    id625_source_month: '2026-03-16', status: 'invoiced', built_at: '2026-04-01T09:00:00.000Z',
    approved_by: 'pat@example.test', approved_at: '2026-04-03T15:30:00.000Z' }),
];
const newestFirst = (a, b) => (a.built_at < b.built_at ? 1 : a.built_at > b.built_at ? -1 : 0);

// ---- the June26 lines: the fixtures' lines with the columns the Lines page adds, made up.
const CUSTOMERS = ['Example Bakery Ltd', 'Example Joinery Ltd', 'Example Dental Care', 'Example Florists', 'Example Garage Ltd',
  'Example Print Shop', 'Example Cafe Ltd', 'Example Vets', 'Example Hardware', 'Example Opticians', 'Example Pharmacy',
  'Example Salon', 'Example Laundry', 'Example Butchers', 'Example Fitness Ltd', 'Example Books', 'Example Farm Shop',
  'Example Studio', 'Example Tiles Ltd'];
const DECIDED_AT = { 7001: '2026-07-03T10:12:00.000Z', 7002: '2026-07-03T10:20:00.000Z', 7003: '2026-07-04T08:45:00.000Z',
  7004: '2026-07-04T09:05:00.000Z' };
const LINES = FIX.lines.map((l, i) => ({
  line_id: l.line_id, run_id: JUNE, run_month_token: 'June26', run_revision: 2, run_status: 'draft', source: l.source,
  supplier_id: l.supplier_id, line_ref: l.line_ref, contract_id: l.contract_id, mpxn: l.mpxn, customer_name: CUSTOMERS[i],
  broker_name: l.effective_broker_name, broker_id: l.broker_id, account_number: `ACC-${l.line_id}`, fuel: 'Electricity',
  contract_start: l.contract_start, contract_end: l.contract_end, usage_kwh_in_month: l.usage_kwh_in_month,
  contract_days_in_month: '30', contract_days_accumulated: '456', uplift_ur_ppkwh: l.uplift_ur_ppkwh,
  uplift_sc_ppday: l.uplift_sc_ppday, broker_due_gbp: l.broker_due_gbp, rule_pay: l.rule_pay, rule_comments: l.rule_comments,
  flags: 'OK', current_decision_id: l.current_decision_id, decided_pay: l.decided_pay, decided_by: l.decided_by,
  decided_at: l.current_decision_id ? DECIDED_AT[l.current_decision_id] : null, decided_reason: l.decided_reason,
  effective_broker_id: l.effective_broker_id, effective_broker_name: l.effective_broker_name,
}));
const DECISIONS = LINES.filter((l) => l.current_decision_id).map((l) => ({
  decision_id: l.current_decision_id, line_id: l.line_id, line_text: `${l.supplier_id} ${l.line_ref}`, decided_pay: l.decided_pay,
  reason: l.decided_reason ?? (l.decided_pay === 'Yes' ? 'Checked against the deal.' : 'Not due this month.'),
  decided_by: l.decided_by ?? 'sam@example.test', decided_at: DECIDED_AT[l.current_decision_id], supersedes: null,
})).sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1));

// ---- the stand-in database, answering as db.ts does over these values.
const linesOf = (runId) => (runId === JUNE ? LINES : []);
const found = (line, search) => searchTerms(search).every((term) => [line.contract_id, line.mpxn, line.customer_name,
  line.effective_broker_name, line.line_ref, line.account_number].some((v) => (v ?? '').toLowerCase().includes(term.toLowerCase())));
const picked = (runId, sel, search) => linesOf(runId).filter((l) => lineMatches(l, sel) && found(l, search));
const byLineId = (a, b) => Number(a.line_id) - Number(b.line_id);
function ordered(rows, order) {
  const keys = [...order, { column: 'effective_broker_name', desc: false }, { column: 'line_ref', desc: false }];
  return rows.slice().sort((a, b) => {
    for (const k of keys) {
      const x = a[k.column] ?? '', y = b[k.column] ?? '';
      if (x !== y) return (x < y ? -1 : 1) * (k.desc ? -1 : 1);
    }
    return Number(b.line_id) - Number(a.line_id);
  });
}
const currentRun = (token) => RUNS.filter((r) => r.month_token === token).sort((a, b) => b.revision - a.revision)[0] ?? null;
const db = {
  runs: async ({ status, search, page }) => {
    const words = search.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
    const rows = RUNS.filter((r) => (!status || r.status === status) && words.every((w) => r.month_token.toLowerCase().includes(w)))
      .sort(newestFirst);
    return { rows: copy(rows.slice((page - 1) * 100, page * 100)), count: rows.length };
  },
  runUsageRows: async () => RUNS.slice().sort(newestFirst).map((r) => ({ monthToken: r.month_token, consumptionMonth: r.consumption_month })),
  run: async (id) => copy(RUNS.find((r) => r.run_id === id) ?? null),
  selectedToken: async (q) => {
    const asked = q.run && q.run.length ? q.run[q.run.length - 1] : '';
    return asked || RUNS.slice().sort(newestFirst)[0].month_token;
  },
  monthTokens: async () => [...new Set(RUNS.slice().sort(newestFirst).map((r) => r.month_token))],
  currentRun: async (token) => copy(currentRun(token)),
  lineChoices: async (runId) => {
    const rows = linesOf(runId);
    return { reasons: rows.map((l) => l.rule_comments), brokers: rows.map((l) => ({ id: l.effective_broker_id, name: l.effective_broker_name })),
      sources: rows.map((l) => l.source) };
  },
  lines: async (runId, sel, search, order, page) =>
    copy(ordered(picked(runId, sel, search), order).slice((page - 1) * LINES_PAGE_SIZE, page * LINES_PAGE_SIZE)),
  lineAmounts: async (runId, sel, search) => picked(runId, sel, search).map((l) => l.broker_due_gbp),
  payableRows: async (runId) => linesOf(runId).map((l) => ({ rulePay: l.rule_pay, decidedPay: l.decided_pay, due: l.broker_due_gbp })),
  line: async (id) => copy(LINES.find((l) => l.line_id === id) ?? null),
  decisions: async ({ pay, page }) => {
    const rows = DECISIONS.filter((d) => !pay || d.decided_pay === pay);
    return { rows: copy(rows.slice((page - 1) * 100, page * 100)), count: rows.length };
  },
  decision: async (id) => copy(DECISIONS.find((d) => d.decision_id === id) ?? null),
  runExceptions: async (runId) => (runId === JUNE ? copy(FIX.exceptions) : []),
  runLines: async (runId) => (runId === JUNE ? FIX.lines.map((l) => ({ ...copy(l), entered_uplift: null })) : []),
  enteredUplifts: async () => copy(FIX.enteredUplifts),
  dealsByMeter: async () => dealsFromRows(copy(FIX.deals)),
  brokerResolver: async () => makeResolver(copy(FIX.brokers), copy(FIX.aliases)),
  billingFacts: async () => copy(FIX.billing),
  // Deciding (piece 2): the reads the /decide, /set-broker, /choose-broker and /resolve pages make.
  decideScope: async (token, sel, search) => {
    const r = currentRun(token);
    return (r ? picked(r.run_id, sel, search) : []).slice().sort(byLineId)
      .map((l) => ({ lineId: l.line_id, decisionId: l.current_decision_id }));
  },
  decideRows: async (ids) => LINES.filter((l) => ids.includes(l.line_id)).sort(byLineId).map((l) => ({
    line_id: l.line_id, line_ref: l.line_ref, run_id: l.run_id, month_token: l.run_month_token, run_status: l.run_status,
    superseded: false, broker_due_gbp: l.broker_due_gbp, rule_pay: l.rule_pay, decided_pay: l.decided_pay,
    decided_by: l.decided_by, current_decision_id: l.current_decision_id })),
  payableNow: async (token) => {
    const r = currentRun(token);
    return sumDec(['0.00', ...(r ? linesOf(r.run_id) : []).filter((l) => l.broker_due_gbp !== null &&
      (l.decided_pay || l.rule_pay) === 'Yes').map((l) => l.broker_due_gbp)]);
  },
  exceptionForFix: async (id, code) => {
    const e = FIX.exceptions.find((x) => x.exception_id === id && x.code === code);
    if (!e) return null;
    const l = LINES.find((x) => x.line_ref === e.subject);
    return copy({ exception_id: e.exception_id, code: e.code, subject: e.subject, detail: e.detail ?? null,
      resolved_at: e.resolved_at ?? null, resolved_by: e.resolved_by ?? null, resolution: e.resolution ?? null,
      run_id: JUNE, month_token: 'June26', run_status: 'draft',
      line: l ? { line_id: l.line_id, line_ref: l.line_ref, supplier_id: l.supplier_id, contract_id: l.contract_id,
        mpxn: l.mpxn, customer_name: l.customer_name, contract_start: l.contract_start, broker_due_gbp: l.broker_due_gbp,
        effective_broker_id: l.effective_broker_id, effective_broker_name: l.effective_broker_name } : null });
  },
  // One invented snapshot deal on any meter.
  dealsOnMeter: async () => [{ hubspot_id: '90000004', contract_start_date: '2026-04-01', contract_end_date: '2028-03-31',
    live_status: 'Live', broker_name: 'Example Brokers Ltd' }],
  brokerChoices: async () => FIX.brokers.filter(([, id]) => id !== null).map(([key, id, name]) => ({ key, id, name }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  exceptionsByIds: async (ids) => FIX.exceptions.filter((e) => ids.includes(e.exception_id))
    .sort((a, b) => Number(a.exception_id) - Number(b.exception_id))
    .map((e) => ({ exception_id: e.exception_id, resolved_at: e.resolved_at ?? null, month_token: 'June26' })),
};

// ---- the requests the preview answers: the four pages, a filter, a month, and the details.
const REQUESTS = [
  ['/runs', {}], ['/runs', { status: ['approved'] }],
  ['/run', { id: [JUNE] }], ['/run', { id: ['44444444-4444-4444-8444-444444444444'] }],
  ['/run', { id: ['22222222-2222-4222-8222-222222222222'] }],
  ['/lines', {}], ['/lines', { run: ['June26'] }], ['/lines', { run: ['June26'], outcome: ['Maybe', 'Yes'] }],
  ['/lines', { run: ['May26'] }],
  ['/line', { id: ['501'] }], ['/line', { id: ['512'] }],
  ['/exceptions', {}], ['/exceptions', { run: ['June26'] }],
  ['/decisions', {}], ['/decisions', { decided_pay: ['Yes'] }],
  ['/decision', { id: ['7003'] }],
  ['/line', { id: ['999'] }],
];

// A request's query from an address's or a form's pairs, every value kept.
function queryOf(pairs) {
  const q = {};
  for (const [k, v] of pairs) (q[k] ??= []).push(v);
  return q;
}
// The five entities esc() writes, back to text.
const unesc = (v) => v.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&');

async function draw(path, query, who) {
  try {
    const page = await VIEWS[path](db, query, NOW, who);
    return { status: 200, title: page.title, html: page.html };
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    return { status: e.status, error: e.message };
  }
}

const answers = [];
const asked = new Set();
function keep(path, query, answer) {
  const same = answers.find((a) => a.who === answer.who && a.status === answer.status && a.title === answer.title &&
    a.html === answer.html && a.error === answer.error);
  if (same) same.requests.push({ path, query });
  else answers.push(answer.who ? { who: answer.who, requests: [{ path, query }], ...answer } : { requests: [{ path, query }], ...answer });
}
// A page for both people: one entry when they see the same, else one for each.
async function both(path, query) {
  const key = path + JSON.stringify(query);
  if (asked.has(key)) return null;
  asked.add(key);
  const forDecider = await draw(path, query, DECIDER);
  const forViewer = await draw(path, query, VIEWER);
  if (forDecider.html === forViewer.html && forDecider.error === forViewer.error) keep(path, query, forDecider);
  else { keep(path, query, { ...forDecider, who: 'decide' }); keep(path, query, { ...forViewer, who: 'view' }); }
  return forDecider;
}

const drawn = [];
for (const [path, query] of REQUESTS) {
  const page = await both(path, query);
  if (page && page.html) drawn.push(page.html);
}

// The deciding pages, at the addresses the decider's pages lead to: every link to one of them, the
// bulk form's /decide for the first two lines (Yes) and for all the lines (No), and Choose broker by
// its address (nothing links to it: the Exceptions page posts its own form).
const deciding = new Map();
const add = (path, query) => deciding.set(path + JSON.stringify(query), [path, query]);
for (const html of drawn) {
  for (const m of html.matchAll(/href="(\/(?:set-broker|choose-broker|resolve|decide)\?[^"]*)"/g)) {
    const u = new URL(unesc(m[1]), 'https://ce.invalid');
    add(u.pathname, queryOf(u.searchParams));
  }
  const bulk = /<form method="get" action="\/decide" class="ce-bulk">(.*?)<div class="ce-bulk-acts">/.exec(html);
  if (bulk) {
    const fields = [...bulk[1].matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)].map((h) => [h[1], unesc(h[2])]);
    add('/decide', queryOf([...fields, ['line', '501'], ['line', '502'], ['pay', 'Yes']]));
    add('/decide', queryOf([...fields, ['all', '1'], ['pay', 'No']]));
  }
}
add('/choose-broker', { exception: ['9001'], next: ['/exceptions?run=June26'] });
for (const [path, query] of deciding.values()) {
  const page = await draw(path, query, DECIDER);
  keep(path, query, page);
  // Where its forms and links go back to, so the preview can follow them.
  for (const m of (page.html ?? '').matchAll(/name="next" value="([^"]*)"/g)) {
    const u = new URL(unesc(m[1]), 'https://ce.invalid');
    await both(u.pathname, queryOf(u.searchParams));
  }
}
// After Exceptions' own forms, the page goes to their `next`.
for (const html of drawn) {
  for (const m of html.matchAll(/<form method="post" action="[^"]*">(?:<input type="hidden" name="[^"]*" value="[^"]*">)*/g)) {
    for (const n of m[0].matchAll(/name="next" value="([^"]*)"/g)) {
      const u = new URL(unesc(n[1]), 'https://ce.invalid');
      await both(u.pathname, queryOf(u.searchParams));
    }
  }
}

// The function's own sentences, for the stub's act answers.
const SAY = {
  noReason: say.validate('No', ''),
  noNote: say.validateResolution(''),
  stale: say.staleMessage([{ lineId: '512', lineRef: 'YU-9100000012-2026-06', decidedBy: 'sam@example.test',
    decidedAt: '2026-11-13T09:58:00.000Z' }]),
  settled: say.alreadySettledRefusal(44, '<img src=x onerror=alert(1)>'),
  fixSaved: say.fixSavedMessage(true),
  chosen1: say.chosenMessage(1),
  uplift15: say.upliftSavedMessage('1.5', '0'),
  marked1Yes: say.markedMessage(1, 'Yes'), marked1No: say.markedMessage(1, 'No'),
  marked2Yes: say.markedMessage(2, 'Yes'), marked2No: say.markedMessage(2, 'No'),
  resolved1: say.resolvedMessage(1, 0), resolved2: say.resolvedMessage(2, 0),
};

// ASCII only, and no "</" or "<!", so the stub is safe inside the page's <script>.
const safe = (v) => JSON.stringify(v).replace(/[^\x00-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  .replaceAll('</', '<\\/').replaceAll('<!', '<\\u0021');
const lines = answers.map((a) => '    ' + safe(a) + ',');
const sayLines = Object.entries(SAY).map(([k, v]) => `    ${k}: ${safe(v)}`);
const stub = readFileSync(STUB, 'utf8');
const start = stub.indexOf(BEGIN), end = stub.indexOf(END);
if (start < 0 || end < start) throw new Error(`${STUB} has no ${BEGIN.trim()} ... ${END.trim()} block`);
const head = stub.slice(0, start) + BEGIN + ": made by tools/ce-preview-pages.mjs from dyce-spine's commission-engine function. Do not edit by hand.\n";
writeFileSync(STUB, head + '  var CE_PAGES = [\n' + lines.join('\n') + '\n  ];\n' +
  '  var CE_SAY = {\n' + sayLines.join(',\n') + '\n  };\n' + stub.slice(end), 'utf8');
const count = answers.reduce((n, a) => n + a.requests.length, 0);
console.log(`wrote ${answers.length} answers for ${count} requests and ${Object.keys(SAY).length} sentences into ${STUB}`);
