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
function side(entries: { w: number; n: PlanNode }[]): { w: number; echoes: number } {
  const best = new Map<string, number>();
  for (const { n, w } of entries) best.set(sourceKey(n), Math.max(best.get(sourceKey(n)) ?? 0, w));
  let w = 0;
  for (const v of best.values()) w += v;
  return { w: Math.round(w), echoes: entries.length - best.size };
}

const CHAINED = new Set<Kind>(["claim", "conclusion", "assumption"]);

/** Pseudo-weight of "taken at face value" a chained card starts from, so one weak objection dents it rather than zeroing it. */
const PRIOR = 100;

type Memo = Map<string, number>;

/**
 * How much a card counts as a reason. Evidence counts at face value (its confidence).
 * A claim, conclusion or assumption also has evidence of its own: it counts as its
 * confidence scaled by how well that evidence holds up — so support passes along a chain,
 * and a claim whose own evidence leans against it can't make a conclusion look certain.
 * The scaling is gentle: (PRIOR + for) / (PRIOR + for + against), so with nothing against
 * it a card keeps its full weight, and a weak objection only trims it.
 */
export function effectiveWeight(n: PlanNode, nodes: Nodes, edges: Edges, seen = new Set<string>(), memo: Memo = new Map()): number {
  const w = weight(n);
  if (!CHAINED.has(n.kind) || seen.has(n.id)) return w;
  const hit = memo.get(n.id);
  if (hit !== undefined) return hit;
  seen.add(n.id);
  const b = balanceOf(n.id, nodes, edges, seen, memo);
  seen.delete(n.id);
  const out = b.score === null ? w : (w * (PRIOR + b.forW)) / (PRIOR + b.forW + b.againstW);
  memo.set(n.id, out);
  return out;
}

export function balance(id: string, nodes: Nodes, edges: Edges): Balance {
  return balanceOf(id, nodes, edges, new Set([id]), new Map());
}

function balanceOf(id: string, nodes: Nodes, edges: Edges, seen: Set<string>, memo: Memo): Balance {
  const pro: { n: PlanNode; w: number }[] = [];
  const con: { n: PlanNode; w: number }[] = [];
  const add = (list: typeof pro, n: PlanNode, mult: number) => {
    // A card further up the chain being weighed (e.g. the one asking): it can't also
    // count for or against its own reasons — that would make two rivals cancel out.
    if (seen.has(n.id)) return;
    list.push({ n, w: effectiveWeight(n, nodes, edges, seen, memo) * mult });
  };
  for (const e of Object.values(edges)) {
    const mult = STRENGTH[e.strength ?? "normal"].mult;
    if (e.rel === "supports" && e.to === id && nodes[e.from]) add(pro, nodes[e.from], mult);
    // Contradiction is mutual: whichever end you're looking from, the other end weighs against.
    if (e.rel === "contradicts") {
      if (e.to === id && nodes[e.from]) add(con, nodes[e.from], mult);
      else if (e.from === id && nodes[e.to]) add(con, nodes[e.to], mult);
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

/** Too little evidence either way to read anything into the for/against split. */
export const isThin = (b: Balance) => b.score !== null && (b.forW + b.againstW < 120 || b.pro.length + b.con.length < 2);

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

// ── Shared cache: every card on screen asks for its balance on every store change. ──
let cache: { nodes: Nodes; edges: Edges; sig: string; byId: Map<string, Balance> } | null = null;

/** What balances depend on: kind, how sure, source — not titles or positions. */
function signature(nodes: Nodes): string {
  let s = "";
  for (const n of Object.values(nodes)) s += `${n.id}:${n.kind}:${n.confidence ?? ""}:${n.source ?? ""}|`;
  return s;
}

/** balance(), memoized across calls until something it depends on changes. */
export function cachedBalance(id: string, nodes: Nodes, edges: Edges): Balance {
  if (!cache || cache.nodes !== nodes || cache.edges !== edges) {
    const sig = signature(nodes);
    if (cache && cache.edges === edges && cache.sig === sig) cache = { ...cache, nodes };
    else cache = { nodes, edges, sig, byId: new Map() };
  }
  let b = cache.byId.get(id);
  if (!b) {
    b = balance(id, nodes, edges);
    cache.byId.set(id, b);
  }
  return b;
}
