/**
 * The command bar's language. Pure: turns a line of text into an action (or errors),
 * and a one-line preview of what it will do. The UI applies the action.
 *
 *   /evidence Rent is cheaper, desc: listings site, conf: 75, from: Zillow, for: C-01
 *   /step Book a week there, after: T-01, status: doing
 *   /link E-01 C-02 contradicts
 *   just some text            → a thought
 */
import { KIND_META, KINDS, STRENGTH, type Kind, type PlanNode, type Rel, type Status, type Strength, relVerb } from "./types";

export interface LinkSpec {
  /** "out": new card → ref; "in": ref → new card. */
  dir: "out" | "in";
  ref: string;
  rel: Rel;
}

export type CommandAction =
  | {
      type: "add";
      kind: Kind;
      title: string;
      body?: string;
      confidence?: number;
      source?: string;
      link?: string;
      status?: Status;
      strength?: Strength;
      links: LinkSpec[];
    }
  | { type: "link"; from: string; to: string; rel: Rel; strength?: Strength };

export interface Parsed {
  action: CommandAction | null;
  errors: string[];
  /** Fields that don't fit this kind of card: dropped, the card is still made. */
  warnings?: string[];
}

/** Short forms for the commands. */
const ALIASES: Record<string, Kind> = {
  t: "thought", th: "thought", note: "thought",
  s: "spark", idea: "spark",
  q: "question", ask: "question",
  a: "assumption", assume: "assumption",
  e: "evidence", ev: "evidence", fact: "evidence", clue: "evidence",
  c: "claim", belief: "claim", hypothesis: "claim",
  d: "conclusion", so: "conclusion", conclude: "conclusion",
  g: "goal",
  m: "milestone",
  step: "step", task: "step", todo: "step",
  r: "risk",
  n: "snippet", code: "snippet", quote: "snippet",
  x: "text", label: "text", heading: "text", title: "text",
  p: "problem", issue: "problem", bug: "problem", symptom: "problem",
  k: "cause", why: "cause", because: "cause",
  rc: "root", rootcause: "root", "root-cause": "root",
  f: "fix", solution: "fix", countermeasure: "fix", remedy: "fix",
};

export function kindFor(word: string): Kind | null {
  const w = word.toLowerCase();
  if ((KINDS as string[]).includes(w)) return w as Kind;
  return ALIASES[w] ?? null;
}

/** Every command, for suggestions: [command, what it does]. */
export const COMMANDS: [string, string][] = [
  ...KINDS.map((k): [string, string] => [k, `Add ${KIND_META[k].label.toLowerCase()} — ${KIND_META[k].hint}`]),
  ["link", "Link two cards: /link E-01 C-02 supports|contradicts|feeds"],
];

type FieldName = "desc" | "conf" | "from" | "link" | "status" | "strength" | Rel | "answers" | "after" | "because";

const FIELD_ALIASES: Record<string, FieldName> = {
  desc: "desc", description: "desc", notes: "desc", note: "desc", body: "desc", details: "desc",
  conf: "conf", confidence: "conf", sure: "conf",
  from: "from", src: "from", source: "from", by: "from",
  link: "link", url: "link",
  status: "status",
  strength: "strength", weight: "strength",
  for: "supports", supports: "supports", support: "supports", pro: "supports",
  against: "contradicts", contradicts: "contradicts", con: "contradicts", vs: "contradicts",
  to: "feeds", feeds: "feeds", then: "feeds", unlocks: "feeds", causes: "feeds", fixes: "feeds",
  answers: "answers", answer: "answers",
  after: "after", needs: "after",
  because: "because", since: "because",
};

/** Field names usable after a comma, e.g. ", conf: 70". */
export const FIELD_NAMES = Object.keys(FIELD_ALIASES);

const FIELD_RE = new RegExp(`(?:^|,)\\s*(${FIELD_NAMES.join("|")})\\s*:`, "gi");

