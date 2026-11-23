"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveImage, isUrl } from "@/lib/image";
import { useImageSrc } from "@/lib/images";
import { deleteWithUndo } from "@/lib/history";
import { usePlan, useReadOnly } from "@/lib/store";
import { BELIEF_KINDS, DEFAULT_CONFIDENCE, KIND_META, KINDS, REL_META, type Kind, type Status } from "@/lib/types";
import { Symbol } from "./NodeCard";

export default function Inspector({ id, onGenerate }: { id: string; onGenerate: () => void }) {
  const node = usePlan((s) => s.nodes[id]);
  const edges = usePlan((s) => s.edges);
  const nodes = usePlan((s) => s.nodes);
  const gathered = usePlan((s) => s.gathered.includes(id));
  const { updateNode, startLinking, decompose, splitStep, promote, focus, testAssumption, addNode, connect } =
    usePlan.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const readOnly = useReadOnly();
  const thumb = useImageSrc(node?.image);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fresh = usePlan((s) => s.fresh === id);

  // A card the user just made: put the cursor in its title, placeholder text selected.
  useEffect(() => {
    if (!fresh) return;
    const t = titleRef.current;
    if (t) {
      t.focus({ preventScroll: true });
      t.select();
    }
    usePlan.getState().clearFresh();
  }, [fresh]);
  const [imgErr, setImgErr] = useState<string | null>(null);

  const attach = async (file: Blob | null | undefined) => {
    if (!file) return;
    setImgErr(null);
    try {
      updateNode(id, { image: await saveImage(file) });
    } catch {
      setImgErr("Couldn't read that image.");
    }
  };

  const links = useMemo(() => {
    const all = Object.values(edges);
    return {
      feeds: all.filter((e) => e.from === id).map((e) => ({ e, n: nodes[e.to] })),
      fedBy: all.filter((e) => e.to === id).map((e) => ({ e, n: nodes[e.from] })),
    };
  }, [edges, nodes, id]);

  if (!node) return null;

  const linkList = (label: string, items: typeof links.feeds) =>
    items.length ? (
      <div className="mt-3">
        <div className="bp-label">{label}</div>
        <ul className="mt-1 space-y-0.5">
          {items.map(({ e, n }) =>
            n ? (
              <li key={e.id} className="group flex items-center gap-2 text-[12px]">
                <button onClick={() => focus(n.id, window.innerWidth, window.innerHeight)} className="flex min-w-0 items-center gap-1.5 text-left text-[var(--ink-dim)] hover:text-[var(--ink)]">
                  <span className={`bp-${n.kind} bp-accent`}><Symbol kind={n.kind} size={11} /></span>
                  <span className="bp-mono whitespace-nowrap text-[10px]">{n.ref}</span>
                  {e.rel && e.rel !== "feeds" && (
                    <span className={`bp-mono text-[9px] uppercase ${e.rel === "contradicts" ? "text-[var(--warn)]" : "text-[var(--sup)]"}`}>
                      {REL_META[e.rel].label}
                    </span>
                  )}
                  <span className="truncate">{n.title}</span>
                </button>
                <button onClick={() => deleteWithUndo({ type: "edge", id: e.id })} title="Unlink" aria-label={`Unlink ${n.ref}`} className="ml-auto text-[var(--ink-faint)] opacity-0 hover:text-[var(--warn)] group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100">✕</button>
              </li>
            ) : null,
          )}
        </ul>
      </div>
    ) : null;

  return (
    <aside className="bp-panel pointer-events-auto ml-auto max-h-full w-[300px] max-w-[calc(100vw-32px)] overflow-y-auto p-4 max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:z-30 max-md:ml-0 max-md:w-auto max-md:max-w-none max-md:max-h-[58dvh] max-md:overflow-y-auto">
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      <div className="flex items-center gap-2">
        <span className={`bp-${node.kind} bp-accent`}><Symbol kind={node.kind} size={16} /></span>
        <span className="bp-mono whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-[var(--ink-dim)]">{node.ref}</span>
        <select
          value={node.kind}
          onChange={(e) => updateNode(id, { kind: e.target.value as Kind })}
          className="bp-input ml-auto w-auto py-1 text-[12px]"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_META[k].label}</option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-[11px] text-[var(--ink-faint)]">{KIND_META[node.kind].hint}</p>

      <label className="bp-label mt-4 block">Title</label>
      <textarea
        ref={titleRef}
        value={node.title}
        rows={2}
        onChange={(e) => updateNode(id, { title: e.target.value })}
        onKeyDown={(e) => {
          // Enter finishes the title (Shift+Enter for a new line) and moves on to notes.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            notesRef.current?.focus();
          }
        }}
        className="bp-input mt-1 resize-none text-[14px]"
      />
      <label className="bp-label mt-3 block">{node.kind === "snippet" ? "Snippet" : "Notes"}</label>
      <textarea
        ref={notesRef}
        value={node.body}
        rows={node.kind === "snippet" ? 7 : 4}
        onChange={(e) => updateNode(id, { body: e.target.value })}
        spellCheck={node.kind !== "snippet"}
        className={`bp-input mt-1 text-[12px] leading-relaxed ${node.kind === "snippet" ? "bp-mono" : ""}`}
        placeholder={node.kind === "snippet" ? "Paste code, copy, a link…" : "Details, where it came from, why it matters…"}
        onPaste={(e) => {
          const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          if (img) {
            e.preventDefault();
            attach(img);
          }
        }}
      />

      {BELIEF_KINDS.has(node.kind) && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <label className="bp-label" htmlFor={`conf-${id}`}>How sure am I?</label>
            <span className="bp-mono text-[12px] text-[var(--ink)]">{node.confidence ?? DEFAULT_CONFIDENCE[node.kind]}%</span>
          </div>
          <input
            id={`conf-${id}`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={node.confidence ?? DEFAULT_CONFIDENCE[node.kind] ?? 50}
            onChange={(e) => updateNode(id, { confidence: Number(e.target.value) })}
            className="bp-range mt-1 w-full"
          />
          <div className="bp-mono flex justify-between text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            <span>doubt it</span>
            <span>no idea</span>
            <span>certain</span>
          </div>
        </div>
      )}

      {(BELIEF_KINDS.has(node.kind) || node.kind === "thought") && (
        <>
          <label className="bp-label mt-3 block" htmlFor={`src-${id}`}>From (who or where)</label>
          <input
            id={`src-${id}`}
            list="bp-sources"
            value={node.source ?? ""}
            onChange={(e) => updateNode(id, { source: e.target.value || undefined })}
            placeholder="e.g. Mum, news article, door cam"
            className="bp-input mt-1 text-[12px]"
          />
          <datalist id="bp-sources">
            {[...new Set(Object.values(nodes).map((n) => n.source?.trim()).filter(Boolean))].map((src) => (
              <option key={src} value={src} />
            ))}
          </datalist>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-faint)]">
            Cards from the same source count once when weighing — repetition isn&apos;t confirmation.
          </p>
        </>
      )}

      <label className="bp-label mt-3 block">Link / URL</label>
      <input
        value={node.link ?? ""}
        onChange={(e) => updateNode(id, { link: e.target.value.trim() || undefined })}
        placeholder="https://…"
        className={`bp-input bp-mono mt-1 text-[11px] ${node.link && !isUrl(node.link) ? "border-[var(--warn)]" : ""}`}
      />

      <div className="mt-3 flex items-center gap-2">
        <span className="bp-label">Image</span>
        {node.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
            {thumb ? <img src={thumb} alt="" className="h-10 w-14 rounded-sm border border-[var(--line)] object-cover" /> : <span className="bp-mono text-[10px] text-[var(--ink-faint)]">{thumb === null ? "missing" : "…"}</span>}
            <button onClick={() => fileRef.current?.click()} className="bp-tool ml-auto text-[11px]">Replace</button>
            <button onClick={() => updateNode(id, { image: undefined })} className="bp-tool text-[11px]">Remove</button>
          </>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="bp-btn ml-auto text-[11px]" title="Or paste an image into Notes, or drop one on the card">
            Attach image
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {imgErr && <p className="mt-1 text-[11px] text-[var(--warn)]">{imgErr}</p>}

      {node.kind === "step" && (
        <div className="mt-3 flex gap-1">
          {(["todo", "doing", "done"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => updateNode(id, { status: s })}
              className={`bp-mono flex-1 rounded-sm border py-1 text-[10px] uppercase tracking-widest ${node.status === s ? `bp-status-${s}` : "border-[var(--line)] text-[var(--ink-faint)]"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-1.5">
        {(node.kind === "goal" || node.kind === "milestone") && (
          <button onClick={() => decompose(id)} className="bp-btn bp-btn-primary col-span-2" title="Scaffold a starter plan feeding this">
            Decompose into steps
          </button>
        )}
        {(node.kind === "evidence" || node.kind === "claim" || node.kind === "thought") && (
          <button
            onClick={() => {
              const c = addNode(node.kind === "evidence" ? "claim" : "conclusion", node.x + 300, node.y, "");
              connect(id, c, "supports");
            }}
            className="bp-btn col-span-2"
            title="Start the next card in the chain, already linked"
          >
            {node.kind === "evidence" ? "What does this suggest? → claim" : "So what follows? → conclusion"}
          </button>
        )}
        {node.kind === "assumption" && (
          <button onClick={() => testAssumption(id)} className="bp-btn bp-btn-primary col-span-2" title="Add the cheapest step that would check this">
            Add a test step
          </button>
        )}
        {(node.kind === "spark" || node.kind === "thought") && (
          <button onClick={() => promote(id)} className="bp-btn bp-btn-primary col-span-2" title="Turn this spark into a goal with a first step">
            Promote to goal
          </button>
        )}
        {node.kind === "step" && (
          <button onClick={() => splitStep(id)} className="bp-btn" title="Too big? Split into two halves">
            Split step
          </button>
        )}
        <button
          onClick={() => usePlan.getState().gather(id)}
          className="bp-btn"
          title="Gather this card (same as shift-click) to combine several into a conclusion"
        >
          {gathered ? "Ungather" : "Gather"}
        </button>
        <button onClick={onGenerate} className="bp-btn" title="Run the idea lenses on this card">
          Generate from this
        </button>
        <button
          onClick={() => startLinking(id)}
          className="bp-btn"
          title="Then tap the card this one leads to — easier than dragging on a phone"
        >
          Link to…
        </button>
        <button onClick={() => deleteWithUndo({ type: "node", id })} className="bp-btn bp-btn-danger">Delete</button>
      </div>

      {linkList("Fed by", links.fedBy)}
      {linkList("Feeds into", links.feeds)}
      </fieldset>
    </aside>
  );
}
