// When the goal banner is on screen. Pure (no Phaser) so it can be unit tested; the GoalBanner view only draws what this says.
// Shared by every restaurant: the banner is not on all the time, it shows for a while and comes back when something about the goal changes.

export const GOAL_BANNER_TIMING = {
  /** A new goal (or a replacement goal) stays fully visible this long. */
  initialMs: 6000,
  /** A progress change brings it back for this long. */
  progressMs: 3000,
  /** A completed goal shows for this long. */
  completeMs: 3000,
  /** Fade out. */
  fadeMs: 600,
  /** Fade in. */
  fadeInMs: 250,
} as const;

export interface GoalBannerInput {
  /** Identity of the current goal (its text), or null when there is none. A different key means a new goal. */
  key: string | null;
  /** Progress of the current goal. */
  progress: number;
  /** How many goals have been completed so far (a rise means a goal was just completed). */
  completed: number;
  /** A popup, overlay, tutorial hand, Lv 1-2 tutorial, level-up card, pause or Closed screen is up: the banner must not show. */
  blocked: boolean;
  reduceMotion: boolean;
}

export interface GoalBannerFrame {
  visible: boolean;
  /** 0 to 1. With reduced motion this is only ever 0 or 1 (no fade), but visible/hidden happen at the same times. */
  alpha: number;
}

export class GoalBannerTimer {
  private key: string | null = null;
  private progress = -1;
  private completed = -1;
  /** Milliseconds of "fully visible" time left. Frozen while blocked. */
  private remaining = 0;
  /** Fade-out time left once `remaining` hits 0. */
  private fade = 0;
  private sinceShow = Infinity;
  private wasBlocked = false;

  /** Advance by dtMs. Safe to call every frame. Changes are noticed even while blocked, so a hidden goal keeps its place. */
  update(dtMs: number, input: GoalBannerInput): GoalBannerFrame {
    const T = GOAL_BANNER_TIMING;
    const dt = Math.max(0, dtMs);
    if (input.key === null) {
      this.key = null;
      this.progress = -1;
      this.completed = input.completed;
      this.remaining = 0;
      this.fade = 0;
      this.wasBlocked = input.blocked;
      return { visible: false, alpha: 0 };
    }
    let want = 0;
    if (this.completed >= 0 && input.completed > this.completed) want = T.completeMs;
    else if (this.key === input.key && input.progress !== this.progress && this.progress >= 0) want = T.progressMs;
    if (input.key !== this.key) want = T.initialMs; // a new or replaced goal always gets the long time
    this.completed = input.completed;
    this.key = input.key;
    this.progress = input.progress;
    if (want > 0 && want >= this.remaining) {
      if (this.remaining <= 0) this.sinceShow = 0;
      this.remaining = want;
      this.fade = T.fadeMs;
    }
    if (input.blocked) {
      this.wasBlocked = true;
      return { visible: false, alpha: 0 };
    }
    if (this.wasBlocked) {
      // Back from an overlay: show the goal again for the short time (or what was left, if that is longer).
      this.wasBlocked = false;
      this.remaining = Math.max(this.remaining, T.progressMs);
      this.fade = T.fadeMs;
      this.sinceShow = 0;
    }
    if (this.remaining > 0) {
      this.remaining -= dt;
      if (this.remaining < 0) {
        this.fade += this.remaining; // carry the overshoot into the fade
        this.remaining = 0;
      }
    } else if (this.fade > 0) {
      this.fade -= dt;
    }
    this.sinceShow += dt;
    if (this.remaining <= 0 && this.fade <= 0) return { visible: false, alpha: 0 };
    if (input.reduceMotion) return { visible: true, alpha: 1 };
    let alpha = 1;
    if (this.remaining <= 0) alpha = Math.max(0, this.fade / T.fadeMs);
    if (this.sinceShow < T.fadeInMs) alpha = Math.min(alpha, this.sinceShow / T.fadeInMs);
    return { visible: true, alpha };
  }
}
