"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { decompose, split, type Draft } from "./generate";
import { wouldCycle } from "./graph";
import { defaultRel } from "./reason";
import { fitAround } from "./frames";
import { estimateHeight, findFreeSpot } from "./layout";
import { BELIEF_KINDS, DEFAULT_CONFIDENCE, KIND_META, type Edge, type Frame, type Kind, type PlanNode, type Rel, type Status, type Strength, type View, STAGE } from "./types";

type Selection = { type: "node" | "edge" | "frame"; id: string } | null;

interface PlanState {
  project: string;
  nodes: Record<string, PlanNode>;
  edges: Record<string, Edge>;
  frames: Record<string, Frame>;
  counters: Record<Kind, number>;
  view: View;
  selection: Selection;
  /** Keys of plot-hole flags and link suggestions the user waved off. */
  dismissed: string[];
  /** Cards gathered with shift-click, to be combined into a conclusion. */
  gathered: string[];
  /** Show every card kind in the toolbar, or just the core few. */
  showAllKinds: boolean;
  /** Touch-friendly linking: the card a link is being drawn from, waiting for a target tap. */
  linking: string | null;
  /** Which sheet is open (see lib/sheets.ts). */
  sheetId: string;
  /** Viewing someone's shared link (read-only). `returnTo` is the sheet to go back to. */
  viewing: { returnTo: string } | null;
  /** A card the user just created: the inspector focuses its title once, then clears this. */
  fresh: string | null;
  clearFresh: () => void;
  /** Id of the most recently created link. */
  lastEdge: string | null;
  /** Card the tour is pointing at (glows). */
  spotlight: string | null;
  /** Card whose title is being edited in place on the sheet. */
  editing: string | null;
  setEditing: (id: string | null) => void;

