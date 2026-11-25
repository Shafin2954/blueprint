export type Kind =
  | "thought"
  | "spark"
  | "evidence"
  | "claim"
  | "conclusion"
  | "assumption"
  | "question"
  | "goal"
  | "milestone"
  | "step"
  | "snippet"
  | "risk";
export type Status = "todo" | "doing" | "done";

export interface PlanNode {
  id: string;
  /** Drawing reference shown on the card, e.g. "G-02". */
  ref: string;
  kind: Kind;
  title: string;
  body: string;
  x: number;
  y: number;
  status: Status;
  createdAt: number;
  /** How sure you are, 0–100. Only meaningful for reasoning kinds. */
  confidence?: number;
  /** A URL this card points at (source, reference). */
  link?: string;
  /** Attached picture, downscaled and stored as a data URL. */
  image?: string;
  /**
   * Where this came from, as a short group name ("Mum", "news article", "door cam").
   * Cards sharing a source count once when weighing, so one rumor repeated three
   * times doesn't look like three independent reasons.
   */
  source?: string;
  /** Set on cards opened from a share link whose image was left out of the link. */
  imageOmitted?: boolean;
}

/**
 * feeds: "from unlocks / leads to `to`" (the default; drives the plan).
 * supports: "from is a reason or evidence for `to`" (also counts upstream).
 * contradicts: "from and `to` can't both be true" (ignored by the plan).
 */
export type Rel = "feeds" | "supports" | "contradicts";

export type Strength = "weak" | "normal" | "strong";

export interface Edge {
  id: string;
  from: string;
  to: string;
  rel?: Rel;
  /** How much this link bears on the card it points at (supports / contradicts only). */
  strength?: Strength;
}

export const STRENGTH: Record<Strength, { mult: number; label: string; adverb: string }> = {
  weak: { mult: 0.5, label: "Weak", adverb: "weakly" },
  normal: { mult: 1, label: "Normal", adverb: "" },
  strong: { mult: 1.5, label: "Strong", adverb: "strongly" },
};

/** "supports" into a question reads as "answers": that's what the link means there. */
export function relVerb(rel: Rel | undefined, toKind?: Kind): string {
  if ((rel ?? "feeds") === "supports" && toKind === "question") return "answers";
  return REL_META[rel ?? "feeds"].verb;
}

export const REL_META: Record<Rel, { label: string; verb: string }> = {
  feeds: { label: "Feeds", verb: "feeds into" },
  supports: { label: "Supports", verb: "supports" },
  contradicts: { label: "Contradicts", verb: "contradicts" },
};

export interface Frame {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export const KIND_META: Record<
  Kind,
  { label: string; prefix: string; hint: string }
> = {
  thought: { label: "Thought", prefix: "TH", hint: "Anything on your mind. No type, no judgment — sort it later." },
  spark: { label: "Spark", prefix: "S", hint: "Raw idea. Unjudged." },
  evidence: {
    label: "Evidence",
    prefix: "E",
    hint: "Something you found or observed. Attach the photo, link, or quote it came from.",
  },
  claim: {
    label: "Claim",
    prefix: "C",
    hint: "Something you think might be true. Link evidence to it: supports or contradicts.",
  },
  conclusion: {
    label: "Conclusion",
    prefix: "D",
    hint: "What the pieces mean, put together. Should rest on the cards that support it.",
  },
  assumption: {
    label: "Assumption",
    prefix: "A",
    hint: "Something you're treating as true but haven't checked. Feed a step into it to test it.",
  },
  question: { label: "Question", prefix: "Q", hint: "Something you don't know yet. Link it to whatever answers it." },
  goal: { label: "Goal", prefix: "G", hint: "An outcome worth the effort." },
  milestone: {
    label: "Milestone",
    prefix: "M",
    hint: "A visible checkpoint. Done when everything feeding it is done.",
  },
  step: {
    label: "Step",
    prefix: "T",
    hint: "Something you can do in under 30 minutes.",
  },
  snippet: {
    label: "Snippet",
    prefix: "N",
    hint: "Code, copy, a link, a quote. Raw material.",
  },
  risk: { label: "Risk", prefix: "R", hint: "What could stop this, and the counter-move." },
};

/** Toolbar groups: loose thinking, reasoning, planning. */
export const KIND_GROUPS: Kind[][] = [
  ["thought", "spark", "question", "assumption"],
  ["evidence", "claim", "conclusion"],
  ["goal", "milestone", "step", "risk", "snippet"],
];

export const KINDS: Kind[] = KIND_GROUPS.flat();

/** The few kinds shown by default; the rest are one tap away. */
export const CORE_KINDS = new Set<Kind>(["thought", "question", "evidence", "claim", "conclusion", "step"]);

/** Kinds that carry a "how sure am I" value. */
export const BELIEF_KINDS = new Set<Kind>(["evidence", "claim", "conclusion", "assumption"]);

export const DEFAULT_CONFIDENCE: Partial<Record<Kind, number>> = {
  evidence: 70,
  claim: 50,
  conclusion: 50,
  assumption: 60,
};

export const NODE_W = 232;
/** Vertical offset of edge anchors from the card's top edge. */
export const ANCHOR_Y = 22;

/**
 * Where a kind sits in the flow of reasoning/planning, left to right: what it usually
 * links into is to its right (evidence → claim → conclusion → question; step → milestone → goal).
 */
export const STAGE: Record<Kind, number> = {
  thought: 0, spark: 0, evidence: 1, assumption: 2, snippet: 2, claim: 3, risk: 3, conclusion: 4,
  step: 4, question: 5, milestone: 5, goal: 6,
};
