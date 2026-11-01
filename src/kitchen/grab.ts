/**
 * Horizontal grab span for a finished cup or cone. The lanes of a machine touch, so a glass is only about a
 * lane wide (roughly 20 px on a phone): too small for a thumb. A ready lane may therefore also grab the space of
 * its neighbours that are not ready (up to `reach` lane-widths each way); next to another ready lane the two
 * split the gap at the midpoint, so two grab areas never overlap.
 *
 * `xs` are the lane centres, `ready` says which lanes hold a finished item, `i` is the lane to measure.
 * Returns the span relative to the lane centre.
 */
export function laneSpan(xs: number[], ready: boolean[], i: number, pitch: number, reach = 0.9): { left: number; right: number } {
  const x = xs[i];
  let left = -reach * pitch;
  let right = reach * pitch;
  xs.forEach((o, j) => {
    if (j === i || !ready[j]) return;
    const mid = (o - x) / 2;
    if (o < x) left = Math.max(left, mid);
    else if (o > x) right = Math.min(right, mid);
  });
  return { left, right };
}
