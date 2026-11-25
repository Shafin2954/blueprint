"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlan, useReadOnly } from "@/lib/store";
import { checkpoint, toast } from "@/lib/history";
import { COMMANDS, FIELD_NAMES, describeAction, parseCommand, resolveRef, unknownRefs, type CommandAction } from "@/lib/command";
import { KIND_META, type Kind } from "@/lib/types";
import { Symbol } from "./NodeCard";

const HISTORY_KEY = "blueprint-command-history";

/** Run a parsed command against the board. Returns the new card's id (for "last"), if any. */
function run(action: CommandAction, last: string | null): string | null {
  const s = usePlan.getState();
  checkpoint(); // one command = one undo step
  if (action.type === "link") {
    const a = resolveRef(action.from, s.nodes, last)!;
    const b = resolveRef(action.to, s.nodes, last)!;
    if (!s.connect(a.id, b.id, action.rel)) {
      toast(`${a.ref} and ${b.ref} are already linked, or that link would loop back.`);
      return null;
    }
    if (action.strength) s.setStrength(usePlan.getState().lastEdge!, action.strength);
    checkpoint();
    return null;
  }
  // Resolve refs before adding, so "last" still means the previous card.
  const targets = action.links.map((l) => ({ ...l, node: resolveRef(l.ref, s.nodes, last)! }));
  // Place by meaning: a card that feeds/supports another goes to its left; a card that
  // follows another (after:/because:) goes to its right. Free-spot search does the rest.
  const outs = targets.filter((t) => t.dir === "out").map((t) => t.node);
  const ins = targets.filter((t) => t.dir === "in").map((t) => t.node);
  const avg = (ns: { x: number; y: number }[], k: "x" | "y") => ns.reduce((v, n) => v + n[k], 0) / ns.length;
  const at = ins.length
    ? { x: Math.max(...ins.map((n) => n.x)) + 300, y: avg(ins, "y") }
    : outs.length
      ? { x: Math.min(...outs.map((n) => n.x)) - 300, y: avg(outs, "y") }
      : undefined;
  const id = s.addCardNear(action.kind, action.title, at);
  usePlan.getState().clearFresh(); // keep typing in the bar, not in the inspector
  s.updateNode(id, {
    ...(action.body ? { body: action.body } : {}),
    ...(action.confidence !== undefined ? { confidence: action.confidence } : {}),
    ...(action.source ? { source: action.source } : {}),
    ...(action.link ? { link: action.link } : {}),
    ...(action.status ? { status: action.status } : {}),
  });
  const failed: string[] = [];
  for (const t of targets) {
    const ok = t.dir === "out" ? s.connect(id, t.node.id, t.rel) : s.connect(t.node.id, id, t.rel);
    if (!ok) failed.push(t.node.ref);
    else if (action.strength && t.rel !== "feeds") s.setStrength(usePlan.getState().lastEdge!, action.strength);
  }
  if (failed.length) toast(`Couldn't link to ${failed.join(", ")} (already linked, or it would loop back).`);
  checkpoint();
  return id;
}

/**
 * Type cards instead of clicking: "/evidence Rent is cheaper, conf: 70, for: C-01".
 * Desktop only. Press "/" anywhere on the sheet to jump here.
 */
