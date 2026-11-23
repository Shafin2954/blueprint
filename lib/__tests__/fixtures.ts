import type { Edge, Kind, PlanNode, Rel } from "../types";

/** Tiny board builder: `card("e1", "evidence", { confidence: 70 })`, then `link("e1", "c1", "supports")`. */
export function board() {
  const nodes: Record<string, PlanNode> = {};
  const edges: Record<string, Edge> = {};
  const counts: Partial<Record<Kind, number>> = {};
  let e = 0;
  const api = {
    nodes,
    edges,
    card(id: string, kind: Kind, extra: Partial<PlanNode> = {}) {
      const n = (counts[kind] = (counts[kind] ?? 0) + 1);
      nodes[id] = {
        id,
        ref: `${kind[0].toUpperCase()}-${String(n).padStart(2, "0")}`,
        kind,
        title: id,
        body: "",
        x: 0,
        y: 0,
        status: "todo",
        createdAt: n,
        ...extra,
      };
      return api;
    },
    link(from: string, to: string, rel: Rel = "feeds") {
      const id = `x${e++}`;
      edges[id] = { id, from, to, rel };
      return api;
    },
  };
  return api;
}
