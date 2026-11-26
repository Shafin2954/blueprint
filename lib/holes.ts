/**
 * Plot-hole checker. Reads the board the way an editor reads a story and flags
 * places where the reasoning or the plan doesn't hold together.
 *
 * Everything here is structural: it looks at how cards are connected and how sure
 * you said you are, never at what the words mean. It's a mirror, not a judge.
 */
import { downstream, upstream } from "./graph";
import { balance, isThin, weight } from "./reason";
import type { Edge, PlanNode } from "./types";

type Nodes = Record<string, PlanNode>;
type Edges = Record<string, Edge>;

export type Severity = "hole" | "gap" | "note";

export type FixAction =
  | { type: "decompose"; id: string }
  | { type: "test-assumption"; id: string }
  | { type: "add-why"; id: string }
  | { type: "contradiction-to-question"; edgeId: string }
  | { type: "split"; id: string }
  | { type: "promote"; id: string }
  | { type: "add-into"; id: string; kind: "cause" | "fix" | "step" | "evidence"; rel: "feeds" | "supports" }
  | { type: "make-root"; id: string };

export interface Flag {
  /** Stable key so a dismissal survives edits elsewhere on the board. */
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  nodeIds: string[];
  fix?: { label: string; action: FixAction };
}

const BIG_VERBS = /\b(build|make|create|launch|ship|finish|design|write|develop|implement)\b/i;
const BIG_NOUNS = /\b(app|product|platform|website|site|system|business|startup|book|everything|mvp|game|course)\b/i;