export function CommandBar() {
  const readOnly = useReadOnly();
  const nodes = usePlan((s) => s.nodes);
  const [text, setText] = useState("");
  const [pick, setPick] = useState(0);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [back, setBack] = useState(-1);
  const [lastCmd, setLastCmd] = useState("");
  // The card the previous command made, for "last" (state: the preview depends on it).
  const [last, setLast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // ↑ recalls history only once you've actually used the bar (clicked or typed in it), so a
  // stray ↑ after focus lands here by accident can't re-run an old command.
  const used = useRef(false);
  const retabbed = useRef(false);

  useEffect(() => {
    const focus = (e: Event) => {
      input.current?.focus(); // synchronous, so a key being pressed right now lands here
      const start = (e as CustomEvent<string | undefined>).detail;
      if (start && !text) setText(start);
    };
    window.addEventListener("blueprint-command-focus", focus);
    return () => window.removeEventListener("blueprint-command-focus", focus);
  }, [text]);

  // Command suggestions while typing "/word" (before the first space).
  const suggestions = useMemo(() => {
    const m = text.match(/^\/{1,2}(\S*)$/);
    if (!m) return [];
    const q = m[1].toLowerCase();
    return COMMANDS.filter(([c]) => c.startsWith(q)).slice(0, 8);
  }, [text]);
  const cur = Math.min(pick, Math.max(0, suggestions.length - 1));

  const parsed = useMemo(() => parseCommand(text), [text]);
  const missing = parsed.action ? unknownRefs(parsed.action, nodes, last) : [];
  const ready = !!parsed.action && missing.length === 0;

  if (readOnly) return null;

  const submit = () => {
    if (!parsed.action || missing.length) {
      input.current?.select(); // the status line says what's wrong; typing again replaces it
      return;
    }
    const id = run(parsed.action, last);
    if (id) setLast(id);
    const h = [text, ...history.filter((x) => x !== text)].slice(0, 50);
    setHistory(h);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    } catch {}
    setBack(-1);
    // Clear the bar (a kept prefix caused "/goal /step …" mistakes); Tab brings the word back.
    const m = text.replace(/^\/{2,}/, "/").match(/^\/\S+/);
    setLastCmd(m ? m[0] : "");
    retabbed.current = false;
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && !e.shiftKey && !text && lastCmd && !retabbed.current) {
      retabbed.current = true; // once: a second Tab moves on as usual
      e.preventDefault();
      setText(`${lastCmd} `);
      return;
    }
    if (suggestions.length && (e.key === "Tab" || (e.key === "Enter" && !parsed.action))) {
      e.preventDefault();
      setText(`/${suggestions[cur][0]} `);
      setPick(0);
      return;
    }
    if (suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPick((cur + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
      return;
    }
    if (e.key.length === 1 || e.key === "Backspace") used.current = true;
    if (e.key === "ArrowUp" && history.length && used.current) {
      e.preventDefault();
      const i = Math.min(back + 1, history.length - 1);
      setBack(i);
      setText(history[i]);
      return;
    }
    if (e.key === "ArrowDown" && back >= 0) {
      e.preventDefault();
      const i = back - 1;
      setBack(i);
      setText(i >= 0 ? history[i] : "");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (text) setText("");
      else document.querySelector<HTMLElement>(".bp-paper")?.focus(); // back to the sheet, so arrows keep working
    }
  };

  const status = !text.trim()
    ? null
    : parsed.errors.length
      ? { tone: "warn", text: parsed.errors[0] }
      : missing.length
        ? { tone: "warn", text: `No card ${missing.join(", ")} on this sheet.` }
        : parsed.action
          ? { tone: "ok", text: `↵ ${describeAction(parsed.action, nodes, last)}${parsed.warnings?.length ? ` · ${parsed.warnings.join(" · ")}` : ""}` }
          : null;

  return (
    <div className="pointer-events-auto relative w-full max-w-[760px]" role="search">
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="Commands" className="bp-panel absolute bottom-full left-0 mb-1.5 w-full py-1">
          {suggestions.map(([c, hint], i) => {
            const k = c as Kind;
            return (
              <li key={c} role="none">
                <button
                  role="option"
                  aria-selected={i === cur}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setText(`/${c} `);
                    input.current?.focus();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] ${i === cur ? "bg-[var(--hover)]" : ""}`}
                >
                  <span className={`bp-${k} bp-accent w-4`}>{KIND_META[k] ? <Symbol kind={k} size={12} /> : "↗"}</span>
                  <span className="bp-mono text-[var(--ink)]">/{c}</span>
                  <span className="truncate text-[var(--ink-faint)]">{hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`bp-mono mb-1 truncate px-1 text-[11px] ${status.tone === "ok" ? (ready ? "text-[var(--ok)]" : "text-[var(--ink-dim)]") : "text-[var(--warn)]"}`}
        >
          {status.text}
        </div>
      )}
      <div className="bp-panel flex items-center gap-2 px-3 py-2 focus-within:border-[var(--milestone)]">
        <span className="bp-mono text-[13px] text-[var(--milestone)]" aria-hidden>
          ›
        </span>
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPick(0);
            setBack(-1);
          }}
          onKeyDown={onKeyDown}
          onPointerDown={() => (used.current = true)}
          onBlur={() => (used.current = false)}
          spellCheck={false}
          autoComplete="off"
          aria-label="Command bar: type a card, e.g. /evidence Rent is cheaper, conf: 70, for: C-01"
          placeholder={lastCmd ? `Tab: ${lastCmd} again · or type /command, or just a thought` : "/evidence Rent is cheaper, conf: 70, for: C-01 — or just type a thought"}
          className="bp-mono min-w-0 flex-1 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("blueprint-help", { detail: "Command bar" }))}
          className="bp-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-faint)] hover:text-[var(--ink)]"
          title={`Fields: ${FIELD_NAMES.slice(0, 12).join(", ")}…`}
        >
          syntax
        </button>
      </div>
    </div>
  );
}
