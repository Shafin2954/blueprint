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