export function findHoles(allNodes: Nodes, edges: Edges): Flag[] {
  // Text boxes are decoration, not thinking: leave them out of every check.
  const nodes: Nodes = Object.fromEntries(Object.entries(allNodes).filter(([, n]) => n.kind !== "text"));
  const flags: Flag[] = [];
  const list = Object.values(nodes);
  const all = Object.values(edges);
  const ins = (id: string) => all.filter((e) => e.to === id);
  const outs = (id: string) => all.filter((e) => e.from === id);
  const name = (n: PlanNode) => `${n.ref} “${n.title}”`;

  for (const n of list) {
    const up = [...upstream(n.id, edges)].map((u) => nodes[u]).filter(Boolean);

    if (n.kind === "goal") {
      if (!up.some((u) => u.kind === "step")) {
        flags.push({
          key: `wish:${n.id}`,
          severity: "hole",
          title: "A wish, not a plan",
          detail: `${name(n)} has no steps leading to it. Nothing on the board actually moves it forward.`,
          nodeIds: [n.id],
          fix: { label: "Decompose into steps", action: { type: "decompose", id: n.id } },
        });
      }
      const reasons = ins(n.id).filter((e) => {
        const k = nodes[e.from]?.kind;
        return e.rel === "supports" || k === "thought" || k === "spark" || k === "question";
      });
      if (reasons.length === 0) {
        flags.push({
          key: `why:${n.id}`,
          severity: "gap",
          title: "No “why” on record",
          detail: `Nothing explains why ${name(n)} matters. When motivation dips, the reason is what keeps you going — write it down.`,
          nodeIds: [n.id],
          fix: { label: "Add a reason", action: { type: "add-why", id: n.id } },
        });
      }
      const shaky = up.filter((u) => u.kind === "assumption" && !isTested(u.id));
      if (shaky.length) {
        flags.push({
          key: `rests:${n.id}:${shaky.map((s) => s.id).join(",")}`,
          severity: "hole",
          title: "Built on untested ground",
          detail: `${name(n)} depends on ${shaky.map((s) => s.ref).join(", ")}, which nobody has checked. If ${shaky.length > 1 ? "they're" : "it's"} wrong, the goal falls with ${shaky.length > 1 ? "them" : "it"}.`,
          nodeIds: [n.id, ...shaky.map((s) => s.id)],
        });
      }
    }

    if (n.kind === "assumption" && !isTested(n.id)) {
      const affected = [...downstream(n.id, edges)].map((d) => nodes[d]).filter((d) => d && d.kind === "goal");
      flags.push({
        key: `untested:${n.id}`,
        severity: affected.length ? "hole" : "gap",
        title: "Untested assumption",
        detail: `${name(n)} is being treated as true. What's the cheapest way to find out if it is?`,
        nodeIds: [n.id],
        fix: { label: "Add a test step", action: { type: "test-assumption", id: n.id } },
      });
    }

    if (n.kind === "question" && outs(n.id).length === 0 && ins(n.id).length === 0 && !n.body.trim()) {
      flags.push({
        key: `open:${n.id}`,
        severity: "gap",
        title: "Open question, nobody on it",
        detail: `${name(n)} isn't linked to anything and has no notes. Answer it, or link it to the step that will.`,
        nodeIds: [n.id],
      });
    }

    if (n.kind === "risk" && !n.body.trim() && !/\s[—–-]\s|→|;|\b(plan|fix|mitigate|counter):/i.test(n.title) && !outs(n.id).concat(ins(n.id)).some((e) => nodes[e.from]?.kind === "step")) {
      flags.push({
        key: `counter:${n.id}`,
        severity: "gap",
        title: "Risk without a counter-move",
        detail: `${name(n)} names the danger but not what you'll do about it. Write the counter-move in its Notes, or link a step that handles it.`,
        nodeIds: [n.id],
      });
    }

    if (n.kind === "step") {
      if (outs(n.id).length === 0) {
        flags.push({
          key: `nowhere:${n.id}`,
          severity: "gap",
          title: "Step that leads nowhere",
          detail: `${name(n)} doesn't feed any goal or milestone. What is it for?`,
          nodeIds: [n.id],
        });
      }
      if (n.status !== "done" && BIG_VERBS.test(n.title) && BIG_NOUNS.test(n.title)) {
        flags.push({
          key: `big:${n.id}`,
          severity: "gap",
          title: "That's not a 30-minute step",
          detail: `${name(n)} sounds like a project. Big steps are where momentum goes to die.`,
          nodeIds: [n.id],
          fix: { label: "Split it", action: { type: "split", id: n.id } },
        });
      }
    }
  }

  for (const e of all) {
    if (e.rel !== "contradicts") continue;
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (!a || !b) continue;
    // Evidence against a claim is reasoning working, not a hole (weighed elsewhere).
    // It's a plot hole only when you hold both sides at once.
    if (a.kind === "evidence" || b.kind === "evidence") continue;
    // A risk "against" a goal is a threat, not a belief you hold.
    if (a.kind === "risk" || b.kind === "risk") continue;
    // Only when you actually lean towards both (50% is "no idea", not a belief).
    if (weight(a) <= 50 || weight(b) <= 50) continue;
    flags.push({
      key: `contra:${e.id}`,
      severity: "hole",
      title: "Holding both sides",
      detail: `You hold both ${name(a)} and ${name(b)}, but they can't both be true. Decide which one wins, or turn the tension into a question you can test.`,
      nodeIds: [a.id, b.id],
      fix: { label: "Make it a question", action: { type: "contradiction-to-question", edgeId: e.id } },
    });
  }

  // ── Problem solving: from a symptom down to a root cause, and a fix that removes it. ──
  const causalIn = (id: string) =>
    ins(id).filter((e) => (e.rel ?? "feeds") === "feeds" && (nodes[e.from]?.kind === "cause" || nodes[e.from]?.kind === "root")).map((e) => nodes[e.from]);
  const fixesIn = (id: string) => ins(id).filter((e) => nodes[e.from]?.kind === "fix").map((e) => nodes[e.from]);
  for (const p of list) {
    if (p.kind !== "problem") continue;
    const direct = causalIn(p.id);
    if (!direct.length) {
      flags.push({
        key: `unexplained:${p.id}`,
        severity: "gap",
        title: "Unexplained problem",
        detail: `Nothing on the board says why ${name(p)} happens. Ask “why?” and add a cause — then ask why again.`,
        nodeIds: [p.id],
        fix: { label: "Ask why", action: { type: "add-into", id: p.id, kind: "cause", rel: "feeds" } },
      });
      continue;
    }
    // Walk the chain of whys: the deepest causes are where you stopped asking.
    const depth = new Map<string, number>();
    const walk = (id: string, d: number, seen: Set<string>) => {
      for (const c of causalIn(id)) {
        if (seen.has(c.id)) continue;
        depth.set(c.id, Math.max(depth.get(c.id) ?? 0, d));
        walk(c.id, d + 1, new Set([...seen, c.id]));
      }
    };
    walk(p.id, 1, new Set([p.id]));
    const chain = [...depth.keys()].map((id) => nodes[id]);
    if (!chain.some((c) => c.kind === "root")) {
      const deepest = chain.filter((c) => !causalIn(c.id).length).sort((a, b) => depth.get(b.id)! - depth.get(a.id)!)[0];
      const d = depth.get(deepest.id)!;
      flags.push({
        key: `noroot:${p.id}:${deepest.id}`,
        severity: "note",
        title: "No root cause yet",
        detail:
          d < 2
            ? `${name(deepest)} is the first answer to “why does ${p.ref} happen?”. First answers are usually symptoms too — ask why ${deepest.ref} happens.`
            : `The chain under ${name(p)} stops at ${name(deepest)}, ${d} whys deep. If removing it would stop the problem, make it the root cause; if not, ask why again.`,
        nodeIds: [p.id, deepest.id],
        fix:
          d < 2
            ? { label: "Ask why again", action: { type: "add-into", id: deepest.id, kind: "cause", rel: "feeds" } }
            : { label: "Make it the root cause", action: { type: "make-root", id: deepest.id } },
      });
    }
    const symptomFixes = fixesIn(p.id);
    if (symptomFixes.length) {
      flags.push({
        key: `symptom:${p.id}:${symptomFixes.map((f) => f.id).join(",")}`,
        severity: "note",
        title: "Treating the symptom",
        detail: `${symptomFixes.map((f) => f.ref).join(", ")} ${symptomFixes.length > 1 ? "go" : "goes"} straight at ${name(p)}, not at a cause. That can be the right stopgap — but the problem will come back unless something removes its cause.`,
        nodeIds: [p.id, ...symptomFixes.map((f) => f.id)],
      });
    }
  }
  for (const r of list) {
    if (r.kind !== "root") continue;
    if (!fixesIn(r.id).length) {
      flags.push({
        key: `nofix:${r.id}`,
        severity: "hole",
        title: "Root cause, no fix",
        detail: `${name(r)} is the cause worth removing, but nothing on the board removes it. What countermeasure would stop it happening?`,
        nodeIds: [r.id],
        fix: { label: "Add a fix", action: { type: "add-into", id: r.id, kind: "fix", rel: "feeds" } },
      });
    }
    const proof = ins(r.id).filter((e) => e.rel === "supports" && nodes[e.from]?.kind === "evidence");
    if (!proof.length) {
      flags.push({
        key: `hunch:${r.id}`,
        severity: "gap",
        title: "Root cause on a hunch",
        detail: `Nothing shows that ${name(r)} really causes this. Fixing the wrong cause costs the fix and leaves the problem: what would you expect to see if it were true?`,
        nodeIds: [r.id],
        fix: { label: "Add evidence", action: { type: "add-into", id: r.id, kind: "evidence", rel: "supports" } },
      });
    }
  }
  for (const f of list) {
    if (f.kind !== "fix" || !outs(f.id).length) continue;
    if (!ins(f.id).some((e) => nodes[e.from]?.kind === "step")) {
      flags.push({
        key: `idlefix:${f.id}`,
        severity: "gap",
        title: "A fix nobody's doing",
        detail: `${name(f)} has no step putting it in place. What's the first thing to do, and when?`,
        nodeIds: [f.id],
        fix: { label: "Add a step", action: { type: "add-into", id: f.id, kind: "step", rel: "feeds" } },
      });
    }
  }

  const loose = list.filter((n) => n.kind !== "spark" && n.kind !== "thought" && n.kind !== "problem" && ins(n.id).length === 0 && outs(n.id).length === 0);
  if (loose.length) {
    flags.push({
      key: `floating:${loose.map((n) => n.id).sort().join(",")}`,
      severity: "note",
      title: `${loose.length} card${loose.length > 1 ? "s" : ""} floating`,
      detail: `${loose.map((n) => n.ref).join(", ")} ${loose.length > 1 ? "aren't" : "isn't"} connected to anything, so ${loose.length > 1 ? "they don't" : "it doesn't"} count toward the plan.`,
      nodeIds: loose.map((n) => n.id),
    });
  }

  const goals = list.filter((n) => n.kind === "goal");
  const idle = list.filter((n) => (n.kind === "spark" || n.kind === "thought") && outs(n.id).length === 0);
  if (goals.length === 0 && idle.length >= 5) {
    const best = idle.reduce((a, b) => (ins(b.id).length > ins(a.id).length ? b : a));
    flags.push({
      key: `pile:${idle.length >= 10 ? "10" : "5"}`,
      severity: "note",
      title: "Lots of ideas, no direction",
      detail: `${idle.length} thoughts and sparks, zero goals. You don't need the best one — just one. Promoting is reversible.`,
      nodeIds: idle.map((n) => n.id),
      fix: best.kind === "spark" ? { label: `Promote ${best.ref}`, action: { type: "promote", id: best.id } } : undefined,
    });
  }

  // ── Reasoning: does what you believe follow from what you've collected? ──
  const supportsIn = (id: string) => all.filter((e) => e.to === id && e.rel === "supports").map((e) => nodes[e.from]).filter(Boolean);
  const pct = (n: PlanNode) => `${Math.round(weight(n))}%`;

  for (const n of list) {
    if (n.kind !== "claim" && n.kind !== "conclusion") continue;
    const reasons = supportsIn(n.id);
    const sure = weight(n);
    const bal = balance(n.id, nodes, edges);

    if (bal.echoes > 0) {
      flags.push({
        key: `echo:${n.id}:${bal.echoes}`,
        severity: "note",
        title: "Same source, counted once",
        detail: `${bal.echoes} card${bal.echoes > 1 ? "s" : ""} weighing on ${name(n)} share a source with another, so they count once. Repetition isn't independent confirmation.`,
        nodeIds: [n.id, ...bal.pro.concat(bal.con).filter((c) => c.source).map((c) => c.id)],
      });
    }

    if (n.kind === "conclusion" && reasons.length === 0) {
      flags.push({
        key: `leap:${n.id}`,
        severity: "hole",
        title: "A leap",
        detail: `${name(n)} is a conclusion with nothing supporting it. What led you here? Link the pieces.`,
        nodeIds: [n.id],
      });
      continue;
    }

    if (reasons.length) {
      // Independent reasons add up: two 70% reasons together justify more than 70%
      // (the chance that at least one holds). Same-source cards count once.
      const bySource = new Map<string, number>();
      for (const r of reasons) {
        const k = r.source?.trim().toLowerCase() || `#${r.id}`;
        bySource.set(k, Math.max(bySource.get(k) ?? 0, weight(r)));
      }
      const best = Math.round(100 * (1 - [...bySource.values()].reduce((p, w) => p * (1 - w / 100), 1)));
      if (sure > best + 15) {
        flags.push({
          key: `over:${n.id}:${Math.round(sure)}:${Math.round(best)}`,
          severity: "gap",
          title: "More sure than your reasons",
          detail: reasons.length === 1
            ? `You're ${pct(n)} sure of ${name(n)}, but the one reason for it is only ${best}% sure. A belief can't be surer than everything holding it up.`
            : `You're ${pct(n)} sure of ${name(n)}, but even if your reasons for it are independent, together they only get to about ${best}%.`,
          nodeIds: [n.id, ...reasons.map((r) => r.id)],
        });
      }
    }

    // Belief and evidence pointing different ways (either way round), once there's enough to judge.
    const evid = bal.score === null ? null : Math.round(bal.score * 100);
    // One strong, unopposed reason is enough to notice you're far less sure than it.
    const lone = bal.con.length === 0 && bal.forW >= 60 && sure < 40;
    const doubtful = evid !== null && (!isThin(bal) || lone) && Math.abs(sure - evid) > 15;
    if (doubtful && sure > 50 && evid! < 50) {
      flags.push({
        key: `belief:${n.id}:${bal.con.map((c) => c.id).join(",")}`,
        severity: "hole",
        title: "Belief vs. evidence",
        detail: `You're ${pct(n)} sure of ${name(n)}, yet what you've linked leans against it: only ${evid}% of its weight is for it (${Math.round(bal.forW)} for, ${Math.round(bal.againstW)} against). Either the belief or the weights need another look.`,
        nodeIds: [n.id, ...bal.con.map((c) => c.id)],
      });
    } else if (doubtful && sure < 50 && evid! > 50) {
      flags.push({
        key: `under:${n.id}:${bal.pro.map((c) => c.id).join(",")}`,
        severity: "gap",
        title: "Less sure than your evidence",
        detail: `You're only ${pct(n)} sure of ${name(n)}, but ${evid}% of what you've linked is for it (${Math.round(bal.forW)} for, ${Math.round(bal.againstW)} against). Is something missing on the other side — or should you believe it more?`,
        nodeIds: [n.id, ...bal.pro.map((c) => c.id)],
      });
    } else {
      for (const c of bal.con) {
        if (c.kind === "evidence" && weight(c) >= 50 && sure >= 70) {
          flags.push({
            key: `ignored:${n.id}:${c.id}`,
            severity: "hole",
            title: "Inconvenient evidence",
            detail: `${name(c)} cuts against ${name(n)}, which you're ${pct(n)} sure of. Can you explain it away honestly — or does it change things?`,
            nodeIds: [n.id, c.id],
          });
        }
      }
    }

    if (n.kind === "conclusion") {
      const below = [...upstream(n.id, edges)].map((u) => nodes[u]).filter(Boolean);
      if (!below.some((u) => u.kind === "evidence")) {
        flags.push({
          key: `beliefs-only:${n.id}`,
          severity: "gap",
          title: "Built only on beliefs",
          detail: `Nothing under ${name(n)} is evidence — it's claims and assumptions all the way down. What would you expect to find if it were true?`,
          nodeIds: [n.id],
        });
      }
      if (reasons.length === 1 && bal.con.length === 0) {
        flags.push({
          key: `thread:${n.id}`,
          severity: "note",
          title: "Hangs on one thread",
          detail: `${name(n)} rests on a single card (${reasons[0].ref}). If that one's wrong, so is this.`,
          nodeIds: [n.id, reasons[0].id],
        });
      }
      const shaky = below.filter((u) => u.kind === "assumption" && !isTested(u.id));
      if (shaky.length) {
        flags.push({
          key: `c-rests:${n.id}:${shaky.map((x) => x.id).join(",")}`,
          severity: "gap",
          title: "Rests on an untested assumption",
          detail: `${name(n)} depends on ${shaky.map((x) => x.ref).join(", ")}, which you haven't checked.`,
          nodeIds: [n.id, ...shaky.map((x) => x.id)],
        });
      }
    }
  }

  // Evidence that bears the same way on every rival answer can't help choose between them
  // (Heuer's "diagnosticity" in the analysis of competing hypotheses).
  for (const q of list) {
    if (q.kind !== "question") continue;
    const answers = supportsIn(q.id).filter((a) => a.kind === "claim" || a.kind === "conclusion");
    if (answers.length < 2) continue;
    const m = evidenceMatrix(answers, nodes, all);
    const flat = m.rows.filter((r) => r.cells.every((c) => c === r.cells[0]) && r.cells[0] !== 0);
    if (flat.length) {
      flags.push({
        key: `undiagnostic:${q.id}:${flat.map((r) => r.node.id).join(",")}`,
        severity: "note",
        title: "Doesn't help you decide",
        detail: `${flat.map((r) => r.node.ref).join(", ")} ${flat.length > 1 ? "bear" : "bears"} the same way on every answer to ${name(q)}, so ${flat.length > 1 ? "they don't" : "it doesn't"} tell the answers apart. Look for evidence that would fit one answer and not the others.`,
        nodeIds: [q.id, ...flat.map((r) => r.node.id)],
      });
    }
  }

  for (const e of list) {
    if (e.kind === "question") {
      const answers = supportsIn(e.id).filter((a) => a.kind === "claim" || a.kind === "conclusion");
      const sure = answers.filter((a) => weight(a) >= 70);
      if (sure.length >= 2) {
        flags.push({
          key: `rivals:${e.id}:${sure.map((a) => a.id).join(",")}`,
          severity: "gap",
          title: "Sure of rival answers",
          detail: `You're quite sure of ${sure.map((a) => a.ref).join(" and ")}, which both answer ${name(e)}. Can they really both be true?`,
          nodeIds: [e.id, ...sure.map((a) => a.id)],
        });
      }
    }
  }

  // Unsourced evidence: one grouped note rather than a flag per card (it's advice, not an error).
  const unsourced = list.filter((e) => e.kind === "evidence" && !e.link && !e.image && !e.body.trim() && !e.source?.trim());
  if (unsourced.length) {
    flags.push({
      key: `source:${unsourced.map((n) => n.id).sort().join(",")}`,
      severity: "note",
      title: "Where did this come from?",
      detail: `${unsourced.map((n) => n.ref).join(", ")} ${unsourced.length > 1 ? "have" : "has"} no “From”, link, picture or notes. Evidence you can't trace back is just a claim — a word like “me” or “lease” is enough.`,
      nodeIds: unsourced.map((n) => n.id),
    });
  }

  const order: Record<Severity, number> = { hole: 0, gap: 1, note: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);

  function isTested(id: string) {
    return ins(id).some((e) => nodes[e.from]?.kind === "step");
  }
}


