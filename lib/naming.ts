import type { PlanNode } from "./types";

/**
 * What to call a sheet: its name if you gave one, otherwise its first question, goal,
 * claim or thought — so an untitled sheet is still recognisable everywhere it's shown.
 */
export function sheetTitle(project: string, nodes: Record<string, PlanNode>): string {
  if (project && project.trim() && project !== "Untitled") return project;
  const pick = (k: string) =>
    Object.values(nodes)
      .filter((n) => n.kind === k && !/^New |^\[/.test(n.title))
      .sort((a, b) => a.createdAt - b.createdAt)[0];
  const n = pick("question") ?? pick("goal") ?? pick("claim") ?? pick("thought");
  return n ? `${n.title.slice(0, 60)}${n.title.length > 60 ? "…" : ""}` : "Untitled";
}