  setShowAllKinds: (v: boolean) => void;
  startLinking: (id: string | null) => void;
  setProject: (name: string) => void;
  setView: (v: View) => void;
  select: (s: Selection) => void;
  addNode: (kind: Kind, x: number, y: number, title?: string, body?: string) => string;
  updateNode: (
    id: string,
    patch: Partial<Pick<PlanNode, "title" | "body" | "kind" | "status" | "confidence" | "link" | "image" | "source">>,
  ) => void;
  moveNode: (id: string, x: number, y: number) => void;
  /** Move many cards at once (one undo step). */
  setPositions: (pos: Record<string, { x: number; y: number }>) => void;
  /** Frame around the given cards (or a default box at x,y). Returns its id. */
  addFrame: (cardIds: string[], x: number, y: number, label?: string) => string;
  updateFrame: (id: string, patch: Partial<Omit<Frame, "id">>) => void;
  /** Move a frame and the cards inside it together. */
  placeFrame: (id: string, x: number, y: number, members: Record<string, { x: number; y: number }>) => void;
  removeFrame: (id: string) => void;
  /** Shrink-wrap each frame around the cards it contained before a layout change. */
  refitFrames: (members: Record<string, string[]>) => void;
  removeNode: (id: string) => void;
  connect: (from: string, to: string, rel?: Rel) => boolean;
  setRel: (edgeId: string, rel: Rel) => boolean;
  setStrength: (edgeId: string, strength: Strength) => void;
  dismiss: (key: string) => void;
  gather: (id: string) => void;
  clearGathered: () => void;
  combine: () => void;
  /** Link two cards with the meaning their kinds suggest (used by drag-to-connect). */
  link: (from: string, to: string) => boolean;
  dump: (lines: string[], x: number, y: number) => void;
  testAssumption: (id: string) => void;
  addWhy: (id: string) => void;
  contradictionToQuestion: (edgeId: string) => void;
  removeEdge: (id: string) => void;
  cycleStatus: (id: string) => void;
  pinDraft: (d: Draft, x: number, y: number, from?: string) => string;
  decompose: (id: string) => void;
  splitStep: (id: string) => void;
  promote: (id: string) => void;
  focus: (id: string, w: number, h: number, select?: boolean) => void;
  /** Pan just enough that a card isn't hidden behind the panels. */
  reveal: (id: string) => void;
  /** Add a card in the nearest free space (next to the selected card, or mid-screen). */
  addCardNear: (kind: Kind, title?: string, at?: { x: number; y: number }) => string;
  /** The link just made by a gesture: its panel opens so its meaning can be chosen. */
  freshEdge: string | null;
  /** Select the link just created and flag it, so its panel asks what it means. */
  selectFreshEdge: () => void;
  /** Replace the sheet with a ready-made one (example or template). Undoable. */
  loadSheet: (s: { project: string; nodes: Record<string, PlanNode>; edges: Record<string, Edge>; counters: Record<Kind, number>; frames?: Record<string, Frame> }) => void;
  /** minK: how far it may zoom out (phones default to a readable 0.55 for automatic fits). */
  fit: (w: number, h: number, padLeft?: number, padRight?: number, minK?: number) => void;
  importPlan: (data: unknown) => boolean;
  reset: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const ZERO: Record<Kind, number> = {
  thought: 0,
  spark: 0,
  evidence: 0,
  claim: 0,
  conclusion: 0,
  assumption: 0,
  question: 0,
  goal: 0,
  milestone: 0,
  step: 0,
  snippet: 0,
  risk: 0,
};

function makeNode(
  counters: Record<Kind, number>,
  kind: Kind,
  x: number,
  y: number,
  title = "",
  body = "",
): [PlanNode, Record<Kind, number>] {
  const n = counters[kind] + 1;
  const node: PlanNode = {
    id: uid(),
    ref: `${KIND_META[kind].prefix}-${String(n).padStart(2, "0")}`,
    kind,
    title: title || `New ${KIND_META[kind].label.toLowerCase()}`,
    body,
    x,
    y,
    status: "todo",
    createdAt: Date.now() + n,
    ...(BELIEF_KINDS.has(kind) ? { confidence: DEFAULT_CONFIDENCE[kind] } : {}),
  };
  return [node, { ...counters, [kind]: n }];
}

/**
 * The part of the screen not covered by panels, so focusing on a card puts it where it
 * can be seen: right of the sidebar and left of the inspector on wide screens, above
 * the bottom sheet on phones.
 */
export function visibleArea(w: number, h: number, panelOpen: boolean) {
  // Desktop: keep clear of the sidebar, the inspector and the command bar at the bottom.
  if (w >= 900) return { left: 330, right: panelOpen ? w - 330 : w - 24, top: 110, bottom: h - 110 };
  // Tablets: phone-style panels, but the command bar is there (from 768px).
  if (w >= 768) return { left: 12, right: w - 12, top: 150, bottom: panelOpen ? h * 0.42 : h - 110 };
  // Phones: below the toolbar and folded panel tabs; above the bottom sheet if it's open.
  return { left: 12, right: w - 12, top: 150, bottom: panelOpen ? h * 0.42 : h - 24 };
}

/** True while looking at a shared link: everything is view-only. */
export const useReadOnly = () => usePlan((s) => s.viewing !== null);

export const usePlan = create<PlanState>()(
  persist(
    (set, get) => ({
      project: "Untitled",
      nodes: {},
      edges: {},
      frames: {},
      counters: { ...ZERO },
      view: { x: 80, y: 90, k: 0.85 },
      selection: null,
      dismissed: [],
      gathered: [],
      showAllKinds: false,
      linking: null,
      sheetId: "",
      viewing: null,
      fresh: null,
      clearFresh: () => set({ fresh: null }),
      lastEdge: null,
      spotlight: null,
      freshEdge: null,
      selectFreshEdge: () => {
        const id = get().lastEdge;
        if (id && get().edges[id]) set({ selection: { type: "edge", id }, freshEdge: id });
      },
      editing: null,
      setEditing: (editing) => set({ editing }),

      setShowAllKinds: (showAllKinds) => set({ showAllKinds }),
      // Linking hides the editor, so the "tap the target" bar (and the sheet) stay visible.
      startLinking: (linking) => {
        if (linking && typeof window !== "undefined" && window.innerWidth < 768) window.dispatchEvent(new CustomEvent("blueprint-sidebar-fold"));
        set(linking ? { linking, selection: null, spotlight: null } : { linking, spotlight: null });
      },
      setProject: (project) => set({ project }),
      setView: (view) => set({ view }),
      select: (selection) => set((s) => ({ selection, fresh: null, freshEdge: selection?.id === s.freshEdge ? s.freshEdge : null })),

      addNode: (kind, x, y, title, body) => {
        const [node, counters] = makeNode(get().counters, kind, x, y, title, body);
        set((s) => ({ nodes: { ...s.nodes, [node.id]: node }, counters, selection: { type: "node", id: node.id }, fresh: node.id }));
        return node.id;
      },

      updateNode: (id, patch) =>
        set((s) => {
          const n = s.nodes[id];
          if (!n) return s;
          let next = { ...n, ...patch };
          let counters = s.counters;
          if (patch.kind && patch.kind !== n.kind) {
            const c = s.counters[patch.kind] + 1;
            counters = { ...s.counters, [patch.kind]: c };
            next = { ...next, ref: `${KIND_META[patch.kind].prefix}-${String(c).padStart(2, "0")}` };
            if (BELIEF_KINDS.has(patch.kind) && next.confidence === undefined) next.confidence = DEFAULT_CONFIDENCE[patch.kind];
          }
          return { nodes: { ...s.nodes, [id]: next }, counters };
        }),

      moveNode: (id, x, y) =>
        set((s) => (s.nodes[id] ? { nodes: { ...s.nodes, [id]: { ...s.nodes[id], x, y } } } : s)),

      addFrame: (cardIds, x, y, label = "Group") => {
        const cards = cardIds.map((id) => get().nodes[id]).filter(Boolean);
        const rect = cards.length ? fitAround(cards) : { x: Math.round(x / 12) * 12, y: Math.round(y / 12) * 12, w: 600, h: 360 };
        const id = uid();
        set((s) => ({ frames: { ...s.frames, [id]: { id, label, ...rect } }, selection: { type: "frame", id }, editing: id }));
        return id;
      },

      updateFrame: (id, patch) =>
        set((s) => (s.frames[id] ? { frames: { ...s.frames, [id]: { ...s.frames[id], ...patch } } } : s)),

      placeFrame: (id, x, y, members) =>
        set((s) => {
          if (!s.frames[id]) return s;
          const nodes = { ...s.nodes };
          for (const [nid, p] of Object.entries(members)) if (nodes[nid]) nodes[nid] = { ...nodes[nid], x: p.x, y: p.y };
          return { nodes, frames: { ...s.frames, [id]: { ...s.frames[id], x, y } } };
        }),

      removeFrame: (id) =>
        set((s) => {
          const frames = { ...s.frames };
          delete frames[id];
          return { frames, selection: s.selection?.id === id ? null : s.selection };
        }),

      refitFrames: (members) =>
        set((s) => {
          const frames = { ...s.frames };
          for (const [fid, ids] of Object.entries(members)) {
            const cards = ids.map((i) => s.nodes[i]).filter(Boolean);
            if (frames[fid] && cards.length) frames[fid] = { ...frames[fid], ...fitAround(cards) };
          }
          return { frames };
        }),

      setPositions: (pos) =>
        set((s) => {
          const nodes = { ...s.nodes };
          for (const [id, p] of Object.entries(pos)) if (nodes[id]) nodes[id] = { ...nodes[id], x: p.x, y: p.y };
          return { nodes };
        }),

      removeNode: (id) =>
        set((s) => {
          const nodes = { ...s.nodes };
          delete nodes[id];
          const edges = Object.fromEntries(
            Object.entries(s.edges).filter(([, e]) => e.from !== id && e.to !== id),
          );
          return { nodes, edges, selection: null, gathered: s.gathered.filter((g) => g !== id) };
        }),

      connect: (from, to, rel = "feeds") => {
        const { edges } = get();
        if (from === to) return false;
        // Contradictions are symmetric tension, not flow, so they can't form a loop.
        if (rel !== "contradicts" && wouldCycle(from, to, edges)) return false;
        if (Object.values(edges).some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return false;
        const id = uid();
        set((s) => ({ edges: { ...s.edges, [id]: { id, from, to, rel } }, lastEdge: id }));
        return true;
      },

      setRel: (edgeId, rel) => {
        const { edges } = get();
        const e = edges[edgeId];
        if (!e) return false;
        if (rel !== "contradicts") {
          const rest = { ...edges };
          delete rest[edgeId];
          if (wouldCycle(e.from, e.to, rest)) return false;
        }
        set((s) => ({ edges: { ...s.edges, [edgeId]: { ...e, rel } } }));
        return true;
      },

      setStrength: (edgeId, strength) =>
        set((s) => (s.edges[edgeId] ? { edges: { ...s.edges, [edgeId]: { ...s.edges[edgeId], strength } } } : s)),

      dismiss: (key) => set((s) => ({ dismissed: [...new Set([...s.dismissed, key])] })),

      gather: (id) =>
        set((s) => ({
          gathered: s.gathered.includes(id) ? s.gathered.filter((g) => g !== id) : [...s.gathered, id],
        })),

      clearGathered: () => set({ gathered: [] }),

      combine: () => {
        const ids = get().gathered.filter((id) => get().nodes[id]);
        if (ids.length < 2) return;
        const parts = ids.map((id) => get().nodes[id]);
        const x = Math.max(...parts.map((n) => n.x)) + 320;
        const y = parts.reduce((s, n) => s + n.y, 0) / parts.length;
        const c = get().addNode("conclusion", Math.round(x / 12) * 12, Math.round(y / 12) * 12,
          "So…", `Putting together ${parts.map((n) => n.ref).join(", ")}. What do they mean, taken together?`);
        ids.forEach((id) => get().connect(id, c, "supports"));
        set({ gathered: [], selection: { type: "node", id: c } });
      },

      link: (from, to) => {
        const a = get().nodes[from];
        const b = get().nodes[to];
        if (!a || !b) return false;
        return get().connect(from, to, defaultRel(a.kind, b.kind));
      },

      dump: (lines, x, y) => {
        const clean = lines.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean);
        if (!clean.length) return;
        // Land in clear space below everything else, so nothing overlaps.
        const list = Object.values(get().nodes);
        const ox = list.length ? Math.min(...list.map((n) => n.x)) : x;
        const oy = list.length ? Math.max(...list.map((n) => n.y)) + 220 : y;
        const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(clean.length))));
        clean.forEach((line, i) => {
          const [title, ...rest] = line.split(/(?<=[.?!])\s+/);
          // A line that asks something is a question (same rule as the command bar).
          get().addNode(/\?\s*$/.test(title) ? "question" : "thought", ox + (i % cols) * 264, oy + Math.floor(i / cols) * 132, title.slice(0, 140), rest.join(" "));
        });
        const rows = Math.ceil(clean.length / cols);
        const k = Math.min(1, get().view.k < 0.7 ? 0.8 : get().view.k);
        const cx = ox + (Math.min(cols, clean.length) * 264) / 2;
        const cy = oy + (rows * 132) / 2;
        set({ selection: null, fresh: null, view: { k, x: window.innerWidth / 2 - cx * k, y: window.innerHeight / 2 - cy * k } });
      },

      testAssumption: (id) => {
        const a = get().nodes[id];
        if (!a) return;
        const step = get().addNode("step", a.x - 280, a.y + 150, `Test: ${a.title}`,
          "Cheapest possible check: ask 3 people, try it once, or look for one counter-example. 30 minutes max.");
        get().connect(step, id);
      },

      addWhy: (id) => {
        const g = get().nodes[id];
        if (!g) return;
        get().addNode("thought", g.x - 290, g.y - 150, "Why this matters to me", "");
        const why = get().selection?.id;
        if (why) get().connect(why, id, "supports");
      },

      contradictionToQuestion: (edgeId) => {
        const e = get().edges[edgeId];
        const a = e && get().nodes[e.from];
        const b = e && get().nodes[e.to];
        if (!a || !b) return;
        get().removeEdge(edgeId);
        const q = get().addNode("question", (a.x + b.x) / 2, Math.max(a.y, b.y) + 170,
          `Which holds: ${a.ref} or ${b.ref}?`,
          `“${a.title}” vs “${b.title}”. What's the cheapest test that would decide it?`);
        get().connect(a.id, q, "supports");
        get().connect(b.id, q, "supports");
      },

      removeEdge: (id) =>
        set((s) => {
          const edges = { ...s.edges };
          delete edges[id];
          return { edges, selection: null };
        }),

      cycleStatus: (id) => {
        const n = get().nodes[id];
        if (!n) return;
        const next: Status = n.status === "todo" ? "doing" : n.status === "doing" ? "done" : "todo";
        get().updateNode(id, { status: next });
      },

      pinDraft: (d, x, y, from) => {
        const id = get().addNode(d.kind, x, y, d.title, d.body);
        if (from) {
          // Generated drafts branch off their seed; steps/risks feed back into it.
          if (d.kind === "spark") get().connect(from, id);
          else get().connect(id, from);
        }
        return id;
      },

      decompose: (id) => {
        const parent = get().nodes[id];
        if (!parent) return;
        const plan = decompose(parent.title);
        const ids: string[] = [];
        const baseX = parent.x - plan.length * 270 + 240;
        plan.forEach((p, i) => {
          const x = p.kind === "risk" ? parent.x : baseX + i * 270;
          const y = p.kind === "risk" ? parent.y + 220 : parent.y + 260;
          const [n, counters] = makeNode(get().counters, p.kind, x, y, p.title, p.body);
          set((s) => ({ nodes: { ...s.nodes, [n.id]: n }, counters }));
          ids.push(n.id);
        });
        plan.forEach((p, i) => get().connect(ids[i], p.feeds === -1 ? id : ids[p.feeds]));
        set({ selection: { type: "node", id: ids[0] } });
        get().reveal(ids[0]);
      },

      splitStep: (id) => {
        const n = get().nodes[id];
        if (!n) return;
        const [a, b] = split(n.title);
        const { edges } = get();
        const ins = Object.values(edges).filter((e) => e.to === id);
        const outs = Object.values(edges).filter((e) => e.from === id);
        const first = get().addNode("step", n.x, n.y, a, n.body);
        const second = get().addNode("step", n.x + 270, n.y, b, "");
        get().removeNode(id);
        ins.forEach((e) => get().connect(e.from, first));
        get().connect(first, second);
        outs.forEach((e) => get().connect(second, e.to));
        set({ selection: { type: "node", id: first } });
      },

      promote: (id) => {
        const n = get().nodes[id];
        if (!n || (n.kind !== "spark" && n.kind !== "thought")) return;
        get().updateNode(id, { kind: "goal" });
        const step = get().addNode("step", n.x - 270, n.y + 200, `15 minutes sketching "${n.title}"`,
          "Paper is fine. The point is to start, not to be right.");
        get().connect(step, id);
      },

      focus: (id, w, h, selectIt = true) => {
        const n = get().nodes[id];
        if (!n) return;
        const k = Math.max(get().view.k, 0.9);
        const a = visibleArea(w, h, selectIt);
        set({
          view: { k, x: (a.left + a.right) / 2 - (n.x + 116) * k, y: (a.top + a.bottom) / 2 - (n.y + 50) * k },
          ...(selectIt ? { selection: { type: "node" as const, id } } : {}),
        });
      },

      reveal: (id) => {
        const n = get().nodes[id];
        if (!n) return;
        const { x, y, k } = get().view;
        const a = visibleArea(window.innerWidth, window.innerHeight, get().selection !== null);
        const sx = n.x * k + x;
        const sy = n.y * k + y;
        const w = 232 * k;
        const h = estimateHeight(n) * k;
        let dx = 0;
        let dy = 0;
        if (sx < a.left) dx = a.left - sx;
        else if (sx + w > a.right) dx = a.right - (sx + w);
        if (sy < a.top) dy = a.top - sy;
        else if (sy + h > a.bottom) dy = a.bottom - (sy + h);
        // Too big to fit, or panning would be large anyway: centre it.
        if (w > a.right - a.left || h > a.bottom - a.top) return get().focus(id, window.innerWidth, window.innerHeight, false);
        if (dx || dy) set({ view: { k, x: x + dx, y: y + dy } });
      },

      addCardNear: (kind, title, at) => {
        const s = get();
        const sel = s.selection?.type === "node" ? s.nodes[s.selection.id] : undefined;
        let x: number;
        let y: number;
        if (at) {
          x = at.x;
          y = at.y;
        } else if (sel) {
          // Same stage as the selected card: stack under it (a column of evidence). Otherwise
          // left if it usually links into the selected card (evidence for a claim, a step for a
          // goal), right if the other way round — so links run forwards instead of looping back.
          const d = STAGE[kind] - STAGE[sel.kind];
          x = d === 0 ? sel.x : sel.x + (d < 0 ? -300 : 300);
          y = d === 0 ? sel.y + 140 : sel.y;
        } else {
          const a = visibleArea(window.innerWidth, window.innerHeight, false);
          x = ((a.left + a.right) / 2 - s.view.x) / s.view.k - 116;
          y = ((a.top + a.bottom) / 2 - s.view.y) / s.view.k - 50;
        }
        const spot = findFreeSpot(s.nodes, x, y);
        const id = get().addNode(kind, spot.x, spot.y, title);
        get().reveal(id);
        return id;
      },

      loadSheet: (sh) =>
        set({
          project: sh.project,
          nodes: sh.nodes,
          edges: sh.edges,
          frames: sh.frames ?? {},
          counters: { ...ZERO, ...sh.counters },
          selection: null,
          gathered: [],
          dismissed: [],
          linking: null,
        }),

      fit: (w, h, padLeft = 0, padRight = 0, minZoom) => {
        const list = Object.values(get().nodes);
        if (!list.length) return;
        const minX = Math.min(...list.map((n) => n.x));
        const minY = Math.min(...list.map((n) => n.y));
        const maxX = Math.max(...list.map((n) => n.x + 232));
        const maxY = Math.max(...list.map((n) => n.y + 140));
        const phone = w < 768;
        const top = (phone ? 150 : 120) + (get().viewing ? 56 : 0); // the shared-sheet banner sits up there too
        const bottom = phone ? 24 : 90; // desktop: leave room for the command bar
        const side = phone ? 16 : 40;
        const aw = Math.max(200, w - padLeft - padRight - side);
        const ah = Math.max(200, h - top - bottom);
        // On phones, never zoom out so far that card text is unreadable (titles stay ≥10px); pan instead.
        const minK = Math.max(minZoom ?? 0.3, phone ? 0.72 : 0);
        const cw = maxX - minX;
        const ch = maxY - minY;
        const k = Math.min(1, Math.max(minK, Math.min(aw / cw, ah / ch)));
        // If it doesn't all fit at this zoom, start at the top-left rather than cutting both edges.
        const ox = cw * k <= aw ? (aw - cw * k) / 2 : 0;
        const oy = ch * k <= ah ? (ah - ch * k) / 2 : 0;
        set({ view: { k, x: padLeft + ox - minX * k + side / 2, y: top + oy - minY * k } });
      },

      importPlan: (data) => {
        const d = data as Partial<PlanState>;
        if (!d || typeof d !== "object" || !d.nodes || !d.edges) return false;
        set({
          project: typeof d.project === "string" ? d.project : "Imported plan",
          nodes: d.nodes,
          edges: d.edges,
          frames: (d as { frames?: Record<string, Frame> }).frames ?? {},
          counters: { ...ZERO, ...(d.counters ?? {}) },
          selection: null,
          gathered: [],
          dismissed: [],
        });
        return true;
      },

      reset: () =>
        set({
          nodes: {},
          edges: {},
          frames: {},
          counters: { ...ZERO },
          project: "Untitled",
          selection: null,
          gathered: [],
          dismissed: [],
          view: { x: 80, y: 90, k: 0.85 },
        }),
    }),
    {
      name: "blueprint-plan-v1",
      storage: createJSONStorage(() => ({
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          try {
            localStorage.setItem(k, v);
          } catch {
            // Usually the browser's storage quota, filled by attached images.
            window.dispatchEvent(new CustomEvent("blueprint-storage-full"));
          }
        },
        removeItem: (k) => localStorage.removeItem(k),
      })),
      skipHydration: true,
      partialize: ({ project, nodes, edges, frames, counters, view, dismissed, showAllKinds, sheetId, viewing }) => ({
        project, nodes, edges, frames, counters, view, dismissed, showAllKinds, sheetId, viewing,
      }),
    },
  ),
);
