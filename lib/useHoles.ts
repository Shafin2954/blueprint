"use client";

import { useMemo } from "react";
import { findHoles, type Flag } from "./holes";
import { usePlan } from "./store";

/** Current flags, minus anything the user dismissed. */
export function useHoles(): Flag[] {
  const nodes = usePlan((s) => s.nodes);
  const edges = usePlan((s) => s.edges);
  const dismissed = usePlan((s) => s.dismissed);
  return useMemo(() => {
    const skip = new Set(dismissed);
    return findHoles(nodes, edges).filter((f) => !skip.has(f.key));
  }, [nodes, edges, dismissed]);
}
