import { describe, expect, it } from "vitest";
import { nearestInDirection, nearestTo } from "../keyboard";
import { board } from "./fixtures";

describe("keyboard navigation", () => {
  // a(0,0)  b(300,0)  c(600,0)
  //         d(300,200)
  const b = board()
    .card("a", "thought", { x: 0, y: 0 })
    .card("b", "thought", { x: 300, y: 0 })
    .card("c", "thought", { x: 600, y: 0 })
    .card("d", "thought", { x: 300, y: 200 })
    .card("far", "thought", { x: 340, y: 900 });

  it("moves to the nearest card in a direction", () => {
    expect(nearestInDirection(b.nodes.a, "right", b.nodes)?.id).toBe("b");
    expect(nearestInDirection(b.nodes.b, "right", b.nodes)?.id).toBe("c");
    expect(nearestInDirection(b.nodes.b, "down", b.nodes)?.id).toBe("d");
    expect(nearestInDirection(b.nodes.d, "up", b.nodes)?.id).toBe("b");
  });

  it("prefers cards straight ahead over ones off to the side", () => {
    expect(nearestInDirection(b.nodes.a, "right", b.nodes)?.id).not.toBe("d");
  });

  it("returns nothing when there is no card that way", () => {
    expect(nearestInDirection(b.nodes.a, "left", b.nodes)).toBeNull();
    expect(nearestInDirection(b.nodes.a, "up", b.nodes)).toBeNull();
  });

  it("finds the card nearest a point", () => {
    expect(nearestTo(620, 30, b.nodes)?.id).toBe("c");
  });
});
