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
