"use client";

import { useEffect, useState } from "react";
import { STARTERS, type Starter, type TourStep } from "@/lib/starters";
import { usePlan } from "@/lib/store";
import { toast } from "@/lib/history";
import { findSheetByName, newSheet, switchSheet } from "@/lib/sheets";
import { Symbol } from "./NodeCard";
import { tidy } from "@/lib/layout";

/** On a phone, lay an example out top to bottom so it can be read without zooming out to nothing. */
function forScreen(st: Starter) {
  const d = st.build();
  if (typeof window === "undefined" || window.innerWidth >= 768) return d;
  const pos = tidy(d.nodes, d.edges, [], { vertical: true });
  d.nodes = Object.fromEntries(Object.entries(d.nodes).map(([id, n]) => [id, { ...n, ...pos[id] }]));
  return d;
}

const fitAll = () => {
  const wide = window.innerWidth >= 900;
  usePlan.getState().fit(window.innerWidth, window.innerHeight, wide ? 300 : 0);
};

/** For the tour: reuse an untouched copy of the example if there is one, rather than piling up copies. */
/** The sheet you were on before the tour, to come back to when it ends. */
let beforeTour: string | null = null;

/**
 * For the tour: always a fresh copy of the example (so the tour's words match what's on
 * screen, even if you edited it last time), kept in one "(tour)" sheet that gets reused.
 */
export function openForTour(st: Starter) {
  const name = `${st.title} (tour)`;
  const fresh = { ...forScreen(st), project: name };
  const s = usePlan.getState();
  if (s.project !== name) beforeTour = Object.keys(s.nodes).length ? s.sheetId : null;
  if (s.project === name) {
    s.loadSheet(fresh);
  } else {
    const existing = findSheetByName(name);
    if (existing && switchSheet(existing.id)) usePlan.getState().loadSheet(fresh);
    else if (Object.keys(s.nodes).length) newSheet(fresh);
    else s.loadSheet(fresh);
  }
  fitAll();
}

/** After the tour: back to the sheet you were on. */
function leaveTour() {
  const back = beforeTour;
  beforeTour = null;
  if (back && back !== usePlan.getState().sheetId && switchSheet(back)) {
    toast("Back to your sheet — the example stays under Sheets if you want it again");
  }
  fitAll();
}

/** Open an example or template. Never overwrites work: a non-empty sheet stays, and this opens as a new one. */
export function loadStarter(st: Starter) {
  const hadCards = Object.keys(usePlan.getState().nodes).length > 0;
  if (hadCards) {
    if (!newSheet(forScreen(st))) return;
    toast(`Opened “${st.title}” as a new sheet — your other work is under Sheets`);
  } else {
    usePlan.getState().loadSheet(forScreen(st));
  }
  fitAll();
}

function Item({ st, onPick, onTour }: { st: Starter; onPick: () => void; onTour?: () => void }) {
  return (
    <li className="flex flex-col rounded-sm border border-[var(--line)] p-3">
      <div className="flex items-center gap-2">
        <span className={`bp-${st.icon} bp-accent`}><Symbol kind={st.icon} size={14} /></span>
        <span className="text-[13px] font-medium text-[var(--ink)]">{st.title}</span>
      </div>
      <p className="mt-1 flex-1 text-[11px] leading-relaxed text-[var(--ink-dim)]">{st.blurb}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {onTour && (
          <button onClick={onTour} className="bp-btn bp-btn-primary px-2 py-1 text-[11px]">Take the tour</button>
        )}
        <button onClick={onPick} className="bp-btn px-2 py-1 text-[11px]">
          {st.type === "example" ? "Explore" : "Use template"}
        </button>
      </div>
    </li>
  );
}

