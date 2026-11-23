"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { decompose, split, type Draft } from "./generate";
import { wouldCycle } from "./graph";
import { defaultRel } from "./reason";
import { BELIEF_KINDS, DEFAULT_CONFIDENCE, KIND_META, type Edge, type Kind, type PlanNode, type Rel, type Status, type View } from "./types";

type Selection = { type: "node" | "edge"; id: string } | null;

interface PlanState {
  project: string;
  nodes: Record<string, PlanNode>;
  edges: Record<string, Edge>;
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
  removeNode: (id: string) => void;
  connect: (from: string, to: string, rel?: Rel) => boolean;
  setRel: (edgeId: string, rel: Rel) => boolean;
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
  /** Replace the sheet with a ready-made one (example or template). Undoable. */
  loadSheet: (s: { project: string; nodes: Record<string, PlanNode>; edges: Record<string, Edge>; counters: Record<Kind, number> }) => void;
  fit: (w: number, h: number, padLeft?: number) => void;
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

export const usePlan = create<PlanState>()(
  persist(
    (set, get) => ({
      project: "Untitled",
      nodes: {},
      edges: {},
      counters: { ...ZERO },
      view: { x: 80, y: 90, k: 0.85 },
      selection: null,
      dismissed: [],
      gathered: [],
      showAllKinds: false,
      linking: null,

      setShowAllKinds: (showAllKinds) => set({ showAllKinds }),
      startLinking: (linking) => set({ linking }),
      setProject: (project) => set({ project }),
      setView: (view) => set({ view }),
      select: (selection) => set({ selection }),

      addNode: (kind, x, y, title, body) => {
        const [node, counters] = makeNode(get().counters, kind, x, y, title, body);
        set((s) => ({ nodes: { ...s.nodes, [node.id]: node }, counters, selection: { type: "node", id: node.id } }));
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
        set((s) => ({ edges: { ...s.edges, [id]: { id, from, to, rel } } }));
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
          get().addNode("thought", ox + (i % cols) * 264, oy + Math.floor(i / cols) * 132, title.slice(0, 140), rest.join(" "));
        });
        const rows = Math.ceil(clean.length / cols);
        const k = Math.min(1, get().view.k < 0.7 ? 0.8 : get().view.k);
        const cx = ox + (Math.min(cols, clean.length) * 264) / 2;
        const cy = oy + (rows * 132) / 2;
        set({ selection: null, view: { k, x: window.innerWidth / 2 - cx * k, y: window.innerHeight / 2 - cy * k } });
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
        set({ view: { k, x: w / 2 - (n.x + 116) * k, y: h / 2 - (n.y + 50) * k }, ...(selectIt ? { selection: { type: "node" as const, id } } : {}) });
      },

      loadSheet: (sh) =>
        set({
          project: sh.project,
          nodes: sh.nodes,
          edges: sh.edges,
          counters: { ...ZERO, ...sh.counters },
          selection: null,
          gathered: [],
          dismissed: [],
          linking: null,
        }),

      fit: (w, h, padLeft = 0) => {
        const list = Object.values(get().nodes);
        if (!list.length) return;
        const minX = Math.min(...list.map((n) => n.x));
        const minY = Math.min(...list.map((n) => n.y));
        const maxX = Math.max(...list.map((n) => n.x + 232));
        const maxY = Math.max(...list.map((n) => n.y + 140));
        const top = 120;
        const bottom = 60;
        const aw = Math.max(200, w - padLeft - 40);
        const ah = Math.max(200, h - top - bottom);
        const k = Math.min(1, Math.max(0.3, Math.min(aw / (maxX - minX), ah / (maxY - minY))));
        set({
          view: {
            k,
            x: padLeft + (aw - (maxX - minX) * k) / 2 - minX * k + 20,
            y: top + (ah - (maxY - minY) * k) / 2 - minY * k,
          },
        });
      },

      importPlan: (data) => {
        const d = data as Partial<PlanState>;
        if (!d || typeof d !== "object" || !d.nodes || !d.edges) return false;
        set({
          project: typeof d.project === "string" ? d.project : "Imported plan",
          nodes: d.nodes,
          edges: d.edges,
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
      partialize: ({ project, nodes, edges, counters, view, dismissed, showAllKinds }) => ({
        project, nodes, edges, counters, view, dismissed, showAllKinds,
      }),
    },
  ),
);
