const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../parts/pool-lib.js");

const votes = [
  {email: "a@example.test", name: "Ann Test", board: "b1", verdict: "keep", audiences: ["wall", "app_all"], note: "", voted_at: "2026-11-01T10:00:00Z", current: true},
  {email: "b@example.test", name: "Bob Test", board: "b1", verdict: "drop", audiences: [], note: "no", voted_at: "2026-11-02T10:00:00Z", current: true},
  {email: "c@example.test", name: "Cy Test", board: "b1", verdict: "pass", audiences: [], note: "", voted_at: "2026-11-02T11:00:00Z", current: false},
  {email: "d@example.test", name: "Di Test", board: "b1", verdict: "maybe", audiences: ["wall"], note: "", voted_at: "2026-11-03T10:00:00Z", current: true},
  {email: "a@example.test", name: "Ann Test", board: "b2", verdict: "maybe", audiences: ["wall"], note: "", voted_at: "2026-11-01T10:00:00Z", current: true},
];

test("verdict constants include pass", () => {
  assert.deepEqual(L.VERDICTS, ["keep", "maybe", "drop", "pass"]);
  assert.equal(L.VERDICT_LABEL.pass, "Pass");
  assert.equal(L.VERDICT_LABEL.keep, "Keep");
});

test("tally counts each verdict, pass separately, over the flat array", () => {
  const t = L.tally(votes, "b1");
  assert.deepEqual([t.keep, t.maybe, t.drop, t.pass], [1, 1, 1, 1]);
  assert.equal(t.voters.length, 4);
  assert.deepEqual(t.voters.map(v => v.email), ["a@example.test", "b@example.test", "c@example.test", "d@example.test"]);
  assert.deepEqual(L.tally(undefined, "b1"), {keep: 0, maybe: 0, drop: 0, pass: 0, voters: []});
  assert.equal(L.tally(votes, "none").voters.length, 0);
});

test("audienceCounts counts keep and maybe votes only", () => {
  const c = L.audienceCounts(votes, "b1", ["wall", "app_all", "app_mgmt"]);
  assert.deepEqual(c, {wall: 2, app_all: 1, app_mgmt: 0});
  assert.deepEqual(L.suggestedAudiences(c), ["wall"]);
  assert.deepEqual(L.suggestedAudiences({wall: 0, app_all: 0}), []);
});

test("votedCount ignores votes that are not current", () => {
  assert.equal(L.votedCount(votes, "b1"), 3);
  assert.equal(L.votedCount(votes, "b2"), 1);
  assert.equal(L.votedCount([], "b1"), 0);
  assert.equal(L.votedCount(undefined, "b1"), 0);
});

test("changedSinceDecided", () => {
  const d = {board: "b1", decision: "keep", audiences: [], decided_by: "x", decided_at: "2026-11-02T10:30:00Z"};
  assert.equal(L.changedSinceDecided(votes.filter(v => v.board === "b1"), d), true);
  assert.equal(L.changedSinceDecided([votes[0], votes[1]], d), false);
  assert.equal(L.changedSinceDecided(votes, null), false);
  assert.equal(L.changedSinceDecided(votes, undefined), false);
});

test("myMark gives the verdict or null", () => {
  assert.equal(L.myMark(votes, "a@example.test", "b1"), "keep");
  assert.equal(L.myMark(votes, "c@example.test", "b1"), "pass");
  assert.equal(L.myMark(votes, "a@example.test", "b3"), null);
  assert.equal(L.myMark(votes, "z@example.test", "b1"), null);
});

test("reviewedCount counts the boards this person has marked", () => {
  assert.equal(L.reviewedCount(votes, "a@example.test"), 2);
  assert.equal(L.reviewedCount(votes, "b@example.test"), 1);
  assert.equal(L.reviewedCount(votes, "z@example.test"), 0);
  assert.equal(L.reviewedCount(undefined, "a@example.test"), 0);
});

test("boardAsAt gives the fallback date for a fallback board", () => {
  const snap = {as_at: "2026-10-31", fallback: {b2: {as_at: "2026-09-30", reason: "r"}}};
  assert.equal(L.boardAsAt(snap, "b2"), "2026-09-30");
  assert.equal(L.boardAsAt(snap, "b1"), "2026-10-31");
  assert.equal(L.boardAsAt({as_at: "2026-10-31"}, "b1"), "2026-10-31");
});

test("draftFor lets an unsaved draft win over a newer saved vote", () => {
  const saved = {verdict: "keep", audiences: ["wall"], note: "saved note"};
  const drafts = {b1: {verdict: "maybe", audiences: ["app_ops"], note: "draft note"}};
  assert.deepEqual(L.draftFor(drafts, saved, "b1"), {verdict: "maybe", audiences: ["app_ops"], note: "draft note"});
  assert.deepEqual(L.draftFor({}, saved, "b1"), {verdict: "keep", audiences: ["wall"], note: "saved note"});
  assert.deepEqual(L.draftFor(undefined, undefined, "b1"), {verdict: null, audiences: [], note: ""});
});

