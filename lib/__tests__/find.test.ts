import { describe, expect, it } from "vitest";
import { findCards, stem } from "../find";
import { board } from "./fixtures";

describe("find", () => {
  it("stems common endings", () => {
    for (const w of ["cooking", "cooked", "cooks", "cook"]) expect(stem(w)).toBe("cook");
    expect(stem("salaries")).toBe("salary");
    expect(stem("planning")).toBe("plan");
  });

  it("matches different forms of a word", () => {
    const b = board().card("a", "claim", { title: "Yes, learning to cook pays off" }).card("b", "evidence", { title: "Junior designer salaries are lower" });
    for (const q of ["cooking", "cooked", "cooks", "cook"]) expect(findCards(b.nodes, q).map((n) => n.id), q).toEqual(["a"]);
    expect(findCards(b.nodes, "salary").map((n) => n.id)).toEqual(["b"]);
    expect(findCards(b.nodes, "learn").map((n) => n.id)).toEqual(["a"]);
    expect(findCards(b.nodes, "gardening")).toEqual([]);
  });
});
