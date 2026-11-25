"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  hint?: string;
  /** One line under the label (shown in the phone bottom sheet, as the tooltip elsewhere). */
  desc?: string;
  icon?: ReactNode;
  className?: string;
  run: () => void;
}

/**
 * A button with a pop-up menu. The menu is portalled to <body>: the toolbar it sits in
 * scrolls and has a backdrop-filter, which makes it the containing block for anything
 * fixed-position inside it — a menu rendered there gets clipped invisible.
 * On phones the menu is a bottom sheet with big rows; elsewhere it's kept inside the viewport.
 */
export function PopMenu({
  label,
  title,
  items,
  buttonClass = "bp-tool",
  id,
}: {
  label: ReactNode;
  title?: string;
  items: MenuItem[];
  buttonClass?: string;
  id: string;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rect) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        e.stopPropagation(); // capture phase on window: the app's own Esc never sees it
        setRect(null);
        btn.current?.focus();
        return;
      }
      if (e.target instanceof Node && (btn.current?.contains(e.target) || menu.current?.contains(e.target))) return;
      setRect(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("resize", close);
    // Focus the first item, so the menu works from the keyboard.
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("resize", close);
    };
  }, [rect]);

  const phone = typeof window !== "undefined" && window.innerWidth < 768;
  const W = 232;
  const estH = items.length * 40 + 12;
  const style = rect
    ? phone
      ? undefined
      : {
          left: Math.max(8, Math.min(rect.left, window.innerWidth - W - 8)),
          top: rect.bottom + 6 + estH > window.innerHeight ? Math.max(8, rect.top - 6 - estH) : rect.bottom + 6,
          width: W,
        }
    : undefined;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const all = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") all[(i + 1) % all.length]?.focus();
    else if (e.key === "ArrowUp") all[(i - 1 + all.length) % all.length]?.focus();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={btn}
        onClick={() => setRect(rect ? null : btn.current!.getBoundingClientRect())}
        aria-haspopup="menu"
        aria-expanded={!!rect}
        aria-controls={id}
        className={buttonClass}
        title={title}
      >
        {label}
      </button>
      {rect &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            onKeyDown={onKeyDown}
            className={`bp-panel bp-menu fixed z-[60] py-1 ${phone ? "inset-x-2 bottom-2 max-h-[70dvh] overflow-y-auto" : ""}`}
            style={style}
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setRect(null);
                  it.run();
                }}
                title={it.desc}
                className={`bp-tool flex w-full items-center justify-start gap-2.5 px-3 text-left ${phone ? "min-h-[48px] text-[15px]" : "py-2"} ${it.className ?? ""}`}
              >
                {it.icon && <span className="bp-accent shrink-0">{it.icon}</span>}
                <span className="flex-1">
                  {it.label}
                  {it.desc && phone && <span className="block py-0.5 text-[11px] leading-snug text-[var(--ink-faint)]">{it.desc}</span>}
                </span>
                {it.hint && !phone && <span className="bp-mono text-[10px] text-[var(--ink-faint)]">{it.hint}</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
