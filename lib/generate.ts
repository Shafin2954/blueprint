/**
 * Offline idea generator. No model, no network: a set of creative "lenses"
 * (shrink, invert, collide, constrain…) applied to whatever you point it at.
 */
import type { Kind } from "./types";

export interface Draft {
  kind: Kind;
  title: string;
  body: string;
  lens: string;
}

const pick = <T,>(xs: readonly T[], r = Math.random) => xs[Math.floor(r() * xs.length)];

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DOMAINS = [
  "gardening", "chess", "cooking", "astronomy", "typography", "weather", "music theory",
  "maps", "origami", "sleep", "trains", "libraries", "beekeeping", "tides", "carpentry",
  "museums", "radio", "knitting", "subways", "fermentation", "lighthouses", "receipts",
] as const;

const FORMATS = [
  "browser extension", "zine", "CLI tool", "board game", "newsletter", "map", "bot",
  "deck of cards", "single web page", "workshop", "screensaver", "printable poster",
  "keyboard shortcut", "sound", "spreadsheet",
] as const;

const PEOPLE = [
  "a night-shift nurse", "a 9-year-old", "your grandmother", "a first-week intern",
  "someone learning to cook", "a tired version of you", "a teacher with 30 kids",
  "a person who hates apps", "a bus driver", "a beginner musician",
] as const;

const CONSTRAINTS = [
  "in under 100 lines", "with no screen at all", "for $0", "in 10 minutes a day",
  "using only text", "that works offline", "in one weekend", "with one button",
  "that a stranger understands in 5 seconds", "without any login",
] as const;

const EVERYDAY = [
  "a to-do list", "the morning commute", "laundry", "group chats", "a bookshelf",
  "leftovers", "a calendar", "passwords", "houseplants", "old photos", "a playlist",
  "the inbox", "a notebook", "walking", "boredom",
] as const;

type Lens = (t: string) => Omit<Draft, "lens" | "kind"> & { kind?: Kind };

const LENSES: Record<string, Lens> = {
  shrink: (t) => ({
    title: `Weekend-sized: ${t}`,
    body: `What's the version of "${t}" you could finish by Sunday night? Cut everything else.`,
  }),
  invert: (t) => ({
    title: `Invert: how would "${t}" fail?`,
    body: "List three ways it dies. Each one is a design requirement in disguise.",
    kind: "risk",
  }),
  collide: (t) => {
    const d = pick(DOMAINS);
    return {
      title: `${t} × ${d}`,
      body: `Borrow one rule, word, or ritual from ${d} and force it into "${t}".`,
    };
  },
  format: (t) => {
    const f = pick(FORMATS);
    return {
      title: `${t}, as a ${f}`,
      body: `Same idea, different container. What does a ${f} make easy that the obvious form doesn't?`,
    };
  },
  person: (t) => {
    const p = pick(PEOPLE);
    return {
      title: `${t}, built only for ${p}`,
      body: `Design for exactly one person. What would ${p} need on day one?`,
    };
  },
  constrain: (t) => {
    const c = pick(CONSTRAINTS);
    return { title: `${t} ${c}`, body: "A hard limit is a shortcut to a decision." };
  },
  remove: (t) => ({
    title: `Remove the hard part of "${t}"`,
    body: "Name the part you're dreading. Delete it from the plan. Is what's left still worth doing?",
  }),
  smallest: (t) => ({
    title: `20-minute move on "${t}"`,
    body: "Open a blank file / page / sheet and make the ugliest possible version. Stop at 20 minutes.",
    kind: "step",
  }),
  diagram: (t) => ({
    title: `Draw "${t}" as boxes and arrows`,
    body: "If you can't draw it, you don't understand it yet. That's useful information.",
    kind: "step",
  }),
  steal: (t) => ({
    title: `Who already solved "${t}" badly?`,
    body: "Find one clunky existing version. Write down the single thing that annoys you most about it.",
  }),
};

/**
 * Lenses for finding a contribution in the AI era: places where cheap, abundant
 * model output creates new scarcity, new gaps, or new jobs for a person.
 */
