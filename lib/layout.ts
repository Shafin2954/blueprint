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

export function tidy(nodes: Nodes, edges: Edges): Positions {
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

  // Connected groups.
  const seen = new Set<string>();
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
      stack.push(...nb.get(x)!);
    }
    if (g.length === 1) loose.push(id);
    else groups.push(g);
  }
  groups.sort((a, b) => b.length - a.length);

  const pos: Positions = {};
  let top = 0;
  for (const g of groups) {
    const min = Math.min(...g.map((id) => layer.get(id)!));
    const cols: string[][] = [];
    for (const id of g) (cols[layer.get(id)! - min] ??= []).push(id);
    const filled = cols.map((c) => c ?? []);
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
  const perRow = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(loose.length * 2))));
  loose.sort((a, b) => nodes[a].createdAt - nodes[b].createdAt);
  let rowH = 0;
  loose.forEach((id, i) => {
    if (i && i % perRow === 0) {
      top += rowH + GAP_Y;
      rowH = 0;
    }
    pos[id] = { x: snap((i % perRow) * COL), y: snap(top) };
    rowH = Math.max(rowH, estimateHeight(nodes[id]));
  });

  // Keep the board roughly where it was on the sheet.
  const ox = Math.min(...ids.map((id) => nodes[id].x));
  const oy = Math.min(...ids.map((id) => nodes[id].y));
  for (const id of ids) pos[id] = { x: pos[id].x + snap(ox), y: pos[id].y + snap(oy) };
  return pos;
}
