// Date helpers. UI uses native <input type="date"> (always yyyy-MM-dd value),
// so no custom dd/MM/yyyy picker is needed — just format conversions for API params.
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isoToDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function isoWithMidnight(iso) { return iso ? `${iso} 00:00:00` : ''; }
export function isoWithEndOfDay(iso) { return iso ? `${iso} 23:59:59` : ''; }

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
