"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { usePlan } from "@/lib/store";
import { cachedBalance, isThin, weight } from "@/lib/reason";
import { BELIEF_KINDS, KIND_META, type Edge, type Kind, type PlanNode } from "@/lib/types";
import { Symbol } from "./NodeCard";

interface Item {
  node: PlanNode;
  /** How this card bears on its parent. */
  rel?: Edge["rel"];
  children: Item[];
  /** Already shown higher up the tree (a card can feed several others). */
  repeat?: boolean;
}

interface Act {
  label: string;
  kind: Kind;
  rel: Edge["rel"] & string;
  /** "for C-01", "answering Q-01"… */
  what: string;
}

/** What you can add straight from the list, per kind of card. */
const ACTS: Partial<Record<Kind, Act[]>> = {
  question: [{ label: "+ answer", kind: "claim", rel: "supports", what: "answering" }],
  claim: [
    { label: "+ for", kind: "evidence", rel: "supports", what: "for" },
    { label: "− against", kind: "evidence", rel: "contradicts", what: "against" },
  ],
  conclusion: [
    { label: "+ for", kind: "evidence", rel: "supports", what: "for" },
    { label: "− against", kind: "evidence", rel: "contradicts", what: "against" },
  ],
  assumption: [{ label: "+ test", kind: "step", rel: "feeds", what: "testing" }],
  goal: [{ label: "+ step", kind: "step", rel: "feeds", what: "towards" }],
  problem: [{ label: "+ cause", kind: "cause", rel: "feeds", what: "causing" }],
  cause: [{ label: "+ why", kind: "cause", rel: "feeds", what: "causing" }],
  root: [
    { label: "+ fix", kind: "fix", rel: "feeds", what: "fixing" },
    { label: "+ proof", kind: "evidence", rel: "supports", what: "for" },
  ],
  fix: [{ label: "+ step", kind: "step", rel: "feeds", what: "putting in" }],
  milestone: [{ label: "+ step", kind: "step", rel: "feeds", what: "towards" }],
};

const ROOT_ORDER: Kind[] = ["question", "problem", "goal", "conclusion", "milestone", "claim", "step", "assumption", "risk", "evidence", "snippet", "spark", "thought"];

/**
 * The sheet as an indented list: each end point (a question, a goal…) with what leads into it
 * underneath — answers, then the reasons for and against each. Reads well on a small screen,
 * where the canvas needs panning and zooming.
 */
function buildTree(nodes: Record<string, PlanNode>, edges: Record<string, Edge>): { roots: Item[]; loose: PlanNode[] } {
  const into = new Map<string, Edge[]>();
  const hasOut = new Set<string>();
  const linked = new Set<string>();
  for (const e of Object.values(edges)) {
    if (!nodes[e.from] || !nodes[e.to]) continue;
    linked.add(e.from).add(e.to);
    into.set(e.to, [...(into.get(e.to) ?? []), e]);
    if (e.rel !== "contradicts") hasOut.add(e.from);
  }
  const shown = new Set<string>();
  const grow = (n: PlanNode, rel: Edge["rel"] | undefined, path: Set<string>): Item => {
    if (shown.has(n.id)) return { node: n, rel, children: [], repeat: true };
    shown.add(n.id);
    path.add(n.id);
    const kids = (into.get(n.id) ?? [])
      .filter((e) => !path.has(e.from))
      // For first, then against, then what feeds in; surest first.
      .sort((a, b) => order(a) - order(b) || weight(nodes[b.from]) - weight(nodes[a.from]))
      .map((e) => grow(nodes[e.from], e.rel, path));
    path.delete(n.id);
    return { node: n, rel, children: kids };
  };
  const order = (e: Edge) => (e.rel === "supports" ? 0 : e.rel === "contradicts" ? 1 : 2);
  const rootCards = Object.values(nodes)
    .filter((n) => linked.has(n.id) && !hasOut.has(n.id))
    .sort((a, b) => ROOT_ORDER.indexOf(a.kind) - ROOT_ORDER.indexOf(b.kind) || a.createdAt - b.createdAt);
  const roots = rootCards.map((n) => grow(n, undefined, new Set()));
  // Anything still unseen sits in a loop of contradictions only: show it as its own root.
  for (const n of Object.values(nodes)) if (linked.has(n.id) && !shown.has(n.id)) roots.push(grow(n, undefined, new Set()));
  const loose = Object.values(nodes)
    .filter((n) => !linked.has(n.id) && n.kind !== "text")
    .sort((a, b) => ROOT_ORDER.indexOf(a.kind) - ROOT_ORDER.indexOf(b.kind) || a.createdAt - b.createdAt);
  return { roots, loose };
}

const matches = (n: PlanNode, q: string) => !q || `${n.ref} ${n.title} ${n.body} ${n.source ?? ""}`.toLowerCase().includes(q);
/** Keep an item if it, or anything under it, matches. */
function filterTree(items: Item[], q: string): Item[] {
  if (!q) return items;
  return items.flatMap((it) => {
    const kids = filterTree(it.children, q);
    return matches(it.node, q) || kids.length ? [{ ...it, children: kids }] : [];
  });
}

