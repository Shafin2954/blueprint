"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlan, useReadOnly } from "@/lib/store";
import { generate, type Draft, type GenMode } from "@/lib/generate";
import { boardToMarkdown } from "@/lib/exportMd";
import { encodeSheet, shareUrl } from "@/lib/shareLink";
import { deleteWithUndo } from "@/lib/history";
import { membersOf } from "@/lib/frames";
import { KIND_META, REL_META, STRENGTH, relVerb, type Rel, type Strength } from "@/lib/types";
import { Symbol } from "./NodeCard";

export const viewCenter = () => {
  const v = usePlan.getState().view;
  return { x: (window.innerWidth / 2 - v.x) / v.k - 116, y: (window.innerHeight / 2 - v.y) / v.k - 40 };
};

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="bp-panel pointer-events-auto max-h-[calc(100dvh-200px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto max-md:max-h-full max-md:w-full">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <span className="bp-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-dim)]">{title}</span>
        <button onClick={onClose} className="bp-mono ml-auto text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">close ✕</button>
      </div>
      {children}
    </div>
  );
}

type Card = Draft;

export function Generator({ onClose }: { onClose: () => void }) {
  const nodes = usePlan((s) => s.nodes);
  const { pinDraft } = usePlan.getState();
  // Seed is whatever was selected when the generator opened; pinning changes selection.
  const [seedId] = useState(() => {
    const sel = usePlan.getState().selection;
    return sel?.type === "node" ? sel.id : null;
  });
  const seedNode = seedId ? nodes[seedId] : undefined;
  const [mode, setMode] = useState<GenMode>("lenses");
  const [topic, setTopic] = useState(seedNode?.title ?? "");
  const [drafts, setDrafts] = useState<Card[]>(() => generate(seedNode?.title ?? null));
  const [pinned, setPinned] = useState<Set<number>>(new Set());

  const roll = (m = mode) => {
    setDrafts(generate(topic || null, 6, m));
    setPinned(new Set());
  };

  const pin = (d: Card, i: number) => {
    const fromSeed = seedNode && topic === seedNode.title ? seedNode : undefined;
    const base = fromSeed ? { x: fromSeed.x + 300, y: fromSeed.y + pinned.size * 150 - 150 } : viewCenter();
    pinDraft(d, base.x, base.y + (fromSeed ? 0 : pinned.size * 30), fromSeed?.id);
    setPinned(new Set(pinned).add(i));
  };

  return (
    <Shell title="Idea generator" onClose={onClose}>
      <div className="flex gap-1 px-4 pt-3">
        {(["lenses", "ai-era"] as GenMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              roll(m);
            }}
            className={`bp-mono flex-1 rounded-sm border py-1.5 text-[10px] uppercase tracking-[0.18em] ${
              mode === m ? "border-[var(--spark)] text-[var(--spark)]" : "border-[var(--line)] text-[var(--ink-faint)]"
            }`}
          >
            {m === "lenses" ? "Creative lenses" : "AI-era contributions"}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          roll();
        }}
        className="flex gap-2 px-4 pt-3"
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={mode === "ai-era" ? "Something you know or care about" : "Topic (empty = something ordinary)"}
          className="bp-input min-w-0 flex-1"
        />
        <button className="bp-btn bp-btn-primary">Roll</button>
      </form>
      <p className="px-4 pt-2 text-[11px] text-[var(--ink-faint)]">
        {mode === "ai-era"
          ? "Angles for finding where a person still matters: new scarcity, trust, glue work, local & private, tools for agents, teaching."
          : "Lenses: shrink, invert, collide, re-format, one person, constrain, remove, steal."}{" "}
        Pin anything that sparks even a little.
      </p>
      <ul className="grid gap-2 p-4 sm:grid-cols-2">
        {drafts.map((d, i) => (
          <li key={i} className={`rounded-sm border border-[var(--line)] p-3 ${pinned.has(i) ? "opacity-40" : ""}`}>
            <div className="bp-mono mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              <span className={`bp-${d.kind} bp-accent`}><Symbol kind={d.kind} size={11} /></span>
              {d.lens} → {KIND_META[d.kind].label}
            </div>
            <p className="text-[13px] leading-snug text-[var(--ink)]">{d.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-dim)]">{d.body}</p>
            <button disabled={pinned.has(i)} onClick={() => pin(d, i)} className="bp-btn mt-2 text-[11px]">
              {pinned.has(i) ? "Pinned" : "Pin to sheet"}
            </button>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

export function Dump({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const dump = usePlan((s) => s.dump);
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <Shell title="Thought dump" onClose={onClose}>
      <div className="p-4">
        <p className="mb-2 text-[12px] leading-relaxed text-[var(--ink-dim)]">
          Empty your head. One thought per line, in any order, half-formed is fine. Each line becomes a card; the{" "}
          <b>Big picture</b> tab will point out which ones seem to belong together.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder={"I keep thinking about tools for students\nEverything I think of already exists\nMaybe the gap is trust, not features\nI like drawing diagrams more than writing"}
          className="bp-input text-[13px] leading-relaxed"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && lines.length) {
              const c = viewCenter();
              dump(lines, c.x - 200, c.y - 120);
              onClose();
            }
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="bp-mono text-[10px] text-[var(--ink-faint)]">{lines.length} thought{lines.length === 1 ? "" : "s"} · ⌘/Ctrl+Enter</span>
          <button
            disabled={!lines.length}
            onClick={() => {
              const c = viewCenter();
              dump(lines, c.x - 200, c.y - 120);
              onClose();
            }}
            className="bp-btn bp-btn-primary ml-auto"
          >
            Drop on sheet
          </button>
        </div>
      </div>
    </Shell>
  );
}

function ShareLink() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasImages = usePlan((s) => Object.values(s.nodes).some((n) => n.image));
  const make = async () => {
    setBusy(true);
    const { project, nodes, edges, frames, counters } = usePlan.getState();
    setUrl(shareUrl(await encodeSheet({ project, nodes, edges, frames, counters })));
    setBusy(false);
  };
  return (
    <div className="space-y-2 border-b border-[var(--line)] p-4 text-[12px] leading-relaxed text-[var(--ink-dim)]">
      <div className="bp-label">Share a link</div>
      <p>
        Anyone with the link sees this sheet read-only and can save their own copy. The whole sheet is packed into the link
        itself — nothing is uploaded anywhere.{hasImages && " Images aren't included."}
      </p>
      {url ? (
        <>
          <input readOnly value={url} onFocus={(e) => e.target.select()} className="bp-input bp-mono text-[11px]" aria-label="Share link" />
          <div className="flex items-center gap-2">
            <span className={`bp-mono text-[10px] ${url.length > 8000 ? "text-[var(--warn)]" : "text-[var(--ink-faint)]"}`}>
              {url.length.toLocaleString()} characters{url.length > 8000 ? " — long; some chat apps may cut it" : ""}
            </span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {}
              }}
              className="bp-btn bp-btn-primary ml-auto"
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          <p className="text-[11px] text-[var(--ink-faint)]">The link is a snapshot: later edits need a new link.</p>
        </>
      ) : (
        <button onClick={make} disabled={busy} className="bp-btn bp-btn-primary">
          {busy ? "Packing…" : "Create link"}
        </button>
      )}
    </div>
  );
}

