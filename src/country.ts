export interface Point {
  x: number;
  y: number;
}

function area(points: Point[]): number {
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const next = points[(i + 1) % points.length];
        if (!next) return sum;
        return sum + p.x * next.y - next.x * p.y;
      }, 0),
    ) / 2
  );
}

/** Find the horizontal cut retaining a fraction of polygon area below it.
 * The UI samples its actual silhouette, rather than treating height as area. */
export function cultivationCut(points: Point[], fraction: number): number {
  let low = Math.min(...points.map((p) => p.y));
  let high = Math.max(...points.map((p) => p.y));
  if (fraction <= 0) return high;
  if (fraction >= 1) return low;
  const target = area(points) * fraction;
  for (let iteration = 0; iteration < 40; iteration++) {
    const cut = (low + high) / 2;
    const clipped: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (!a || !b) continue;
      if (a.y >= cut) clipped.push(a);
      if (a.y >= cut !== b.y >= cut)
        clipped.push({
          x: a.x + ((b.x - a.x) * (cut - a.y)) / (b.y - a.y),
          y: cut,
        });
    }
    if (area(clipped) > target) low = cut;
    else high = cut;
  }
  return (low + high) / 2;
}
