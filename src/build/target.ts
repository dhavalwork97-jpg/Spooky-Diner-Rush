/**
 * Which build this is. `npm run build` is the normal build; `npm run build:crazygames` passes `--mode crazygames`.
 * Platform differences that are about the BUILD (not about what the browser reports at run time) live here.
 */
export const IS_CRAZYGAMES_BUILD: boolean = import.meta.env.MODE === 'crazygames';

/** The 10 s intro video before the title. CrazyGames wants players in gameplay at once (at most one click), so it is off there. */
export const INTRO_VIDEO_ENABLED: boolean = !IS_CRAZYGAMES_BUILD;