export function Share({ onClose }: { onClose: () => void }) {
  const readOnly = useReadOnly();
  const project = usePlan((s) => s.project);
  const nodes = usePlan((s) => s.nodes);
  const edges = usePlan((s) => s.edges);
  const [withRequest, setWithRequest] = useState(true);
  const [copied, setCopied] = useState(false);
  const frames = usePlan((s) => s.frames);
  const md = useMemo(() => boardToMarkdown(project, nodes, edges, withRequest, frames), [project, nodes, edges, withRequest, frames]);

  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.replace(/[^\w-]+/g, "-").toLowerCase() || "board"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Shell title="Share" onClose={onClose}>
      {!readOnly && <ShareLink />}
      <div className="space-y-3 p-4 text-[12px] leading-relaxed text-[var(--ink-dim)]">
        <div className="bp-label">Share with an AI (Markdown)</div>
        <p>
          Blueprint never talks to an AI itself. This turns your board into a Markdown file you can paste into whichever
          assistant you like, for a second opinion on whether your thinking holds together.
        </p>
        <label className="flex items-center gap-2 text-[var(--ink)]">
          <input type="checkbox" checked={withRequest} onChange={(e) => setWithRequest(e.target.checked)} />
          Include a consistency-check request at the top
        </label>
        <textarea readOnly value={md} rows={12} className="bp-input bp-mono text-[11px] leading-relaxed" />
        <div className="flex items-center gap-2">
          <span className="bp-mono text-[10px] text-[var(--ink-faint)]">{md.length.toLocaleString()} characters</span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(md);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              } catch {
                download();
              }
            }}
            className="bp-btn ml-auto"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={download} className="bp-btn bp-btn-primary">Download .md</button>
        </div>
        <p className="text-[11px] text-[var(--ink-faint)]">Attached images aren&apos;t included. Links are.</p>
      </div>
    </Shell>
  );
}

