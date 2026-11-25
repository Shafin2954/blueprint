/**
 * Tidy: a layered left-to-right layout.
 *
 * Each connected group is laid out in columns by dependency depth (a card sits one
 * column right of everything that feeds or supports it). Within a column, cards are
 * ordered to keep lines from crossing (a few barycenter sweeps). Groups stack
 * vertically, biggest first; cards with no links go in a grid underneath.
 */
import { NODE_W, type Edge, type PlanNode } from "./types";

type Nodes = Record<string, PlanNode>;
type Edges = Record<string, Edge>;
export type Positions = Record<string, { x: number; y: number }>;

const COL = NODE_W + 76;
const GAP_Y = 36;
const GROUP_GAP = 140;
const snap = (v: number) => Math.round(v / 12) * 12;

/** Rough rendered height of a card, so stacked cards don't overlap. */
export function estimateHeight(n: PlanNode): number {
  let h = 44 + 12 + 19 * Math.max(1, Math.ceil(n.title.length / 26));
  if (n.body.trim()) h += 8 + 19 * Math.min(3, Math.ceil(n.body.length / 36));
  if (n.image) h += 168;
  if (n.link || n.source) h += 28;
  if (n.kind === "evidence" || n.kind === "claim" || n.kind === "conclusion" || n.kind === "assumption" || n.kind === "question") h += 26;
  return h;
}

/**
 * @param frameMembers cards grouped by frame: each frame's cards are laid out as their own
 *   block (so a frame can be shrink-wrapped around exactly its cards afterwards).
 */
export function tidy(nodes: Nodes, edges: Edges, frameMembers: string[][] = [], opts: { vertical?: boolean } = {}): Positions {
  const ids = Object.keys(nodes);
  if (!ids.length) return {};
  const valid = Object.values(edges).filter((e) => nodes[e.from] && nodes[e.to] && e.from !== e.to);

  // Undirected neighbours, for grouping.
  const nb = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  for (const e of valid) {
    nb.get(e.from)!.add(e.to);
    nb.get(e.to)!.add(e.from);
  }

  // Directed flow (feeds + supports; contradictions handled separately).
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of valid) if (e.rel !== "contradicts") parents.get(e.to)!.push(e.from);

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (visiting.has(id)) return 0; // shouldn't happen (links can't loop), but never hang
    visiting.add(id);
    const d = Math.max(-1, ...parents.get(id)!.map(depth)) + 1;
    visiting.delete(id);
    layer.set(id, d);
    return d;
  };
  ids.forEach(depth);
  // A card linked only by "contradicts" sits one column left of what it contradicts.
  for (const e of valid) {
    if (e.rel !== "contradicts") continue;
    const onlyContra = (id: string) => valid.every((x) => (x.from !== id && x.to !== id) || x.rel === "contradicts");
    if (onlyContra(e.from) && !onlyContra(e.to)) layer.set(e.from, Math.max(0, layer.get(e.to)! - 1));
    else if (onlyContra(e.to) && !onlyContra(e.from)) layer.set(e.to, Math.max(0, layer.get(e.from)! - 1));
    else if (onlyContra(e.from) && onlyContra(e.to)) layer.set(e.to, layer.get(e.from)! + 1);
  }

  // Framed cards first: one block per frame (a card in two frames goes with the first).
  const seen = new Set<string>();
  const framed: string[][] = [];
  for (const members of frameMembers) {
    const block = members.filter((id) => nodes[id] && !seen.has(id));
    block.forEach((id) => seen.add(id));
    if (block.length) framed.push(block);
  }
  // Then connected groups among the remaining cards (links into frames don't pull cards in).
  const groups: string[][] = [];
  const loose: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const g: string[] = [];
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      g.push(x);
      stack.push(...[...nb.get(x)!].filter((n) => !seen.has(n)));
    }
    if (g.length === 1 && ![...nb.get(id)!].length) loose.push(id);
    else groups.push(g);
  }
  groups.sort((a, b) => b.length - a.length);
  groups.unshift(...framed);

  const pos: Positions = {};
  let top = 0;
  for (const g of groups) {
    const min = Math.min(...g.map((id) => layer.get(id)!));
    const cols: string[][] = [];
    for (const id of g) (cols[layer.get(id)! - min] ??= []).push(id);
    // Array.from (not .map) so gaps in a sparse array become real empty columns; then
    // drop empty columns so a group never has a hole in the middle.
    const filled = Array.from(cols, (c) => c ?? []).filter((c) => c.length);
    // Start from current vertical order, then reduce crossings.
    filled.forEach((c) => c.sort((a, b) => nodes[a].y - nodes[b].y));
    const order = new Map<string, number>();
    const index = () => filled.forEach((c) => c.forEach((id, i) => order.set(id, i)));
    index();
    const bary = (id: string) => {
      const ns = [...nb.get(id)!].filter((n) => order.has(n));
      return ns.length ? ns.reduce((s, n) => s + order.get(n)!, 0) / ns.length : order.get(id)!;
    };
    for (let sweep = 0; sweep < 4; sweep++) {
      const seq = sweep % 2 ? [...filled.keys()].reverse() : [...filled.keys()];
      for (const ci of seq) {
        filled[ci].sort((a, b) => bary(a) - bary(b));
        index();
      }
    }
    if (opts.vertical) {
      // Narrow screens: layers run top to bottom, two cards to a row, so it reads like a page.
      for (const c of filled) {
        for (let i = 0; i < c.length; i += 2) {
          const row = c.slice(i, i + 2);
          row.forEach((id, j) => (pos[id] = { x: snap(j * (NODE_W + 24) + (row.length === 1 ? (NODE_W + 24) / 2 : 0)), y: snap(top) }));
          top += Math.max(...row.map((id) => estimateHeight(nodes[id]))) + GAP_Y;
        }
        top += 24;
      }
      top += GROUP_GAP - 24 - GAP_Y;
      continue;
    }
    const heights = filled.map((c) => c.reduce((s, id) => s + estimateHeight(nodes[id]), 0) + GAP_Y * Math.max(0, c.length - 1));
    const tallest = Math.max(...heights);
    filled.forEach((c, ci) => {
      let y = top + (tallest - heights[ci]) / 2;
      for (const id of c) {
        pos[id] = { x: snap(ci * COL), y: snap(y) };
        y += estimateHeight(nodes[id]) + GAP_Y;
      }
    });
    top += tallest + GROUP_GAP;
  }

  // Unlinked cards: a grid underneath, oldest first.
  const perRow = opts.vertical ? 2 : Math.max(3, Math.min(6, Math.ceil(Math.sqrt(loose.length * 2))));
  loose.sort((a, b) => nodes[a].createdAt - nodes[b].createdAt);
  let rowH = 0;
  loose.forEach((id, i) => {
    if (i && i % perRow === 0) {
      top += rowH + GAP_Y;
      rowH = 0;
    }
    pos[id] = { x: snap((i % perRow) * (opts.vertical ? NODE_W + 24 : COL)), y: snap(top) };
    rowH = Math.max(rowH, estimateHeight(nodes[id]));
  });

  // Keep the board roughly where it was on the sheet.
  const ox = Math.min(...ids.map((id) => nodes[id].x));
  const oy = Math.min(...ids.map((id) => nodes[id].y));
  for (const id of ids) pos[id] = { x: pos[id].x + snap(ox), y: pos[id].y + snap(oy) };
  return pos;
}

