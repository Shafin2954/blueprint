import type { Edge, PlanNode } from "./types";

type Nodes = Record<string, PlanNode>;
type Edges = Record<string, Edge>;

type Adj = { out: Map<string, string[]>; inc: Map<string, string[]> };
// Edges objects are replaced (never mutated) on change, so they make a safe cache key.
const adjCache = new WeakMap<Edges, Adj>();

/** Dependency adjacency. Contradictions are tension, not flow, so they're left out. */
export function adjacency(edges: Edges): Adj {
  const hit = adjCache.get(edges);
  if (hit) return hit;
  const built = buildAdjacency(edges);
  adjCache.set(edges, built);
  return built;
}

function buildAdjacency(edges: Edges): Adj {
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const e of Object.values(edges)) {
    if (e.rel === "contradicts") continue;
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inc.has(e.to)) inc.set(e.to, []);
    out.get(e.from)!.push(e.to);
    inc.get(e.to)!.push(e.from);
  }
  return { out, inc };
}

function walk(start: string, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(next.get(start) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || id === start) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return seen;
}

export function upstream(id: string, edges: Edges) {
  return walk(id, adjacency(edges).inc);
}

export function downstream(id: string, edges: Edges) {
  return walk(id, adjacency(edges).out);
}

/** Done-ness, with milestones derived from the steps feeding them. */
export function isDone(id: string, nodes: Nodes, edges: Edges, guard = new Set<string>()): boolean {
  const n = nodes[id];
  if (!n) return true;
  if (n.kind === "step") return n.status === "done";
  if (n.kind === "milestone") {
    if (guard.has(id)) return false;
    guard.add(id);
    const feeders = [...upstream(id, edges)].filter((u) => nodes[u]?.kind === "step");
    return feeders.length > 0 && feeders.every((u) => nodes[u].status === "done");
  }
  return true;
}

export interface Progress {
  done: number;
  total: number;
}

/** For goals and milestones: share of upstream steps that are done. */
export function progress(id: string, nodes: Nodes, edges: Edges): Progress {
  const steps = [...upstream(id, edges)].filter((u) => nodes[u]?.kind === "step");
  return { done: steps.filter((s) => nodes[s].status === "done").length, total: steps.length };
}

export interface Move {
  node: PlanNode;
  /** Goals and milestones this step eventually feeds. */
  unlocks: PlanNode[];
  blocked: boolean;
}

/**
 * The frontier: steps that aren't done and whose direct step/milestone
 * predecessors are all done. Ranked: in-progress first, then by how much they unlock.
 */
export function nextMoves(nodes: Nodes, edges: Edges): Move[] {
  const { inc } = adjacency(edges);
  const moves: Move[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "step" || n.status === "done") continue;
    const preds = (inc.get(n.id) ?? []).filter((p) => {
      const k = nodes[p]?.kind;
      return k === "step" || k === "milestone";
    });
    const blocked = preds.some((p) => !isDone(p, nodes, edges));
    const unlocks = [...downstream(n.id, edges)]
      .map((d) => nodes[d])
      .filter((d) => d && (d.kind === "goal" || d.kind === "milestone"));
    moves.push({ node: n, unlocks, blocked });
  }
  return moves
    .filter((m) => !m.blocked)
    .sort(
      (a, b) =>
        Number(b.node.status === "doing") - Number(a.node.status === "doing") ||
        b.unlocks.length - a.unlocks.length ||
        a.node.createdAt - b.node.createdAt,
    );
}

/** Nodes and edges on any path through `id` — used to light up its chain. */
export function chain(id: string, edges: Edges) {
  const nodes = new Set<string>([id, ...upstream(id, edges), ...downstream(id, edges)]);
  const ids = new Set<string>();
  for (const e of Object.values(edges)) {
    if (nodes.has(e.from) && nodes.has(e.to)) ids.add(e.id);
  }
  return { nodes, edges: ids };
}

export function wouldCycle(from: string, to: string, edges: Edges) {
  return from === to || downstream(to, edges).has(from);
}
