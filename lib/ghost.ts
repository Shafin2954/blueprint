import { useEffect, useState } from "react";
/**
 * Ghost-click guard. On a phone, tapping a card opens a bottom sheet; the browser's
 * click for that same tap then lands on whatever button just appeared under the finger
 * ("Delete link", "→ claim"…). A real tap on that button always starts with its own
 * pointerdown; the ghost click doesn't. So after a tap that opens a panel, swallow a
 * click outside the sheet only if no new pointerdown has happened since.
 */
let armedAt = 0;
let downSince = false;
let installed = false;
const WINDOW_MS = 700;

export function armGhostGuard() {
  armedAt = performance.now();
  downSince = false;
}

export function installGhostGuard() {
  if (installed) return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      // The arming tap's own pointerdown runs before armGhostGuard (it's what arms it),
      // so any pointerdown seen here afterwards is a genuinely new touch.
      if (performance.now() - armedAt > 0 && !(e.target as Element | null)?.closest?.(".bp-paper")) downSince = true;
    },
    true,
  );
  window.addEventListener(
    "click",
    (e) => {
      if (downSince || performance.now() - armedAt > WINDOW_MS) return;
      const t = e.target as Element | null;
      if (t?.closest?.(".bp-paper")) return;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
}

/**
 * A panel that slides in under the finger on a touch screen catches the tail of that
 * same tap (the browser's synthesized mousedown opens a <select>, focuses a button).
 * Returns true for a moment after `key` changes, on coarse pointers: render the panel
 * with pointer-events off meanwhile.
 */
export function useJustOpened(key: string): boolean {
  const coarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const [st, setSt] = useState(() => ({ key, quiet: coarse() }));
  if (st.key !== key) setSt({ key, quiet: coarse() }); // a different card/link opened: quiet again
  useEffect(() => {
    if (!st.quiet) return;
    const t = setTimeout(() => setSt((s) => (s === st ? { ...s, quiet: false } : s)), 450);
    return () => clearTimeout(t);
  }, [st]);
  return st.key === key && st.quiet;
}