test("voteLine is plain text and keeps markup as text", () => {
  const v = {name: "Ann Test", verdict: "keep", audiences: ["wall", "app_sales"], note: "<img src=x>"};
  assert.equal(L.voteLine(v), "Ann Test: Keep (Wallboard, App: Sales). <img src=x>");
  assert.equal(L.voteLine({name: "Bob Test", verdict: "drop", audiences: [], note: ""}), "Bob Test: Drop");
  assert.equal(L.voteLine({name: "Cy Test", verdict: "pass", audiences: [], note: "later"}), "Cy Test: Pass. later");
});

test("filterBoards", () => {
  const boards = [
    {id: "b3", num: 3, area: "ops"}, {id: "b1", num: 1, area: "sales"}, {id: "b2", num: 2, area: "ops"},
  ];
  const ctx = {votes: votes.concat([{email: "me@example.test", name: "Me", board: "b2", verdict: "pass", audiences: [], note: "", voted_at: "2026-11-04T10:00:00Z", current: true}]),
    email: "me@example.test", decisions: [{board: "b1", decision: "keep", audiences: [], decided_by: "x", decided_at: "2026-11-02T10:30:00Z"}]};
  assert.deepEqual(L.filterBoards(boards, {}, ctx).map(b => b.id), ["b1", "b2", "b3"]);
  assert.deepEqual(L.filterBoards(boards, {area: "ops"}, ctx).map(b => b.id), ["b2", "b3"]);
  assert.deepEqual(L.filterBoards(boards, {toReview: true}, ctx).map(b => b.id), ["b1", "b3"]);
  assert.deepEqual(L.filterBoards(boards, {awaiting: true}, ctx).map(b => b.id), ["b2"]);
  assert.deepEqual(L.filterBoards(boards, {changed: true}, ctx).map(b => b.id), ["b1"]);
  assert.deepEqual(L.filterBoards(boards, {}, undefined).map(b => b.id), ["b1", "b2", "b3"]);
});

test("the library holds no hard-coded board count", () => {
  assert.equal(typeof L.reviewedCount, "function");
  assert.equal(L.reviewedCount(votes, "a@example.test"), 2);
});

test("fmt shows a dash for unknown values", () => {
  for (const f of ["int", "gbp", "kwh", "pct", "date", "top"]) {
    assert.equal(L.fmt(null, f), L.DASH);
    assert.equal(L.fmt(undefined, f), L.DASH);
  }
  assert.equal(L.fmt(0, "int"), "0");
});

test("fmt numbers", () => {
  assert.equal(L.fmt(12345, "int"), "12,345");
  assert.equal(L.fmt(1234.5, "gbp"), "£1,235");
  assert.equal(L.fmt(892.62, "gbp"), "£892.62");
  assert.equal(L.fmt(-50, "gbp"), "-£50.00");
  assert.equal(L.fmt(2500000, "kwh"), "2.5 GWh");
  assert.equal(L.fmt(45000, "kwh"), "45 MWh");
  assert.equal(L.fmt(950, "kwh"), "950 kWh");
  assert.equal(L.fmt(12.34, "pct"), "12.3%");
  assert.equal(L.fmt(1, "days"), "1 day");
  assert.equal(L.fmt(2.5, "days"), "2.5 days");
  assert.equal(L.fmt(45, "minutes"), "45 min");
  assert.equal(L.fmt(125, "minutes"), "2h 05m");
  assert.equal(L.fmt(0.21, "ppkwh"), "0.210p/kWh");
  assert.equal(L.fmt(5, "ppday"), "5.000p/day");
});

test("fmt dates, months, text and top", () => {
  assert.equal(L.fmt("2026-10-13", "date"), "13/10/2026");
  assert.equal(L.fmt("2026-07-01", "month"), "Jul 2026");
  assert.equal(L.fmt("2026-10-06T10:07:00", "datetime"), "06/10/2026 10:07");
  assert.equal(L.fmt("Current", "text"), "Current");
  assert.equal(L.fmt([{label: "A", value: 3}, {label: "B", value: 2}, {label: "C", value: 1}, {label: "D", value: 0}], "top"), "A, B, C");
  assert.equal(L.fmt([], "top"), L.DASH);
});

test("ukDateTime converts UTC to London and leaves naive times alone", () => {
  assert.equal(L.ukDateTime("2026-07-01T12:00:00Z"), "01/07/2026 13:00");
  assert.equal(L.ukDateTime("2026-12-01T12:00:00Z"), "01/12/2026 12:00");
  assert.equal(L.ukDateTime("2026-10-06T10:07:00"), "06/10/2026 10:07");
  assert.equal(L.ukDateTime("2026-10-06"), "06/10/2026");
});

