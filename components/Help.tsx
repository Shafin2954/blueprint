"use client";

import { useMemo, useState } from "react";
import { HELP, searchHelp, type DemoRow, type HelpEntry, type HelpGroup } from "@/lib/help";
import { usePlan } from "@/lib/store";
import { KIND_META, type Rel } from "@/lib/types";
import { Symbol } from "./NodeCard";

const GROUPS: (HelpGroup | "All")[] = ["All", "Cards", "Links", "Checks", "Tools"];

const REL_GLYPH: Record<Rel, { glyph: string; cls: string; label: string }> = {
  feeds: { glyph: "→", cls: "text-[var(--ink-dim)]", label: "feeds" },
  supports: { glyph: "+", cls: "text-[var(--sup)]", label: "supports" },
  contradicts: { glyph: "≠", cls: "text-[var(--warn)]", label: "contradicts" },
};

/** A tiny static diagram: cards as chips, links as labelled arrows. */
function Demo({ rows }: { rows: DemoRow[] }) {
  return (
    <div className="bp-demo space-y-2 rounded-sm border border-[var(--line)] p-2.5" aria-label="Example">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          {row.map((part, j) =>
            typeof part === "string" ? (
              <span key={j} className={`bp-mono flex flex-col items-center text-[13px] leading-none ${REL_GLYPH[part].cls}`}>
                {REL_GLYPH[part].glyph}
                <span className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">{REL_GLYPH[part].label}</span>
              </span>
            ) : (
              <span
                key={j}
                className={`bp-${part.kind} bp-demo-chip inline-flex max-w-[190px] items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] text-[var(--ink)]`}
              >
                <span className="bp-accent shrink-0"><Symbol kind={part.kind} size={11} /></span>
                <span className={`truncate ${part.status === "done" ? "line-through decoration-[var(--ok)]" : ""}`}>{part.text}</span>
                {part.sure !== undefined && <span className="bp-mono shrink-0 text-[9px] text-[var(--ink-faint)]">{part.sure}%</span>}
                {part.status && part.status !== "done" && (
                  <span className={`bp-mono shrink-0 rounded-sm border px-1 text-[8px] uppercase bp-status-${part.status}`}>{part.status}</span>
                )}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function Entry({ e, open, onToggle }: { e: HelpEntry; open: boolean; onToggle: () => void }) {
  return (
    <li className="rounded-sm border border-[var(--line)]">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--hover)]">
        <span className={`mt-0.5 w-4 shrink-0 ${e.kind ? `bp-${e.kind} bp-accent` : "text-[var(--ink-faint)]"}`}>
          {e.kind ? <Symbol kind={e.kind} size={14} /> : <span className="bp-mono text-[11px]">{e.group === "Checks" ? "!" : e.group === "Links" ? "↗" : "·"}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-[var(--ink)]">{e.title}</span>
          <span className="block text-[11px] leading-relaxed text-[var(--ink-dim)]">{e.summary}</span>
        </span>
        <span className="bp-mono shrink-0 text-[9px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">{e.group}</span>
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3 pl-[38px] text-[12px] leading-relaxed text-[var(--ink-dim)]">
          <p>{e.body}</p>
          {e.fix && (
            <p>
              <span className="bp-label mr-1.5 text-[var(--ok)]">Fix</span>
              {e.fix}
            </p>
          )}
          {e.demo && <Demo rows={e.demo} />}
          {e.kind && (
            <button
              onClick={() => usePlan.getState().addCardNear(e.kind!)}
              className="bp-btn text-[11px]"
            >
              Add a blank {KIND_META[e.kind].label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function Help({ onClose, initialQuery = "" }: { onClose: () => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [group, setGroup] = useState<HelpGroup | "All">("All");
  const results = useMemo(() => searchHelp(q).filter((e) => group === "All" || e.group === group), [q, group]);
  // When opened for a specific flag, expand the best match straight away.
  const [opened, setOpened] = useState<Set<string>>(() => new Set(initialQuery ? searchHelp(initialQuery).slice(0, 1).map((e) => e.id) : []));
  const toggle = (id: string) =>
    setOpened((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="bp-panel pointer-events-auto flex max-h-[calc(100dvh-200px)] w-[min(620px,calc(100vw-32px))] flex-col max-md:max-h-full max-md:w-full">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <span className="bp-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-dim)]">Help</span>
        <span className="bp-mono text-[10px] text-[var(--ink-faint)]">{HELP.length} entries</span>
        <button onClick={onClose} className="bp-mono ml-auto text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">close ✕</button>
      </div>
      <div className="space-y-2 border-b border-[var(--line)] px-4 py-3">
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: evidence, leap, combine, image, share…"
          className="bp-input text-[13px]"
          aria-label="Search help"
        />
        <div className="flex flex-wrap gap-1" role="tablist">
          {GROUPS.map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g)}
              className={`bp-mono rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
                group === g ? "border-[var(--spark)] text-[var(--spark)]" : "border-[var(--line)] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {results.length === 0 ? (
          <p className="text-[12px] text-[var(--ink-dim)]">Nothing matches “{q}”.</p>
        ) : (
          <ul className="space-y-1.5">
            {results.map((e) => (
              <Entry key={e.id} e={e} open={opened.has(e.id) || (results.length === 1)} onToggle={() => toggle(e.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
