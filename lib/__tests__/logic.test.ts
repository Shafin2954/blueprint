import { describe, expect, it } from "vitest";
import { chain, isDone, nextMoves, progress, wouldCycle } from "../graph";
import { balance, defaultRel } from "../reason";
import { findHoles } from "../holes";
import { suggestLinks, words } from "../insight";
import { boardToMarkdown } from "../exportMd";
import { board } from "./fixtures";

const titles = (b: ReturnType<typeof board>) => findHoles(b.nodes, b.edges).map((f) => f.title);

describe("graph", () => {
  it("refuses links that would loop back", () => {
    const b = board().card("a", "step").card("b", "step").card("c", "step").link("a", "b").link("b", "c");
    expect(wouldCycle("c", "a", b.edges)).toBe(true);
    expect(wouldCycle("a", "c", b.edges)).toBe(false);
    expect(wouldCycle("a", "a", b.edges)).toBe(true);
  });

  it("ignores contradictions when tracing dependencies", () => {
    const b = board().card("a", "claim").card("b", "claim").link("a", "b", "contradicts");
    expect(wouldCycle("b", "a", b.edges)).toBe(false);
  });

  it("derives milestone completion from the steps feeding it", () => {
    const b = board()
      .card("t1", "step", { status: "done" })
      .card("t2", "step")
      .card("m", "milestone")
      .link("t1", "m")
      .link("t2", "m");
    expect(isDone("m", b.nodes, b.edges)).toBe(false);
    b.nodes.t2.status = "done";
    expect(isDone("m", b.nodes, { ...b.edges })).toBe(true);
  });

  it("lists only unblocked steps as next moves, doing first", () => {
    const b = board()
      .card("t1", "step")
      .card("t2", "step")
      .card("t3", "step", { status: "doing" })
      .card("g", "goal")
      .link("t1", "t2")
      .link("t2", "g")
      .link("t3", "g");
    const moves = nextMoves(b.nodes, b.edges).map((m) => m.node.id);
    expect(moves).toEqual(["t3", "t1"]); // t2 is blocked by t1
    expect(progress("g", b.nodes, b.edges)).toEqual({ done: 0, total: 3 });
  });

  it("lights up a card's whole chain", () => {
    const b = board().card("a", "step").card("b", "step").card("c", "goal").card("z", "step").link("a", "b").link("b", "c");
    expect([...chain("b", b.edges).nodes].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("weighing", () => {
  it("adds each supporting card's confidence, and contradictions from either end", () => {
    const b = board()
      .card("e1", "evidence", { confidence: 70 })
      .card("e2", "evidence", { confidence: 85 })
      .card("c", "claim", { confidence: 50 })
      .link("e1", "c", "supports")
      .link("c", "e2", "contradicts"); // direction doesn't matter for contradictions
    const bal = balance("c", b.nodes, b.edges);
    expect(bal.forW).toBe(70);
    expect(bal.againstW).toBe(85);
    expect(bal.score).toBeCloseTo(70 / 155);
  });

  it("counts cards from the same source once, at the strongest", () => {
    const b = board()
      .card("e1", "evidence", { confidence: 70, source: "Mum" })
      .card("e2", "evidence", { confidence: 60, source: " mum " })
      .card("e3", "evidence", { confidence: 50, source: "Door cam" })
      .card("c", "claim")
      .link("e1", "c", "supports")
      .link("e2", "c", "supports")
      .link("e3", "c", "supports");
    const bal = balance("c", b.nodes, b.edges);
    expect(bal.forW).toBe(120);
    expect(bal.echoes).toBe(1);
  });

  it("scales each link by its strength", () => {
    const b = board()
      .card("e1", "evidence", { confidence: 60 })
      .card("e2", "evidence", { confidence: 60 })
      .card("c", "claim")
      .link("e1", "c", "supports")
      .link("e2", "c", "contradicts");
    b.edges.x0.strength = "strong";
    b.edges.x1.strength = "weak";
    const bal = balance("c", b.nodes, { ...b.edges });
    expect(bal.forW).toBe(90);
    expect(bal.againstW).toBe(30);
  });

  it("passes support along a chain: a claim whose own evidence leans against it counts for less", () => {
    const b = board()
      .card("e1", "evidence", { confidence: 70 })
      .card("e2", "evidence", { confidence: 85 })
      .card("c", "claim", { confidence: 80 })
      .card("d", "conclusion")
      .link("e1", "c", "supports")
      .link("e2", "c", "contradicts")
      .link("c", "d", "supports");
    // c's own evidence: 70 for, 85 against → score 70/155; it lends d 80 × 0.45 ≈ 36, not 80
    expect(balance("d", b.nodes, b.edges).forW).toBe(Math.round(80 * (70 / 155)));
  });

  it("calls one reason too little to judge", async () => {
    const { isThin } = await import("../reason");
    const b = board().card("e", "evidence", { confidence: 90 }).card("c", "claim").link("e", "c", "supports");
    expect(isThin(balance("c", b.nodes, b.edges))).toBe(true);
  });

  it("returns no score when nothing bears on a card", () => {
    const b = board().card("c", "claim");
    expect(balance("c", b.nodes, b.edges).score).toBeNull();
  });

  it("picks link meanings from the kinds being joined", () => {
    expect(defaultRel("evidence", "claim")).toBe("supports");
    expect(defaultRel("step", "goal")).toBe("feeds");
    expect(defaultRel("snippet", "step")).toBe("feeds");
  });
});

describe("plot holes", () => {
  it("flags a conclusion with nothing under it as a leap", () => {
    expect(titles(board().card("d", "conclusion"))).toContain("A leap");
  });

  it("flags being more sure than your best reason", () => {
    const b = board()
      .card("c", "claim", { confidence: 40 })
      .card("d", "conclusion", { confidence: 90 })
      .card("e", "evidence", { confidence: 80, body: "seen" })
      .link("e", "c", "supports")
      .link("c", "d", "supports");
    expect(titles(b)).toContain("More sure than your reasons");
  });

  it("flags a confident belief that the evidence weighs against", () => {
    const b = board()
      .card("c", "claim", { confidence: 80 })
      .card("e1", "evidence", { confidence: 70, body: "x" })
      .card("e2", "evidence", { confidence: 85, body: "y" })
      .link("e1", "c", "supports")
      .link("e2", "c", "contradicts");
    expect(titles(b)).toContain("Belief vs. evidence");
  });

  it("does not call evidence against a claim a contradiction hole", () => {
    const b = board()
      .card("c", "claim", { confidence: 40 })
      .card("e", "evidence", { confidence: 85, body: "x" })
      .link("e", "c", "contradicts");
    const t = titles(b);
    expect(t).not.toContain("Holding both sides");
    expect(t).not.toContain("Inconvenient evidence");
  });

  it("doesn't call two 50% ('no idea') claims 'holding both sides'", () => {
    const b = board().card("a", "claim", { confidence: 50 }).card("b", "claim", { confidence: 50 }).link("a", "b", "contradicts");
    expect(titles(b)).not.toContain("Holding both sides");
  });

  it("flags holding both sides of a contradiction", () => {
    const b = board()
      .card("a", "claim", { confidence: 70 })
      .card("b", "claim", { confidence: 60 })
      .link("a", "b", "contradicts");
    expect(titles(b)).toContain("Holding both sides");
  });

  it("flags conclusions built only on beliefs", () => {
    const b = board().card("c", "claim").card("d", "conclusion").link("c", "d", "supports");
    expect(titles(b)).toContain("Built only on beliefs");
  });

  it("flags untested assumptions until a step feeds them", () => {
    const b = board().card("a", "assumption").card("g", "goal").link("a", "g");
    expect(titles(b)).toContain("Untested assumption");
    b.card("t", "step").link("t", "a");
    expect(findHoles(b.nodes, { ...b.edges }).map((f) => f.title)).not.toContain("Untested assumption");
  });

  it("flags a goal with no steps as a wish", () => {
    expect(titles(board().card("g", "goal"))).toContain("A wish, not a plan");
  });

  it("flags project-sized steps", () => {
    expect(titles(board().card("t", "step", { title: "Build the whole app" }))).toContain("That's not a 30-minute step");
  });

  it("accepts a named source as tracing evidence back", () => {
    expect(titles(board().card("e", "evidence"))).toContain("Where did this come from?");
    expect(titles(board().card("e", "evidence", { source: "Mum" }))).not.toContain("Where did this come from?");
  });

  it("notes repeated sources", () => {
    const b = board()
      .card("e1", "evidence", { source: "TV", body: "a" })
      .card("e2", "evidence", { source: "TV", body: "b" })
      .card("c", "claim")
      .link("e1", "c", "supports")
      .link("e2", "c", "supports");
    expect(titles(b)).toContain("Same source, counted once");
  });

  it("orders holes before gaps before notes", () => {
    const b = board().card("g", "goal").card("d", "conclusion").card("e", "evidence");
    const sev = findHoles(b.nodes, b.edges).map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((x, y) => ["hole", "gap", "note"].indexOf(x) - ["hole", "gap", "note"].indexOf(y)));
  });
});

describe("insight", () => {
  it("stems and drops stop words", () => {
    const w = words("The students don't trust answers");
    expect(w.has("student")).toBe(true);
    expect(w.has("answer")).toBe(true);
    expect(w.has("the")).toBe(false);
  });

  it("suggests links between unlinked cards that share rare words", () => {
    const b = board()
      .card("a", "thought", { title: "Students distrust AI answers" })
      .card("b", "thought", { title: "Show where AI answers came from" })
      .card("c", "thought", { title: "I like gardening" });
    const s = suggestLinks(b.nodes, b.edges, new Set());
    expect(s).toHaveLength(1);
    expect([s[0].a, s[0].b].sort()).toEqual(["a", "b"]);
  });
});

describe("frames", () => {
  it("counts a card as inside when its middle is inside", async () => {
    const { membersOf, fitAround } = await import("../frames");
    const b = board().card("a", "thought", { x: 0, y: 0 }).card("b", "thought", { x: 500, y: 0 });
    const f = { id: "f", label: "G", ...fitAround([b.nodes.a]) };
    expect(membersOf(f, b.nodes)).toEqual(["a"]);
    const md = boardToMarkdown("P", b.nodes, b.edges, false, { f });
    expect(md).toContain("**G**: T-01");
  });
});

describe("markdown export", () => {
  it("includes cards, sources, links, weights and the request", () => {
    const b = board()
      .card("e", "evidence", { title: "Crumbs", confidence: 70, source: "Mum", link: "https://example.com" })
      .card("c", "claim", { title: "Dog did it", confidence: 80 })
      .link("e", "c", "supports");
    const md = boardToMarkdown("Cake", b.nodes, b.edges);
    expect(md).toContain("# Cake");
    expect(md).toContain("consistency");
    expect(md).toContain("**E-01** _(70% sure)_ — Crumbs");
    expect(md).toContain("From: Mum");
    expect(md).toContain("E-01 **supports** C-01");
    expect(md).toContain("for 70");
    expect(boardToMarkdown("Cake", b.nodes, b.edges, false)).not.toContain("What I'd like from you");
  });
});