/**
 * The nearest clear spot to (x, y) for a new card: tries the spot itself, then a widening
 * ring of grid positions, preferring right and down so new cards read in order.
 */
export function findFreeSpot(nodes: Nodes, x: number, y: number): { x: number; y: number } {
  const list = Object.values(nodes);
  const W = NODE_W + 24;
  const H = 132;
  const free = (px: number, py: number) =>
    list.every((n) => px + W <= n.x || n.x + NODE_W + 24 <= px || py + H <= n.y || n.y + estimateHeight(n) + 24 <= py);
  const sx = snap(x);
  const sy = snap(y);
  if (free(sx, sy)) return { x: sx, y: sy };
  // Straight down first: new cards form a readable column instead of a row that links cut through.
  for (let i = 1; i <= 6; i++) if (free(sx, snap(sy + i * H))) return { x: sx, y: snap(sy + i * H) };
  for (let r = 1; r <= 12; r++) {
    const ring: [number, number][] = [];
    for (let i = -r; i <= r; i++) ring.push([r, i], [i, r], [-r, i], [i, -r]);
    // right and below first, then the rest; nearest first within each
    ring.sort((a, b) => Number(a[0] < 0 || a[1] < 0) - Number(b[0] < 0 || b[1] < 0) || Math.hypot(...a) - Math.hypot(...b));
    for (const [cx, cy] of ring) {
      const px = snap(sx + cx * W);
      const py = snap(sy + cy * H);
      if (free(px, py)) return { x: px, y: py };
    }
  }
  return { x: sx, y: sy };
}
