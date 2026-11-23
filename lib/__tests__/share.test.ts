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

  it("treats a link as untrusted: bad kinds, remote images and dangling links are cleaned", async () => {
    const evil = {
      project: "x",
      nodes: {
        a: { kind: "nope", title: 42, x: "1", image: "https://tracker.example/p.png", link: "javascript:alert(1)" },
        b: { kind: "claim", title: "ok", confidence: 900 },
      },
      edges: { e1: { from: "a", to: "b", rel: "supports" }, e2: { from: "a", to: "ghost" } },
      frames: { f: { x: "?", label: 7 } },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(evil));
    const packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    const code = Buffer.from(packed).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const d = await decodeSheet(code);
    expect(d.nodes.a.kind).toBe("thought");
    expect(d.nodes.a.title).toBe("Untitled");
    expect(d.nodes.a.image).toBeUndefined();
    expect(d.nodes.a.imageOmitted).toBe(true);
    expect(d.nodes.a.link).toBeUndefined();
    expect(d.nodes.b.confidence).toBe(100);
    expect(Object.keys(d.edges)).toEqual(["e1"]);
    expect(d.frames.f.label).toBe("Group");
  });

  it("rejects garbage", async () => {
    await expect(decodeSheet("not-a-real-code")).rejects.toThrow();
  });

  it("reads the code from the URL fragment", () => {
    expect(shareCodeFromHash("#s=abc")).toBe("abc");
    expect(shareCodeFromHash("#other")).toBeNull();
  });
});
