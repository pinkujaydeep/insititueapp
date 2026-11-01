// Helpers for building safe PostgREST filters from user input.

/** Removes characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Builds an `or=(col.ilike.*term*,...)` expression for a free-text search. */
export function ilikeAny(term: string, columns: string[]): string | null {
  const t = sanitizeSearch(term);
  if (!t) return null;
  return columns.map((c) => `${c}.ilike.*${t}*`).join(",");
}

/** Start of a local calendar day as an ISO timestamp. */
export function dayStart(iso: string): string {
  return new Date(`${iso}T00:00:00`).toISOString();
}

/** Start of the day after a local calendar day (exclusive upper bound). */
export function dayEnd(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