export function EdgePanel({ id }: { id: string }) {
  const readOnly = useReadOnly();
  const edge = usePlan((s) => s.edges[id]);
  const nodes = usePlan((s) => s.nodes);
  const { setRel, setStrength } = usePlan.getState();
  const fresh = usePlan((s) => s.freshEdge === id);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (fresh) panelRef.current?.querySelector<HTMLButtonElement>(".bp-rel-active")?.focus();
  }, [fresh]);
  const [err, setErr] = useState(false);
  if (!edge) return null;
  const a = nodes[edge.from];
  const b = nodes[edge.to];
  const rel = edge.rel ?? "feeds";
  return (
    <aside ref={panelRef} className="bp-panel pointer-events-auto ml-auto w-[300px] max-w-[calc(100vw-32px)] p-4 max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:z-30 max-md:ml-0 max-md:w-auto max-md:max-w-none max-md:max-h-[58dvh] max-md:overflow-y-auto">
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      <div className="flex items-center">
        <div className="bp-label">{fresh ? "New link — what does it mean?" : "Link"}</div>
        <button onClick={() => usePlan.getState().select(null)} className="bp-btn bp-mono ml-auto px-2 py-0.5 text-[11px]" aria-label="Close link panel">
          Done ✕
        </button>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-[var(--ink)]">
        <span className="bp-mono text-[11px] text-[var(--ink-dim)]">{a?.ref}</span> {a?.title}
        <span className="block py-1 text-[11px] text-[var(--spark)]">{relVerb(rel, b?.kind)} ↓</span>
        <span className="bp-mono text-[11px] text-[var(--ink-dim)]">{b?.ref}</span> {b?.title}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {(Object.keys(REL_META) as Rel[]).map((r) => (
          <button
            key={r}
            onClick={() => setErr(!setRel(id, r))}
            className={`bp-mono rounded-sm border px-1 py-1.5 text-[10px] uppercase tracking-[0.06em] bp-rel-${r} ${
              rel === r ? "bp-rel-active" : "border-[var(--line)] text-[var(--ink-faint)]"
            }`}
          >
            {REL_META[r].label}
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-[11px] text-[var(--warn)]">That would make a loop.</p>}
      {rel !== "feeds" && (
        <>
          <div className="bp-label mt-4">How much does it count?</div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {(Object.keys(STRENGTH) as Strength[]).map((k) => (
              <button
                key={k}
                onClick={() => setStrength(id, k)}
                aria-pressed={(edge.strength ?? "normal") === k}
                className={`bp-mono rounded-sm border px-1 py-1.5 text-[10px] uppercase tracking-[0.04em] ${
                  (edge.strength ?? "normal") === k ? "border-[var(--spark)] text-[var(--spark)]" : "border-[var(--line)] text-[var(--ink-faint)]"
                }`}
              >
                {STRENGTH[k].label} ×{STRENGTH[k].mult}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-faint)]">
            Strong evidence that clinches it, or something that only hints. Its weight is the card&apos;s “how sure” × this.
          </p>
        </>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-faint)]">
        <b>Feeds</b>: leads to / unlocks. <b>Supports</b>: is a reason or evidence for. <b>Contradicts</b>: both can&apos;t be true — the
        plot-hole checker will chase it.
      </p>
      <button onClick={() => deleteWithUndo({ type: "edge", id })} className="bp-btn bp-btn-danger mt-3 w-full">Delete link</button>
      </fieldset>
    </aside>
  );
}

export function FramePanel({ id }: { id: string }) {
  const readOnly = useReadOnly();
  const frame = usePlan((s) => s.frames[id]);
  const nodes = usePlan((s) => s.nodes);
  if (!frame) return null;
  const members = membersOf(frame, nodes).map((m) => nodes[m]);
  return (
    <aside className="bp-panel pointer-events-auto ml-auto w-[300px] max-w-[calc(100vw-32px)] p-4 max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:z-30 max-md:ml-0 max-md:w-auto max-md:max-w-none max-md:max-h-[58dvh] max-md:overflow-y-auto">
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      <div className="flex items-center">
        <label className="bp-label block" htmlFor={`frame-${id}`}>Frame label</label>
        <button onClick={() => usePlan.getState().select(null)} className="bp-btn bp-mono ml-auto px-2 py-0.5 text-[11px]" aria-label="Close frame panel">
          Done ✕
        </button>
      </div>
      <input
        id={`frame-${id}`}
        value={frame.label}
        onChange={(e) => usePlan.getState().updateFrame(id, { label: e.target.value })}
        className="bp-input mt-1 text-[14px]"
      />
      </fieldset>
      <div className="bp-label mt-4">Inside ({members.length})</div>
      {members.length ? (
        <ul className="mt-1 space-y-0.5">
          {members.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => usePlan.getState().focus(n.id, window.innerWidth, window.innerHeight)}
                className="flex w-full items-center gap-1.5 text-left text-[12px] text-[var(--ink-dim)] hover:text-[var(--ink)]"
              >
                <span className={`bp-${n.kind} bp-accent`}><Symbol kind={n.kind} size={11} /></span>
                <span className="bp-mono text-[10px]">{n.ref}</span>
                <span className="truncate">{n.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-[var(--ink-faint)]">Empty. Drag cards into it.</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-faint)]">
        A card belongs to a frame when its middle is inside. Drag the label to move the frame with its cards; drag the corner to resize.
      </p>
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          disabled={!members.length}
          onClick={() => usePlan.getState().refitFrames({ [id]: members.map((m) => m.id) })}
          className="bp-btn"
        >
          Fit to cards
        </button>
        <button onClick={() => deleteWithUndo({ type: "frame", id })} className="bp-btn bp-btn-danger">Remove frame</button>
      </div>
      </fieldset>
    </aside>
  );
}
