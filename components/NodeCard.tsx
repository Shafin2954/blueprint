"use client";

import { memo } from "react";
import { usePlan } from "@/lib/store";
import { isDone, progress } from "@/lib/graph";
import type { Severity } from "@/lib/holes";
import { BELIEF_KINDS, KIND_META, NODE_W, type Kind, type PlanNode } from "@/lib/types";
import { balance, weight } from "@/lib/reason";
import { hostOf, looksLikeImage } from "@/lib/image";
import { useImageSrc } from "@/lib/images";

export function Symbol({ kind, size = 14 }: { kind: Kind; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4 };
  switch (kind) {
    case "evidence":
      return (
        <svg {...common}>
          <circle cx="6.5" cy="6.5" r="4.8" />
          <path d="M10 10l4.5 4.5" />
        </svg>
      );
    case "claim":
      return (
        <svg {...common}>
          <path d="M2 3.5h12v7H7l-3.5 3v-3H2z" />
        </svg>
      );
    case "conclusion":
      return (
        <svg {...common}>
          <circle cx="8" cy="3.5" r="1" fill="currentColor" />
          <circle cx="4" cy="11.5" r="1" fill="currentColor" />
          <circle cx="12" cy="11.5" r="1" fill="currentColor" />
          <path d="M1.5 14.5h13" />
        </svg>
      );
    case "thought":
      return (
        <svg {...common}>
          <path d="M3 11.5c-1.4 0-2.2-1-2.2-2.2 0-1.1.8-2 1.9-2.2C2.9 5.2 4.4 3.8 6.2 4c.6-1.4 2-2.3 3.5-2.1 1.9.2 3.3 1.8 3.2 3.7 1.3.3 2.2 1.4 2.2 2.8 0 1.7-1.3 3.1-3 3.1z" />
          <circle cx="4" cy="14" r="0.9" />
        </svg>
      );
    case "assumption":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" strokeDasharray="2.2 2" />
          <path d="M8 4.5v4.5M8 11v.6" />
        </svg>
      );
    case "question":
      return (
        <svg {...common}>
          <path d="M5.5 5.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.8M8 12.2v.6" />
          <rect x="1.5" y="1.5" width="13" height="13" rx="6.5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M8 1v4M8 11v4M1 8h4M11 8h4M3 3l2.5 2.5M10.5 10.5L13 13M13 3l-2.5 2.5M5.5 10.5L3 13" />
        </svg>
      );
    case "goal":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" />
          <circle cx="8" cy="8" r="3.5" />
          <circle cx="8" cy="8" r="0.8" fill="currentColor" />
        </svg>
      );
    case "milestone":
      return (
        <svg {...common}>
          <path d="M8 1.5L14.5 8 8 14.5 1.5 8z" />
        </svg>
      );
    case "step":
      return (
        <svg {...common}>
          <rect x="2" y="2" width="12" height="12" />
        </svg>
      );
    case "snippet":
      return (
        <svg {...common}>
          <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" />
        </svg>
      );
    case "risk":
      return (
        <svg {...common}>
          <path d="M8 1.8L15 14H1z" />
          <path d="M8 6v4M8 11.6v.8" />
        </svg>
      );
  }
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const f = total ? done / total : 0;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" className="shrink-0">
      <circle cx={12} cy={12} r={r} stroke="var(--line)" strokeWidth={2.5} fill="none" />
      <circle
        cx={12}
        cy={12}
        r={r}
        stroke="var(--ok)"
        strokeWidth={2.5}
        fill="none"
        strokeDasharray={`${c * f} ${c}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

const WEIGHED = new Set<Kind>(["claim", "conclusion", "assumption", "question"]);

function NodeCard({
  node,
  selected,
  dimmed,
  flag,
  gathered,
}: {
  node: PlanNode;
  selected: boolean;
  dimmed: boolean;
  flag?: Severity;
  gathered?: boolean;
}) {
  const cycleStatus = usePlan((s) => s.cycleStatus);
  // Subscribing to edges/nodes only for kinds that show derived progress.
  const derived = usePlan((s) =>
    node.kind === "goal" || node.kind === "milestone"
      ? (() => {
          const p = progress(node.id, s.nodes, s.edges);
          return `${p.done}/${p.total}/${node.kind === "milestone" && isDone(node.id, s.nodes, s.edges) ? 1 : 0}`;
        })()
      : "",
  );
  const [pd, pt, md] = derived.split("/").map(Number);
  // "for/against" weights, as a string so the selector stays referentially stable.
  const weighed = usePlan((s) => {
    if (!WEIGHED.has(node.kind)) return "";
    const b = balance(node.id, s.nodes, s.edges);
    return b.score === null ? "" : `${Math.round(b.forW)}/${Math.round(b.againstW)}`;
  });
  const [forW, againstW] = weighed ? weighed.split("/").map(Number) : [0, 0];
  const belief = BELIEF_KINDS.has(node.kind);
  const img = useImageSrc(node.image);
  const editing = usePlan((s) => s.editing === node.id);
  const readOnly = usePlan((s) => s.viewing !== null);
  const spot = usePlan((s) => s.spotlight === node.id);
  const setEditing = (on: boolean) => usePlan.getState().setEditing(on ? node.id : null);
  const done = node.kind === "step" ? node.status === "done" : md === 1;

  return (
    <div
      data-node-id={node.id}
      role="group"
      aria-label={`${KIND_META[node.kind].label} ${node.ref}: ${node.title}`}
      aria-current={selected || undefined}
      className={`bp-card bp-${node.kind} absolute cursor-grab active:cursor-grabbing ${selected ? "bp-selected" : ""} ${done ? "bp-done" : ""} ${gathered ? "bp-gathered" : ""} ${spot ? "bp-spotlight" : ""}`}
      style={{ left: node.x, top: node.y, width: NODE_W, opacity: dimmed ? 0.38 : 1 }}
    >
      <div className="flex h-[44px] items-center gap-2 px-3">
        <span className="bp-accent">
          <Symbol kind={node.kind} />
        </span>
        <span className="bp-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-dim)]">
          {KIND_META[node.kind].label} · {node.ref}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {flag && flag !== "note" && (
            <span className={`bp-flagdot bp-flag-${flag}`} title={flag === "hole" ? "Plot hole — see the Plot holes tab" : "Gap — see the Plot holes tab"}>
              !
            </span>
          )}
          {node.kind === "step" && (
            <button
              data-nodrag
              disabled={readOnly}
              onClick={() => cycleStatus(node.id)}
              title="Cycle status: todo → doing → done"
              className={`bp-mono rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-widest bp-status-${node.status}`}
            >
              {node.status}
            </button>
          )}
          {(node.kind === "goal" || node.kind === "milestone") && pt > 0 && (
            <span className="bp-mono flex items-center gap-1 text-[10px] text-[var(--ink-dim)]">
              {pd}/{pt}
              <Ring done={pd} total={pt} />
            </span>
          )}
        </span>
      </div>
      <div className="px-3 pb-3">
        {editing ? (
          <textarea
            data-nodrag
            autoFocus
            defaultValue={node.title}
            rows={2}
            aria-label="Card title"
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== node.title) usePlan.getState().updateNode(node.id, { title: v });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) (e.target as HTMLTextAreaElement).blur();
              if (e.key === "Escape") {
                (e.target as HTMLTextAreaElement).value = node.title;
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            className="bp-input -mx-1 w-[calc(100%+8px)] resize-none px-1 py-0.5 text-[14px] leading-snug"
          />
        ) : (
          <h3
            data-title
            title="Double-click to edit"
            className={`text-[14px] leading-snug text-[var(--ink)] ${node.kind === "goal" ? "font-semibold" : "font-medium"}`}
          >
            {node.title}
          </h3>
        )}
        {node.body &&
          (node.kind === "snippet" ? (
            <pre className="bp-mono mt-2 max-h-28 overflow-hidden whitespace-pre-wrap rounded-sm border border-[var(--line)] bg-[var(--code)] p-2 text-[11px] leading-relaxed text-[var(--ink)]">
              {node.body}
            </pre>
          ) : (
            <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-[var(--ink-dim)]">{node.body}</p>
          ))}
        {node.imageOmitted && !node.image && (
          <span className="bp-mono mt-2 block rounded-sm border border-dashed border-[var(--line)] p-2 text-center text-[10px] text-[var(--ink-faint)]">
            image not included in shared link
          </span>
        )}
        {node.image && img === null && (
          <span className="bp-mono mt-2 block rounded-sm border border-dashed border-[var(--line)] p-2 text-center text-[10px] text-[var(--ink-faint)]">
            image not on this device
          </span>
        )}
        {(img || (!node.image && !readOnly && node.link && looksLikeImage(node.link))) && (
          // eslint-disable-next-line @next/next/no-img-element -- user data URLs / arbitrary hosts
          <img
            src={img ?? node.link}
            alt=""
            draggable={false}
            className="mt-2 max-h-40 w-full rounded-sm border border-[var(--line)] object-cover"
          />
        )}
        {node.source && (
          <span className="bp-mono mt-2 mr-1 inline-flex max-w-full truncate rounded-sm border border-dashed border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-dim)]" title="Source">
            from {node.source}
          </span>
        )}
        {node.link && (
          <a
            data-nodrag
            href={node.link}
            target="_blank"
            rel="noopener noreferrer"
            className="bp-mono mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-sm border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--milestone)] hover:border-[var(--milestone)]"
            title={node.link}
          >
            ↗ {hostOf(node.link)}
          </a>
        )}
        {(belief || weighed) && (
          <div className="mt-2.5 flex items-center gap-2">
            {belief && (
              <span className="bp-mono shrink-0 text-[10px] text-[var(--ink-dim)]" title="How sure you are">
                {Math.round(weight(node))}% sure
              </span>
            )}
            {weighed && (
              <span className="flex flex-1 items-center gap-1.5" title={`Weighed: ${forW} for, ${againstW} against`}>
                <span className="flex h-[4px] flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--warn)_70%,transparent)]">
                  <span className="h-full bg-[var(--sup)]" style={{ width: `${(forW / (forW + againstW || 1)) * 100}%` }} />
                </span>
                <span className="bp-mono text-[9px] text-[var(--ink-faint)]">+{forW}/−{againstW}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {/* in / out ports */}
      <span className="bp-port bp-port-in" style={{ top: 22 }} />
      <span data-port={node.id} className="bp-port bp-port-out" style={{ top: 22 }} title="Drag to connect, or drop on empty paper to add a next step" />
    </div>
  );
}

export default memo(NodeCard);