export function Outline({ onClose }: { onClose: () => void }) {
  const nodes = useDeferredValue(usePlan((s) => s.nodes));
  const edges = useDeferredValue(usePlan((s) => s.edges));
  const [q, setQ] = useState("");
  const tree = useMemo(() => buildTree(nodes, edges), [nodes, edges]);
  const query = q.trim().toLowerCase();
  const roots = useMemo(() => filterTree(tree.roots, query), [tree, query]);
  const loose = tree.loose.filter((n) => matches(n, query));

  const readOnly = usePlan((s) => s.viewing !== null);
  // The inline "add" box that's open, if any: what to add, into which card.
  const [adding, setAdding] = useState<{ target: string; act: Act } | null>(null);
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim();
    if (!adding || !t) return;
    usePlan.getState().addInto(adding.act.kind, t, adding.target, adding.act.rel);
    setDraft(""); // stay open: add several in a row
  };

  const go = (n: PlanNode) => {
    onClose();
    usePlan.getState().focus(n.id, window.innerWidth, window.innerHeight);
  };

  const row = (it: Item, depth: number, key: string): React.ReactNode => {
    const n = it.node;
    const b = BELIEF_KINDS.has(n.kind) ? cachedBalance(n.id, nodes, edges) : null;
    return (
      <li key={key}>
        <div className="group flex items-start">
        <button
          onClick={() => go(n)}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-sm py-1.5 pr-2 text-left hover:bg-[var(--hover)] [@media(pointer:coarse)]:min-h-[44px]"
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {it.rel && (
            <span
              className={`bp-mono mt-0.5 w-3 shrink-0 text-center text-[12px] ${it.rel === "supports" ? "text-[var(--sup)]" : it.rel === "contradicts" ? "text-[var(--warn)]" : "text-[var(--ink-faint)]"}`}
              aria-label={it.rel === "supports" ? "for" : it.rel === "contradicts" ? "against" : "feeds"}
            >
              {it.rel === "supports" ? "+" : it.rel === "contradicts" ? "−" : "→"}
            </span>
          )}
          <span className={`bp-${n.kind} bp-accent mt-0.5 shrink-0`}><Symbol kind={n.kind} size={13} /></span>
          <span className="min-w-0 flex-1">
            <span className={`block text-[13px] leading-snug text-[var(--ink)] ${it.repeat ? "opacity-60" : ""}`}>
              {n.title}
              {it.repeat && <span className="text-[11px] text-[var(--ink-faint)]"> (above)</span>}
            </span>
            <span className="bp-mono block text-[10px] text-[var(--ink-faint)]">
              {n.ref} · {KIND_META[n.kind].label}
              {BELIEF_KINDS.has(n.kind) && ` · you ${Math.round(weight(n))}%`}
              {b && b.score !== null && !isThin(b) && ` · evidence ${Math.round(b.score * 100)}% for`}
              {n.kind === "step" && ` · ${n.status}`}
            </span>
          </span>
        </button>
        {!readOnly && !it.repeat && (ACTS[n.kind] ?? []).length > 0 && (
          <span className="flex shrink-0 gap-1 py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100">
            {ACTS[n.kind]!.map((a) => (
              <button
                key={a.label}
                onClick={() => {
                  setAdding(adding?.target === n.id && adding.act === a ? null : { target: n.id, act: a });
                  setDraft("");
                }}
                aria-expanded={adding?.target === n.id && adding.act === a}
                title={`Add ${a.what} ${n.ref}`}
                className={`bp-btn bp-mono px-1.5 py-0.5 text-[10px] ${a.rel === "contradicts" ? "text-[var(--warn)]" : a.rel === "supports" ? "text-[var(--sup)]" : ""}`}
              >
                {a.label}
              </button>
            ))}
          </span>
        )}
        </div>
        {adding?.target === n.id && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
            className="flex items-center gap-1.5 py-1 pr-2"
            style={{ paddingLeft: 24 + (depth + 1) * 16 }}
          >
            <span className={`bp-${adding.act.kind} bp-accent shrink-0`}><Symbol kind={adding.act.kind} size={12} /></span>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(null);
                }
              }}
              placeholder={`${KIND_META[adding.act.kind].label} ${adding.act.what} ${n.ref}… (Enter adds)`}
              aria-label={`New ${KIND_META[adding.act.kind].label.toLowerCase()} ${adding.act.what} ${n.ref}`}
              className="bp-input min-w-0 flex-1 px-2 py-1 text-[13px]"
            />
            <button type="submit" disabled={!draft.trim()} className="bp-btn text-[11px] disabled:opacity-40">Add</button>
          </form>
        )}
        {!it.repeat && it.children.length > 0 && (
          <ul>
            {it.children.map((c, i) => row(c, depth + 1, `${c.node.id}-${i}`))}
          </ul>
        )}
      </li>
    );
  };

  const empty = !Object.keys(nodes).length;
  return (
    <div role="dialog" aria-label="Outline" className="bp-panel pointer-events-auto flex max-h-[calc(100dvh-200px)] w-[min(560px,calc(100vw-32px))] flex-col max-md:max-h-full max-md:w-full">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <span className="bp-label">Outline</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter the outline"
          className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button onClick={onClose} aria-label="Close" className="bp-mono text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">
          <span className="max-md:hidden">esc</span>
          <span className="md:hidden">close ✕</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {empty ? (
          <p className="px-2 py-3 text-[12px] text-[var(--ink-dim)]">This sheet is empty.</p>
        ) : (
          <>
            <p className="px-2 pb-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
              Each question, goal or conclusion with what leads into it: <span className="text-[var(--sup)]">+</span> for,{" "}
              <span className="text-[var(--warn)]">−</span> against, → feeds. Tap a card to open it; the small buttons add answers, reasons and steps right here.
            </p>
            {roots.length > 0 && <ul>{roots.map((it) => row(it, 0, it.node.id))}</ul>}
            {loose.length > 0 && (
              <>
                <div className="bp-label px-2 pb-1 pt-3">Not linked yet</div>
                <ul>{loose.map((n) => row({ node: n, children: [] }, 0, n.id))}</ul>
              </>
            )}
            {!roots.length && !loose.length && <p className="px-2 py-3 text-[12px] text-[var(--ink-dim)]">Nothing matches “{q}”.</p>}
          </>
        )}
      </div>
    </div>
  );
}
