/**
 * Weighing what you believe. Transparent arithmetic, no magic: every card that
 * supports or contradicts another adds its own confidence to that side, scaled
 * by the link's strength (weak ×0.5, normal ×1, strong ×1.5).
 */
import { BELIEF_KINDS, DEFAULT_CONFIDENCE, STRENGTH, type Edge, type Kind, type PlanNode } from "./types";

type Nodes = Record<string, PlanNode>;
type Edges = Record<string, Edge>;

/** Weight a card brings as a reason: its confidence, or a neutral default. */
export function weight(n: PlanNode): number {
  if (BELIEF_KINDS.has(n.kind)) return n.confidence ?? DEFAULT_CONFIDENCE[n.kind] ?? 50;
  return n.kind === "thought" || n.kind === "spark" ? 40 : 50;
}

export interface Balance {
  forW: number;
  againstW: number;
  pro: PlanNode[];
  con: PlanNode[];
  /** Share of weight on the "for" side, 0–1, or null when nothing bears on it. */
  score: number | null;
  /** Cards not counted because another card from the same source already was. */
  echoes: number;
}

const sourceKey = (n: PlanNode) => n.source?.trim().toLowerCase() || `#${n.id}`;

/**
 * Sum one side, counting each source once (at its strongest card), so the same
 * rumor repeated on three cards doesn't look like three independent reasons.
 */
function side(entries: { n: PlanNode; mult: number }[]): { w: number; echoes: number } {
  const best = new Map<string, number>();
  for (const { n, mult } of entries) best.set(sourceKey(n), Math.max(best.get(sourceKey(n)) ?? 0, weight(n) * mult));
  let w = 0;
  for (const v of best.values()) w += v;
  return { w: Math.round(w), echoes: entries.length - best.size };
}

export function balance(id: string, nodes: Nodes, edges: Edges): Balance {
  const pro: { n: PlanNode; mult: number }[] = [];
  const con: { n: PlanNode; mult: number }[] = [];
  for (const e of Object.values(edges)) {
    const mult = STRENGTH[e.strength ?? "normal"].mult;
    if (e.rel === "supports" && e.to === id && nodes[e.from]) pro.push({ n: nodes[e.from], mult });
    // Contradiction is mutual: whichever end you're looking from, the other end weighs against.
    if (e.rel === "contradicts") {
      if (e.to === id && nodes[e.from]) con.push({ n: nodes[e.from], mult });
      else if (e.from === id && nodes[e.to]) con.push({ n: nodes[e.to], mult });
    }
  }
  const f = side(pro);
  const a = side(con);
  return {
    forW: f.w,
    againstW: a.w,
    pro: pro.map((x) => x.n),
    con: con.map((x) => x.n),
    score: f.w + a.w ? f.w / (f.w + a.w) : null,
    echoes: f.echoes + a.echoes,
  };
}

/** Kinds that can be weighed (the ones evidence can bear on). */
export const WEIGHABLE = new Set<Kind>(["claim", "conclusion", "assumption", "question", "goal", "thought", "spark"]);

/** Sensible default meaning for a new link, from what kinds it joins. */
export function defaultRel(from: Kind, to: Kind): "feeds" | "supports" {
  const plan = (k: Kind) => k === "step" || k === "milestone" || k === "goal";
  if (plan(from) && plan(to)) return "feeds";
  if (from === "step" || from === "milestone") return "feeds";
  if (to === "step" || to === "milestone") return "feeds";
  return "supports";
}
