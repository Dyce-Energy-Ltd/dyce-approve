// Price book health for the Pricing tab's Supplier files screen (Phil Brook, 20/11/2026): for each
// SharePoint Base Prices folder the loader reads, the newest file received and, if a later file
// failed to load, that failure. Pure functions, no DOM.
//
// BOOKS is the folder list of dyce-data-pipelines pricing_loader/folders.js, one row per supplier
// and fuel; keep the two in step. Files are the overview's `files` (pricing.supplier_file_state), failures its
// `loadFailures` (pricing.load_failure).

export const BOOKS = [
  { supplierId: 'voltx', fuel: 'electricity', folder: 'Voltx Power/Pricing Files/Base Prices' },
  { supplierId: 'yu', fuel: 'electricity', folder: 'YU Energy/Pricing Matrix/Base Prices/YU Energy/Electricity' },
  { supplierId: 'yu', fuel: 'gas', folder: 'YU Energy/Pricing Matrix/Base Prices/YU Energy/Gas' },
  { supplierId: 'jellyfish', fuel: 'electricity', folder: 'Jellyfish/Pricing Files/Base Prices/Electricity' },
  { supplierId: 'jellyfish', fuel: 'gas', folder: 'Jellyfish/Pricing Files/Base Prices/Gas' },
];

// The folder in SharePoint's own folder view. The loader's library "Documents" is "Shared Documents"
// in the address.
const SP_SITE = '/sites/Partnersales/Shared Documents/';
const SP_VIEW = 'https://dyceenergy.sharepoint.com/sites/Partnersales/Shared%20Documents/Forms/AllItems.aspx?id=';
export function folderUrl(folder) {
  return SP_VIEW + encodeURIComponent(SP_SITE + folder);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function time(t) {
  const v = Date.parse(t);
  return Number.isFinite(v) ? v : null;
}

function newest(items, key) {
  let best = null;
  for (const it of items) {
    const t = time(it[key]);
    if (t !== null && (best === null || t > best.t)) best = { it, t };
  }
  return best;
}

// One row per book: status 'file' (newest file shown), 'failed' (a file newer than the newest
// loaded one failed; the last good file, if any, is still given) or 'none' (nothing yet).
export function bookHealth(files, failures, now) {
  return BOOKS.map((b) => {
    const mine = (x) => x.supplierId === b.supplierId && x.fuel === b.fuel;
    const f = newest((files || []).filter(mine), 'loadedAt');
    const x = newest((failures || []).filter(mine), 'seenAt');
    const failed = x !== null && (f === null || x.t > f.t);
    return {
      supplierId: b.supplierId,
      fuel: b.fuel,
      folder: b.folder,
      status: failed ? 'failed' : f ? 'file' : 'none',
      file: f ? f.it : null,
      failure: failed ? x.it : null,
      age: f ? ageText(f.it.loadedAt, now) : '',
    };
  });
}

// UK calendar days since t, in words: 'today', '1 day ago', '6 days ago'. Not a date gives ''.
export function ageText(t, now) {
  const v = time(t);
  if (v === null) return '';
  const days = Math.round((ukDay(now) - ukDay(v)) / DAY_MS);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day ago' : days + ' days ago';
}

const UK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

// Midnight UTC of the UK calendar date the instant falls on, so days are counted as the UK sees them.
function ukDay(ms) {
  const p = Object.fromEntries(UK.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
}
