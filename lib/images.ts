"use client";

/**
 * Card images live in IndexedDB as Blobs, not inside the sheet JSON.
 * A card's `image` is then a short reference: "idb:<key>".
 *
 * localStorage holds ~5 MB and base64 inflates images by a third, so a handful of
 * photos used to fill it. IndexedDB typically allows hundreds of MB.
 * Old boards (image = "data:…") keep working and are migrated on startup.
 */
import { useEffect, useState } from "react";
import type { PlanNode } from "./types";

const DB = "blueprint-images";
const STORE = "images";
const PREFIX = "idb:";

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const isStoredRef = (ref?: string) => !!ref && ref.startsWith(PREFIX);

/** Save an image Blob; returns the reference to put on the card. */
export async function storeImage(blob: Blob): Promise<string> {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await tx("readwrite", (s) => s.put(blob, key));
  return PREFIX + key;
}

const urls = new Map<string, string>();

/** A URL the <img> can show: object URL for stored images, or the value itself (data:/https:). */
export async function imageUrl(ref: string): Promise<string | null> {
  if (!isStoredRef(ref)) return ref;
  const hit = urls.get(ref);
  if (hit) return hit;
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(ref.slice(PREFIX.length)) as IDBRequest<Blob | undefined>).catch(
    () => undefined,
  );
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(ref, u);
  return u;
}

/** React hook: resolve a card's image reference to something <img> can show. `null` = missing. */
export function useImageSrc(ref?: string): string | null | undefined {
  const [src, setSrc] = useState<{ ref?: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!ref) return;
    let live = true;
    imageUrl(ref).then((url) => live && setSrc({ ref, url }));
    return () => {
      live = false;
    };
  }, [ref]);
  if (!ref) return undefined;
  if (!isStoredRef(ref)) return ref;
  return src?.ref === ref ? src.url : undefined; // undefined = still loading
}

/** For export: turn a stored reference back into an embeddable data URL. */
export async function refToDataUrl(ref: string): Promise<string | null> {
  if (!isStoredRef(ref)) return ref;
  const blob = await tx<Blob | undefined>("readonly", (s) => s.get(ref.slice(PREFIX.length)) as IDBRequest<Blob | undefined>).catch(
    () => undefined,
  );
  if (!blob) return null;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

/** Cards' images as stored references: moves any inline data URLs into IndexedDB. */
export async function internImages(nodes: Record<string, PlanNode>): Promise<Record<string, PlanNode> | null> {
  const inline = Object.values(nodes).filter((n) => n.image?.startsWith("data:"));
  if (!inline.length) return null;
  const out = { ...nodes };
  for (const n of inline) {
    try {
      const blob = await (await fetch(n.image!)).blob();
      out[n.id] = { ...n, image: await storeImage(blob) };
    } catch {
      // leave it inline; it still displays
    }
  }
  return out;
}

/** Cards with stored images, copied with the images embedded (for a self-contained export). */
export async function embedImages(nodes: Record<string, PlanNode>): Promise<Record<string, PlanNode>> {
  const out = { ...nodes };
  for (const n of Object.values(nodes)) {
    if (!isStoredRef(n.image)) continue;
    const data = await refToDataUrl(n.image!);
    out[n.id] = { ...n, image: data ?? undefined };
  }
  return out;
}

/** Delete stored images that no card on any sheet refers to any more. */
export async function collectGarbage(inUse: Set<string>) {
  const keys = (await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).catch(() => [])) as string[];
  const dead = keys.filter((k) => !inUse.has(PREFIX + k));
  for (const k of dead) await tx("readwrite", (s) => s.delete(k)).catch(() => {});
  return dead.length;
}
