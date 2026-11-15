/**
 * Minimum gap between two plays of the same sound, so a burst of events (five coins, three bats) never stacks into noise.
 * Pure: the caller passes the time in seconds. Names without a gap always play.
 */
export function makeThrottle(gaps: Readonly<Record<string, number>>): (name: string, nowSeconds: number) => boolean {
  const last = new Map<string, number>();
  return (name, now) => {
    const gap = gaps[name];
    if (gap === undefined) return true;
    const prev = last.get(name);
    if (prev !== undefined && now - prev < gap) return false;
    last.set(name, now);
    return true;
  };
}
