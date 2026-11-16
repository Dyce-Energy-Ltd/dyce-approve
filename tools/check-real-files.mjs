// LOCAL ONLY. Never run in CI, never commit its output.
// Reads the real supplier files in C:/dev/Projects/pricing/ through the adapters and prints COUNTS
// only: rows read, converted, refused by reason. No supplier value is printed or written anywhere.
// Run: node tools/check-real-files.mjs [folder]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseSupplierFile } from '../pricing/adapters.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const XLSX = createRequire(import.meta.url)(path.join(here, '..', 'vendor', 'xlsx.full.min.js'));
const dir = process.argv[2] || 'C:/dev/Projects/pricing';

// Which real file feeds which adapter. The names are matched by pattern, not printed with dates.
const FILES = [
  ['voltx_elec_v1', /^Voltx.*\.xlsx$/i],
  ['yu_elec_v1', /^YU Energy - Elec.*\.xlsx$/i],
  ['yu_gas_v1', /^YU Energy - Gas.*\.xlsx$/i],
  ['jellyfish_elec_v1', /^Jellyfish Elec.*\.csv$/i],
  ['jellyfish_gas_v1', /^Jell+yfish Gas.*\.csv$/i],
];

let failed = false;
const names = fs.readdirSync(dir);
for (const [format, pattern] of FILES) {
  const name = names.find((n) => pattern.test(n));
  if (!name) { console.log(`${format}: file not found`); failed = true; continue; }
  const full = path.join(dir, name);
  const wb = name.toLowerCase().endsWith('.csv')
    ? XLSX.read(fs.readFileSync(full, 'utf8'), { type: 'string', raw: true })
    : XLSX.read(fs.readFileSync(full), { type: 'array' });
  try {
    const out = parseSupplierFile(format, wb);
    const byReason = {};
    for (const r of out.refused) {
      const reason = r.reason.replace(/\d/g, '#');   // keep reasons generic
      byReason[reason] = (byReason[reason] || 0) + 1;
    }
    console.log(`${format}: read ${out.rowCountSource}, converted ${out.rows.length}, refused ${out.refused.length}`);
    for (const [reason, n] of Object.entries(byReason).sort()) console.log(`    ${n}  ${reason}`);
  } catch (e) {
    failed = true;
    console.log(`${format}: THREW ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
