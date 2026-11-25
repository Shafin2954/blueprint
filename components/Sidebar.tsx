"use client";

import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { usePlan, useReadOnly } from "@/lib/store";
import { nextMoves, progress } from "@/lib/graph";
import { islands, pairKey, suggestLinks } from "@/lib/insight";
import { useHoles } from "@/lib/useHoles";
import { evidenceMatrix } from "@/lib/holes";
import { cachedBalance, isThin, weight, type Balance } from "@/lib/reason";
import type { Flag, FixAction } from "@/lib/holes";
import type { Kind, PlanNode } from "@/lib/types";
import { Symbol } from "./NodeCard";

type Tab = "next" | "holes" | "picture";

const focusOn = (id: string) => usePlan.getState().focus(id, window.innerWidth, window.innerHeight);

function Ref({ n }: { n: PlanNode }) {
  return (
    <button
      onClick={() => focusOn(n.id)}
      title={n.title}
      className={`bp-${n.kind} bp-mono inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-dim)] hover:text-[var(--ink)] [@media(pointer:coarse)]:min-h-[36px] [@media(pointer:coarse)]:px-2.5`}
    >
      <span className="bp-accent"><Symbol kind={n.kind} size={10} /></span>
      {n.ref}
    </button>
  );
}

export function runFix(a: FixAction) {
  const s = usePlan.getState();
  switch (a.type) {
    case "decompose": return s.decompose(a.id);
    case "test-assumption": return s.testAssumption(a.id);
    case "add-why": return s.addWhy(a.id);
    case "contradiction-to-question": return s.contradictionToQuestion(a.edgeId);
    case "split": return s.splitStep(a.id);
    case "promote": return s.promote(a.id);
  }
}