/** Split "title, key: value, key: value" — commas inside a title or value are fine. */
function splitFields(rest: string): { title: string; fields: [FieldName, string][] } {
  const marks: { at: number; end: number; name: FieldName }[] = [];
  for (const m of rest.matchAll(FIELD_RE)) marks.push({ at: m.index!, end: m.index! + m[0].length, name: FIELD_ALIASES[m[1].toLowerCase()] });
  const title = (marks.length ? rest.slice(0, marks[0].at) : rest).trim().replace(/,\s*$/, "");
  const fields = marks.map((m, i): [FieldName, string] => [m.name, rest.slice(m.end, i + 1 < marks.length ? marks[i + 1].at : undefined).trim()]);
  return { title, fields };
}

const REF_RE = /^[a-z]{1,2}-\d{1,3}$|^last$/i;
const refsIn = (v: string) => v.split(/[\s,&+]+/).filter(Boolean);

function rel(word: string | undefined): Rel | null {
  if (!word) return "supports";
  const f = FIELD_ALIASES[word.toLowerCase()];
  return f === "supports" || f === "contradicts" || f === "feeds" ? f : null;
}

export function parseCommand(input: string): Parsed {
  // "//goal" happens when "/" opened the bar and then the command was typed with its slash.
  const text = input.trim().replace(/^\/{2,}/, "/");
  if (!text) return { action: null, errors: [] };
  const errors: string[] = [];

  // No slash: a quick thought — or a question, if it ends with "?".
  if (!text.startsWith("/")) {
    const { title, fields } = splitFields(text);
    const t = title || text;
    return finishAdd(t.trim().endsWith("?") ? "question" : "thought", t, fields, errors);
  }

  const m = text.match(/^\/(\S*)\s*([\s\S]*)$/)!;
  const cmd = m[1].toLowerCase();
  const rest = m[2];
  // "/goal /step Measure…": a second command typed over a first — the latest one wins.
  const again = rest.match(/^\/([a-z]+)(?=\s|$)/i); // not "/r/finance", a title that starts with a slash
  if (again && (kindFor(again[1]) || /^l(ink)?$/i.test(again[1]))) return parseCommand(rest);

  if (cmd === "link" || cmd === "l") {
    const [from, to, how, strength] = rest.split(/\s+/).filter(Boolean);
    if (!from || !to) return { action: null, errors: ["Usage: /link E-01 C-02 supports | contradicts | feeds"] };
    if (!REF_RE.test(from) || !REF_RE.test(to)) errors.push("Use card refs like E-01 and C-02.");
    const r = rel(how);
    if (!r) errors.push(`“${how}” isn't a link type — use supports, contradicts or feeds.`);
    const st = strength && (["weak", "normal", "strong"] as Strength[]).find((s) => s === strength.toLowerCase());
    return { action: errors.length ? null : { type: "link", from, to, rel: r!, ...(st ? { strength: st } : {}) }, errors };
  }

  const kind = kindFor(cmd);
  if (!kind) {
    const close = COMMANDS.map(([c]) => c).filter((c) => c.startsWith(cmd.slice(0, 2)));
    return { action: null, errors: [`No command “/${cmd}”.${close.length ? ` Did you mean ${close.map((c) => "/" + c).join(", ")}?` : ""}`] };
  }
  const { title, fields } = splitFields(rest);
  return finishAdd(kind, title, fields, errors);
}

