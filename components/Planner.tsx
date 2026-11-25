"use client";

import { NODE_W } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlan, useReadOnly } from "@/lib/store";
import { CORE_KINDS, KIND_META, KINDS, type Kind } from "@/lib/types";
import { checkpoint, deleteWithUndo, redo, startHistory, toast, toastUndo, undo, useHistory } from "@/lib/history";
import { tidy } from "@/lib/layout";
import { installGhostGuard } from "@/lib/ghost";
import { membersOf } from "@/lib/frames";
import { sheetTitle } from "@/lib/naming";
import { NEXT_KIND, describe as describeCard, nearestInDirection, nearestTo, type Dir } from "@/lib/keyboard";
import { weight } from "@/lib/reason";
import { BELIEF_KINDS } from "@/lib/types";
import { enterViewer, exitViewer, internOpenSheet, keepSharedCopy, maintainImages, newSheet, startSheets } from "@/lib/sheets";
import { decodeSheet, shareCodeFromHash } from "@/lib/shareLink";
import { embedImages } from "@/lib/images";
import { Sheets } from "./Sheets";
import { PopMenu } from "./PopMenu";
import { Find } from "./Find";
import { CommandBar } from "./CommandBar";
import Board from "./Board";
import Inspector from "./Inspector";
import { Symbol } from "./NodeCard";
import { Dump, EdgePanel, FramePanel, Generator, Share } from "./Panels";
import { Help } from "./Help";
import { Start, Tour, openForTour } from "./Start";
import type { Starter } from "@/lib/starters";
import Sidebar from "./Sidebar";

/** Show the whole sheet. When the user asks (Fit, Tidy, opening a shared link) it really fits, even if small. */
const fitToScreen = (minK = 0.5) => {
  const s = usePlan.getState();
  if (window.innerWidth >= 900) return s.fit(window.innerWidth, window.innerHeight, 320, s.selection ? 330 : 20, minK);
  s.select(null);
  s.fit(window.innerWidth, window.innerHeight, 0, 0, 0.25);
};

