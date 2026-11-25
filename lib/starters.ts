/**
 * Ways in: worked examples to explore, and fill-in templates to start your own.
 * Examples are complete little boards; templates are bare structure with
 * [placeholders] — the thinking stays yours.
 */
import { BELIEF_KINDS, DEFAULT_CONFIDENCE, KIND_META, type Edge, type Kind, type PlanNode, type Rel, type Status } from "./types";

export interface Sheet {
  project: string;
  nodes: Record<string, PlanNode>;
  edges: Record<string, Edge>;
  counters: Record<Kind, number>;
}

export interface TourStep {
  text: string;
  /** Ref of the card to bring into view (e.g. "E-01"). */
  focus?: string;
  /** Open the inspector on the focused card. */
  select?: boolean;
  tab?: "next" | "holes" | "picture";
}

export interface Starter {
  id: string;
  type: "example" | "template";
  title: string;
  blurb: string;
  icon: Kind;
  build: () => Sheet;
  tour?: TourStep[];
}

type CardSpec = {
  kind: Kind;
  x: number;
  y: number;
  title: string;
  body?: string;
  sure?: number;
  status?: Status;
  source?: string;
  link?: string;
};

/** Builds a sheet the same way the app would: refs, counters and defaults included. */
function sheet(project: string, cards: Record<string, CardSpec>, links: [string, string, Rel?][]): Sheet {
  const counters = Object.fromEntries(Object.keys(KIND_META).map((k) => [k, 0])) as Record<Kind, number>;
  const nodes: Record<string, PlanNode> = {};
  const ids: Record<string, string> = {};
  let t = Date.now();
  for (const [key, c] of Object.entries(cards)) {
    const n = ++counters[c.kind];
    const id = `${key}-${Math.random().toString(36).slice(2, 8)}`;
    ids[key] = id;
    nodes[id] = {
      id,
      ref: `${KIND_META[c.kind].prefix}-${String(n).padStart(2, "0")}`,
      kind: c.kind,
      title: c.title,
      body: c.body ?? "",
      x: c.x,
      y: c.y,
      status: c.status ?? "todo",
      createdAt: t++,
      ...(BELIEF_KINDS.has(c.kind) ? { confidence: c.sure ?? DEFAULT_CONFIDENCE[c.kind] } : {}),
      ...(c.source ? { source: c.source } : {}),
      ...(c.link ? { link: c.link } : {}),
    };
  }
  const edges: Record<string, Edge> = {};
  links.forEach(([a, b, rel = "feeds"], i) => {
    const id = `l${i}-${Math.random().toString(36).slice(2, 8)}`;
    edges[id] = { id, from: ids[a], to: ids[b], rel };
  });
  return { project, nodes, edges, counters };
}

