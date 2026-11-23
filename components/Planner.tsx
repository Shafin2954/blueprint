"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlan, useReadOnly } from "@/lib/store";
import { nextMoves } from "@/lib/graph";
import { CORE_KINDS, KIND_GROUPS, KIND_META, type Kind } from "@/lib/types";
import { checkpoint, deleteWithUndo, redo, startHistory, toast, toastUndo, undo, useHistory } from "@/lib/history";
import { tidy } from "@/lib/layout";
import { membersOf } from "@/lib/frames";
import { NEXT_KIND, describe as describeCard, nearestInDirection, nearestTo, type Dir } from "@/lib/keyboard";
import { weight } from "@/lib/reason";
import { BELIEF_KINDS } from "@/lib/types";
import { enterViewer, exitViewer, keepSharedCopy, maintainImages, newSheet, startSheets } from "@/lib/sheets";
import { decodeSheet, shareCodeFromHash } from "@/lib/shareLink";
import { embedImages, internImages } from "@/lib/images";
import { Sheets } from "./Sheets";
import { Find } from "./Find";
import Board from "./Board";
import Inspector from "./Inspector";
import { Symbol } from "./NodeCard";
import { Dump, EdgePanel, FramePanel, Generator, Share, viewCenter } from "./Panels";
import { Help } from "./Help";
import { Start, Tour, loadStarter } from "./Start";
import type { Starter } from "@/lib/starters";
import Sidebar from "./Sidebar";

const fitToScreen = () => {
  const s = usePlan.getState();
  if (window.innerWidth >= 900) return s.fit(window.innerWidth, window.innerHeight, 300);
  // Phones: a whole plan is unreadable at that scale, so open on the next move instead.
  const top = nextMoves(s.nodes, s.edges)[0];
  if (top) s.focus(top.node.id, window.innerWidth, window.innerHeight);
  else s.fit(window.innerWidth, window.innerHeight);
  s.select(null);
};

function Pipeline() {
  const nodes = usePlan((s) => s.nodes);
  const counts = useMemo(() => {
    const c = { spark: 0, goal: 0, milestone: 0, step: 0, doing: 0, done: 0 };
    for (const n of Object.values(nodes)) {
      if (n.kind === "step") {
        if (n.status === "done") c.done++;
        else if (n.status === "doing") c.doing++;
        else c.step++;
      } else if (n.kind in c) c[n.kind as "spark"]++;
    }
    return c;
  }, [nodes]);
  const stages: [string, number][] = [
    ["Sparks", counts.spark],
    ["Goals", counts.goal],
    ["Milestones", counts.milestone],
    ["Queued", counts.step],
    ["Doing", counts.doing],
    ["Done", counts.done],
  ];
  return (
    <div className="bp-mono hidden items-center gap-1 text-[10px] uppercase tracking-[0.16em] lg:flex" aria-label="Pipeline">
      {stages.map(([label, n], i) => (
        <div key={label} className="flex items-center gap-1">
          <span className={`rounded-sm border border-[var(--line)] px-2 py-1 ${n ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}`}>
            {label} <b className="ml-1 font-semibold">{n}</b>
          </span>
          {i < stages.length - 1 && <span className="text-[var(--ink-faint)]">→</span>}
        </div>
      ))}
    </div>
  );
}

function TitleBlock({ onSheets }: { onSheets: () => void }) {
  const project = usePlan((s) => s.project);
  const setProject = usePlan((s) => s.setProject);
  const k = usePlan((s) => s.view.k);
  const count = usePlan((s) => Object.keys(s.nodes).length);
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <div className="bp-panel bp-mono pointer-events-auto hidden w-[300px] text-[10px] uppercase tracking-[0.16em] text-[var(--ink-dim)] md:block">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center text-[9px] text-[var(--ink-faint)]">
          Sheet
          <button onClick={onSheets} className="ml-auto normal-case tracking-normal text-[var(--milestone)] hover:underline">
            all sheets ›
          </button>
        </div>
        <input
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="w-full bg-transparent font-sans text-[14px] normal-case tracking-normal text-[var(--ink)] outline-none"
        />
      </div>
      <div className="grid grid-cols-[1.5fr_1fr_0.8fr] divide-x divide-[var(--line)]">
        <div className="px-3 py-2"><div className="text-[9px] text-[var(--ink-faint)]">Date</div>{date}</div>
        <div className="px-3 py-2"><div className="text-[9px] text-[var(--ink-faint)]">Scale</div>1:{(1 / k).toFixed(2)}</div>
        <div className="px-3 py-2"><div className="text-[9px] text-[var(--ink-faint)]">Items</div>{count}</div>
      </div>
    </div>
  );
}

