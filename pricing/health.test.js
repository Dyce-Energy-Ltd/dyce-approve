import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS, bookHealth, ageText } from './health.js';

// Invented files and failures only.
const NOW = Date.parse('2026-11-23T09:00:00Z');
const file = (supplierId, fuel, name, loadedAt, extra) => Object.assign({
  supplierFileId: name, supplierId, fuel, sourceFilename: name, loadedAt,
  rowCountSource: 10, rowCountLoaded: 10, refusedCount: 0, state: 'awaiting_bandings', stateLabel: 'Awaiting bandings',
}, extra);
const failure = (supplierId, fuel, sourcePath, seenAt, reason) => ({ driveItemId: sourcePath, sourcePath, supplierId, fuel, reason, seenAt });

test('one row per SharePoint Base Prices folder, in the loader\'s order', () => {
  assert.deepEqual(BOOKS.map((b) => b.supplierId + ' ' + b.fuel), [
    'voltx electricity', 'yu electricity', 'yu gas', 'jellyfish electricity', 'jellyfish gas',
  ]);
  assert.equal(bookHealth([], [], NOW).length, 5);
});

test('a book shows its newest file, whatever its state', () => {
  const rows = bookHealth([
    file('yu', 'gas', 'old.xlsx', '2026-11-17T10:00:00Z', { state: 'live', stateLabel: 'Live' }),
    file('yu', 'gas', 'new.xlsx', '2026-11-20T12:46:00Z'),
    file('yu', 'electricity', 'elec.xlsx', '2026-11-21T08:00:00Z'),
  ], [], NOW);
  const gas = rows.find((r) => r.supplierId === 'yu' && r.fuel === 'gas');
  assert.equal(gas.status, 'file');
  assert.equal(gas.file.sourceFilename, 'new.xlsx');
  assert.equal(gas.failure, null);
  assert.equal(rows.find((r) => r.supplierId === 'voltx').status, 'none');
});

test('a failure newer than the newest file is shown; an older one is not', () => {
  const files = [file('jellyfish', 'electricity', 'a.csv', '2026-11-20T14:05:00Z')];
  const newer = bookHealth(files, [failure('jellyfish', 'electricity', 'b.csv', '2026-11-22T10:00:00Z', 'unknown NDA band')], NOW)
    .find((r) => r.supplierId === 'jellyfish' && r.fuel === 'electricity');
  assert.equal(newer.status, 'failed');
  assert.equal(newer.failure.reason, 'unknown NDA band');
  assert.equal(newer.file.sourceFilename, 'a.csv');   // the last good file is still shown
  const older = bookHealth(files, [failure('jellyfish', 'electricity', 'b.csv', '2026-11-19T10:00:00Z', 'x')], NOW)
    .find((r) => r.supplierId === 'jellyfish' && r.fuel === 'electricity');
  assert.equal(older.status, 'file');
  assert.equal(older.failure, null);
});

test('a failure with no file at all is shown as failed', () => {
  const r = bookHealth([], [failure('voltx', 'electricity', 'v.xls', '2026-11-22T10:00:00Z', 'This file type is not read: .xls.')], NOW)[0];
  assert.equal(r.status, 'failed');
  assert.equal(r.file, null);
});

test('a failure without supplier or fuel belongs to no book', () => {
  const rows = bookHealth([], [failure(null, null, 'stray.csv', '2026-11-22T10:00:00Z', 'x')], NOW);
  assert.ok(rows.every((r) => r.status === 'none'));
});

test('age in UK calendar days, in words', () => {
  assert.equal(ageText('2026-11-23T08:00:00Z', NOW), 'today');
  assert.equal(ageText('2026-11-22T23:30:00Z', NOW), '1 day ago');   // late last night is not today
  assert.equal(ageText('2026-06-30T23:30:00Z', Date.parse('2026-07-01T08:00:00Z')), 'today');   // 00:30 BST
  assert.equal(ageText('2026-11-22T08:00:00Z', NOW), '1 day ago');
  assert.equal(ageText('2026-11-17T08:00:00Z', NOW), '6 days ago');
  assert.equal(ageText(null, NOW), '');
  assert.equal(ageText('not a date', NOW), '');
});
