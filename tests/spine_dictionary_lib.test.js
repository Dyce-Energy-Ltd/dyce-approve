const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../parts/spine-dictionary-lib.js");

// Invented views, shaped as the spine-dictionary function gives them.
const views = [
  { name: "broker_comms", description: "One row per broker email address.\nMore detail.", columns: [
    { name: "broker_id", description: "The broker's number." },
    { name: "email", description: null }] },
  { name: "contract", description: "One row per supplier contract.", columns: [
    { name: "contract_id", description: "The contract's number." },
    { name: "supplier_id", description: "Which Supplier holds it." }] },
  { name: "postcode_ldz", description: null, columns: [
    { name: "postcode", description: "The postcode, with its space." },
    { name: "ldz", description: "The gas local distribution zone." }] },
];

test("friendly: underscores become spaces and the first letter a capital", () => {
  assert.equal(L.friendly("broker_comms"), "Broker comms");
  assert.equal(L.friendly("postcode_ldz"), "Postcode ldz");
  assert.equal(L.friendly("contract"), "Contract");
  assert.equal(L.friendly(""), "");
  assert.equal(L.friendly(null), "");
});

test("firstLine: the text before the first line break, or nothing", () => {
  assert.equal(L.firstLine(null), "");
  assert.equal(L.firstLine(undefined), "");
  assert.equal(L.firstLine(""), "");
  assert.equal(L.firstLine("One row per contract."), "One row per contract.");
  assert.equal(L.firstLine("One row per contract.\nGrain: one per deal.\nMore."), "One row per contract.");
  assert.equal(L.firstLine("  One row per contract.  \nMore."), "One row per contract.");
});

test("search: case-insensitive, over column names and explanations, grouped by view", () => {
  const ldz = L.search(views, "LDZ");
  assert.equal(ldz.length, 1);
  assert.equal(ldz[0].view.name, "postcode_ldz");
  assert.deepEqual(ldz[0].columns.map((c) => c.name), ["ldz"]);
  // An explanation matches, in any case.
  const supplier = L.search(views, "supplier");
  assert.deepEqual(supplier.map((r) => r.view.name), ["contract"]);
  assert.deepEqual(supplier[0].columns.map((c) => c.name), ["supplier_id"]);
  // Matches in two views keep the views' order, and each view's columns in their order.
  const number = L.search(views, "number");
  assert.deepEqual(number.map((r) => [r.view.name, r.columns.map((c) => c.name)]),
    [["broker_comms", ["broker_id"]], ["contract", ["contract_id"]]]);
  // A column with no explanation still matches on its name.
  assert.deepEqual(L.search(views, "EMAIL").map((r) => [r.view.name, r.columns.map((c) => c.name)]),
    [["broker_comms", ["email"]]]);
});

test("search: a view's friendly name matches, with only the columns that match too", () => {
  assert.deepEqual(L.search(views, "broker comms").map((r) => [r.view.name, r.columns.length]), [["broker_comms", 0]]);
  assert.deepEqual(L.search(views, "postcode").map((r) => [r.view.name, r.columns.map((c) => c.name)]),
    [["postcode_ldz", ["postcode"]]]);
});

test("search: an empty query, or nothing that matches, gives nothing", () => {
  assert.deepEqual(L.search(views, ""), []);
  assert.deepEqual(L.search(views, "   "), []);
  assert.deepEqual(L.search(views, null), []);
  assert.deepEqual(L.search(views, "zzz"), []);
  assert.deepEqual(L.search(null, "ldz"), []);
});

test("search: the query is text, not a pattern", () => {
  assert.deepEqual(L.search(views, "("), []);
  assert.deepEqual(L.search(views, ".*"), []);
  assert.deepEqual(L.search(views, "broker's").map((r) => r.view.name), ["broker_comms"]);
});