export interface MatrixRow {
  node: PlanNode;
  /** Per answer: +1 supports it, -1 contradicts it, 0 not linked. */
  cells: number[];
}

/**
 * Evidence × answers, as in the analysis of competing hypotheses: every card linked to any
 * of the answers, and how it bears on each. Rows that differ across answers are the useful ones.
 */
export function evidenceMatrix(answers: PlanNode[], nodes: Nodes, edges: Edge[]): { answers: PlanNode[]; rows: MatrixRow[] } {
  const ids = new Set(answers.map((a) => a.id));
  const rows = new Map<string, MatrixRow>();
  for (const e of edges) {
    if (e.rel !== "supports" && e.rel !== "contradicts") continue;
    let other: string | null = null;
    let target: string | null = null;
    if (ids.has(e.to) && !ids.has(e.from)) [other, target] = [e.from, e.to];
    else if (e.rel === "contradicts" && ids.has(e.from) && !ids.has(e.to)) [other, target] = [e.to, e.from];
    if (!other || !target || !nodes[other] || nodes[other].kind === "question") continue;
    const row = rows.get(other) ?? { node: nodes[other], cells: answers.map(() => 0) };
    row.cells[answers.findIndex((a) => a.id === target)] = e.rel === "supports" ? 1 : -1;
    rows.set(other, row);
  }
  return { answers, rows: [...rows.values()].sort((a, b) => a.node.ref.localeCompare(b.node.ref, undefined, { numeric: true })) };
}
