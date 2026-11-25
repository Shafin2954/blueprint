import { describe, expect, it } from "vitest";
import { describeAction, parseCommand, resolveRef, unknownRefs } from "../command";
import { board } from "./fixtures";

const add = (s: string) => {
  const p = parseCommand(s);
  expect(p.errors).toEqual([]);
  if (p.action?.type !== "add") throw new Error("not add");
  return p.action;
};

describe("command bar parser", () => {
  it("parses a kind, title and fields", () => {
    const a = add("/evidence Rent is 30% cheaper, desc: from the listings site, conf: 75, from: Zillow, for: C-01");
    expect(a).toMatchObject({ kind: "evidence", title: "Rent is 30% cheaper", body: "from the listings site", confidence: 75, source: "Zillow" });
    expect(a.links).toEqual([{ dir: "out", ref: "C-01", rel: "supports" }]);
  });

  it("keeps commas that aren't followed by a field name", () => {
    const a = add("/claim Move, then rent somewhere small, conf: 55%");
    expect(a.title).toBe("Move, then rent somewhere small");
    expect(a.confidence).toBe(55);
  });

  it("plain text is a thought; a plain question is a question", () => {
    expect(add("Dogs need daily walks")).toMatchObject({ kind: "thought", title: "Dogs need daily walks" });
    expect(add("Should I switch to a standing desk?")).toMatchObject({ kind: "question" });
  });

  it("understands short forms and link directions", () => {
    const a = add("/e Vet bills add up, against: c-01, because: E-02 E-03, strength: strong");
    expect(a.kind).toBe("evidence");
    expect(a.links).toEqual([
      { dir: "out", ref: "c-01", rel: "contradicts" },
      { dir: "in", ref: "E-02", rel: "supports" },
      { dir: "in", ref: "E-03", rel: "supports" },
    ]);
    expect(a.strength).toBe("strong");
    const s = add("/step Book a week there, after: T-01, to: G-01, status: doing");
    expect(s.links).toEqual([{ dir: "in", ref: "T-01", rel: "feeds" }, { dir: "out", ref: "G-01", rel: "feeds" }]);
    expect(s.status).toBe("doing");
    expect(add("/claim Yes, answers: Q-01").links).toEqual([{ dir: "out", ref: "Q-01", rel: "supports" }]);
  });

  it("a second command typed over a first one wins", () => {
    expect(add("/goal /step Measure the desk, to: G-01").kind).toBe("step");
    expect(add("/goal /step Measure the desk, to: G-01").title).toBe("Measure the desk");
  });

  it("parses /link", () => {
    expect(parseCommand("/link E-01 C-02 contradicts strong").action).toEqual({ type: "link", from: "E-01", to: "C-02", rel: "contradicts", strength: "strong" });
    expect(parseCommand("/link E-01 C-02").action).toMatchObject({ rel: "supports" });
  });

  it("explains mistakes instead of guessing", () => {
    expect(parseCommand("/evidance Something").errors[0]).toMatch(/Did you mean \/evidence/);
    expect(parseCommand("/claim X, conf: 150").errors[0]).toMatch(/0–100/);
    expect(parseCommand("/goal X, conf: 50").errors[0]).toMatch(/only applies/);
    expect(parseCommand("/claim").errors[0]).toMatch(/title/);
    expect(parseCommand("/claim X, for: banana").errors[0]).toMatch(/isn't a card ref/);
    expect(parseCommand("/link E-01").errors[0]).toMatch(/Usage/);
  });

  it("resolves refs, flags unknown ones, and previews the result", () => {
    const b = board().card("c", "claim", { title: "Get a dog" });
    const a = add("/evidence Walks, for: C-01 C-09, conf: 80");
    expect(unknownRefs(a, b.nodes, null)).toEqual(["C-09"]);
    expect(resolveRef("last", b.nodes, "c")?.id).toBe("c");
    expect(describeAction(a, b.nodes, null)).toBe("Add evidence “Walks” · 80% sure · supports C-01 “Get a dog” · supports C-09");
  });
});

describe("double slash", () => {
  it("treats //claim like /claim", () => {
    expect(parseCommand("//claim Test").action).toMatchObject({ type: "add", kind: "claim", title: "Test" });
  });
});
