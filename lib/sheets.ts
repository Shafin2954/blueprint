"use client";

/**
 * Several sheets per browser.
 *
 * The open sheet lives in the main store (persisted as before). Every other sheet
 * is parked in its own localStorage slot. Switching parks the current one and
 * unparks the target, so no sheet is ever stored twice (images are big).
 */
import { useSyncExternalStore } from "react";
import { usePlan } from "./store";
import { historyImageRefs, loadWithoutHistory } from "./history";
import { collectGarbage, internImages, listStoredRefs } from "./images";
import { KINDS, type Edge, type Frame, type Kind, type PlanNode, type View } from "./types";

export interface SheetData {
  project: string;
  nodes: Record<string, PlanNode>;
  edges: Record<string, Edge>;
  frames?: Record<string, Frame>;
  counters: Record<Kind, number>;
  view?: View;
  dismissed?: string[];
}

export interface SheetMeta {
  id: string;
  name: string;
  cards: number;
  updatedAt: number;
}

const INDEX = "blueprint-sheets-v1";
const slot = (id: string) => `blueprint-sheet:${id}`;
const newId = () => Math.random().toString(36).slice(2, 10);
const BLANK_VIEW: View = { x: 80, y: 90, k: 0.85 };

let index: SheetMeta[] = [];
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