function finishAdd(kind: Kind, title: string, fields: [FieldName, string][], errors: string[]): Parsed {
  if (!title) errors.push(`Give the ${KIND_META[kind].label.toLowerCase()} a title: /${kind} Your text here`);
  const action: Extract<CommandAction, { type: "add" }> = { type: "add", kind, title, links: [] };
  for (const [name, value] of fields) {
    if (!value) {
      errors.push(`“${name}:” is empty.`);
      continue;
    }
    switch (name) {
      case "desc":
        action.body = value;
        break;
      case "conf": {
        const n = Number(value.replace(/%$/, ""));
        if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`conf: should be 0–100, got “${value}”.`);
        else action.confidence = Math.round(n);
        break;
      }
      case "from":
        action.source = value;
        break;
      case "link":
        if (!/^https?:\/\//i.test(value)) errors.push("link: should start with http:// or https://");
        else action.link = value;
        break;
      case "status": {
        const s = value.toLowerCase();
        if (s === "todo" || s === "doing" || s === "done") action.status = s;
        else errors.push("status: is todo, doing or done.");
        break;
      }
      case "strength": {
        const s = value.toLowerCase() as Strength;
        if (s in STRENGTH) action.strength = s;
        else errors.push("strength: is weak, normal or strong.");
        break;
      }
      default: {
        for (const ref of refsIn(value)) {
          if (!REF_RE.test(ref)) {
            errors.push(`“${ref}” isn't a card ref (like E-01, or “last”).`);
            continue;
          }
          if (name === "after") action.links.push({ dir: "in", ref, rel: "feeds" });
          else if (name === "because") action.links.push({ dir: "in", ref, rel: "supports" });
          else if (name === "answers") action.links.push({ dir: "out", ref, rel: "supports" });
          else action.links.push({ dir: "out", ref, rel: name as Rel });
        }
      }
    }
  }
  const warnings: string[] = [];
  if (action.confidence !== undefined && !["evidence", "claim", "conclusion", "assumption"].includes(kind)) {
    warnings.push(`conf: ignored — it only applies to evidence, claims, conclusions and assumptions`);
    delete action.confidence;
  }
  if (action.status && kind !== "step") {
    warnings.push("status: ignored — it only applies to steps");
    delete action.status;
  }
  return { action: errors.length ? null : action, errors, warnings };
}

/** Find a card by ref ("E-01") or "last" (the card made just before). */
export function resolveRef(ref: string, nodes: Record<string, PlanNode>, last: string | null): PlanNode | undefined {
  if (ref.toLowerCase() === "last") return last ? nodes[last] : undefined;
  const r = ref.toUpperCase();
  return Object.values(nodes).find((n) => n.ref.toUpperCase() === r);
}

/** Missing refs, so the preview can warn before Enter. */
export function unknownRefs(action: CommandAction, nodes: Record<string, PlanNode>, last: string | null): string[] {
  const refs = action.type === "link" ? [action.from, action.to] : action.links.map((l) => l.ref);
  return refs.filter((r) => !resolveRef(r, nodes, last));
}

/** One line describing what Enter will do. */
export function describeAction(action: CommandAction, nodes: Record<string, PlanNode>, last: string | null): string {
  const name = (ref: string) => {
    const n = resolveRef(ref, nodes, last);
    return n ? `${n.ref} “${n.title.slice(0, 28)}${n.title.length > 28 ? "…" : ""}”` : ref;
  };
  if (action.type === "link") return `Link ${name(action.from)} ${action.rel === "feeds" ? "→ feeds" : action.rel} ${name(action.to)}${action.strength ? ` (${action.strength})` : ""}`;
  const bits = [`Add ${KIND_META[action.kind].label.toLowerCase()} “${action.title}”`];
  if (action.confidence !== undefined) bits.push(`${action.confidence}% sure`);
  if (action.source) bits.push(`from ${action.source}`);
  if (action.status) bits.push(action.status);
  if (action.body) bits.push("with notes");
  if (action.link) bits.push("with a link");
  for (const l of action.links) {
    const target = resolveRef(l.ref, nodes, last);
    const verb =
      l.dir === "in"
        ? l.rel === "feeds" ? "after" : "because of"
        : l.rel === "feeds"
          ? (() => { const v = relVerb("feeds", target?.kind, action.kind); return v === "feeds into" ? "→ feeds" : v; })()
          : l.rel === "supports" && target?.kind === "question" ? "answers" : l.rel;
    bits.push(`${verb} ${name(l.ref)}`);
  }
  if (action.strength && action.links.length) bits.push(`(${action.strength} links)`);
  return bits.join(" · ");
}
