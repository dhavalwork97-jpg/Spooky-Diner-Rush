/**
 * Landscape on phones. A web page cannot rotate the screen by itself: Android Chrome only allows
 * `screen.orientation.lock()` while the page is fullscreen, and both need a tap. So the first tap
 * on a phone (or the "Tap to play" button shown in portrait) enters fullscreen and locks landscape.
 * iPhone Safari supports neither, so there the portrait screen keeps asking to turn the phone.
 * Everything is best effort and never throws; the game works without it.
 */

/** The parts of the browser this needs, so tests can fake them. */
export interface OrientationEnv {
  isIframe: boolean;
  coarsePointer: boolean;
  shortSide: number;
  fullscreenElement: unknown;
  requestFullscreen?: () => Promise<void>;
  lock?: (orientation: 'landscape') => Promise<void>;
}

export type LandscapeResult = 'locked' | 'fullscreen' | 'unsupported' | 'skipped';

/** A phone or small tablet held in any direction: touch input and a short side under 900 css px. */
export function isPhoneLike(env: Pick<OrientationEnv, 'coarsePointer' | 'shortSide'>): boolean {
  return env.coarsePointer && env.shortSide < 900;
}

/** Can this browser ever lock landscape? (iPhone Safari cannot, so the portrait text asks the player to turn the phone.) */
export function canLock(env: Pick<OrientationEnv, 'lock'>): boolean {
  return typeof env.lock === 'function';
}

/**
 * Enter fullscreen and lock landscape. Resolves with what happened; never rejects.
 * Skipped on desktop and inside an iframe (CrazyGames handles fullscreen and rotation itself).
 */
export async function enterLandscape(env: OrientationEnv): Promise<LandscapeResult> {
  if (env.isIframe || !isPhoneLike(env)) return 'skipped';
  let full = env.fullscreenElement != null;
  if (!full && env.requestFullscreen) {
    try {
      await env.requestFullscreen();
      full = true;
    } catch {
      full = false;
    }
  }
  if (env.lock) {
    try {
      await env.lock('landscape');
      return 'locked';
    } catch {
      /* not allowed here (not fullscreen, or the device refuses) */
    }
  }
  return full ? 'fullscreen' : 'unsupported';
}

/** The real browser, read when needed (the window can be resized or rotated between taps). */
export function browserEnv(): OrientationEnv {
  const doc = document.documentElement;
  const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> }) | undefined;
  let isIframe = false;
  try {
    isIframe = window.self !== window.top;
  } catch {
    isIframe = true;
  }
  return {
    isIframe,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    shortSide: Math.min(window.screen.width, window.screen.height),
    fullscreenElement: document.fullscreenElement,
    requestFullscreen: doc.requestFullscreen ? () => doc.requestFullscreen({ navigationUI: 'hide' }) : undefined,
    lock: orientation?.lock ? (o) => orientation.lock!(o) : undefined,
  };
}

/**
 * The text of the portrait overlay. Inside the CrazyGames iframe the page must not try fullscreen or a lock (CrazyGames does both
 * itself and shows its own rotate prompt), so there it only asks the player to turn the phone.
 */
export function rotateMessage(env: Pick<OrientationEnv, 'isIframe' | 'lock'>): string {
  return !env.isIframe && canLock(env) ? 'Tap to play in landscape' : 'Turn your phone sideways to play';
}

/**
 * Wire it up: the portrait overlay (`#rotate`) becomes a "Tap to play" button, and the first tap anywhere on a
 * phone enters fullscreen + landscape. If the browser cannot lock (iPhone), the overlay keeps asking to turn the phone.
 */
export function initOrientation(): void {
  const overlay = document.getElementById('rotate');
  const msg = document.getElementById('rotateMsg');
  const env = browserEnv();
  const TURN = 'Turn your phone sideways to play';
  if (msg) msg.textContent = rotateMessage(env);
  if (env.isIframe) return; // CrazyGames (and any other embed) handles fullscreen and rotation itself

  let last = -Infinity; // one tap reaches both the overlay and the page handler: count it once
  const go = (): void => {
    const now = performance.now();
    if (now - last < 1000) return;
    last = now;
    void enterLandscape(browserEnv()).then((r) => {
      if (r === 'unsupported' && msg) msg.textContent = TURN;
    });
  };
  overlay?.addEventListener('click', go);
  // First tap on the game itself (the page may already be sideways): go fullscreen once.
  window.addEventListener(
    'pointerup',
    () => {
      if (!document.fullscreenElement) go();
    },
    { once: true, passive: true },
  );
  // After fullscreen is left (Back gesture), the next tap can re-enter it.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      window.addEventListener('pointerup', go, { once: true, passive: true });
    }
  });
}
