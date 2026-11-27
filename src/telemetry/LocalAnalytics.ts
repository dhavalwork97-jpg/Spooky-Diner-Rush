/**
 * On-device, aggregate-only game analytics for Recovery 1.0.
 * No network requests, third-party SDKs, player IDs, raw event history, or personal data.
 * Counts and active play time stay in this browser's localStorage.
 */
export type LocalMetric =
  | 'session_started' | 'session_ended' | 'restaurant_entered' | 'level_reached'
  | 'menu_step_reached' | 'recipe_book_opened' | 'dish_delivered' | 'order_completed'
  | 'closed' | 'reopened';

export interface LocalAnalyticsData {
  version: 1;
  sessions: number;
  activeMs: number;
  counters: Record<string, number>;
}

const KEY = 'spooky-diner-rush-local-analytics';
const MAX_COUNTERS = 200;
const MAX_COUNT = 1_000_000;
const EMPTY = (): LocalAnalyticsData => ({ version: 1, sessions: 0, activeMs: 0, counters: {} });

let data = EMPTY();
let loaded = false;
let enabled = true;
let active = false;
let visible = true;
let pendingMs = 0;
let listenersInstalled = false;

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function clean(value: unknown): LocalAnalyticsData {
  const out = EMPTY();
  if (!value || typeof value !== 'object') return out;
  const v = value as Partial<LocalAnalyticsData>;
  if (v.version !== 1) return out;
  out.sessions = Number.isFinite(v.sessions) ? Math.max(0, Math.min(MAX_COUNT, Math.floor(v.sessions!))) : 0;
  out.activeMs = Number.isFinite(v.activeMs) ? Math.max(0, Math.min(10_000_000_000, Math.floor(v.activeMs!))) : 0;
  if (v.counters && typeof v.counters === 'object' && !Array.isArray(v.counters)) {
    for (const [key, count] of Object.entries(v.counters).slice(0, MAX_COUNTERS)) {
      if (!/^[a-z0-9:_-]{1,80}$/.test(key) || typeof count !== 'number' || !Number.isFinite(count) || count < 0) continue;
      out.counters[key] = Math.min(MAX_COUNT, Math.floor(count));
    }
  }
  return out;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  const s = storage();
  if (!s) return;
  try {
    const raw = s.getItem(KEY);
    if (raw) data = clean(JSON.parse(raw));
  } catch {
    data = EMPTY();
  }
}

function persist(): void {
  load();
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable or full. Analytics must never interrupt gameplay.
  }
}

function bump(key: string): void {
  if (!(key in data.counters) && Object.keys(data.counters).length >= MAX_COUNTERS) return;
  data.counters[key] = Math.min(MAX_COUNT, (data.counters[key] ?? 0) + 1);
}

function safeDetail(detail?: string | number): string {
  if (detail === undefined) return '';
  return String(detail).toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 48);
}

function flushTime(): void {
  if (pendingMs > 0) {
    data.activeMs = Math.min(10_000_000_000, data.activeMs + Math.floor(pendingMs));
    pendingMs = 0;
  }
  persist();
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener('pagehide', () => LocalAnalytics.endSession());
  if (typeof document !== 'undefined') {
    visible = !document.hidden;
    document.addEventListener('visibilitychange', () => {
      visible = !document.hidden;
      if (!visible) flushTime();
    });
  }
  const w = window as Window & {
    __chefRushAnalytics?: { snapshot: () => LocalAnalyticsData; exportJson: () => string; reset: () => void };
  };
  w.__chefRushAnalytics = {
    snapshot: () => LocalAnalytics.snapshot(),
    exportJson: () => LocalAnalytics.exportJson(),
    reset: () => LocalAnalytics.reset(),
  };
}

export const LocalAnalytics = {
  /** Call on the first restaurant scene. Debug/test sessions are deliberately excluded. */
  startSession(debugOrTest = false): void {
    load();
    enabled = !debugOrTest;
    if (!enabled || active) return;
    active = true;
    data.sessions = Math.min(MAX_COUNT, data.sessions + 1);
    bump('session_started');
    installListeners();
    persist();
  },

  /** Count an allow-listed funnel event. Detail is a game id, restaurant id, or level/step number. */
  track(metric: LocalMetric, detail?: string | number): void {
    load();
    if (!enabled) return;
    const suffix = safeDetail(detail);
    bump(suffix ? `${metric}:${suffix}` : metric);
    // Batched by tick() (every ~5 s) and flushed on hide/unload; avoid synchronous writes per delivery.
  },

  /** Accumulate foreground gameplay time; cap frame gaps so tab switches do not inflate play time. */
  tick(deltaMs: number): void {
    if (!enabled || !active || !visible || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    pendingMs += Math.min(250, deltaMs);
    if (pendingMs >= 5_000) flushTime();
  },

  endSession(): void {
    if (!active || !enabled) return;
    active = false;
    bump('session_ended');
    flushTime();
  },

  snapshot(): LocalAnalyticsData {
    load();
    const copy = clean(data);
    copy.activeMs += Math.floor(pendingMs);
    return copy;
  },

  exportJson(): string {
    return JSON.stringify(this.snapshot(), null, 2);
  },

  /** Developer-only local reset; does not touch the player's game save. */
  reset(): void {
    data = EMPTY();
    loaded = true;
    active = false;
    enabled = true;
    pendingMs = 0;
    persist();
  },
};
