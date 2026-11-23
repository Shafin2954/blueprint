/**
 * Frames: labeled rectangles that group cards ("Suspects", "Money", "Phase 1").
 * A card belongs to a frame when its centre is inside it — so membership is just
 * geometry, and moving a card in or out of a frame is how you regroup.
 */
import { estimateHeight } from "./layout";
import { NODE_W, type Frame, type PlanNode } from "./types";

const PAD_X = 28;
const PAD_TOP = 52; // room for the label tab
const PAD_BOTTOM = 28;
const snap = (v: number) => Math.round(v / 12) * 12;

export const cardCenter = (n: PlanNode) => ({ x: n.x + NODE_W / 2, y: n.y + 40 });

export function membersOf(f: Frame, nodes: Record<string, PlanNode>): string[] {
  return Object.values(nodes)
    .filter((n) => {
      const c = cardCenter(n);
      return c.x >= f.x && c.x <= f.x + f.w && c.y >= f.y && c.y <= f.y + f.h;
    })
    .map((n) => n.id);
}

/** The rectangle that snugly wraps some cards, with room for the label. */
export function fitAround(cards: PlanNode[]): Pick<Frame, "x" | "y" | "w" | "h"> {
  const minX = Math.min(...cards.map((n) => n.x));
  const minY = Math.min(...cards.map((n) => n.y));
  const maxX = Math.max(...cards.map((n) => n.x + NODE_W));
  const maxY = Math.max(...cards.map((n) => n.y + estimateHeight(n)));
  return {
    x: snap(minX - PAD_X),
    y: snap(minY - PAD_TOP),
    w: snap(maxX - minX + PAD_X * 2),
    h: snap(maxY - minY + PAD_TOP + PAD_BOTTOM),
  };
}

export const MIN_FRAME = { w: 240, h: 140 };
