import { describe, expect, it } from "vitest";
import { routeHits, routeLink } from "../routing";
import { board } from "./fixtures";
import { NODE_W } from "../types";

const anchor = (n: { x: number; y: number }, side: "out" | "in") => ({ x: side === "out" ? n.x + NODE_W : n.x - 4, y: n.y + 22 });

describe("link routing", () => {
  it("draws a plain curve when nothing is in the way", () => {
    const b = board().card("a", "evidence", { x: 0, y: 0 }).card("c", "claim", { x: 400, y: 0 });
    const r = routeLink(anchor(b.nodes.a, "out"), anchor(b.nodes.c, "in"), []);
    expect(r.d.match(/C /g)).toHaveLength(1);
  });

  it("detours around a card that sits between the ends", () => {
    // a ... blocker ... c, all in one row: a straight link would run through the blocker
    const b = board()
      .card("a", "evidence", { x: 0, y: 0 })
      .card("blocker", "evidence", { x: 330, y: 0 })
      .card("c", "claim", { x: 700, y: 0 });
    const others = [b.nodes.blocker];
    const direct = routeLink(anchor(b.nodes.a, "out"), anchor(b.nodes.c, "in"), []);
    expect(routeHits(direct, others)).toBe(1); // sanity: the naive curve would hit it
    const r = routeLink(anchor(b.nodes.a, "out"), anchor(b.nodes.c, "in"), others);
    expect(routeHits(r, others)).toBe(0);
  });

  it("goes around a column of cards in the way", () => {
    const b = board().card("a", "evidence", { x: 0, y: 200 }).card("c", "claim", { x: 760, y: 200 });
    for (let i = 0; i < 4; i++) b.card(`m${i}`, "thought", { x: 380, y: i * 130 });
    const others = [0, 1, 2, 3].map((i) => b.nodes[`m${i}`]);
    const r = routeLink(anchor(b.nodes.a, "out"), anchor(b.nodes.c, "in"), others);
    expect(routeHits(r, others)).toBe(0);
  });
});

describe("link routing in a tight row", () => {
  it("clears cards only ~70px apart (turns inside the gaps)", () => {
    const b = board();
    ["e1", "e2", "e3", "e4"].forEach((id, i) => b.card(id, "evidence", { x: i * 300, y: 0 }));
    b.card("c", "claim", { x: 1200, y: 0 });
    const others = ["e2", "e3", "e4"].map((id) => b.nodes[id]);
    const r = routeLink(anchor(b.nodes.e1, "out"), anchor(b.nodes.c, "in"), others);
    expect(routeHits(r, others)).toBe(0);
  });
});