export const STARTERS: Starter[] = [
  // ── Examples ──
  {
    id: "cake",
    type: "example",
    title: "The missing cake",
    blurb: "A tiny mystery. See how evidence, claims and weighing fit together.",
    icon: "evidence",
    build: () =>
      sheet(
        "The missing cake",
        {
          e1: { kind: "evidence", x: 0, y: 0, title: "Crumbs on the sofa", body: "Found them at 6pm.", sure: 70, source: "Me" },
          e2: { kind: "evidence", x: 0, y: 190, title: "Dog was outside all afternoon", sure: 85, source: "Door camera" },
          e3: { kind: "evidence", x: 0, y: 380, title: "Frosting on my brother's sleeve", sure: 60, source: "Mum" },
          e4: { kind: "evidence", x: 0, y: 560, title: "Brother says he was at football", sure: 40, source: "Brother" },
          c1: { kind: "claim", x: 360, y: 90, title: "The dog took it", sure: 80 },
          c2: { kind: "claim", x: 360, y: 430, title: "My brother took it", sure: 40 },
          q: { kind: "question", x: 720, y: 250, title: "Who took the cake?" },
          d: { kind: "conclusion", x: 720, y: 520, title: "Brother did it and blamed the dog", sure: 90 },
        },
        [
          ["e1", "c1", "supports"],
          ["e2", "c1", "contradicts"],
          ["e1", "c2", "supports"],
          ["e3", "c2", "supports"],
          ["e4", "c2", "contradicts"],
          ["c1", "q", "supports"],
          ["c2", "q", "supports"],
          ["c2", "d", "supports"],
        ],
      ),
    tour: [
      { text: "This sheet is a little mystery: who took the cake? Each box is a card, and arrows connect them. Drag the paper to look around; pinch to zoom (Ctrl+scroll on a computer).", focus: "Q-01" },
      { text: "Evidence is something you found. It has a “how sure” value, and can name where it came from, carry a photo, or link to a source.", focus: "E-01" },
      { text: "A claim is something that might be true. Arrows marked + support it, ≠ contradict it. The bar shows the weight for (green) against (red).", focus: "C-01" },
      { text: "Tap any card to edit it. Try dragging the “How sure am I?” slider and watch the bars and flags react.", focus: "E-02", select: true },
      { text: "Plot holes points out where reasoning doesn't hold. Here: you're 80% sure the dog did it, but the evidence leans the other way — and the conclusion is far surer than the claim it rests on.", tab: "holes" },
      { text: "Big picture ranks the possible answers to a question by their evidence, next to how sure you said you are.", tab: "picture" },
      { text: "To link cards, select one and press “Link to…”, then pick the other — or drag from a card's right-hand dot (on a phone, hold the dot first). Gather several cards (or Shift-click them) to combine them into a conclusion.", focus: "D-01" },
      { text: "That's the core. Start (toolbar) has templates for your own questions; Sheets keeps several boards. Press ? for help on anything." },
    ],
  },
  {
    id: "move",
    type: "example",
    title: "Should I move cities?",
    blurb: "A decision with two options, an untested assumption and a plan to check it.",
    icon: "question",
    build: () =>
      sheet(
        "Should I move to a new city?",
        {
          q: { kind: "question", x: 760, y: 240, title: "Should I move to the new city?" },
          go: { kind: "claim", x: 400, y: 80, title: "Move", sure: 55 },
          stay: { kind: "claim", x: 400, y: 420, title: "Stay", sure: 50 },
          e1: { kind: "evidence", x: 0, y: 0, title: "Rent is about 30% cheaper there", sure: 75, source: "Listings site" },
          e2: { kind: "evidence", x: 0, y: 170, title: "Three times more jobs in my field", sure: 65, source: "Job board search" },
          e3: { kind: "evidence", x: 0, y: 360, title: "My closest friends are here", sure: 95, source: "Me" },
          e4: { kind: "evidence", x: 0, y: 530, title: "Moving costs about two months' savings", sure: 70, source: "Movers' quotes" },
          a1: { kind: "assumption", x: 400, y: 640, title: "I'll make new friends quickly", sure: 60 },
          d: { kind: "conclusion", x: 760, y: 520, title: "Visit for a week before deciding", sure: 70 },
          t1: { kind: "step", x: 1120, y: 520, title: "Book a cheap week there next month", body: "Work remotely from a café; go to one meetup." },
        },
        [
          ["e1", "go", "supports"],
          ["e2", "go", "supports"],
          ["e3", "stay", "supports"],
          ["e4", "go", "contradicts"],
          ["a1", "go", "supports"],
          ["go", "q", "supports"],
          ["stay", "q", "supports"],
          ["a1", "d", "supports"],
          ["e3", "d", "supports"],
          ["d", "t1", "feeds"],
        ],
      ),
  },
  {
    id: "ship",
    type: "example",
    title: "Ship one small thing",
    blurb: "A project plan: goal, milestone, steps, a risk — and what to do next.",
    icon: "goal",
    build: () =>
      sheet(
        "Ship one small thing",
        {
          why: { kind: "thought", x: 0, y: 0, title: "I want proof I can still finish things", body: "Small. Finished. Shown to someone." },
          t1: { kind: "step", x: 0, y: 260, title: "Write one sentence: what does done look like?", status: "done" },
          t2: { kind: "step", x: 300, y: 170, title: "Sketch the 3 core screens on paper", body: "20 min, pen only.", status: "doing" },
          t3: { kind: "step", x: 300, y: 360, title: "Build the bare canvas", body: "Pan, zoom, cards. Nothing else." },
          m1: { kind: "milestone", x: 600, y: 260, title: "Ugly first version runs" },
          t4: { kind: "step", x: 900, y: 260, title: "Show it to one friend", body: "Ask what they'd change first." },
          g: { kind: "goal", x: 1200, y: 120, title: "Ship one small thing this month" },
          r: { kind: "risk", x: 900, y: 460, title: "Losing steam after day 3", body: "Counter: every step under 30 min; always leave the next one written down." },
        },
        [
          ["why", "g", "supports"],
          ["t1", "t2"],
          ["t1", "t3"],
          ["t2", "m1"],
          ["t3", "m1"],
          ["m1", "t4"],
          ["t4", "g"],
          ["r", "g"],
        ],
      ),
  },

  // ── Templates ──
  {
    id: "t-decision",
    type: "template",
    title: "Weigh a decision",
    blurb: "Two options, evidence for and against each, and where you land.",
    icon: "question",
    build: () =>
      sheet(
        "My decision",
        {
          q: { kind: "question", x: 720, y: 220, title: "[What are you deciding?]" },
          a: { kind: "claim", x: 360, y: 80, title: "[Option A]", sure: 50 },
          b: { kind: "claim", x: 360, y: 380, title: "[Option B]", sure: 50 },
          e1: { kind: "evidence", x: 0, y: 0, title: "[Something for A]", sure: 60 },
          e2: { kind: "evidence", x: 0, y: 170, title: "[Something against A]", sure: 60 },
          e3: { kind: "evidence", x: 0, y: 380, title: "[Something for B]", sure: 60 },
          d: { kind: "conclusion", x: 720, y: 470, title: "[So I'll…]", sure: 50 },
        },
        [
          ["e1", "a", "supports"],
          ["e2", "a", "contradicts"],
          ["e3", "b", "supports"],
          ["a", "q", "supports"],
          ["b", "q", "supports"],
        ],
      ),
  },
  {
    id: "t-mystery",
    type: "template",
    title: "Solve a mystery",
    blurb: "Clues on the left, theories in the middle, the answer on the right.",
    icon: "evidence",
    build: () =>
      sheet(
        "My mystery",
        {
          e1: { kind: "evidence", x: 0, y: 0, title: "[Clue 1]" },
          e2: { kind: "evidence", x: 0, y: 180, title: "[Clue 2]" },
          e3: { kind: "evidence", x: 0, y: 360, title: "[Clue 3]" },
          t1: { kind: "claim", x: 360, y: 80, title: "[Theory 1]", sure: 50 },
          t2: { kind: "claim", x: 360, y: 320, title: "[Theory 2]", sure: 50 },
          q: { kind: "question", x: 720, y: 200, title: "[What happened?]" },
        },
        [
          ["e1", "t1", "supports"],
          ["e2", "t2", "supports"],
          ["t1", "q", "supports"],
          ["t2", "q", "supports"],
        ],
      ),
  },
  {
    id: "t-belief",
    type: "template",
    title: "Test a belief",
    blurb: "Something you believe, why, what could prove it wrong, and how to check.",
    icon: "claim",
    build: () =>
      sheet(
        "Testing a belief",
        {
          c: { kind: "claim", x: 380, y: 150, title: "[Something I believe]", sure: 70 },
          why: { kind: "evidence", x: 0, y: 0, title: "[Why I believe it]", sure: 60 },
          against: { kind: "evidence", x: 0, y: 220, title: "[What would prove me wrong?]", sure: 50 },
          a: { kind: "assumption", x: 0, y: 420, title: "[What I'm taking for granted]", sure: 60 },
          t: { kind: "step", x: 380, y: 420, title: "[Cheapest way to check it]" },
        },
        [
          ["why", "c", "supports"],
          ["against", "c", "contradicts"],
          ["a", "c", "supports"],
          ["t", "a"],
        ],
      ),
  },
  {
    id: "t-plan",
    type: "template",
    title: "Plan a project",
    blurb: "A goal, why it matters, a first milestone, and steps small enough to start.",
    icon: "goal",
    build: () =>
      sheet(
        "My project",
        {
          why: { kind: "thought", x: 0, y: 0, title: "[Why this matters to me]" },
          t1: { kind: "step", x: 0, y: 220, title: "[First 20-minute step]" },
          t2: { kind: "step", x: 300, y: 220, title: "[Next step]" },
          m: { kind: "milestone", x: 600, y: 220, title: "[First visible version]" },
          g: { kind: "goal", x: 900, y: 80, title: "[What I want to finish]" },
          r: { kind: "risk", x: 600, y: 420, title: "[What could stop me]" },
        },
        [
          ["why", "g", "supports"],
          ["t1", "t2"],
          ["t2", "m"],
          ["m", "g"],
          ["r", "g"],
        ],
      ),
  },
];
