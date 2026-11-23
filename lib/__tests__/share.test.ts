import { describe, expect, it } from "vitest";
import { decodeSheet, encodeSheet, shareCodeFromHash } from "../shareLink";
import { STARTERS } from "../starters";

describe("share links", () => {
  it("round-trips a sheet through the link", async () => {
    const sh = STARTERS.find((s) => s.id === "move")!.build();
    const code = await encodeSheet({ ...sh, frames: {} });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe
    const back = await decodeSheet(code);
    expect(back.project).toBe(sh.project);
    expect(Object.keys(back.nodes)).toEqual(Object.keys(sh.nodes));
    expect(back.edges).toEqual(sh.edges);
  });

  it("leaves images out but notes they existed", async () => {
    const sh = STARTERS[0].build();
    const id = Object.keys(sh.nodes)[0];
    sh.nodes[id].image = "idb:abc";
    const back = await decodeSheet(await encodeSheet({ ...sh, frames: {} }));
    expect(back.nodes[id].image).toBeUndefined();
    expect(back.nodes[id].imageOmitted).toBe(true);
  });

  it("compresses: a typical sheet fits comfortably in a link", async () => {
    const sh = STARTERS.find((s) => s.id === "cake")!.build();
    expect((await encodeSheet({ ...sh, frames: {} })).length).toBeLessThan(2500);
  });

  it("rejects garbage", async () => {
    await expect(decodeSheet("not-a-real-code")).rejects.toThrow();
  });

  it("reads the code from the URL fragment", () => {
    expect(shareCodeFromHash("#s=abc")).toBe("abc");
    expect(shareCodeFromHash("#other")).toBeNull();
  });
});
