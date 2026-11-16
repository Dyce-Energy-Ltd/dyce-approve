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
const FIX = JSON.parse(readFileSync(join(folder, 'golden', 'fixtures.json'), 'utf8')).exceptions;

const copy = (v) => JSON.parse(JSON.stringify(v));

// ---- the invented runs: June26 is the fixtures' run; Mar26 records the wrong usage month.
const JUNE = '11111111-1111-4111-8111-111111111111';
const run = (o) => ({ consumption_month: null, id625_source_month: null, source_files: [], built_by: 'builder',
  approved_by: null, approved_at: null, ...o });
const RUNS = [
  run({ run_id: JUNE, month_token: 'June26', revision: 2, consumption_month: 'June 2026', id625_source_month: '2026-06-15',
    status: 'draft', built_at: '2026-07-02T09:30:00.000Z',
    source_files: [{ name: 'ID625 June 2026 example.xlsx', size: 48211, sha256: '5f0c0a7e1c9b4d2a8e6f3b1d0c9a8e7f6d5c4b3a2918f7e6d5c4b3a291807f6e' }] }),
  run({ run_id: '11111111-1111-4111-8111-111111111110', month_token: 'June26', revision: 1, consumption_month: 'June 2026',
    id625_source_month: '2026-06-15', status: 'superseded', built_at: '2026-07-01T16:05:00.000Z' }),
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
  currentRun: async (token) => copy(RUNS.filter((r) => r.month_token === token).sort((a, b) => b.revision - a.revision)[0] ?? null),
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

const answers = [];
for (const [path, query] of REQUESTS) {
  let answer;
  try {
    const page = await VIEWS[path](db, query, NOW);
    answer = { status: 200, title: page.title, html: page.html };
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    answer = { status: e.status, error: e.message };
  }
  const same = answers.find((a) => a.status === answer.status && a.title === answer.title && a.html === answer.html && a.error === answer.error);
  if (same) same.requests.push({ path, query });
  else answers.push({ requests: [{ path, query }], ...answer });
}

// ASCII only, and no "</" or "<!", so the stub is safe inside the page's <script>.
const lines = answers.map((a) => '    ' + JSON.stringify(a).replace(/[^\x00-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  .replaceAll('</', '<\\/').replaceAll('<!', '<\\u0021') + ',');
const stub = readFileSync(STUB, 'utf8');
const start = stub.indexOf(BEGIN), end = stub.indexOf(END);
if (start < 0 || end < start) throw new Error(`${STUB} has no ${BEGIN.trim()} ... ${END.trim()} block`);
const head = stub.slice(0, start) + BEGIN + ": made by tools/ce-preview-pages.mjs from dyce-spine's commission-engine function. Do not edit by hand.\n";
writeFileSync(STUB, head + '  var CE_PAGES = [\n' + lines.join('\n') + '\n  ];\n' + stub.slice(end), 'utf8');
console.log(`wrote ${answers.length} answers for ${REQUESTS.length} requests into ${STUB}`);
