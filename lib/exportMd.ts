/**
 * Turns the board into Markdown you can hand to any AI (or a friend) for a
 * consistency check. Nothing is sent anywhere: the app only produces text.
 */
import { findHoles } from "./holes";
import { membersOf } from "./frames";
import { balance, weight } from "./reason";
import { BELIEF_KINDS, KIND_META, KINDS, REL_META, STRENGTH, type Edge, type Frame, type PlanNode } from "./types";

type Nodes = Record<string, PlanNode>;
type Edges = Record<string, Edge>;

export const CHECK_REQUEST = `## What I'd like from you

This is a map of my own thinking. Please **check it for consistency** — don't decide for me, and don't add new facts unless you clearly label them as yours.

1. **Contradictions** between cards, including ones I haven't marked.
2. **Leaps**: conclusions that don't actually follow from what supports them.
3. **Circular reasoning**: things that end up supporting themselves.
4. **Confidence mismatches**: where I'm much more (or less) sure than my reasons justify.
5. **Ignored evidence**: anything I've collected that cuts against what I believe.
6. **Hidden assumptions**: things stated as fact that are really assumptions.
7. **Plan gaps**: goals with no realistic path, steps that are really projects.

Refer to cards by their ref (e.g. \`E-02\`). Be direct but kind. Finish with the **one question** that would most change my mind if I answered it honestly.`;

const indent = (s: string) => s.trim().split("\n").map((l) => `  > ${l}`).join("\n");

export function boardToMarkdown(project: string, nodes: Nodes, edges: Edges, withRequest = true, frames: Record<string, Frame> = {}): string {
  const list = Object.values(nodes);
  const out: string[] = [`# ${project || "Untitled"}`, ""];
  out.push(`_Exported from Blueprint on ${new Date().toISOString().slice(0, 10)} · ${list.length} cards · ${Object.keys(edges).length} links_`, "");
  if (withRequest) out.push(CHECK_REQUEST, "");

  out.push(
    "## How to read this",
    "",
    "Each card has a ref (`E-01`, `C-02`…), a kind, and for beliefs a confidence: how sure I am, 0–100%. \"From\" names where a card came from; cards from the same source are counted once when weighing.",
    "Links mean: **feeds** = leads to / unlocks · **supports** = is a reason or evidence for · **contradicts** = both can't be true.",
    "",
  );

  let images = 0;
  out.push("## Cards", "");
  for (const kind of KINDS) {
    const cards = list.filter((n) => n.kind === kind).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    if (!cards.length) continue;
    const label = KIND_META[kind].label;
    out.push(`### ${cards.length > 1 && kind !== "evidence" ? `${label}s` : label}`, "");
    for (const n of cards) {
      const meta = [
        BELIEF_KINDS.has(n.kind) ? `${Math.round(weight(n))}% sure` : "",
        n.kind === "step" ? n.status : "",
      ].filter(Boolean);
      out.push(`- **${n.ref}**${meta.length ? ` _(${meta.join(", ")})_` : ""} — ${n.title}`);
      if (n.body.trim()) out.push(n.kind === "snippet" ? "  ```\n" + n.body.replace(/^/gm, "  ") + "\n  ```" : indent(n.body));
      if (n.source) out.push(`  From: ${n.source}`);
      if (n.link) out.push(`  Source: <${n.link}>`);
      if (n.image) {
        images++;
        out.push("  _(has an attached image — not included in this export)_");
      }
    }
    out.push("");
  }

  const groups = Object.values(frames)
    .map((f) => ({ f, ids: membersOf(f, nodes) }))
    .filter((g) => g.ids.length);
  if (groups.length) {
    out.push("## Groups", "", "_Cards I've framed together._", "");
    for (const { f, ids } of groups) out.push(`- **${f.label}**: ${ids.map((id) => nodes[id].ref).join(", ")}`);
    out.push("");
  }

  const links = Object.values(edges).filter((e) => nodes[e.from] && nodes[e.to]);
  if (links.length) {
    out.push("## Links", "");
    for (const e of links) {
      const a = nodes[e.from];
      const b = nodes[e.to];
      const how = e.rel && e.rel !== "feeds" ? STRENGTH[e.strength ?? "normal"].adverb : "";
      out.push(`- ${a.ref} **${how ? `${how} ` : ""}${REL_META[e.rel ?? "feeds"].verb}** ${b.ref}  _(${a.title} → ${b.title})_`);
    }
    out.push("");
  }

  const weighed = list.filter((n) => n.kind === "claim" || n.kind === "conclusion" || n.kind === "question");
  const lines = weighed
    .map((n) => ({ n, b: balance(n.id, nodes, edges) }))
    .filter(({ b }) => b.score !== null)
    .map(({ n, b }) => `- **${n.ref}** ${n.title}: for ${Math.round(b.forW)} (${b.pro.map((p) => p.ref).join(", ") || "—"}) vs against ${Math.round(b.againstW)} (${b.con.map((p) => p.ref).join(", ") || "—"})`);
  if (lines.length) {
    out.push("## How the weights add up", "", "_Each supporting or contradicting card adds its own confidence to that side, ×0.5 for weak links and ×1.5 for strong ones; cards from the same source count once._", "", ...lines, "");
  }

  const flags = findHoles(nodes, edges);
  if (flags.length) {
    out.push("## Flags my board already raised", "", "_Structural checks from the app. Tell me if any of these are wrong, or what they miss._", "");
    for (const f of flags) out.push(`- **[${f.severity.toUpperCase()}] ${f.title}** — ${f.detail}`);
    out.push("");
  }

  if (images) out.push(`_Note: ${images} card${images > 1 ? "s have" : " has"} an attached image that isn't included. Ask me if one matters._`, "");
  return out.join("\n");
}
