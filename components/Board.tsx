"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlan } from "@/lib/store";
import { chain, isDone } from "@/lib/graph";
import { useHoles } from "@/lib/useHoles";
import type { Severity } from "@/lib/holes";
import { ANCHOR_Y, NODE_W, type Kind, type PlanNode } from "@/lib/types";
import { imageToDataUrl, isUrl } from "@/lib/image";
import NodeCard from "./NodeCard";

type Gesture =
  | { mode: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { mode: "drag"; id: string; ox: number; oy: number; moved: boolean }
  | { mode: "connect"; from: string; x: number; y: number }
  | { mode: "pinch"; d0: number; k0: number; vx: number; vy: number; mx: number; my: number }
  | null;

function edgePath(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.max(70, Math.abs(bx - ax) / 2);
  return `M ${ax} ${ay} C ${ax + dx} ${ay}, ${bx - dx} ${by}, ${bx} ${by}`;
}

/** Point halfway along the same cubic, for the relation glyph. */
function edgeMid(ax: number, ay: number, bx: number, by: number) {
  const dx = Math.max(70, Math.abs(bx - ax) / 2);
  return { x: (ax + 3 * (ax + dx) + 3 * (bx - dx) + bx) / 8, y: (ay + 3 * ay + 3 * by + by) / 8 };
}

const SEV_RANK: Record<Severity, number> = { hole: 0, gap: 1, note: 2 };

/** What you probably want next when you drag a link out of a card into empty space. */
const NEXT_KIND: Partial<Record<Kind, Kind>> = {
  thought: "thought",
  spark: "thought",
  evidence: "claim",
  question: "claim",
  claim: "conclusion",
  assumption: "claim",
  conclusion: "conclusion",
};

export default function Board() {
  const nodes = usePlan((s) => s.nodes);
  const edges = usePlan((s) => s.edges);
  const view = usePlan((s) => s.view);
  const selection = usePlan((s) => s.selection);
  const gathered = usePlan((s) => s.gathered);
  const { setView, select, moveNode, connect, addNode, link, gather, updateNode } = usePlan.getState();
  void connect;

  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(null);
  const [temp, setTemp] = useState<{ from: string; x: number; y: number } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const flags = useHoles();
  const worst = useMemo(() => {
    const m = new Map<string, Severity>();
    for (const f of flags) {
      for (const id of f.nodeIds) {
        const cur = m.get(id);
        if (!cur || SEV_RANK[f.severity] < SEV_RANK[cur]) m.set(id, f.severity);
      }
    }
    return m;
  }, [flags]);

  const lit = useMemo(
    () => (selection?.type === "node" ? chain(selection.id, edges) : null),
    [selection, edges],
  );

  const toWorld = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = usePlan.getState().view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };

  // Wheel: pinch / ctrl+wheel zooms around the cursor, plain wheel pans.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = usePlan.getState().view;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const k = Math.min(2, Math.max(0.25, v.k * Math.exp(-e.deltaY * 0.01)));
        setView({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  // Active touch points, for two-finger pinch zoom.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const startPinch = () => {
    const [a, b] = [...touches.current.values()];
    const r = ref.current!.getBoundingClientRect();
    const v = usePlan.getState().view;
    gesture.current = {
      mode: "pinch",
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      k0: v.k,
      vx: v.x,
      vy: v.y,
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top,
    };
    setTemp(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        ref.current!.setPointerCapture(e.pointerId);
        return startPinch();
      }
      if (touches.current.size > 2) return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const port = target.closest<HTMLElement>("[data-port]");
    const card = target.closest<HTMLElement>("[data-node-id]");
    if (target.closest("[data-nodrag]")) return;

    if (port) {
      const id = port.dataset.port!;
      const p = toWorld(e.clientX, e.clientY);
      gesture.current = { mode: "connect", from: id, ...p };
      setTemp({ from: id, ...p });
    } else if (card && usePlan.getState().linking) {
      // Tap-to-link mode (touch friendly): this tap picks the target.
      const from = usePlan.getState().linking!;
      const to = card.dataset.nodeId!;
      usePlan.getState().startLinking(null);
      if (to !== from && !link(from, to)) flash("Those are already linked, or the link would loop back on itself.");
      select({ type: "node", id: to });
      return;
    } else if (card && e.shiftKey) {
      gather(card.dataset.nodeId!);
      return;
    } else if (card) {
      const id = card.dataset.nodeId!;
      const n = usePlan.getState().nodes[id];
      const p = toWorld(e.clientX, e.clientY);
      gesture.current = { mode: "drag", id, ox: p.x - n.x, oy: p.y - n.y, moved: false };
      select({ type: "node", id });
    } else if (!target.closest("[data-edge]")) {
      const v = usePlan.getState().view;
      gesture.current = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    } else {
      return;
    }
    ref.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "pinch") {
      if (touches.current.size < 2) return;
      const [a, b] = [...touches.current.values()];
      const k = Math.min(2, Math.max(0.25, (g.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      // Keep the point under the fingers' midpoint fixed while zooming.
      setView({ k, x: g.mx - ((g.mx - g.vx) * k) / g.k0, y: g.my - ((g.my - g.vy) * k) / g.k0 });
      return;
    }
    if (g.mode === "pan") {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      setView({ ...usePlan.getState().view, x: g.vx + dx, y: g.vy + dy });
    } else if (g.mode === "drag") {
      const p = toWorld(e.clientX, e.clientY);
      g.moved = true;
      // Snap to the minor grid, like a drafting table.
      moveNode(g.id, Math.round((p.x - g.ox) / 12) * 12, Math.round((p.y - g.oy) / 12) * 12);
    } else if (g.mode === "connect") {
      const p = toWorld(e.clientX, e.clientY);
      g.x = p.x;
      g.y = p.y;
      setTemp({ from: g.from, ...p });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.mode === "pinch") {
      // Lifting one finger ends the pinch; don't let the other one start a pan.
      if (touches.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    if (!g) return;
    if (g.mode === "pan" && !g.moved) {
      select(null);
      // Double-tap on touch screens, where dblclick isn't reliable.
      if (e.pointerType === "touch") {
        const now = e.timeStamp;
        const t = lastTap.current;
        if (t && now - t.t < 350 && Math.hypot(t.x - e.clientX, t.y - e.clientY) < 30) {
          const p = toWorld(e.clientX, e.clientY);
          addNode("thought", p.x - NODE_W / 2, p.y - 20, "New thought");
          lastTap.current = null;
        } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
    if (g.mode === "connect") {
      setTemp(null);
      const hit = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((el) => (el as HTMLElement).closest<HTMLElement>("[data-node-id]"))
        .find(Boolean);
      const to = hit?.dataset.nodeId;
      if (to && to !== g.from) {
        if (!link(g.from, to)) flash("Those are already linked, or the link would loop back on itself.");
      } else if (!to) {
        // Dropped on empty paper: sketch whatever naturally comes next, right there.
        const kind = NEXT_KIND[usePlan.getState().nodes[g.from]?.kind ?? "step"] ?? "step";
        const id = addNode(kind, g.x, g.y - ANCHOR_Y, kind === "step" ? "Next step" : "");
        link(g.from, id);
      }
    }
  };

  const flash = (msg: string) => {
    setRefused(msg);
    setTimeout(() => setRefused(null), 2200);
  };

  // Drop a picture or a link onto the paper → evidence card. Onto a card → attach it there.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    const onto = (e.target as HTMLElement).closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    const text = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")).split("\n")[0]?.trim();
    try {
      if (file) {
        const image = await imageToDataUrl(file);
        if (onto) updateNode(onto, { image });
        else {
          const id = addNode("evidence", p.x - NODE_W / 2, p.y - 20, file.name.replace(/\.[^.]+$/, "") || "Picture");
          updateNode(id, { image });
        }
      } else if (text && isUrl(text)) {
        if (onto) updateNode(onto, { link: text });
        else {
          const id = addNode("evidence", p.x - NODE_W / 2, p.y - 20, "Source");
          updateNode(id, { link: text });
        }
      } else if (text) {
        addNode("thought", p.x - NODE_W / 2, p.y - 20, text.slice(0, 140));
      }
    } catch {
      flash("Couldn't read that.");
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // The board captures the pointer during a press (for dragging), so the browser
    // reports the double-click on the board itself. Ask what's really underneath.
    const t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null) ?? (e.target as HTMLElement);
    const card = t.closest<HTMLElement>("[data-node-id]");
    if (card) {
      if (t.closest("[data-title]")) usePlan.getState().setEditing(card.dataset.nodeId!);
      return;
    }
    if (t.closest("[data-edge]") || t.closest("[data-nodrag]")) return;
    const p = toWorld(e.clientX, e.clientY);
    addNode("thought", p.x - NODE_W / 2, p.y - 20, "New thought");
  };

  const list = Object.values(nodes);
  const grid = 24 * view.k;
  const major = grid * 5;

  return (
    <div
      ref={ref}
      className="bp-paper absolute inset-0 touch-none select-none overflow-hidden"
      style={{
        backgroundSize: `${major}px ${major}px, ${major}px ${major}px, ${grid}px ${grid}px, ${grid}px ${grid}px, 100% 100%`,
        backgroundPosition: `${view.x}px ${view.y}px, ${view.x}px ${view.y}px, ${view.x}px ${view.y}px, ${view.x}px ${view.y}px, 0 0`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        touches.current.delete(e.pointerId);
        gesture.current = null;
        setTemp(null);
      }}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1}>
          <defs>
            {["ink", "lit", "sel", "sup"].map((m) => (
              <marker key={m} id={`arrow-${m}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.6" className={`bp-edge-${m}`} />
              </marker>
            ))}
          </defs>
          {Object.values(edges).map((e) => {
            const a = nodes[e.from];
            const b = nodes[e.to];
            if (!a || !b) return null;
            const d = edgePath(a.x + NODE_W, a.y + ANCHOR_Y, b.x - 4, b.y + ANCHOR_Y);
            const mid = edgeMid(a.x + NODE_W, a.y + ANCHOR_Y, b.x - 4, b.y + ANCHOR_Y);
            const sel = selection?.type === "edge" && selection.id === e.id;
            const on = lit?.edges.has(e.id);
            const rel = e.rel ?? "feeds";
            const pending = rel === "feeds" && !isDone(a.id, nodes, edges);
            const tone = sel ? "sel" : rel === "contradicts" ? "contra" : on ? "lit" : rel === "supports" ? "sup" : "ink";
            return (
              <g key={e.id}>
                <path
                  d={d}
                  data-edge
                  className="pointer-events-auto cursor-pointer"
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    select({ type: "edge", id: e.id });
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  className={`bp-edge-${tone}`}
                  stroke="currentColor"
                  strokeWidth={sel || on ? 2 : 1.3}
                  strokeDasharray={rel === "contradicts" ? "2 5" : pending ? "7 5" : undefined}
                  markerEnd={rel === "contradicts" ? undefined : `url(#arrow-${tone})`}
                />
                {rel !== "feeds" && (
                  <g transform={`translate(${mid.x} ${mid.y})`} className={`bp-edge-${tone}`}>
                    <circle r={9} fill="var(--paper)" stroke="currentColor" strokeWidth={1.3} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={12} fill="currentColor" className="bp-mono">
                      {rel === "supports" ? "+" : "≠"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {temp && nodes[temp.from] && (
            <path
              d={edgePath(nodes[temp.from].x + NODE_W, nodes[temp.from].y + ANCHOR_Y, temp.x, temp.y)}
              fill="none"
              className="bp-edge-sel"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeDasharray="3 4"
            />
          )}
        </svg>

        {list.map((n: PlanNode) => (
          <NodeCard
            key={n.id}
            node={n}
            selected={selection?.type === "node" && selection.id === n.id}
            flag={worst.get(n.id)}
            dimmed={!!lit && !lit.nodes.has(n.id)}
            gathered={gathered.includes(n.id)}
          />
        ))}
      </div>

      {list.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="bp-mono max-w-sm text-center text-xs uppercase leading-relaxed tracking-[0.2em] text-[var(--ink-dim)]">
            Blank sheet. Press Start for examples, a tour and templates,
            <br /> D to dump what&apos;s on your mind, or double-click to drop a thought.
          </p>
        </div>
      )}

      {refused && (
        <div className="bp-mono pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded border border-[var(--warn)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--warn)]">
          {refused}
        </div>
      )}
    </div>
  );
}