function readIndex(): SheetMeta[] {
  try {
    const raw = localStorage.getItem(INDEX);
    return raw ? (JSON.parse(raw) as SheetMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex() {
  try {
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    window.dispatchEvent(new CustomEvent("blueprint-storage-full"));
  }
  emit();
}

function currentData(): SheetData {
  const { project, nodes, edges, frames, counters, view, dismissed } = usePlan.getState();
  return { project, nodes, edges, frames, counters, view, dismissed };
}

/** Keep the open sheet's entry in the list current (name, size, last edit). */
function touchCurrent() {
  const s = usePlan.getState();
  if (s.viewing) return; // a shared sheet being viewed isn't one of yours
  const meta: SheetMeta = { id: s.sheetId, name: s.project || "Untitled", cards: Object.keys(s.nodes).length, updatedAt: Date.now() };
  const i = index.findIndex((m) => m.id === s.sheetId);
  if (i >= 0) index[i] = meta;
  else index.unshift(meta);
  writeIndex();
}

let started = false;

/** Call once after the store has loaded. Migrates a pre-sheets board into sheet #1. */
export function startSheets() {
  if (started) return;
  started = true;
  index = readIndex();
  if (!usePlan.getState().sheetId) usePlan.setState({ sheetId: newId() });
  // Drop index entries whose slot vanished (cleared storage), except the open one.
  const open = usePlan.getState().sheetId;
  index = index.filter((m) => m.id === open || localStorage.getItem(slot(m.id)) !== null);
  touchCurrent();

  let timer: ReturnType<typeof setTimeout> | undefined;
  usePlan.subscribe((s, prev) => {
    if (s.nodes === prev.nodes && s.edges === prev.edges && s.project === prev.project && s.sheetId === prev.sheetId) return;
    clearTimeout(timer);
    timer = setTimeout(touchCurrent, 400);
  });
}

/** Park the open sheet in its slot. Returns false if storage is full. */
function park(): boolean {
  const s = usePlan.getState();
  // A shared sheet being viewed isn't yours to keep: leaving it just drops it
  // (your own sheet is already parked under viewing.returnTo).
  if (s.viewing) return true;
  try {
    localStorage.setItem(slot(s.sheetId), JSON.stringify(currentData()));
    return true;
  } catch {
    window.dispatchEvent(new CustomEvent("blueprint-storage-full"));
    return false;
  }
}

function open(id: string, data: SheetData, viewing: { returnTo: string } | null = null) {
  loadWithoutHistory(() =>
    usePlan.setState({
      viewing,
      sheetId: id,
      project: data.project,
      nodes: data.nodes,
      edges: data.edges,
      frames: data.frames ?? {},
      counters: { ...(Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>), ...data.counters },
      view: data.view ?? BLANK_VIEW,
      dismissed: data.dismissed ?? [],
      selection: null,
      gathered: [],
      linking: null,
    }),
  );
}

export function switchSheet(id: string): boolean {
  const s = usePlan.getState();
  if (id === s.sheetId) return true;
  const raw = localStorage.getItem(slot(id));
  if (!raw) return false;
  touchCurrent();
  if (!park()) return false;
  open(id, JSON.parse(raw) as SheetData);
  localStorage.removeItem(slot(id));
  touchCurrent();
  return true;
}

/** Open a new sheet (blank, or with the given content). The current one is kept. */
export function newSheet(data?: SheetData): boolean {
  touchCurrent();
  if (!park()) return false;
  const id = newId();
  open(id, data ?? { project: "Untitled", nodes: {}, edges: {}, counters: {} as Record<Kind, number> });
  touchCurrent();
  return true;
}

export function duplicateSheet(id: string): boolean {
  const data: SheetData | null = id === usePlan.getState().sheetId ? currentData() : JSON.parse(localStorage.getItem(slot(id)) ?? "null");
  if (!data) return false;
  const copy = { ...data, project: `${data.project || "Untitled"} (copy)` };
  const nid = newId();
  try {
    localStorage.setItem(slot(nid), JSON.stringify(copy));
  } catch {
    window.dispatchEvent(new CustomEvent("blueprint-storage-full"));
    return false;
  }
  const at = index.findIndex((m) => m.id === id);
  index.splice(at + 1, 0, { id: nid, name: copy.project, cards: Object.keys(copy.nodes).length, updatedAt: Date.now() });
  writeIndex();
  return true;
}

export function renameSheet(id: string, name: string) {
  if (id === usePlan.getState().sheetId) {
    usePlan.getState().setProject(name);
    return;
  }
  const raw = localStorage.getItem(slot(id));
  if (!raw) return;
  const data = JSON.parse(raw) as SheetData;
  data.project = name;
  try {
    localStorage.setItem(slot(id), JSON.stringify(data));
  } catch {
    return;
  }
  const m = index.find((x) => x.id === id);
  if (m) m.name = name;
  writeIndex();
}

/** Delete a sheet. Deleting the open one switches to the most recent other (or a blank). */
export function deleteSheet(id: string) {
  if (id === usePlan.getState().sheetId) {
    const other = index.filter((m) => m.id !== id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const data: SheetData = other
      ? (JSON.parse(localStorage.getItem(slot(other.id)) ?? "null") as SheetData)
      : { project: "Untitled", nodes: {}, edges: {}, counters: {} as Record<Kind, number> };
    const target = other?.id ?? newId();
    open(target, data);
    if (other) localStorage.removeItem(slot(other.id));
  } else {
    localStorage.removeItem(slot(id));
  }
  index = index.filter((m) => m.id !== id);
  touchCurrent();
}

export function useSheets(): SheetMeta[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Move any inline (data:) images on the open sheet into the image store.
 * Patches only image fields, only if the same sheet is still open, and never as an
 * undo step — safe to run while the user keeps working.
 */
export async function internOpenSheet() {
  const sheetId = usePlan.getState().sheetId;
  const moved = await internImages(usePlan.getState().nodes);
  if (!moved || usePlan.getState().sheetId !== sheetId) return;
  loadWithoutHistory(() =>
    usePlan.setState((s) => {
      const nodes = { ...s.nodes };
      for (const [id, n] of Object.entries(moved)) {
        // Only replace an image that's still the same inline one we converted.
        if (nodes[id] && nodes[id].image?.startsWith("data:") && n.image !== nodes[id].image) nodes[id] = { ...nodes[id], image: n.image };
      }
      return { nodes };
    }),
  );
}

/**
 * Housekeeping, run once after startup:
 * 1. move inline (data:) images on every sheet into the image store, shrinking the sheets;
 * 2. delete stored images that nothing refers to any more.
 */
export async function maintainImages() {
  // Snapshot the candidates first: anything stored after this line is never deleted.
  const candidates = await listStoredRefs();

  await internOpenSheet();
  for (const m of index) {
    if (m.id === usePlan.getState().sheetId) continue;
    const raw = localStorage.getItem(slot(m.id));
    if (!raw) continue;
    const data = JSON.parse(raw) as SheetData;
    const moved = await internImages(data.nodes);
    if (moved) {
      data.nodes = moved;
      try {
        localStorage.setItem(slot(m.id), JSON.stringify(data));
      } catch {
        /* keep the old copy */
      }
    }
  }

  // Everything that could still show an image: every sheet (re-read now), and undo history.
  const inUse = new Set<string>(historyImageRefs());
  const note = (nodes: Record<string, PlanNode>) => Object.values(nodes).forEach((n) => n.image && inUse.add(n.image));
  note(usePlan.getState().nodes);
  for (const m of index) {
    const raw = localStorage.getItem(slot(m.id));
    if (raw) note((JSON.parse(raw) as SheetData).nodes);
  }
  const s = usePlan.getState();
  if (s.viewing) {
    const raw = localStorage.getItem(slot(s.viewing.returnTo));
    if (raw) note((JSON.parse(raw) as SheetData).nodes);
  }
  return collectGarbage(candidates, inUse);
}

// ── Viewing a shared link ──

/** Show a shared sheet read-only. Your open sheet is parked and comes back on close. */
export function enterViewer(data: SheetData): boolean {
  const s = usePlan.getState();
  if (s.viewing) {
    open(s.sheetId, data, s.viewing); // already viewing: just swap the content
    return true;
  }
  touchCurrent();
  if (!park()) return false;
  open(`view-${newId()}`, data, { returnTo: s.sheetId });
  return true;
}

/** Leave the shared sheet and reopen what you had before. */
export function exitViewer() {
  const s = usePlan.getState();
  if (!s.viewing) return;
  const back = s.viewing.returnTo;
  const raw = localStorage.getItem(slot(back));
  const data: SheetData = raw ? JSON.parse(raw) : { project: "Untitled", nodes: {}, edges: {}, counters: {} as Record<Kind, number> };
  open(raw ? back : newId(), data);
  if (raw) localStorage.removeItem(slot(back));
  touchCurrent();
}

/** Keep the shared sheet: it becomes one of your own sheets (your previous one stays in the list). */
export function keepSharedCopy() {
  const s = usePlan.getState();
  if (!s.viewing) return;
  usePlan.setState({ viewing: null, sheetId: newId(), project: s.project });
  touchCurrent();
}