const AI_LENSES: Record<string, Lens> = {
  "newly scarce": (t) => ({
    title: `When ${t} is free, what's scarce?`,
    body: "AI makes producing it nearly free. What gets more valuable around it — taste, trust, curation, verification, a human face?",
  }),
  "human check": (t) => ({
    title: `The trust layer for AI-made ${t}`,
    body: "Where would you NOT trust a model's output here? The thing that checks, cites, or signs off on it is a product.",
  }),
  "make it visible": (t) => ({
    title: `Make the invisible part of ${t} visible`,
    body: "AI systems are opaque. A clear picture of what's happening (inputs, decisions, failures) is something people will pay attention to.",
  }),
  "your unfair data": (t) => ({
    title: `What do you know about ${t} that isn't online?`,
    body: "Models know the internet. Your lived detail, local knowledge, or private data is the part they can't copy.",
    kind: "question",
  }),
  "boring glue": (t) => ({
    title: `The tedious glue around ${t}`,
    body: "AI does the flashy middle. Who handles the handoffs, formats, cleanup, and 'now put it in the other system'?",
  }),
  "small & private": (t) => ({
    title: `${t}, but local, private, and tiny`,
    body: "Runs offline, on-device, for one community or one person. Big labs won't build it; that's the opening.",
  }),
  "teach the humans": (t) => ({
    title: `What do people need to learn now that AI does part of ${t}?`,
    body: "Every shift creates confused beginners. A guide, tool, or ritual for them is a contribution.",
  }),
  "where models are weak": (t) => ({
    title: `Where ${t} touches the physical, slow, or social world`,
    body: "Models are weak at bodies, places, relationships, and accountability. Find where this topic depends on those.",
  }),
  "tools for agents": (t) => ({
    title: `A tool for AI agents doing ${t}`,
    body: "Not for humans — for the agents. What would make an agent reliably good at this? Clean data, a checker, a sandbox?",
  }),
  "answers → judgment": (t) => ({
    title: `Help people decide about ${t}, not just know`,
    body: "Answers are cheap now. Comparing, weighing, and committing are not. Build for the decision.",
  }),
  "test the hype": (t) => ({
    title: `Assumption: AI already handles ${t} well`,
    body: "Is that true? Try it for 20 minutes and write down exactly where it breaks. The breaks are your map.",
    kind: "assumption",
  }),
};

const EVERYDAY_AI = [
  "writing", "studying", "small businesses", "code review", "your hobby", "local news", "job hunting",
  "teaching", "personal finance", "research papers", "design", "customer support", "music practice",
] as const;

export type GenMode = "lenses" | "ai-era";

export function generate(seed: string | null, count = 6, mode: GenMode = "lenses"): Draft[] {
  const set = mode === "ai-era" ? AI_LENSES : LENSES;
  const names = shuffle(Object.keys(set)).slice(0, count);
  return names.map((name) => {
    const topic = clean(seed) || pick(mode === "ai-era" ? EVERYDAY_AI : EVERYDAY);
    const out = set[name](topic);
    return { kind: out.kind ?? "spark", title: out.title, body: out.body, lens: name };
  });
}

function clean(s: string | null) {
  if (!s) return "";
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0, 46).trimEnd() + "…" : t;
}

export interface Scaffold {
  kind: Kind;
  title: string;
  body: string;
  /** Index into the scaffold list this one feeds, or -1 for the parent. */
  feeds: number;
}

/** Breaks a goal (or milestone) into a starter plan. Steps chain in order. */
export function decompose(title: string): Scaffold[] {
  const t = clean(title);
  return [
    {
      kind: "step",
      title: "Write one sentence: what does done look like?",
      body: `For "${t}". If you can't say it in a sentence, the goal is still a spark.`,
      feeds: 1,
    },
    {
      kind: "step",
      title: "20 minutes: the ugliest possible version",
      body: "No polish, no setup rabbit holes. Timer on.",
      feeds: 2,
    },
    {
      kind: "milestone",
      title: "Something exists",
      body: "A thing you could show someone, even if it embarrasses you.",
      feeds: 3,
    },
    {
      kind: "step",
      title: "Show it to one person",
      body: "Ask: what's the first thing you'd change?",
      feeds: -1,
    },
    {
      kind: "risk",
      title: "Momentum dies after day 3",
      body: "Counter-move: keep every step under 30 minutes and always leave the next one written down.",
      feeds: -1,
    },
  ];
}

/** Splits a step into two smaller halves. */
export function split(title: string): [string, string] {
  const t = clean(title);
  return [`Prepare: ${t}`, `Finish: ${t}`];
}
