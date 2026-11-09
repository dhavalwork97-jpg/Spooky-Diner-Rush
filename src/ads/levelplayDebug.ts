/**
 * A small status text for TEST builds only (test mode is switched on in the env file). It shows why LevelPlay did or did not start and why an ad
 * did not load, because nothing else on the phone shows that. It never exists in a store build, never takes a tap, and never throws.
 */
let box: HTMLElement | null = null;
let enabled = false;
const lines: string[] = [];
const MAX_LINES = 7;

export function enableAdDebug(on: boolean): void {
  enabled = on;
}

/** Turns a LevelPlay error payload or a thrown value into one short line. */
export function describeError(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { errorCode?: unknown; errorMessage?: unknown; message?: unknown };
    const code = o.errorCode !== undefined ? `code ${String(o.errorCode)}: ` : '';
    const msg = o.errorMessage ?? o.message;
    if (msg !== undefined) return `${code}${String(msg)}`.slice(0, 160);
  }
  return String(e ?? 'unknown').slice(0, 160);
}

export function adDebug(text: string): void {
  if (!enabled || typeof document === 'undefined') return;
  try {
    lines.push(text);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    if (!box) {
      box = document.createElement('div');
      Object.assign(box.style, {
        position: 'fixed',
        left: '4px',
        top: '4px',
        zIndex: '99999',
        maxWidth: '70vw',
        padding: '3px 6px',
        font: '11px/1.3 monospace',
        color: '#fff',
        background: 'rgba(0,0,0,0.65)',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(box);
    }
    box.textContent = lines.map((l) => `LP ${l}`).join('\n');
  } catch {
    /* a debug line must never break the game */
  }
}

/** Test hook. */
export function resetAdDebug(): void {
  lines.length = 0;
  box?.remove();
  box = null;
  enabled = false;
}
