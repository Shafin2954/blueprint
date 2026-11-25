"use client";

import { useDeferredValue, useMemo } from "react";
import { findHoles, type Flag } from "./holes";
import { usePlan } from "./store";

/** Current flags, minus anything the user dismissed. */
export function useHoles(): Flag[] {
  // Deferred: while you type, the keystroke paints first and the checks catch up just after.
  const nodes = useDeferredValue(usePlan((s) => s.nodes));
  const edges = useDeferredValue(usePlan((s) => s.edges));
  const dismissed = usePlan((s) => s.dismissed);
  return useMemo(() => {
    const skip = new Set(dismissed);
    return findHoles(nodes, edges).filter((f) => !skip.has(f.key));
  }, [nodes, edges, dismissed]);
}
