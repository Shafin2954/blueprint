/**
 * Spatial keyboard navigation: from a card, find the nearest card in a direction.
 * Cards straight ahead win over cards far off to the side.
 */
import { NODE_W, type Kind, type PlanNode } from "./types";

export type Dir = "left" | "right" | "up" | "down";

const center = (n: PlanNode) => ({ x: n.x + NODE_W / 2, y: n.y + 40 });

export function nearestInDirection(from: PlanNode, dir: Dir, nodes: Record<string, PlanNode>): PlanNode | null {
  const a = center(from);
  let best: PlanNode | null = null;
  let bestScore = Infinity;
  for (const n of Object.values(nodes)) {
    if (n.id === from.id) continue;
    const b = center(n);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue; // must actually be in that direction
    const score = along + across * 2.5; // sideways distance costs more
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

/** The card nearest a point (e.g. the middle of the screen). */
export function nearestTo(x: number, y: number, nodes: Record<string, PlanNode>): PlanNode | null {
  let best: PlanNode | null = null;
  let d = Infinity;
  for (const n of Object.values(nodes)) {
    const c = center(n);
    const dd = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (dd < d) {
      d = dd;
      best = n;
    }
  }
  return best;
}

/** What you probably want next after a card (drag-to-empty-paper and the N key). */
export const NEXT_KIND: Partial<Record<Kind, Kind>> = {
  thought: "thought",
  spark: "thought",
  evidence: "claim",
  question: "claim",
  claim: "conclusion",
  assumption: "claim",
  conclusion: "conclusion",
};

export function describe(n: PlanNode, kindLabel: string, sure?: number): string {
  return `${kindLabel} ${n.ref}: ${n.title}${sure !== undefined ? `, ${sure}% sure` : ""}${n.kind === "step" ? `, ${n.status}` : ""}`;
}
