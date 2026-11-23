import { KIND_META, type PlanNode } from "./types";

/** A tiny suffix-stripping stemmer: good enough to make "cooking", "cooked", "cooks" meet "cook". */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  for (const [suf, rep] of [
    ["ies", "y"], ["ied", "y"], ["ing", ""], ["ed", ""], ["es", ""], ["s", ""], ["ly", ""], ["er", ""], ["ment", ""], ["ness", ""],
  ] as const) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }
  // "planning" → "plann" → "plan"
  if (/([^aeiou])\1$/.test(w) && w.length > 3) w = w.slice(0, -1);
  return w;
}

const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];

export function findCards(nodes: Record<string, PlanNode>, q: string): PlanNode[] {
  const list = Object.values(nodes);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  return list
    .map((n) => {
      const title = n.title.toLowerCase();
      const hay = `${title} ${n.body} ${n.ref} ${n.source ?? ""} ${KIND_META[n.kind].label}`.toLowerCase();
      // Forgiving about word endings: compare stems, and let a stem match the start of a word.
      const stems = words(hay).map(stem);
      const hit = (t: string) => {
        if (hay.includes(t)) return true;
        const ts = stem(t);
        return stems.some((w) => w.startsWith(ts) || (w.length >= 4 && ts.startsWith(w)));
      };
      if (!terms.every(hit)) return null;
      // Title and ref hits first, then anything else.
      const score = terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (n.ref.toLowerCase() === t ? 5 : 0) + 1, 0);
      return { n, score };
    })
    .filter((x): x is { n: PlanNode; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map((x) => x.n);
}