test("axisLabel", () => {
  assert.equal(L.axisLabel("2026-09"), "Sep 26");
  assert.equal(L.axisLabel("2026-09-28"), "28/09");
  assert.equal(L.axisLabel("Direct"), "Direct");
});

test("fillTemplate fills placeholders with formatted values", () => {
  const row = {n: 145, total: 739, gbp: 1234.5, missing: null};
  assert.equal(L.fillTemplate("{n:int} meters of {total:int}", row), "145 meters of 739");
  assert.equal(L.fillTemplate("Value {gbp:gbp}", row), "Value £1,235");
  assert.equal(L.fillTemplate("Gone {missing:int}", row), "Gone " + L.DASH);
  assert.equal(L.fillTemplate("No placeholders", row), "No placeholders");
  assert.equal(L.fillTemplate("{n}", row), "145");
  assert.equal(L.fillTemplate("{nope:int}", row), L.DASH);
  assert.equal(L.fillTemplate(undefined, row), "");
});

test("fmt unknown values return dash for all formats", () => {
  const formats = ["int", "gbp", "kwh", "pct", "days", "minutes", "ppkwh", "ppday", "text", "date", "datetime", "month", "top"];
  for (const f of formats) {
    assert.equal(L.fmt(null, f), L.DASH, `fmt(null, "${f}")`);
    assert.equal(L.fmt(undefined, f), L.DASH, `fmt(undefined, "${f}")`);
    assert.equal(L.fmt("", f), L.DASH, `fmt("", "${f}")`);
  }
});

test("fmt zero survives across formats", () => {
  assert.equal(L.fmt(0, "gbp"), "£0.00");
  assert.equal(L.fmt(0, "kwh"), "0 kWh");
  assert.equal(L.fmt(0, "pct"), "0.0%");
  assert.equal(L.fmt(0, "days"), "0 days");
});

test("fmt negative kwh", () => {
  assert.equal(L.fmt(-2500000, "kwh"), "-2.5 GWh");
});

test("ukDateTime with explicit offset", () => {
  assert.equal(L.ukDateTime("2026-07-01T12:00:00+01:00"), "01/07/2026 12:00");
});

test("ukDateTime around clock change", () => {
  assert.equal(L.ukDateTime("2026-10-25T00:30:00Z"), "25/10/2026 01:30");
  assert.equal(L.ukDateTime("2026-10-25T01:30:00Z"), "25/10/2026 01:30");
});

test("plainTables rewrites spine table names in plain words", () => {
  assert.equal(L.plainTables("spine.entity_quote rows with outcome Lost"), "Rows in the quote table in the spine with outcome Lost");
  assert.equal(L.plainTables("Count of rows in spine.entity_contract whose"), "Count of rows in the contract table in the spine whose");
  assert.equal(L.plainTables("Count of entity_contract rows whose"), "Count of rows in the contract table in the spine whose");
});

test("plainTables does not mangle quote_option into quote", () => {
  assert.equal(L.plainTables("Sum over spine.entity_quote_option rows"), "Sum over rows in the quote options table in the spine");
  assert.equal(L.plainTables("from entity_quote_option."), "From the quote options table in the spine.");
});

test("plainTables handles the broker alias list, unknown tables and digits", () => {
  assert.equal(L.plainTables("matched through spine.broker_alias"), "Matched through the broker alias list in the spine");
  assert.equal(L.plainTables("uses spine.entity_foo_bar"), "Uses the foo bar table in the spine");
  assert.equal(L.plainTables("spine.entity_5yp_by_month, then spine.entity_id625_arrears."),
    "The five-year plan table in the spine, then the ID625 arrears table in the spine.");
  assert.equal(L.plainTables("No tables here"), "No tables here");
});

test("plainTables handles the singular row (board 17 and 18 definitions)", () => {
  assert.equal(
    L.plainTables("Every spine.entity_loss_report row with loss_cos_date in this calendar month, whatever its status."),
    "Every row in the loss report table in the spine with loss_cos_date in this calendar month, whatever its status.");
  assert.equal(
    L.plainTables("Every spine.entity_loss_report row grouped by loss_status, named as on wallboard 6."),
    "Every row in the loss report table in the spine grouped by loss_status, named as on wallboard 6.");
  assert.equal(L.plainTables("Count of spine.entity_quote rows won"), "Count of rows in the quote table in the spine won");
  assert.equal(L.plainTables("spine.entity_quote rowsum"), "The quote table in the spine rowsum");
});

test("plainTables does not capitalise an identifier", () => {
  assert.equal(L.plainTables("month_token is read from spine.entity_contract"), "month_token is read from the contract table in the spine");
  assert.equal(L.plainTables("loss_status counted in spine.entity_quote rows"), "loss_status counted in rows in the quote table in the spine");
});
