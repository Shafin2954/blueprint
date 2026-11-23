import { describe, expect, it } from "vitest";
import { STARTERS } from "../starters";
import { findHoles } from "../holes";
import { balance } from "../reason";

describe("starters", () => {
  for (const st of STARTERS) {
    it(`${st.id} builds a valid sheet`, () => {
      const sh = st.build();
      const refs = Object.values(sh.nodes).map((n) => n.ref);
      expect(new Set(refs).size).toBe(refs.length);
      for (const e of Object.values(sh.edges)) {
        expect(sh.nodes[e.from], `edge from in ${st.id}`).toBeDefined();
        expect(sh.nodes[e.to], `edge to in ${st.id}`).toBeDefined();
      }
      // Every tour step that points at a card points at one that exists.
      for (const step of st.tour ?? []) if (step.focus) expect(refs).toContain(step.focus);
    });
  }

  it("templates are bare structure with placeholders", () => {
    for (const st of STARTERS.filter((s) => s.type === "template")) {
      for (const n of Object.values(st.build().nodes)) expect(n.title).toMatch(/^\[.+\]$/);
    }
  });

  it("the cake tour describes what the checker really says", () => {
    const sh = STARTERS.find((s) => s.id === "cake")!.build();
    const titles = findHoles(sh.nodes, sh.edges).map((f) => f.title);
    expect(titles).toContain("Belief vs. evidence");
    expect(titles).toContain("More sure than your reasons");
    const dog = Object.values(sh.nodes).find((n) => n.title === "The dog took it")!;
    expect(balance(dog.id, sh.nodes, sh.edges).score!).toBeLessThan(0.5);
  });
});
