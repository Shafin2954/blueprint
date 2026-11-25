/**
 * Link routing: draw a link as a smooth curve, and if that curve would pass through
 * other cards, detour above or below them. Cheap and predictable — no full graph
 * router — but it stops links from reading as chains through unrelated cards.
 */
import { estimateHeight } from "./layout";
import { NODE_W, type PlanNode } from "./types";

type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

const PAD = 10;

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

const inside = (p: Pt, r: Rect) => p.x > r.x - PAD && p.x < r.x + r.w + PAD && p.y > r.y - PAD && p.y < r.y + r.h + PAD;

/** A horizontal-tangent S-curve from a to b, as its four control points. */
function sCurve(a: Pt, b: Pt): [Pt, Pt, Pt, Pt] {
  const dx = Math.max(70, Math.abs(b.x - a.x) / 2);
  return [a, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }, b];
}

function hits(segments: [Pt, Pt, Pt, Pt][], obstacles: Rect[]): Rect[] {
  const out = new Set<Rect>();
  for (const seg of segments) {
    for (let i = 1; i < 24; i++) {
      const p = cubic(...seg, i / 24);
      for (const r of obstacles) if (inside(p, r)) out.add(r);
    }
  }
  return [...out];
}

const toD = (segs: [Pt, Pt, Pt, Pt][]) =>
  `M ${segs[0][0].x} ${segs[0][0].y} ` + segs.map(([, c1, c2, e]) => `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`).join(" ");

export interface Route {
  d: string;
  /** Where to draw the relation glyph (+ / ≠). */
  mid: Pt;
}

/**
 * Route a link from `a` (source anchor) to `b` (target anchor), avoiding `others`
 * (every card except the two ends).
 */
export function routeLink(a: Pt, b: Pt, others: PlanNode[]): Route {
  return routeAround(a, b, others.map(cardRect));
}

export const cardRect = (n: PlanNode): Rect => ({ x: n.x, y: n.y, w: NODE_W, h: estimateHeight(n) });

/** routeLink with the obstacles already measured (measure each card once, not once per link). */
export function routeAround(a: Pt, b: Pt, obstacles: Rect[]): Route {
  // Only cards in the link's neighbourhood can be in the way.
  const minX = Math.min(a.x, b.x) - 80;
  const maxX = Math.max(a.x, b.x) + 80;
  const near = obstacles.filter((r) => r.x + r.w > minX && r.x < maxX);

  const direct = sCurve(a, b);
  const blockers = hits([direct], near);
  if (!blockers.length) return { d: toD([direct]), mid: cubic(...direct, 0.5) };

  // Detour: turn up (or down) in the gap right after the source, run along above (or below)
  // everything in the way, and come back down in the gap right before the target. Cards sit
  // only ~70px apart, so the turns must happen inside those gaps.
  const top = Math.min(...blockers.map((r) => r.y));
  const bottom = Math.max(...blockers.map((r) => r.y + r.h));
  const g = 26;
  const x1 = a.x + g;
  const x2 = b.x - g;
  let best: { segs: [Pt, Pt, Pt, Pt][]; cost: number } = { segs: [direct], cost: blockers.length * 1000 + 5000 };
  if (x2 > x1 + 20) {
    for (const clear of [26, 60, 110]) {
      for (const wy of [top - clear, bottom + clear]) {
        const r = Math.min(18, Math.abs(wy - a.y) / 2, Math.abs(wy - b.y) / 2);
        const up1 = wy < a.y ? -1 : 1;
        const up2 = wy < b.y ? -1 : 1;
        // out of the source, round the corner, rise in the gap
        const s1: [Pt, Pt, Pt, Pt] = [a, { x: x1, y: a.y }, { x: x1, y: a.y }, { x: x1, y: a.y + up1 * r }];
        const s2: [Pt, Pt, Pt, Pt] = [{ x: x1, y: a.y + up1 * r }, { x: x1, y: wy }, { x: x1, y: wy }, { x: x1 + r, y: wy }];
        // along the top/bottom
        const s3: [Pt, Pt, Pt, Pt] = [{ x: x1 + r, y: wy }, { x: x1 + r, y: wy }, { x: x2 - r, y: wy }, { x: x2 - r, y: wy }];
        // round the corner, drop in the gap before the target, into its port
        const s4: [Pt, Pt, Pt, Pt] = [{ x: x2 - r, y: wy }, { x: x2, y: wy }, { x: x2, y: wy }, { x: x2, y: b.y + up2 * r }];
        const s5: [Pt, Pt, Pt, Pt] = [{ x: x2, y: b.y + up2 * r }, { x: x2, y: b.y }, { x: x2, y: b.y }, b];
        const segs = [s1, s2, s3, s4, s5];
        const n = hits(segs, near).length;
        const cost = n * 1000 + Math.abs(wy - a.y) + Math.abs(wy - b.y);
        if (cost < best.cost) best = { segs, cost };
      }
    }
  }
  const segs = best.segs;
  // The relation glyph sits in the middle of the long run.
  const mid = segs.length === 5 ? { x: (segs[2][0].x + segs[2][3].x) / 2, y: segs[2][0].y } : cubic(...segs[0], 0.5);
  return { d: toD(segs), mid };
}

/** Exposed for tests: does a route pass through a card? */
export function routeHits(route: Route, others: PlanNode[]): number {
  const nums = route.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const segs: [Pt, Pt, Pt, Pt][] = [];
  let p0 = { x: nums[0], y: nums[1] };
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const seg: [Pt, Pt, Pt, Pt] = [p0, { x: nums[i], y: nums[i + 1] }, { x: nums[i + 2], y: nums[i + 3] }, { x: nums[i + 4], y: nums[i + 5] }];
    segs.push(seg);
    p0 = seg[3];
  }
  return hits(segs, others.map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: estimateHeight(n) }))).length;
}
