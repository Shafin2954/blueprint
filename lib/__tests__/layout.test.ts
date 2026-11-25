import { describe, expect, it } from "vitest";
import { estimateHeight, tidy } from "../layout";
import { STARTERS } from "../starters";
import { board } from "./fixtures";

const overlaps = (pos: ReturnType<typeof tidy>, nodes: Parameters<typeof tidy>[0]) => {
  const ids = Object.keys(pos);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos[ids[i]], b = pos[ids[j]];
      if (a.x !== b.x) continue;
      const ha = estimateHeight(nodes[ids[i]]), hb = estimateHeight(nodes[ids[j]]);
      if (a.y < b.y + hb && b.y < a.y + ha) return [ids[i], ids[j]];
    }
  return null;
};

describe("tidy", () => {
  it("puts each card right of what feeds or supports it", () => {
    const b = board().card("e", "evidence").card("c", "claim").card("d", "conclusion").card("t", "step")
      .link("e", "c", "supports").link("c", "d", "supports").link("d", "t");
    const p = tidy(b.nodes, b.edges);
    expect(p.e.x).toBeLessThan(p.c.x);
    expect(p.c.x).toBeLessThan(p.d.x);
    expect(p.d.x).toBeLessThan(p.t.x);
  });

  it("puts evidence that only contradicts a claim in the column before it", () => {
    const b = board().card("e1", "evidence").card("e2", "evidence").card("c", "claim")
      .link("e1", "c", "supports").link("e2", "c", "contradicts");
    const p = tidy(b.nodes, b.edges);
    expect(p.e2.x).toBe(p.e1.x);
    expect(p.e2.x).toBeLessThan(p.c.x);
  });

  it("puts unlinked cards underneath the connected ones", () => {
    const b = board().card("a", "step").card("b", "step").card("lone", "thought").link("a", "b");
    const p = tidy(b.nodes, b.edges);
    expect(p.lone.y).toBeGreaterThan(Math.max(p.a.y, p.b.y));
  });

  it("keeps each frame's cards together and away from other cards", async () => {
    const { fitAround } = await import("../frames");
    // two unlinked framed cards that would otherwise land in different places
    const b = board()
      .card("s1", "thought", { x: 0, y: 0 }).card("s2", "thought", { x: 900, y: 600 })
      .card("e", "evidence").card("c", "claim").link("e", "c", "supports")
      .card("lone", "thought");
    const p = tidy(b.nodes, b.edges, [["s1", "s2"]]);
    const moved = Object.fromEntries(Object.entries(b.nodes).map(([id, n]) => [id, { ...n, ...p[id] }]));
    const box = fitAround([moved.s1, moved.s2]);
    for (const other of ["e", "c", "lone"]) {
      const n = moved[other];
      const cx = n.x + 116, cy = n.y + 40;
      const inside = cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
      expect(inside, other).toBe(false);
    }
  });

  it("copes with gaps in depth (unlinked cards from different columns in one frame)", () => {
    const b = board().card("a", "step").card("b", "step").card("c", "step").card("d", "goal")
      .link("a", "b").link("b", "c").link("c", "d");
    // a is depth 0, d is depth 3: framing just those two leaves empty columns in between
    expect(() => tidy(b.nodes, b.edges, [["a", "d"]])).not.toThrow();
    const p = tidy(b.nodes, b.edges, [["a", "d"]]);
    expect(p.a.x).toBeLessThan(p.d.x);
  });

  it("never stacks cards on top of each other", () => {
    for (const st of STARTERS) {
      const sh = st.build();
      expect(overlaps(tidy(sh.nodes, sh.edges), sh.nodes), st.id).toBeNull();
    }
  });

  it("positions every card on the 12px grid", () => {
    const sh = STARTERS[0].build();
    for (const v of Object.values(tidy(sh.nodes, sh.edges))) {
      expect(v.x % 12).toBe(0);
      expect(v.y % 12).toBe(0);
    }
  });
});

describe("tidy on a phone", () => {
  it("lays every starter out two cards wide, without overlaps", () => {
    for (const st of STARTERS) {
      const d = st.build();
      const pos = tidy(d.nodes, d.edges, [], { vertical: true });
      expect(overlaps(pos, d.nodes), st.id).toBeNull();
      const xs = new Set(Object.values(pos).map((p) => p.x));
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(2 * 260);
    }
  });
});