type Overlay = "gen" | "dump" | "share" | "help" | "start" | "sheets" | "find" | null;

function Toolbar({ open }: { open: (o: Overlay) => void }) {
  const addNode = usePlan((s) => s.addNode);
  const showAll = usePlan((s) => s.showAllKinds);
  const setShowAll = usePlan((s) => s.setShowAllKinds);
  const { canUndo, canRedo } = useHistory();
  const file = useRef<HTMLInputElement>(null);
  const readOnly = useReadOnly();

  const exportPlan = async () => {
    const { project, nodes, edges, frames, counters } = usePlan.getState();
    // Embed images so the file is a complete backup on its own.
    const full = await embedImages(nodes);
    const blob = new Blob([JSON.stringify({ project, nodes: full, edges, frames, counters }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.replace(/[^\w-]+/g, "-").toLowerCase() || "plan"}.blueprint.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (readOnly) {
    return (
      <div className="bp-panel pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 [&>*]:shrink-0">
        <button onClick={() => open("find")} className="bp-btn">Find</button>
        <button onClick={fitToScreen} className="bp-tool">Fit</button>
        <button onClick={() => open("share")} className="bp-tool">Markdown</button>
        <button onClick={() => open("help")} className="bp-btn bp-mono h-[30px] w-[30px] rounded-full p-0 text-[13px]" aria-label="Help">?</button>
      </div>
    );
  }

  return (
    <div className="bp-panel bp-noscrollbar pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 max-md:flex-nowrap md:flex-wrap [&>*]:shrink-0">
      <button onClick={undo} disabled={!canUndo} className="bp-tool px-2 disabled:opacity-30" title="Undo (Ctrl/⌘+Z)" aria-label="Undo">↶</button>
      <button onClick={redo} disabled={!canRedo} className="bp-tool px-2 disabled:opacity-30" title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo">↷</button>
      <span className="mx-1 h-5 w-px bg-[var(--line)]" />
      {KIND_GROUPS.map((group) => group.filter((k) => showAll || CORE_KINDS.has(k))).filter((g) => g.length).map((group, gi) => (
        <span key={gi} className="flex items-center">
          {gi > 0 && <span className="mx-1 h-5 w-px bg-[var(--line)]" />}
          {group.map((k: Kind) => (
            <button
              key={k}
              onClick={() => {
                const c = viewCenter();
                addNode(k, c.x, c.y);
              }}
              title={`Add ${KIND_META[k].label} — ${KIND_META[k].hint}`}
              className={`bp-${k} bp-tool px-2`}
              aria-label={`Add ${KIND_META[k].label}`}
            >
              <span className="bp-accent"><Symbol kind={k} /></span>
            </button>
          ))}
        </span>
      ))}
      <button
        onClick={() => setShowAll(!showAll)}
        className="bp-tool bp-mono px-2 text-[10px] uppercase tracking-[0.14em]"
        title={showAll ? "Show only the core cards" : "Show all 12 card kinds: spark, assumption, goal, milestone, risk, snippet…"}
      >
        {showAll ? "− fewer" : "+ more"}
      </button>
      <span className="mx-1 h-5 w-px bg-[var(--line)]" />
      <button
        onClick={() => {
          const st = usePlan.getState();
          const ids = st.gathered.length ? st.gathered : st.selection?.type === "node" ? [st.selection.id] : [];
          const c = viewCenter();
          st.addFrame(ids, c.x - 180, c.y - 120);
          st.clearGathered();
        }}
        className="bp-tool"
        title="Frame: group the gathered (or selected) cards under a label"
      >
        Frame
      </button>
      <button onClick={() => open("find")} className="bp-btn" title="Find a card (Ctrl/⌘+K or /)" aria-label="Find a card">
        Find
      </button>
      <button onClick={() => open("start")} className="bp-btn" title="Examples, a guided tour, and templates">Start</button>
      <button onClick={() => open("dump")} className="bp-btn" title="Empty your head: one thought per line (D)">Dump</button>
      <button onClick={() => open("gen")} className="bp-btn" title="Idea generator (G)">Generate</button>
      <button onClick={() => open("share")} className="bp-btn bp-btn-primary" title="Share a read-only link, or export Markdown for an AI consistency check">
        Share
      </button>
      <button
        onClick={() => open("help")}
        className="bp-btn bp-mono h-[30px] w-[30px] rounded-full p-0 text-[13px]"
        title="Help: what every card, link, check and tool does (?)"
        aria-label="Help"
      >
        ?
      </button>
      <span className="mx-1 h-5 w-px bg-[var(--line)]" />
      <button
        onClick={() => {
          const st = usePlan.getState();
          if (Object.keys(st.nodes).length < 2) return;
          checkpoint();
          // Remember who was in each frame, lay out, then shrink-wrap the frames again.
          const members = Object.fromEntries(Object.values(st.frames).map((f) => [f.id, membersOf(f, st.nodes)]));
          st.setPositions(tidy(st.nodes, st.edges));
          st.refitFrames(members);
          checkpoint();
          fitToScreen();
          toastUndo("Tidied the sheet");
        }}
        className="bp-tool"
        title="Lay the sheet out left to right by how cards connect (undoable)"
      >
        Tidy
      </button>
      <button onClick={fitToScreen} className="bp-tool" title="Fit the whole plan on screen">Fit</button>
      <button onClick={exportPlan} className="bp-tool" title="Download plan as JSON">Export</button>
      <button onClick={() => file.current?.click()} className="bp-tool" title="Load a .blueprint.json">Import</button>
      <button onClick={() => open("sheets")} className="bp-tool" title="Your sheets: new, open, rename, duplicate, delete">
        Sheets
      </button>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const d = JSON.parse(await f.text());
            if (!d || typeof d !== "object" || !d.nodes || !d.edges) toast("That file doesn't look like a Blueprint sheet.");
            else if (newSheet({ project: d.project || f.name.replace(/\.blueprint\.json$|\.json$/, ""), nodes: d.nodes, edges: d.edges, frames: d.frames ?? {}, counters: d.counters ?? {} })) {
              fitToScreen();
              toast(`Imported “${d.project || f.name}” as a new sheet`);
              // Move embedded images into the image store.
              const moved = await internImages(usePlan.getState().nodes);
              if (moved) usePlan.setState({ nodes: moved });
            }
          } catch {
            toast("Couldn't read that file.");
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

function clearHash() {
  history.replaceState(null, "", location.pathname + location.search);
}

function openShared(code: string) {
  decodeSheet(code)
    .then((d) => {
      if (enterViewer(d)) {
        fitToScreen();
        usePlan.getState().select(null);
      } else toast("Couldn't open the shared sheet — browser storage is full.");
    })
    .catch(() => {
      toast("That share link looks broken or incomplete.");
      clearHash();
    });
}

function ViewerBar() {
  const viewing = usePlan((s) => s.viewing);
  const project = usePlan((s) => s.project);
  if (!viewing) return null;
  return (
    <div role="region" aria-label="Shared sheet" className="bp-panel pointer-events-auto flex flex-wrap items-center gap-2 border-[var(--milestone)] px-3 py-2">
      <span className="bp-mono text-[10px] uppercase tracking-[0.18em] text-[var(--milestone)]">Shared · read-only</span>
      <span className="text-[13px] text-[var(--ink)]">{project}</span>
      <button
        onClick={() => {
          keepSharedCopy();
          clearHash();
          toast(`Saved “${project}” to your sheets — you can edit it now`);
        }}
        className="bp-btn bp-btn-primary"
      >
        Save a copy to edit
      </button>
      <button
        onClick={() => {
          exitViewer();
          clearHash();
        }}
        className="bp-tool"
      >
        Close
      </button>
    </div>
  );
}

/** World coordinates of the middle of the screen. */
const centerWorld = (): [number, number] => {
  const v = usePlan.getState().view;
  return [(window.innerWidth / 2 - v.x) / v.k, (window.innerHeight / 2 - v.y) / v.k];
};

/** Pan just enough to bring a card on screen (no jump if it's already visible). */
function reveal(id: string) {
  const s = usePlan.getState();
  const n = s.nodes[id];
  if (!n) return;
  const { x, y, k } = s.view;
  const sx = n.x * k + x;
  const sy = n.y * k + y;
  const m = 80;
  if (sx < m + 300 || sy < m + 60 || sx + 232 * k > window.innerWidth - m - 300 || sy + 120 * k > window.innerHeight - m) {
    s.focus(id, window.innerWidth, window.innerHeight, true);
  }
}

/** Tells screen readers what's selected and what keyboard mode is on. */
function Announcer() {
  const text = usePlan((s) => {
    const sel = s.selection;
    let t = "";
    if (sel?.type === "node" && s.nodes[sel.id]) {
      const n = s.nodes[sel.id];
      t = describeCard(n, KIND_META[n.kind].label, BELIEF_KINDS.has(n.kind) ? Math.round(weight(n)) : undefined);
    } else if (sel?.type === "frame" && s.frames[sel.id]) t = `Frame ${s.frames[sel.id].label}`;
    else if (sel?.type === "edge") t = "Link selected";
    if (s.linking) t += `. Linking from ${s.nodes[s.linking]?.ref}: choose a card with the arrow keys, Enter to link.`;
    return t;
  });
  return (
    <div aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}

function LinkBar() {
  const linking = usePlan((s) => s.linking);
  const from = usePlan((s) => (s.linking ? s.nodes[s.linking] : undefined));
  if (!linking || !from) return null;
  return (
    <div className="bp-panel pointer-events-auto flex items-center gap-2 border-[var(--milestone)] px-3 py-2">
      <span className="bp-mono text-[10px] uppercase tracking-[0.18em] text-[var(--milestone)]">Linking</span>
      <span className="text-[12px] text-[var(--ink-dim)]">from {from.ref} — tap the card it leads to (or arrows + Enter)</span>
      <button onClick={() => usePlan.getState().startLinking(null)} className="bp-tool">Cancel</button>
    </div>
  );
}

function Toast() {
  const [msg, setMsg] = useState<{ text: string; undo: boolean; n: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; undo: boolean }>).detail;
      setMsg((m) => ({ ...d, n: (m?.n ?? 0) + 1 }));
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 6000);
    };
    window.addEventListener("blueprint-toast", on);
    return () => {
      window.removeEventListener("blueprint-toast", on);
      clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <div key={msg.n} role="status" className="bp-panel pointer-events-auto flex items-center gap-3 px-3 py-2 text-[12px] text-[var(--ink)]">
      {msg.text}
      {msg.undo && <button
        onClick={() => {
          undo();
          setMsg(null);
        }}
        className="bp-btn bp-btn-primary px-2 py-0.5 text-[11px]"
      >
        Undo
      </button>}
    </div>
  );
}

function GatherBar() {
  const gathered = usePlan((s) => s.gathered);
  const nodes = usePlan((s) => s.nodes);
  const { combine, clearGathered } = usePlan.getState();
  if (!gathered.length) return null;
  return (
    <div className="bp-panel pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="bp-mono text-[10px] uppercase tracking-[0.18em] text-[var(--spark)]">Gathered</span>
      <span className="bp-mono text-[11px] text-[var(--ink-dim)]">{gathered.map((g) => nodes[g]?.ref).filter(Boolean).join(" + ")}</span>
      <button disabled={gathered.length < 2} onClick={combine} className="bp-btn bp-btn-primary" title="Create a conclusion supported by all gathered cards">
        Combine → conclusion
      </button>
      <button onClick={clearGathered} className="bp-tool">Clear</button>
    </div>
  );
}

export default function Planner() {
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  const [tour, setTour] = useState<Starter | null>(null);
  // `n` remounts the overlay on each open so the generator reseeds from the current selection.
  const [overlay, setOverlay] = useState<{ kind: Overlay; n: number; q?: string }>({ kind: null, n: 0 });
  useEffect(() => {
    const on = () => setFull(true);
    // Other panels ask for a specific help entry (e.g. the ? on a plot-hole flag).
    const help = (e: Event) => setOverlay((o) => ({ kind: "help", n: o.n + 1, q: (e as CustomEvent<string>).detail }));
    // A share link pasted into an already-open tab.
    const onHash = () => {
      const code = shareCodeFromHash(location.hash);
      if (code) openShared(code);
    };
    window.addEventListener("blueprint-storage-full", on);
    window.addEventListener("blueprint-help", help);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("blueprint-storage-full", on);
      window.removeEventListener("blueprint-help", help);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  const open = (kind: Overlay) => setOverlay((o) => ({ kind: o.kind === kind ? null : kind, n: o.n + 1 }));
  const close = () => setOverlay((o) => ({ ...o, kind: null }));
  const selection = usePlan((s) => s.selection);

  useEffect(() => {
    Promise.resolve(usePlan.persist.rehydrate()).then(() => {
      startHistory();
      startSheets();
      maintainImages().catch(() => {});
      // Offline + installable. Only in production builds: a dev-mode worker would cache stale code.
      if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
      }
      // First thing on an empty sheet: offer a way in (examples, tour, templates).
      const code = shareCodeFromHash(location.hash);
      if (code) openShared(code);
      else if (usePlan.getState().viewing) exitViewer();
      if (!code && Object.keys(usePlan.getState().nodes).length === 0) setOverlay((o) => ({ kind: "start", n: o.n + 1 }));
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const inField = t.closest("input, textarea, select, [contenteditable]");
      // Undo/redo work everywhere except inside text fields, which have their own.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOverlay((o) => ({ kind: o.kind === "find" ? null : "find", n: o.n + 1 }));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !inField) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((k === "z" && e.shiftKey) || k === "y") {
          e.preventDefault();
          redo();
        }
        return;
      }
      // Esc in the inspector's fields: done typing, back to moving around the sheet.
      if (inField && e.key === "Escape" && t.closest("aside")) {
        (t as HTMLElement).blur();
        return;
      }
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = usePlan.getState();
      // Shared, read-only sheets: look around, but no changes.
      if (s.viewing && !(e.key.startsWith("Arrow") && !e.shiftKey) && !["Escape", "/", "?"].includes(e.key)) return;
      const toggle = (kind: Overlay) => setOverlay((o) => ({ kind: o.kind === kind ? null : kind, n: o.n + 1 }));
      const selNode = s.selection?.type === "node" ? s.nodes[s.selection.id] : undefined;
      const ARROWS: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

      // ── Keyboard-only: move between cards, nudge, edit, link, create ──
      if (ARROWS[e.key]) {
        e.preventDefault();
        if (e.shiftKey && selNode) {
          const step = 24;
          const d = ARROWS[e.key];
          s.moveNode(selNode.id, selNode.x + (d === "left" ? -step : d === "right" ? step : 0), selNode.y + (d === "up" ? -step : d === "down" ? step : 0));
          return;
        }
        const next = selNode ? nearestInDirection(selNode, ARROWS[e.key], s.nodes) : nearestTo(...centerWorld(), s.nodes);
        if (next) {
          s.select({ type: "node", id: next.id });
          reveal(next.id);
        }
        return;
      }
      if (e.key === "Enter" && s.selection) {
        e.preventDefault();
        if (s.linking && selNode && s.linking !== selNode.id) {
          if (!s.link(s.linking, selNode.id)) toast("Those are already linked, or the link would loop back.");
          s.startLinking(null);
        } else if (s.selection.type !== "edge") s.setEditing(s.selection.id);
        return;
      }
      if (e.key.toLowerCase() === "l" && selNode) {
        s.startLinking(selNode.id);
        return;
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (selNode) {
          const kind = NEXT_KIND[selNode.kind] ?? "step";
          const id = s.addNode(kind, selNode.x + 312, selNode.y, kind === "step" ? "Next step" : "");
          s.link(selNode.id, id);
          reveal(id);
        } else {
          const [x, y] = centerWorld();
          s.addNode("thought", x - 116, y - 40);
        }
        return;
      }
      if (e.key === " " && selNode) {
        e.preventDefault();
        s.gather(selNode.id);
        return;
      }
      if (e.key.toLowerCase() === "c" && s.gathered.length >= 2) {
        s.combine();
        return;
      }
      if (e.key.toLowerCase() === "t" && selNode?.kind === "step") {
        s.cycleStatus(selNode.id);
        return;
      }
      if (e.key.toLowerCase() === "f") {
        const ids = s.gathered.length ? s.gathered : selNode ? [selNode.id] : [];
        const [x, y] = centerWorld();
        s.addFrame(ids, x - 180, y - 120);
        s.clearGathered();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selection) {
        e.preventDefault();
        deleteWithUndo(s.selection);
      } else if (e.key === "Escape") {
        setOverlay((o) => ({ ...o, kind: null }));
        s.select(null);
        s.clearGathered();
        s.startLinking(null);
      } else if (e.key.toLowerCase() === "g") {
        toggle("gen");
      } else if (e.key === "/") {
        e.preventDefault();
        toggle("find");
      } else if (e.key === "?") {
        e.preventDefault();
        toggle("help");
      } else if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggle("dump");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) return <div className="bp-paper absolute inset-0" />;

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Board />
      <Announcer />
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <header className="flex flex-wrap items-center gap-3">
          <div className="bp-panel pointer-events-auto hidden items-center gap-2 px-3 py-2 md:flex">
            <span className="bp-accent bp-goal"><Symbol kind="goal" size={16} /></span>
            <span className="bp-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--ink)]">Blueprint</span>
          </div>
          <Toolbar open={open} />
          <div className="ml-auto"><Pipeline /></div>
        </header>
        <div className="flex justify-center empty:hidden"><ViewerBar /></div>
        <div className="flex min-h-0 flex-1 items-start gap-3">
          <Sidebar />
          {/* On phones, panels become full-width sheets instead of squeezing between columns. */}
          <div className="flex flex-1 justify-center max-md:pointer-events-none max-md:fixed max-md:inset-x-2 max-md:top-16 max-md:bottom-2 max-md:z-20 max-md:items-start">
            {overlay.kind === "gen" && <Generator key={overlay.n} onClose={close} />}
            {overlay.kind === "dump" && <Dump key={overlay.n} onClose={close} />}
            {overlay.kind === "share" && <Share key={overlay.n} onClose={close} />}
            {overlay.kind === "help" && <Help key={overlay.n} initialQuery={overlay.q} onClose={close} />}
            {overlay.kind === "find" && <Find key={overlay.n} onClose={close} />}
            {overlay.kind === "sheets" && (
              <Sheets key={overlay.n} onClose={close} onNew={() => setOverlay((o) => ({ kind: "start", n: o.n + 1 }))} />
            )}
            {overlay.kind === "start" && (
              <Start
                key={overlay.n}
                onClose={close}
                onTour={(st: Starter) => {
                  loadStarter(st);
                  close();
                  setTour(st);
                }}
                onDump={() => setOverlay((o) => ({ kind: "dump", n: o.n + 1 }))}
              />
            )}
            {!overlay.kind && tour?.tour && <Tour key={tour.id} steps={tour.tour} onEnd={() => setTour(null)} />}
          </div>
          {selection?.type === "node" && (
            <Inspector id={selection.id} onGenerate={() => setOverlay((o) => ({ kind: "gen", n: o.n + 1 }))} />
          )}
          {selection?.type === "edge" && <EdgePanel id={selection.id} />}
          {selection?.type === "frame" && <FramePanel id={selection.id} />}
        </div>
        {full && (
          <div className="bp-panel pointer-events-auto mx-auto flex items-center gap-3 border-[var(--warn)] px-3 py-2 text-[12px] text-[var(--warn)]">
            Browser storage is full, so recent changes aren&apos;t being saved. Remove a few images, or Export to keep a copy.
            <button onClick={() => setFull(false)} className="bp-tool">OK</button>
          </div>
        )}
        <div className="flex flex-col items-center gap-2"><LinkBar /><GatherBar /><Toast /></div>
        <footer className="flex items-end justify-between gap-3">
          <p className="bp-mono hidden text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)] sm:block">
            Drag paper to pan · ctrl+scroll to zoom · double-click for a thought · drag a right port to link · shift-click to gather · drop images or links on the paper · arrows move · ⌘/Ctrl+Z undo · ⌘/Ctrl+K find · D dump · G generate · ? help
          </p>
          <TitleBlock onSheets={() => setOverlay((o) => ({ kind: "sheets", n: o.n + 1 }))} />
        </footer>
      </div>
    </main>
  );
}