function NextTab() {
  const readOnly = useReadOnly();
  // Deferred: heavy summaries catch up just after a keystroke instead of delaying it.
  const nodes = useDeferredValue(usePlan((s) => s.nodes));
  const edges = useDeferredValue(usePlan((s) => s.edges));
  const cycleStatus = usePlan((s) => s.cycleStatus);
  const moves = useMemo(() => nextMoves(nodes, edges), [nodes, edges]);
  const goals = useMemo(
    () => Object.values(nodes).filter((n) => n.kind === "goal").map((g) => ({ g, p: progress(g.id, nodes, edges) })),
    [nodes, edges],
  );
  return (
    <>
      {moves.length === 0 ? (
        <p className="px-2 pb-2 text-[12px] leading-relaxed text-[var(--ink-dim)]">
          No open steps. Pick a goal and hit <b>Decompose</b>, or drag from a card&apos;s right port onto empty paper.
        </p>
      ) : (
        <ol className="space-y-1">
          {moves.slice(0, 7).map((m, i) => (
            <li key={m.node.id} className="flex items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-[var(--hover)]">
              <button
                disabled={readOnly}
                onClick={() => cycleStatus(m.node.id)}
                title="Cycle status"
                className={`bp-mono mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[2px] border text-[9px] bp-status-${m.node.status}`}
              >
                {m.node.status === "doing" ? "▸" : i + 1}
              </button>
              <button onClick={() => focusOn(m.node.id)} className="min-w-0 text-left">
                <span className="block text-[13px] leading-snug text-[var(--ink)]">{m.node.title}</span>
                <span className="bp-mono block truncate text-[10px] text-[var(--ink-faint)]">
                  {m.node.ref}
                  {m.unlocks.length > 0 && ` · unlocks ${m.unlocks.map((u) => u.ref).join(", ")}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {goals.length > 0 && (
        <div className="mt-3 border-t border-[var(--line)] px-2 pt-3">
          {goals.map(({ g, p }) => (
            <button key={g.id} onClick={() => focusOn(g.id)} className="mb-2 block w-full text-left">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-[var(--ink)]">{g.title}</span>
                <span className="bp-mono shrink-0 text-[10px] text-[var(--ink-dim)]">
                  {p.total ? Math.round((p.done / p.total) * 100) : 0}%
                </span>
              </span>
              <span className="mt-1 block h-[3px] w-full bg-[var(--line)]">
                <span className="block h-full bg-[var(--ok)]" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const SEV: Record<Flag["severity"], string> = { hole: "Hole", gap: "Gap", note: "Note" };

function HolesTab({ flags }: { flags: Flag[] }) {
  const readOnly = useReadOnly();
  const nodes = usePlan((s) => s.nodes);
  const dismiss = usePlan((s) => s.dismiss);
  return (
    <>
      <p className="px-2 text-[11px] leading-relaxed text-[var(--ink-faint)]">
        These checks look at how your cards connect and how sure you said you are — not at what the words mean. For a
        second opinion on meaning, use <b>Share with AI</b>.
      </p>
      {flags.length === 0 ? (
        <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--ink-dim)]">
          {Object.keys(nodes).length < 3
            ? "Add a few cards and link them — this is where weak spots in the reasoning or plan show up."
            : "Nothing flagged. Either it holds together, or there isn't enough on the sheet yet to tell."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {flags.map((f) => (
            <li key={f.key} className={`bp-flag bp-flag-${f.severity} group rounded-sm border px-2.5 py-2`}>
              <div className="flex items-center gap-2">
                <span className="bp-mono text-[9px] uppercase tracking-[0.2em]">{SEV[f.severity]}</span>
                <button
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent("blueprint-help", { detail: f.title.includes("floating") ? "Floating cards" : f.title }))
                  }
                  title="What does this mean?"
                  aria-label={`Explain: ${f.title}`}
                  className="bp-hit bp-mono ml-auto grid h-4 w-4 place-items-center rounded-full border border-[var(--line)] text-[9px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  ?
                </button>
                {!readOnly && <button
                  onClick={() => dismiss(f.key)}
                  title="Dismiss — I've thought about this"
                  aria-label={`Dismiss: ${f.title}`}
                  className="bp-hit text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                >
                  ✕
                </button>}
              </div>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-[var(--ink)]">{f.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-dim)]">{f.detail}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {f.nodeIds.slice(0, 6).map((id) => nodes[id] && <Ref key={id} n={nodes[id]} />)}
                {f.fix && !readOnly && (
                  <button onClick={() => runFix(f.fix!.action)} className="bp-btn ml-auto px-2 py-0.5 text-[11px]">
                    {f.fix.label}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const STAGE: Record<Kind, number> = {
  thought: 0, spark: 1, evidence: 1, assumption: 2, snippet: 2, claim: 3, risk: 3, question: 4, conclusion: 4,
  step: 4, milestone: 5, goal: 6,
};

function Meter({ score }: { score: number | null }) {
  if (score === null) return <span className="bp-mono text-[10px] text-[var(--ink-faint)]">no evidence yet</span>;
  return (
    <span className="flex h-[5px] w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--warn)_70%,transparent)]">
      <span className="h-full bg-[var(--sup)]" style={{ width: `${score * 100}%` }} />
    </span>
  );
}

const rank = (b: Balance) => (b.score === null ? 0 : 1);

const reasonsText = (b: Balance) => {
  const n = b.pro.length + b.con.length;
  if (isThin(b)) return `${n} reason${n === 1 ? "" : "s"} · too little to judge`;
  if (!b.con.length) return `${n} reasons, none against`;
  if (!b.pro.length) return `${n} reasons, none for`;
  return `${b.pro.length} for, ${b.con.length} against · ${Math.round(b.score! * 100)}% of weight for`;
};

/** Questions with several candidate answers, each weighed by what supports or contradicts it. */
function Questions() {
  // Deferred: heavy summaries catch up just after a keystroke instead of delaying it.
  const nodes = useDeferredValue(usePlan((s) => s.nodes));
  const edges = useDeferredValue(usePlan((s) => s.edges));
  const qs = useMemo(() => {
    return Object.values(nodes)
      .filter((q) => q.kind === "question")
      .map((q) => {
        const answers = Object.values(edges)
          .filter((e) => e.to === q.id && e.rel !== "contradicts" && nodes[e.from])
          .map((e) => nodes[e.from])
          .filter((a) => a.kind === "claim" || a.kind === "conclusion")
          .map((a) => ({ a, b: cachedBalance(a.id, nodes, edges) }))
          // By net evidence (weight for minus against); answers with no evidence at all last.
          .sort((x, y) => rank(y.b) - rank(x.b) || (y.b.forW - y.b.againstW) - (x.b.forW - x.b.againstW));
        return { q, answers };
      })
      .filter((x) => x.answers.length > 0);
  }, [nodes, edges]);

  if (!qs.length) {
    return (
      <p className="text-[11px] leading-relaxed text-[var(--ink-faint)]">
        Ask a <b>Question</b>, link candidate <b>Claims</b> into it as possible answers, then link <b>Evidence</b> to each
        claim (supports or contradicts). The answers get weighed here.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      <li className="text-[11px] leading-relaxed text-[var(--ink-faint)]">
        Ranked by the evidence linked to each answer (green for, red against: the weight for minus the weight against) — not by how sure you said you are.
        With only one reason, or very little weight either way, it says “too little to judge” rather than a percentage.
      </li>
      {qs.map(({ q, answers }) => (
        <li key={q.id}>
          <button onClick={() => focusOn(q.id)} className="block text-left text-[12px] font-medium text-[var(--ink)] hover:underline">
            {q.title}
          </button>
          <ul className="mt-1.5 space-y-1.5">
            {answers.map(({ a, b }) => (
              <li key={a.id}>
                <button onClick={() => focusOn(a.id)} className="w-full text-left">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] text-[var(--ink-dim)]">{a.title}</span>
                    <span className="bp-mono shrink-0 text-[10px] text-[var(--ink-faint)]">
                      you: {Math.round(weight(a))}%
                    </span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className={`flex-1 ${isThin(b) ? "opacity-40" : ""}`}><Meter score={b.score} /></span>
                    <span className="bp-mono shrink-0 text-[9px] text-[var(--ink-faint)]" title={`Evidence weight: ${Math.round(b.forW)} for, ${Math.round(b.againstW)} against`}>
                      {b.score === null
                        ? "no evidence"
                        : reasonsText(b)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {answers.length >= 2 && <Matrix answers={answers.map((x) => x.a)} />}
        </li>
      ))}
    </ul>
  );
}

/** Evidence × answers grid: which evidence actually tells the answers apart. */
function Matrix({ answers }: { answers: PlanNode[] }) {
  const nodes = useDeferredValue(usePlan((s) => s.nodes));
  const edges = useDeferredValue(usePlan((s) => s.edges));
  const m = useMemo(() => evidenceMatrix(answers, nodes, Object.values(edges)), [answers, nodes, edges]);
  if (!m.rows.length) return null;
  const mark = (c: number) => (c > 0 ? "+" : c < 0 ? "−" : "?");
  return (
    <details className="mt-2">
      <summary className="bp-mono cursor-pointer text-[10px] uppercase tracking-[0.12em] text-[var(--ink-faint)] hover:text-[var(--ink)]">
        Evidence × answers
      </summary>
      <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-faint)]">
        + fits that answer, − cuts against it, ? not weighed against it yet. Rows that differ across answers are what decide it;
        a row that&apos;s the same everywhere doesn&apos;t help.
      </p>
      <table className="bp-mono mt-1.5 w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="text-left font-normal text-[var(--ink-faint)]" />
            {m.answers.map((a) => (
              <th key={a.id} title={a.title} className="px-1 font-normal text-[var(--ink-dim)]">{a.ref}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => {
            const flat = r.cells.every((c) => c === r.cells[0]);
            return (
              <tr key={r.node.id} className={`border-t border-[var(--line)] ${flat ? "opacity-50" : ""}`} title={flat ? "Same for every answer: doesn't help decide" : undefined}>
                <td className="max-w-0 py-0.5 pr-1">
                  <button onClick={() => focusOn(r.node.id)} className="block w-full truncate text-left text-[var(--ink-dim)] hover:text-[var(--ink)]" title={r.node.title}>
                    {r.node.ref} {r.node.title}
                  </button>
                </td>
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    className={`w-8 text-center ${c > 0 ? "text-[var(--sup)]" : c < 0 ? "text-[var(--warn)]" : "text-[var(--ink-faint)]"}`}
                    aria-label={c > 0 ? "fits" : c < 0 ? "against" : "not weighed"}
                  >
                    {mark(c)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function PictureTab({ flagCount }: { flagCount: number }) {
  const readOnly = useReadOnly();
  // Deferred: heavy summaries catch up just after a keystroke instead of delaying it.
  const nodes = useDeferredValue(usePlan((s) => s.nodes));
  const edges = useDeferredValue(usePlan((s) => s.edges));
  const dismissed = usePlan((s) => s.dismissed);
  const { connect, dismiss } = usePlan.getState();
  const isl = useMemo(() => islands(nodes, edges), [nodes, edges]);
  const sugg = useMemo(() => suggestLinks(nodes, edges, new Set(dismissed)), [nodes, edges, dismissed]);
  const loose = Object.keys(nodes).length - isl.reduce((s, i) => s + i.ids.length, 0);

  const link = (a: PlanNode, b: PlanNode) => {
    const [from, to] = STAGE[a.kind] <= STAGE[b.kind] ? [a, b] : [b, a];
    const plan = (k: Kind) => k === "step" || k === "milestone";
    connect(from.id, to.id, plan(from.kind) && to.kind !== "assumption" ? "feeds" : "supports");
  };

  return (
    <div className="space-y-3">
      <section className="px-2">
        <div className="bp-label mb-1">Questions &amp; answers</div>
        <Questions />
      </section>

      <section className="px-2">
        <div className="bp-label mb-1">Shape</div>
        <p className="text-[12px] leading-relaxed text-[var(--ink-dim)]">
          {isl.length === 0
            ? "Nothing connected yet."
            : `${isl.length} island${isl.length > 1 ? "s" : ""} of connected thinking`}
          {loose > 0 && `, ${loose} loose card${loose > 1 ? "s" : ""}`}
          {`, ${flagCount} open flag${flagCount === 1 ? "" : "s"}.`}
        </p>
        <ul className="mt-1.5 space-y-1">
          {isl.slice(0, 5).map((i) => (
            <li key={i.hub.id}>
              <button onClick={() => focusOn(i.hub.id)} className="w-full rounded-sm px-1.5 py-1 text-left hover:bg-[var(--hover)]">
                <span className="block truncate text-[12px] text-[var(--ink)]">{i.hub.title}</span>
                <span className="bp-mono block truncate text-[10px] text-[var(--ink-faint)]">
                  {i.ids.length} cards · hub {i.hub.ref}
                  {i.theme.length > 0 && ` · ${i.theme.join(", ")}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-2">
        <div className="bp-label mb-1">Possible connections</div>
        {sugg.length === 0 ? (
          <p className="text-[11px] text-[var(--ink-faint)]">None spotted. Dump more thoughts and they&apos;ll start finding each other.</p>
        ) : (
          <ul className="space-y-1.5">
            {sugg.map((s) => {
              const a = nodes[s.a];
              const b = nodes[s.b];
              return (
                <li key={pairKey(s.a, s.b)} className="rounded-sm border border-[var(--line)] p-2">
                  <div className="flex items-center gap-1">
                    <Ref n={a} /><span className="text-[var(--ink-faint)]">↔</span><Ref n={b} />
                    <span className="bp-mono ml-1 truncate text-[10px] text-[var(--ink-faint)]">“{s.shared.join("”, “")}”</span>
                  </div>
                  <div className={`mt-1.5 flex gap-1 ${readOnly ? "hidden" : ""}`}>
                    <button onClick={() => link(a, b)} className="bp-btn px-2 py-0.5 text-[11px]">Link them</button>
                    <button onClick={() => dismiss(pairKey(s.a, s.b))} className="bp-tool px-2 py-0.5 text-[11px]">Not related</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Sidebar() {
  const flags = useHoles();
  // Planning sheets open on Next; reasoning sheets on Plot holes, the most useful view there.
  const [tab, setTab] = useState<Tab>(() =>
    Object.values(usePlan.getState().nodes).some((n) => n.kind === "step") ? "next" : "holes",
  );
  const [open, setOpenState] = useState(() => {
    if (window.innerWidth < 768) return false; // phones: start folded, the board needs the room
    try {
      const saved = localStorage.getItem("blueprint-sidebar-open");
      if (saved !== null) return saved === "1";
    } catch {}
    return window.innerWidth >= 900;
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (window.innerWidth < 768) return; // phones: not remembered
    try {
      localStorage.setItem("blueprint-sidebar-open", v ? "1" : "0");
    } catch {}
  };
  useEffect(() => {
    // Phones: opening a card folds the panel (not remembered — it's about room, not preference).
    const fold = () => setOpenState(false);
    window.addEventListener("blueprint-sidebar-fold", fold);
    return () => window.removeEventListener("blueprint-sidebar-fold", fold);
  }, []);
  // The tour (and anything else) can ask for a tab: dispatch "blueprint-tab" with "next" | "holes" | "picture".
  useEffect(() => {
    const on = (e: Event) => {
      setTab((e as CustomEvent<Tab>).detail);
      setOpen(true);
    };
    window.addEventListener("blueprint-tab", on);
    return () => window.removeEventListener("blueprint-tab", on);
  }, []);
  const holes = flags.filter((f) => f.severity === "hole").length;
  const tabs: [Tab, string, number?][] = [
    ["next", "Next"],
    ["holes", "Plot holes", flags.length],
    ["picture", "Big picture"],
  ];

  const linking = usePlan((s) => s.linking !== null);
  if (linking && window.innerWidth < 768) return null; // phones: give the board all the room while choosing a target

  return (
    <aside aria-label="Checks and overview" className="bp-panel pointer-events-auto w-[300px] max-w-[calc(100vw-32px)]">
      <div className="flex items-center border-b border-[var(--line)]">
        {tabs.map(([t, label, n]) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setOpen(true);
            }}
            aria-label={`${label} tab`}
            className={`bp-tabbtn bp-mono flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-1.5 py-2.5 text-[10px] uppercase tracking-[0.08em] ${
              open && tab === t ? "text-[var(--ink)] shadow-[inset_0_-2px_0_var(--spark)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
            }`}
          >
            {label}
            {n ? <span className={`rounded-full px-1.5 text-[9px] ${holes ? "bg-[var(--warn)] text-[var(--paper-deep)]" : "bg-[var(--line)] text-[var(--ink)]"}`}>{n}</span> : null}
          </button>
        ))}
        <button onClick={() => setOpen(!open)} className="bp-tabbtn bp-mono px-3 text-[12px] text-[var(--ink-faint)]" title={open ? "Collapse" : "Expand"} aria-label={open ? "Collapse panel" : "Expand panel"}>
          {open ? "−" : "+"}
        </button>
      </div>
      {open && (
        <div className="max-h-[calc(100dvh-220px)] overflow-y-auto px-2 py-3">
          {tab === "next" && <NextTab />}
          {tab === "holes" && <HolesTab flags={flags} />}
          {tab === "picture" && <PictureTab flagCount={flags.length} />}
        </div>
      )}
    </aside>
  );
}
