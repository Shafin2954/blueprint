/**
 * "See the full picture" helpers that run offline: islands of connected thinking,
 * hubs, and possible links between cards that share vocabulary but no arrow.
 */
import type { Edge, PlanNode } from "./types";

type Nodes = Record<string, PlanNode>;
type Edges = Record<string, Edge>;

const STOP = new Set(
  ("a an the and or but if then else of to in on at by for with from into onto over under about as is are was were be been being " +
    "it its this that these those i me my we our you your they them their he she his her not no yes do does did done doing have has had " +
    "can could should would will just so very really more most less much many some any all one two three what which who whom whose why how " +
    "when where there here up down out off than too also only even still like get got make made thing things way new next first step " +
    "always never look feel feels felt want need know think maybe something nothing anything stuff lot lots keep kept min mins minute minutes").split(" "),
);

/** A readable word for each stem seen (the shortest original form), for display. */
const surface = new Map<string, string>();
export const display = (stem: string) => surface.get(stem) ?? stem;

export function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    let w = raw.replace(/'s$/, "");
    if (STOP.has(w)) continue;
    // Crude stemming: enough to match "prices" with "pricing".
    if (w.length > 4) w = w.replace(/(ings?|ed|es|(?<![su])s)$/, "");
    if (w.length >= 3 && !STOP.has(w)) {
      out.add(w);
      const seen = surface.get(w);
      if (!seen || raw.length < seen.length) surface.set(w, raw.replace(/'s$/, ""));
    }
  }
  return out;
}

export interface Suggestion {
  a: string;
  b: string;
  shared: string[];
  score: number;
}

/** Pairs of cards with no arrow between them that keep talking about the same things. */
export function suggestLinks(nodes: Nodes, edges: Edges, dismissed: Set<string>, limit = 6): Suggestion[] {
  const list = Object.values(nodes);
  const bags = new Map(list.map((n) => [n.id, words(`${n.title} ${n.body}`)]));
  const df = new Map<string, number>();
  for (const bag of bags.values()) for (const w of bag) df.set(w, (df.get(w) ?? 0) + 1);
  const linked = new Set(Object.values(edges).flatMap((e) => [`${e.from}|${e.to}`, `${e.to}|${e.from}`]));

  const out: Suggestion[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (linked.has(`${a.id}|${b.id}`)) continue;
      const key = pairKey(a.id, b.id);
      if (dismissed.has(key)) continue;
      const A = bags.get(a.id)!;
      const B = bags.get(b.id)!;
      const shared = [...A].filter((w) => B.has(w));
      if (!shared.length) continue;
      // Rare shared words count more than common ones.
      const score = shared.reduce((s, w) => s + 1 / (df.get(w) ?? 1) + (w.length >= 6 ? 0.3 : 0), 0);
      if (score >= 0.8) out.push({ a: a.id, b: b.id, shared: shared.slice(0, 3).map(display), score });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export interface Island {
  ids: string[];
  hub: PlanNode;
  theme: string[];
}

/** Connected groups of cards (ignoring arrow direction), biggest first. */
export function islands(nodes: Nodes, edges: Edges): Island[] {
  const nb = new Map<string, string[]>();
  for (const e of Object.values(edges)) {
    if (!nodes[e.from] || !nodes[e.to]) continue;
    nb.set(e.from, [...(nb.get(e.from) ?? []), e.to]);
    nb.set(e.to, [...(nb.get(e.to) ?? []), e.from]);
  }
  const seen = new Set<string>();
  const out: Island[] = [];
  for (const n of Object.values(nodes)) {
    if (seen.has(n.id)) continue;
    const ids: string[] = [];
    const stack = [n.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      stack.push(...(nb.get(id) ?? []));
    }
    if (ids.length < 2) continue;
    const hub = ids
      .map((id) => nodes[id])
      .sort((a, b) => (nb.get(b.id)?.length ?? 0) - (nb.get(a.id)?.length ?? 0) || rank(b) - rank(a))[0];
    const freq = new Map<string, number>();
    for (const id of ids) for (const w of words(`${nodes[id].title} ${nodes[id].body}`)) freq.set(w, (freq.get(w) ?? 0) + 1);
    const theme = [...freq].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => display(w));
    out.push({ ids, hub, theme });
  }
  return out.sort((a, b) => b.ids.length - a.ids.length);
}

const rank = (n: PlanNode) => (n.kind === "goal" ? 3 : n.kind === "milestone" ? 2 : 1);

/** Compact text rendering of the board for Claude. */
export function boardToText(project: string, nodes: Nodes, edges: Edges): string {
  const lines = [`PROJECT: ${project}`, "", "CARDS:"];
  for (const n of Object.values(nodes).sort((a, b) => a.ref.localeCompare(b.ref))) {
    const status = n.kind === "step" ? ` [${n.status}]` : "";
    lines.push(`- ${n.ref} (${n.kind}${status}): ${n.title}${n.body.trim() ? ` — ${n.body.trim().replace(/\s+/g, " ")}` : ""}`);
  }
  lines.push("", "LINKS:");
  for (const e of Object.values(edges)) {
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (a && b) lines.push(`- ${a.ref} ${e.rel ?? "feeds"} ${b.ref}`);
  }
  return lines.join("\n");
}
