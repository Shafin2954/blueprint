"use client";

/**
 * Undo / redo for everything on the sheet.
 *
 * Rather than wrapping every action, this watches the store: whenever the board
 * content changes, the state from *before* the change is pushed onto the undo
 * stack. Changes that arrive in a quick burst (a drag, a run of keystrokes, a
 * compound action like Decompose) collapse into a single step.
 */
import { useSyncExternalStore } from "react";
import { usePlan } from "./store";
import type { Edge, Kind, PlanNode } from "./types";

interface Snapshot {
  project: string;
  nodes: Record<string, PlanNode>;
  edges: Record<string, Edge>;
  counters: Record<Kind, number>;
}

const LIMIT = 200;
/** Changes closer together than this are one step. */
const BURST_MS = 700;

let past: Snapshot[] = [];
let future: Snapshot[] = [];
let lastChange = 0;
let applying = false;
let started = false;
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

const snap = (s: Snapshot): Snapshot => ({ project: s.project, nodes: s.nodes, edges: s.edges, counters: s.counters });

/** Begin recording. Call once, after the saved board has loaded. */
export function startHistory() {
  if (started) return;
  started = true;
  usePlan.subscribe((state, prev) => {
    if (applying) return;
    if (state.nodes === prev.nodes && state.edges === prev.edges && state.project === prev.project) return;
    const now = performance.now();
    if (now - lastChange > BURST_MS) {
      past.push(snap(prev));
      if (past.length > LIMIT) past = past.slice(-LIMIT);
      future = [];
      emit();
    }
    lastChange = now;
  });
}

function apply(s: Snapshot) {
  applying = true;
  const cur = usePlan.getState();
  usePlan.setState({
    ...s,
    // Drop selection/gathering that point at cards which no longer exist.
    selection: cur.selection && (s.nodes[cur.selection.id] || s.edges[cur.selection.id]) ? cur.selection : null,
    gathered: cur.gathered.filter((g) => s.nodes[g]),
    linking: null,
  });
  applying = false;
  lastChange = 0; // the next edit always starts a fresh step
}

export function undo() {
  const prev = past.pop();
  if (!prev) return false;
  future.push(snap(usePlan.getState()));
  apply(prev);
  emit();
  return true;
}

export function redo() {
  const next = future.pop();
  if (!next) return false;
  past.push(snap(usePlan.getState()));
  apply(next);
  emit();
  return true;
}

/** Replace the board wholesale (e.g. switching sheets) without making it an undo step; history starts fresh. */
export function loadWithoutHistory(fn: () => void) {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
  past = [];
  future = [];
  lastChange = 0;
  emit();
}

/** Make the next change its own undo step, even if it follows quickly (e.g. a delete). */
export function checkpoint() {
  lastChange = 0;
}

export function useHistory() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  return { canUndo: past.length > 0, canRedo: future.length > 0 };
}

/** Show a short message with an Undo button (rendered by <Toast/> in the Planner). */
export function toastUndo(text: string) {
  window.dispatchEvent(new CustomEvent("blueprint-toast", { detail: { text, undo: true } }));
}

/** A plain message, no Undo button. */
export function toast(text: string) {
  window.dispatchEvent(new CustomEvent("blueprint-toast", { detail: { text, undo: false } }));
}

/** Delete a card or link as its own undo step, and offer to take it back. */
export function deleteWithUndo(sel: { type: "node" | "edge"; id: string }) {
  const s = usePlan.getState();
  checkpoint();
  if (sel.type === "node") {
    const n = s.nodes[sel.id];
    if (!n) return;
    const links = Object.values(s.edges).filter((e) => e.from === sel.id || e.to === sel.id).length;
    s.removeNode(sel.id);
    toastUndo(`Deleted ${n.ref}${links ? ` and ${links} link${links > 1 ? "s" : ""}` : ""}`);
  } else {
    if (!s.edges[sel.id]) return;
    s.removeEdge(sel.id);
    toastUndo("Deleted link");
  }
  checkpoint();
}