/** The way in: shown on an empty sheet, and from the Start button. */
export function Start({
  onClose,
  onTour,
  onDump,
}: {
  onClose: () => void;
  onTour: (st: Starter) => void;
  onDump: () => void;
}) {
  const examples = STARTERS.filter((s) => s.type === "example");
  const templates = STARTERS.filter((s) => s.type === "template");
  const pick = (st: Starter) => {
    loadStarter(st);
    onClose();
  };
  return (
    <div className="bp-panel pointer-events-auto max-h-[calc(100dvh-200px)] w-[min(680px,calc(100vw-32px))] overflow-y-auto max-md:max-h-full max-md:w-full">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <span className="bp-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-dim)]">Start</span>
        <button onClick={onClose} className="bp-mono ml-auto text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">
          blank sheet ✕
        </button>
      </div>
      <div className="space-y-5 p-4">
        <p className="text-[13px] leading-relaxed text-[var(--ink-dim)]">
          A sheet for thinking things through: collect what you know, say what you think and how sure you are, link it up,
          and let the board point out where it doesn&apos;t hold together. New here? Take the two-minute tour.
        </p>

        <section>
          <div className="bp-label mb-2">Explore an example</div>
          <ul className="grid gap-2 sm:grid-cols-3">
            {examples.map((st) => (
              <Item key={st.id} st={st} onPick={() => pick(st)} onTour={st.tour ? () => onTour(st) : undefined} />
            ))}
          </ul>
        </section>

        <section>
          <div className="bp-label mb-2">Start your own from a template</div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {templates.map((st) => (
              <Item key={st.id} st={st} onPick={() => pick(st)} />
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
            Templates are just structure: replace every <span className="bp-mono">[bracket]</span> with your own words, and
            delete what you don&apos;t need.
          </p>
        </section>

        <section className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
          <button onClick={onDump} className="bp-btn">Empty my head first (D)</button>
          <button onClick={onClose} className="bp-btn">Blank sheet</button>
          <span className="text-[11px] text-[var(--ink-faint)]">Press ? any time for help on anything.</span>
        </section>
      </div>
    </div>
  );
}

/** Step-by-step walkthrough over a loaded example. */
export function Tour({ steps, onEnd }: { steps: TourStep[]; onEnd: () => void }) {
  const [i, setI] = useState(0);
  const step = steps[i];

  useEffect(() => {
    const s = usePlan.getState();
    // On phones the editor would cover the tour, so the tour never opens it there.
    const openEditor = !!step.select && window.innerWidth >= 768;
    const n = step.focus ? Object.values(s.nodes).find((x) => x.ref === step.focus) : undefined;
    if (n) {
      s.focus(n.id, window.innerWidth, window.innerHeight, openEditor);
      // Keep the card clear of the tour box (top on desktop, bottom on phones).
      const v = usePlan.getState().view;
      usePlan.getState().setView({ ...v, y: v.y + (window.innerWidth >= 768 ? 110 : -110) });
    }
    if (!openEditor) s.select(null);
    usePlan.setState({ spotlight: n?.id ?? null });
    if (step.tab) window.dispatchEvent(new CustomEvent("blueprint-tab", { detail: step.tab }));
  }, [step]);

  const end = () => {
    usePlan.setState({ spotlight: null });
    leaveTour();
    onEnd();
  };

  return (
    <div role="dialog" aria-label="Tour" className="bp-panel pointer-events-auto w-[min(440px,calc(100vw-32px))] border-[var(--spark)] p-4 max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:w-auto">
      <div className="flex items-center gap-2">
        <span className="bp-mono text-[10px] uppercase tracking-[0.22em] text-[var(--spark)]">Tour</span>
        <span className="bp-mono text-[10px] text-[var(--ink-faint)]">
          {i + 1} / {steps.length}
        </span>
        <button onClick={end} className="bp-mono ml-auto text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">end ✕</button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]">{step.text}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          {steps.map((_, j) => (
            <span key={j} className={`h-1 w-4 rounded-full ${j <= i ? "bg-[var(--spark)]" : "bg-[var(--line)]"}`} />
          ))}
        </span>
        <button disabled={i === 0} onClick={() => setI(i - 1)} className="bp-tool ml-auto disabled:opacity-30">Back</button>
        {i < steps.length - 1 ? (
          <button onClick={() => setI(i + 1)} className="bp-btn bp-btn-primary">Next</button>
        ) : (
          <button onClick={end} className="bp-btn bp-btn-primary">Done</button>
        )}
      </div>
    </div>
  );
}
