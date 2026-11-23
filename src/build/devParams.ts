// Developer-only URL switches. The Poki build removes them so the shipped game
// cannot be put into debug / test mode from the address bar.
export const DEV_PARAMS: readonly string[] = [
  'debug', 'test', 'taco', 'pizza', 'nozones', 'zones',
  'level', 'restaurants', 'speed', 'dessert', 'fried', 'side',
];

/** Returns the query string without developer switches. Other keys (e.g. Poki's gd*) are kept. */
export function stripDevParams(search: string, keys: readonly string[] = DEV_PARAMS): string {
  const params = new URLSearchParams(search);
  for (const k of keys) params.delete(k);
  const out = params.toString();
  return out ? `?${out}` : '';
}

/** Keys that block default scrolling inside an embedded game page. */
export const SCROLL_KEYS: readonly string[] = ['ArrowUp', 'ArrowDown', 'Space', ' '];
export const isScrollKey = (e: { code?: string; key?: string }): boolean =>
  SCROLL_KEYS.includes(e.code ?? '') || SCROLL_KEYS.includes(e.key ?? '');
