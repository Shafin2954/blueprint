"use client";

import { useMemo, useState } from "react";
import { usePlan } from "@/lib/store";
import { KIND_META, type PlanNode } from "@/lib/types";
import { Symbol } from "./NodeCard";

export function findCards(nodes: Record<string, PlanNode>, q: string): PlanNode[] {
  const list = Object.values(nodes);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  return list
    .map((n) => {
      const title = n.title.toLowerCase();
      const hay = `${title} ${n.body} ${n.ref} ${n.source ?? ""} ${KIND_META[n.kind].label}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      // Title and ref hits first, then anything else.
      const score = terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (n.ref.toLowerCase() === t ? 5 : 0) + 1, 0);
      return { n, score };
    })
    .filter((x): x is { n: PlanNode; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((x) => x.n);
}

function snippet(text: string, q: string) {
  const t = q.toLowerCase().split(/\s+/).find(Boolean);
  if (!t || !text) return "";
  const i = text.toLowerCase().indexOf(t);
  if (i < 0) return "";
  const start = Math.max(0, i - 30);
  return `${start ? "…" : ""}${text.slice(start, i + t.length + 50).replace(/\s+/g, " ")}…`;
}

export function Find({ onClose }: { onClose: () => void }) {
  const nodes = usePlan((s) => s.nodes);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => findCards(nodes, q), [nodes, q]);
  const cur = Math.min(active, Math.max(0, results.length - 1));

  const go = (n: PlanNode) => {
    usePlan.getState().focus(n.id, window.innerWidth, window.innerHeight);
    onClose();
  };

  return (
    <div role="dialog" aria-label="Find a card" className="bp-panel pointer-events-auto flex max-h-[calc(100dvh-200px)] w-[min(560px,calc(100vw-32px))] flex-col max-md:max-h-full max-md:w-full">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <span className="bp-mono text-[11px] text-[var(--ink-faint)]" aria-hidden>⌕</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(cur + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(cur - 1, 0));
            } else if (e.key === "Enter" && results[cur]) {
              go(results[cur]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Find a card: words, a ref like E-02, a source…"
          aria-label="Find a card"
          role="combobox"
          aria-expanded
          aria-controls="bp-find-results"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button onClick={onClose} className="bp-mono text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">esc</button>
      </div>
      {!q && results.length > 0 && <div className="bp-label px-4 pt-3">Recent</div>}
      <ul id="bp-find-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 ? (
          <li className="px-2 py-3 text-[12px] text-[var(--ink-dim)]">
            {Object.keys(nodes).length ? `No card matches “${q}”.` : "This sheet is empty."}
          </li>
        ) : (
          results.map((n, i) => (
            <li key={n.id} role="option" aria-selected={i === cur}>
              <button
                onClick={() => go(n)}
                onMouseMove={() => setActive(i)}
                className={`flex w-full items-start gap-2.5 rounded-sm px-2 py-1.5 text-left ${i === cur ? "bg-[var(--hover)]" : ""}`}
              >
                <span className={`bp-${n.kind} bp-accent mt-0.5`}><Symbol kind={n.kind} size={13} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-[var(--ink)]">{n.title}</span>
                  {q && snippet(n.body, q) && (
                    <span className="block truncate text-[11px] text-[var(--ink-faint)]">{snippet(n.body, q)}</span>
                  )}
                </span>
                <span className="bp-mono shrink-0 text-[10px] text-[var(--ink-faint)]">{n.ref}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