function Pipeline() {
  const nodes = usePlan((s) => s.nodes);
  const planning = Object.values(nodes).some((n) => n.kind === "goal" || n.kind === "milestone" || n.kind === "step");
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
  if (!planning) return null; // a reasoning sheet doesn't need the planning pipeline
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
  const readOnly = useReadOnly();
  const nodes = usePlan((s) => s.nodes);
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
          {!readOnly && (
            <button onClick={onSheets} className="ml-auto -mr-1.5 -mt-1 mb-1 inline-block min-h-6 px-1.5 py-1 normal-case tracking-normal text-[var(--milestone)] hover:underline">
              all sheets ›
            </button>
          )}
        </div>
        <input
          value={project === "Untitled" ? "" : project}
          placeholder={sheetTitle(project, nodes)}
          readOnly={readOnly}
          aria-label="Current sheet name"
          onChange={(e) => setProject(e.target.value || "Untitled")}
          className="w-full bg-transparent font-sans text-[14px] normal-case tracking-normal text-[var(--ink)] outline-none placeholder:text-[var(--ink-dim)]"
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
    a.download = `${sheetTitle(project, nodes).replace(/[^\w-]+/g, "-").toLowerCase() || "plan"}.blueprint.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (readOnly) {
    return (
      <div className="bp-panel pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 [&>*]:shrink-0">
        <button onClick={() => open("find")} className="bp-btn">Find</button>
        <button onClick={() => fitToScreen()} className="bp-tool">Fit</button>
        <button onClick={() => open("share")} className="bp-tool">Markdown</button>
        <button onClick={() => open("help")} className="bp-btn bp-mono h-[30px] w-[30px] rounded-full p-0 text-[13px]" aria-label="Help">?</button>
      </div>
    );
  }

  const tidyNow = () => {
    const st = usePlan.getState();
    if (Object.keys(st.nodes).length < 2) return;
    checkpoint();
    // Remember who was in each frame, lay out, then shrink-wrap the frames again.
    const members = Object.fromEntries(Object.values(st.frames).map((f) => [f.id, membersOf(f, st.nodes)]));
    st.setPositions(tidy(st.nodes, st.edges, Object.values(members), {
      vertical: window.innerWidth < 768,
      // As many columns as fit beside the side panels at a readable zoom (0.85).
      maxCols: Math.max(3, Math.floor((window.innerWidth - 700) / ((NODE_W + 76) * 0.85))),
    }));
    st.refitFrames(members);
    checkpoint();
    fitToScreen(0.8); // tidy shouldn't shrink text to nothing; pan for the rest
    toastUndo("Tidied the sheet");
  };

  const frameNow = frameCards;

  return (
    <div className="bp-panel bp-noscrollbar bp-toolbar pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto whitespace-nowrap p-1.5 max-md:flex-nowrap md:flex-wrap [&>*]:shrink-0">
      <button onClick={undo} disabled={!canUndo} className="bp-tool px-2 disabled:opacity-30" title="Undo (Ctrl/⌘+Z)" aria-label="Undo">↶</button>
      <button onClick={redo} disabled={!canRedo} className="bp-tool px-2 disabled:opacity-30" title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo">↷</button>
      <span className="mx-1 h-5 w-px bg-[var(--line)] max-md:hidden" />
      {/* Phones: one labelled "+ Add" menu instead of a row of bare icons. */}
      <span className="md:hidden">
        <PopMenu
          id="bp-add"
          label={<span className="text-[13px]">+ Add</span>}
          buttonClass="bp-btn bp-btn-primary"
          title="Add a card"
          items={KINDS.map((k) => ({
            label: KIND_META[k].label,
            desc: KIND_META[k].hint,
            icon: <span className={`bp-${k} bp-accent`}><Symbol kind={k} /></span>,
            run: () => usePlan.getState().addCardNear(k),
          }))}
        />
      </span>
      <span className="hidden items-center md:flex">
        {KINDS.filter((k) => CORE_KINDS.has(k)).map((k: Kind) => (
          <button
            key={k}
            onClick={() => usePlan.getState().addCardNear(k)}
            title={`Add ${KIND_META[k].label} — ${KIND_META[k].hint}`}
            className={`bp-${k} bp-tool px-2`}
            aria-label={`Add ${KIND_META[k].label}`}
          >
            <span className="bp-accent"><Symbol kind={k} /></span>
            <span className="hidden text-[12px] xl:inline">{KIND_META[k].label}</span>
          </button>
        ))}
        {/* The other kinds, labelled, in a menu — instead of a row of unlabelled icons. */}
        <PopMenu
          id="bp-more-kinds"
          label={<span className="bp-mono text-[10px] uppercase tracking-[0.1em]">+ more cards</span>}
          title="Spark, assumption, goal, milestone, risk, snippet"
          items={KINDS.filter((k) => !CORE_KINDS.has(k)).map((k) => ({
            label: KIND_META[k].label,
            hint: "",
            icon: <span className={`bp-${k} bp-accent`}><Symbol kind={k} /></span>,
            run: () => usePlan.getState().addCardNear(k),
          }))}
        />
      </span>
      <span className="mx-1 h-5 w-px bg-[var(--line)] max-md:hidden" />
      <button onClick={tidyNow} className="bp-btn max-md:!hidden" title="Lay the sheet out left to right by how cards connect (undoable)">Tidy</button>
      <button onClick={() => open("find")} className="bp-btn" title="Find a card (Ctrl/⌘+K)" aria-label="Find a card">Find</button>
      <button onClick={() => open("start")} className="bp-btn max-md:!hidden" title="Examples, a guided tour, and templates">Start</button>
      <button onClick={() => open("share")} className="bp-btn bp-btn-primary" title="Share a read-only link, or export Markdown for an AI consistency check">
        Share
      </button>
      <button onClick={() => open("sheets")} className="bp-btn max-md:!hidden" title="Your sheets: new, open, rename, duplicate, delete">Sheets</button>
      <button
        onClick={() => open("help")}
        className="bp-btn bp-mono h-[30px] w-[30px] rounded-full p-0 text-[13px] max-md:!hidden"
        title="Help: what every card, link, check and tool does (?)"
        aria-label="Help"
      >
        ?
      </button>
      <PopMenu
        id="bp-more"
        label="⋯ More"
        title="More: dump, generate, frame, tidy, fit, export, import"
        items={[
          ...(window.innerWidth < 768
            ? [
                { label: "Start: examples, tour, templates", run: () => open("start") },
                { label: "Sheets", run: () => open("sheets") },
                { label: "Help", hint: "?", run: () => open("help") },
              ]
            : []),
          { label: "Dump thoughts", hint: "D", run: () => open("dump") },
          { label: "Generate ideas", hint: "G", run: () => open("gen") },
          { label: "Frame cards", hint: "F", run: frameNow },
          { label: "Tidy layout", hint: "", run: tidyNow },
          { label: "Fit to screen", hint: "", run: () => fitToScreen() },
          { label: "Export file", hint: "", run: exportPlan },
          { label: "Import file", hint: "", run: () => file.current?.click() },
        ]}
      />
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
              window.dispatchEvent(new CustomEvent("blueprint-close-overlay"));
              toast(`Imported “${d.project || f.name}” as a new sheet`);
              // Move embedded images into the image store (safe if the user keeps working).
              internOpenSheet().catch(() => {});
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
          const r = keepSharedCopy();
          clearHash();
          toast(r === "already" ? `You'd already saved “${project}” — opened your copy` : `Saved “${project}” to your sheets — you can edit it now`);
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

/** Frame the gathered (or selected) cards; say so if the box also takes in cards in between. */
function frameCards() {
  const st = usePlan.getState();
  const ids = st.gathered.length ? st.gathered : st.selection?.type === "node" ? [st.selection.id] : [];
  if (!ids.length) {
    toast(
      window.innerWidth < 768
        ? "Select a card (or press Gather on several), then Frame them."
        : "Select a card, or gather several (shift-click or Gather), then Frame them.",
    );
    return;
  }
  const [x, y] = centerWorld();
  const fid = st.addFrame(ids, x - 180, y - 120);
  st.clearGathered();
  const f = usePlan.getState().frames[fid];
  const extra = membersOf(f, usePlan.getState().nodes).filter((m) => !ids.includes(m));
  if (ids.length && extra.length) {
    const refs = extra.map((m) => usePlan.getState().nodes[m].ref).join(", ");
    toast(`The frame also contains ${refs}, which sit${extra.length === 1 ? "s" : ""} inside the box — drag ${extra.length === 1 ? "it" : "them"} out if they don't belong.`);
  }
}

/** World coordinates of the middle of the screen. */
const centerWorld = (): [number, number] => {
  const v = usePlan.getState().view;
  return [(window.innerWidth / 2 - v.x) / v.k, (window.innerHeight / 2 - v.y) / v.k];
};

const reveal = (id: string) => usePlan.getState().reveal(id);

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
  const nodes = usePlan((s) => s.nodes);
  const others = useMemo(
    () => Object.values(nodes).filter((n) => n.id !== linking).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true })),
    [nodes, linking],
  );
  if (!linking || !from) return null;
  return (
    <div className="bp-panel pointer-events-auto flex flex-wrap items-center gap-2 border-[var(--milestone)] px-3 py-2">
      <span className="bp-mono text-[10px] uppercase tracking-[0.18em] text-[var(--milestone)]">Linking</span>
      <span className="min-w-0 text-[12px] text-[var(--ink-dim)]">
        from {from.ref} — <span className="md:hidden">tap the card it leads to, or pick:</span>
        <span className="max-md:hidden">click the card it leads to (or arrows + Enter), or pick:</span>
      </span>
      {/* A list is easier than hunting for an off-screen card on a small screen. */}
      <select
        aria-label="Pick the card to link to"
        value=""
        onChange={(e) => {
          const st = usePlan.getState();
          const to = e.target.value;
          st.startLinking(null);
          if (to && st.link(linking, to)) st.selectFreshEdge();
          else if (to) toast("Those are already linked, or the link would loop back.");
        }}
        className="bp-input min-w-0 max-w-[40vw] px-1 py-1 text-[12px] [@media(pointer:coarse)]:min-h-[40px]"
      >
        <option value="">card…</option>
        {others.map((n) => (
          <option key={n.id} value={n.id}>{n.ref} {n.title.slice(0, 40)}</option>
        ))}
      </select>
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
      timer = setTimeout(() => setMsg(null), d.undo ? 4500 : 3500);
    };
    // After Undo/Redo the "… · Undo" message is stale.
    const undid = () => setMsg(null);
    window.addEventListener("blueprint-toast", on);
    window.addEventListener("blueprint-undid", undid);
    return () => {
      window.removeEventListener("blueprint-toast", on);
      window.removeEventListener("blueprint-undid", undid);
      clearTimeout(timer);
    };
  }, []);
  if (!msg) return null;
  return (
    <div key={msg.n} role="status" className="bp-panel pointer-events-none flex items-center gap-3 px-3 py-2 text-[12px] text-[var(--ink)] [&_button]:pointer-events-auto">
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
  // Phones get the link/undo bars at the bottom; tracked so each is rendered once.
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [tour, setTour] = useState<Starter | null>(null);
  // `n` remounts the overlay on each open so the generator reseeds from the current selection.
  const [overlay, setOverlay] = useState<{ kind: Overlay; n: number; q?: string }>({ kind: null, n: 0 });
  // Phones have room for one thing: opening a card closes overlays and folds the sidebar.
  useEffect(
    () =>
      usePlan.subscribe((st, prev) => {
        // The first card on an empty sheet: the Start panel has done its job.
        if (Object.keys(prev.nodes).length === 0 && Object.keys(st.nodes).length > 0 && st.sheetId === prev.sheetId)
          setOverlay((o) => (o.kind === "start" ? { ...o, kind: null } : o));
        if (window.innerWidth >= 768 || !st.selection || st.selection === prev.selection) return;
        setOverlay((o) => (o.kind ? { ...o, kind: null } : o));
        window.dispatchEvent(new CustomEvent("blueprint-sidebar-fold"));
      }),
    [],
  );

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
    const closeOverlay = () => setOverlay((o) => ({ ...o, kind: null }));
    window.addEventListener("blueprint-close-overlay", closeOverlay);
    return () => {
      window.removeEventListener("blueprint-close-overlay", closeOverlay);
      window.removeEventListener("blueprint-storage-full", on);
      window.removeEventListener("blueprint-help", help);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  const open = (kind: Overlay) => {
    // Phones have room for one panel at a time: opening one closes the card editor.
    if (window.innerWidth < 768) usePlan.getState().select(null);
    setOverlay((o) => ({ kind: o.kind === kind ? null : kind, n: o.n + 1 }));
  };
  const close = () => setOverlay((o) => ({ ...o, kind: null }));
  const selection = usePlan((s) => s.selection);

  useEffect(() => {
    Promise.resolve(usePlan.persist.rehydrate()).then(() => {
      installGhostGuard();
      startHistory();
      startSheets();
      maintainImages().catch(() => {});
      // Offline + installable. Only in production builds: a dev-mode worker would cache stale code.
      if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        navigator.serviceWorker
          .register(`${base}/sw.js`, { scope: `${base}/` })
          .then(() => navigator.serviceWorker.ready)
          .then((reg) => {
            // Hand over what this page already loaded, so it's cached for offline use.
            const urls = [
              location.href.split("#")[0],
              ...performance
                .getEntriesByType("resource")
                .map((r) => r.name)
                .filter((u) => u.startsWith(location.origin) && /\/_next\/static\/|\/icons\/|manifest/.test(u)),
            ];
            reg.active?.postMessage({ type: "precache", urls });
          })
          .catch(() => {});
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
        if (usePlan.getState().viewing) return;
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
        // Done editing: back to the sheet, so arrows and Tab carry on from the card.
        (t as HTMLElement).blur();
        document.querySelector<HTMLElement>(".bp-paper")?.focus();
        return;
      }
      // Esc in a panel's own field (Help search, Find…): close the panel.
      if (inField && e.key === "Escape" && t.closest("[data-overlay]")) {
        setOverlay((o) => ({ ...o, kind: null }));
        return;
      }
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = usePlan.getState();
      // Shared, read-only sheets: look around, but no changes.
      if (s.viewing && !(e.key.startsWith("Arrow") && !e.shiftKey) && !["Escape", "/", "?"].includes(e.key)) return;
      // Enter/Space belong to a focused button or link; arrows belong to panels and overlays
      // (scrolling, tabs). Only when focus is on the sheet itself do they drive the board.
      const onControl = !!t.closest("button, a, summary, [role=button], [role=tab], [role=option], [role=switch]");
      const inPanel = !!t.closest("aside, [data-overlay], [role=dialog], [role=listbox], [role=tablist]");
      if ((e.key === "Enter" || e.key === " ") && onControl) return;
      if (e.key.startsWith("Arrow") && inPanel) return;
      // Single-letter shortcuts only when focus is on the sheet itself, not on a button or panel —
      // otherwise typing (or a stray key after closing a panel) fires them.
      // Nothing focused (e.g. right after a reload) and you start typing words: that's text,
      // not shortcuts — send it to the command bar. Shortcuts work once the sheet has focus.
      // With a card selected, though, letters are shortcuts for it (N, L, T…), never text.
      if (t === document.body && s.selection) document.querySelector<HTMLElement>(".bp-paper")?.focus();
      else if (t === document.body && window.innerWidth >= 768 && !s.viewing && /^[\p{L}\p{N}]$/u.test(e.key)) {
        // Focus the bar now, during this keydown: the browser then types this same key into it.
        window.dispatchEvent(new CustomEvent("blueprint-command-focus"));
        return;
      }
      const onSheet = (!onControl && !inPanel) || (t === document.body && !!s.selection);
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
        // Linking: arrows move a highlight to choose the target; the editor stays closed.
        if (s.linking && s.nodes[s.linking]) {
          const from = (s.spotlight && s.nodes[s.spotlight]) || s.nodes[s.linking];
          const target = nearestInDirection(from, ARROWS[e.key], s.nodes);
          if (target) {
            usePlan.setState({ spotlight: target.id });
            reveal(target.id);
          }
          return;
        }
        const next = selNode ? nearestInDirection(selNode, ARROWS[e.key], s.nodes) : nearestTo(...centerWorld(), s.nodes);
        if (next) {
          s.select({ type: "node", id: next.id });
          reveal(next.id);
        }
        return;
      }
      if (e.key === "Enter" && s.linking) {
        e.preventDefault();
        const target = s.spotlight;
        if (!target || target === s.linking) return toast("Choose the card to link to with the arrow keys, then Enter.");
        if (s.link(s.linking, target)) s.selectFreshEdge();
        else toast("Those are already linked, or the link would loop back.");
        s.startLinking(null);
        usePlan.setState({ spotlight: null });
        return;
      }
      if (e.key === "Enter" && s.selection && onSheet) {
        e.preventDefault();
        if (s.selection.type !== "edge") s.setEditing(s.selection.id);
        return;
      }
      if (!onSheet && e.key !== "?" && e.key !== "/" && e.key !== "Escape") return;
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
        e.preventDefault(); // or the "f" lands in the new frame's label field
        frameCards();
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
        usePlan.setState({ spotlight: null });
      } else if (e.key.toLowerCase() === "g") {
        toggle("gen");
      } else if (e.key === "/") {
        e.preventDefault();
        // Desktop: jump to the command bar, ready for a command. Phones: Find.
        if (window.innerWidth >= 768 && !s.viewing) window.dispatchEvent(new CustomEvent("blueprint-command-focus", { detail: "/" }));
        else toggle("find");
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
        <div className="flex flex-col items-center gap-2 empty:hidden">
          <ViewerBar />
          {!phone && <LinkBar />}
          {!phone && <Toast />}
        </div>
        <div className="flex min-h-0 flex-1 items-start gap-3">
          <Sidebar />
          {/* On phones, panels become full-width sheets instead of squeezing between columns. */}
          <div data-overlay className="flex flex-1 justify-center max-md:pointer-events-none max-md:fixed max-md:inset-x-2 max-md:top-16 max-md:bottom-2 max-md:z-20 max-md:items-start">
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
                  openForTour(st);
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
        {/* Phones: link and undo bars at the bottom, where they don't cover cards near the top. */}
        <div className="flex flex-col items-center gap-2">
          {phone && <LinkBar />}
          {phone && <Toast />}
          <GatherBar />
        </div>
        <footer className="flex items-end justify-between gap-3">
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <CommandBar />
          </div>
          <TitleBlock onSheets={() => setOverlay((o) => ({ kind: "sheets", n: o.n + 1 }))} />
        </footer>
      </div>
    </main>
  );
}
