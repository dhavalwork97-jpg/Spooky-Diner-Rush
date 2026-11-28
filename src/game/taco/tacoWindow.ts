/**
 * The Taco Truck's window: a looping night video (graveyard, moon, haunted house) shown through the glass. Fractions of the 2754x1536 art.
 * The video file is cropped to the band of the scene that the glass shows, so it needs no more pixels than that, and it is stretched over
 * the glass box (the front layer hides whatever lies outside the glass). The still is the same band as one picture: it is always drawn first,
 * so reduced motion, a slow network or a failed video all show the same scene, and the tap pumpkins and combo lights stay on their art.
 */
export const TACO_WINDOW = {
  rect: { x: 0.245, y: 0.0652, width: 0.583, height: 0.3175 },
  stillKey: 'taco_window_still',
  stillFile: 'assets/taco/window/window_still.webp',
  videoKey: 'taco_window_loop',
  videoFiles: ['assets/taco/window/window_loop.webm', 'assets/taco/window/window_loop.mp4'],
  ambience: 'taco_ambience',
} as const;

/** The video's measured scene (fractions of the video frame) placed on the art: art = origin + frame * size. */
export function windowToArt(vx: number, vy: number): { x: number; y: number } {
  const r = TACO_WINDOW.rect;
  // The cropped band starts 10% down the full frame and is 54% tall.
  return { x: r.x + vx * r.width, y: r.y + ((vy - 0.1) / 0.54) * r.height };
}
