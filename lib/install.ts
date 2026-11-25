"use client";

/**
 * Installing the app and keeping its data.
 * - Chrome/Edge/Android fire `beforeinstallprompt`: keep it, so "Install app" can show the real prompt.
 * - Safari has no prompt: explain Share → Add to Home Screen instead.
 * - Ask the browser to treat this site's storage as persistent, so sheets aren't evicted
 *   when the device runs low on space (granted quietly for installed or frequently used sites).
 */
import { toast } from "./history";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: PromptEvent | null = null;

export function startInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    keepData();
  });
}

export const isInstalled = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

export async function installApp() {
  if (deferred) {
    const e = deferred;
    deferred = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === "accepted") toast("Installed — Blueprint now opens like an app, and works offline");
    return;
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  toast(
    ios
      ? "In Safari: tap Share (the square with an arrow), then “Add to Home Screen”"
      : "Use your browser's menu: “Install app” or “Add to Home screen”. It already works offline in this browser.",
  );
}

/** Ask once that this site's storage not be cleared automatically. Safe to call repeatedly. */
export function keepData() {
  navigator.storage?.persisted?.().then((already) => {
    if (!already) navigator.storage.persist?.().catch(() => {});
  });
}
