/**
 * Share a sheet as a link. The whole sheet is compressed into the URL's #fragment,
 * which browsers never send to a server — so sharing needs no backend and the
 * content stays between you and whoever you give the link to.
 * Images are left out (they'd make links enormous).
 */
import type { Edge, Frame, Kind, PlanNode } from "./types";

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
  if (!d || typeof d !== "object" || !d.nodes || !d.edges) throw new Error("Not a Blueprint sheet");
  return { project: String(d.project ?? "Shared sheet"), nodes: d.nodes, edges: d.edges, frames: d.frames ?? {}, counters: d.counters ?? {} };
}

export const shareCodeFromHash = (hash: string) => (hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null);

export function shareUrl(code: string): string {
  const base = `${location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
  return `${base}${PREFIX}${code}`;
}
