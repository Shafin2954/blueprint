/**
 * Share a sheet as a link. The whole sheet is compressed into the URL's #fragment,
 * which browsers never send to a server — so sharing needs no backend and the
 * content stays between you and whoever you give the link to.
 * Images are left out (they'd make links enormous).
 */
import { KIND_META, type Edge, type Frame, type Kind, type PlanNode } from "./types";

export interface SharedSheet {
  project: string;
  nodes: Record<string, PlanNode>;
  edges: Record<string, Edge>;
  frames: Record<string, Frame>;
  counters: Record<Kind, number>;
}

const PREFIX = "#s=";
/** Bumped if the format ever changes, so old links can still be read. */
const VERSION = 1;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeSheet(sheet: SharedSheet): Promise<string> {
  const nodes = Object.fromEntries(
    Object.entries(sheet.nodes).map(([id, n]) => {
      const { image, ...rest } = n;
      return [id, image || rest.imageOmitted ? { ...rest, imageOmitted: true } : rest];
    }),
  );
  const json = JSON.stringify({ v: VERSION, ...sheet, nodes });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return toBase64Url(packed);
}

export async function decodeSheet(code: string): Promise<SharedSheet> {
  const raw = await pipe(fromBase64Url(code), new DecompressionStream("deflate-raw"));
  const d = JSON.parse(new TextDecoder().decode(raw));
  if (!d || typeof d !== "object" || !d.nodes || typeof d.nodes !== "object" || !d.edges || typeof d.edges !== "object") {
    throw new Error("Not a Blueprint sheet");
  }
  return sanitize(d);
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const KINDS = new Set(Object.keys(KIND_META));
const RELS = new Set(["feeds", "supports", "contradicts"]);
const STRENGTHS = new Set(["weak", "normal", "strong"]);
const STATUSES = new Set(["todo", "doing", "done"]);

/**
 * A link is untrusted input: rebuild every card, link and frame from known fields only.
 * Unknown kinds become thoughts; images are always dropped (a crafted link must not make
 * the viewer's browser fetch from somewhere).
 */
function sanitize(d: Record<string, unknown>): SharedSheet {
  const nodes: Record<string, PlanNode> = {};
  for (const [id, v] of Object.entries(d.nodes as Record<string, Record<string, unknown>>)) {
    if (!v || typeof v !== "object") continue;
    const kind = (KINDS.has(String(v.kind)) ? v.kind : "thought") as Kind;
    nodes[id] = {
      id,
      ref: str(v.ref, 12) || "?",
      kind,
      title: str(v.title, 300) || "Untitled",
      body: str(v.body),
      x: num(v.x),
      y: num(v.y),
      status: (STATUSES.has(String(v.status)) ? v.status : "todo") as PlanNode["status"],
      createdAt: num(v.createdAt),
      ...(typeof v.confidence === "number" ? { confidence: Math.max(0, Math.min(100, num(v.confidence, 50))) } : {}),
      ...(typeof v.link === "string" && /^https?:\/\//i.test(v.link) ? { link: str(v.link, 2000) } : {}),
      ...(typeof v.source === "string" ? { source: str(v.source, 120) } : {}),
      ...(v.image || v.imageOmitted ? { imageOmitted: true } : {}),
      ...(typeof v.w === "number" ? { w: Math.max(60, Math.min(2000, num(v.w))) } : {}),
      ...(typeof v.size === "number" ? { size: Math.max(8, Math.min(200, num(v.size))) } : {}),
      ...(v.plain === true ? { plain: true } : {}),
    };
  }
  const edges: Record<string, Edge> = {};
  for (const [id, v] of Object.entries(d.edges as Record<string, Record<string, unknown>>)) {
    if (!v || typeof v !== "object" || !nodes[String(v.from)] || !nodes[String(v.to)]) continue;
    edges[id] = {
      id,
      from: String(v.from),
      to: String(v.to),
      ...(RELS.has(String(v.rel)) ? { rel: v.rel as Edge["rel"] } : {}),
      ...(STRENGTHS.has(String(v.strength)) ? { strength: v.strength as Edge["strength"] } : {}),
    };
  }
  const frames: Record<string, Frame> = {};
  for (const [id, v] of Object.entries((d.frames ?? {}) as Record<string, Record<string, unknown>>)) {
    if (!v || typeof v !== "object") continue;
    frames[id] = { id, x: num(v.x), y: num(v.y), w: Math.max(40, num(v.w, 400)), h: Math.max(40, num(v.h, 300)), label: str(v.label, 80) || "Group" };
  }
  const counters = Object.fromEntries(
    Object.entries((d.counters ?? {}) as Record<string, unknown>).filter(([k]) => KINDS.has(k)).map(([k, v]) => [k, num(v)]),
  ) as Record<Kind, number>;
  return { project: str(d.project, 120) || "Shared sheet", nodes, edges, frames, counters };
}

export const shareCodeFromHash = (hash: string) => (hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null);

export function shareUrl(code: string): string {
  const base = `${location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
  return `${base}${PREFIX}${code}`;
}
