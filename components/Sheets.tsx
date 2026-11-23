"use client";

import { useState } from "react";
import { usePlan } from "@/lib/store";
import { deleteSheet, duplicateSheet, newSheet, renameSheet, switchSheet, useSheets } from "@/lib/sheets";
import { toast } from "@/lib/history";

function ago(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

export function Sheets({ onClose, onNew }: { onClose: () => void; onNew: () => void }) {
  const sheets = useSheets();
  const current = usePlan((s) => s.sheetId);
  const [confirm, setConfirm] = useState<string | null>(null);

  const fail = () => toast("Couldn't do that — browser storage may be full. Export a sheet or remove some images.");

  return (
    <div className="bp-panel pointer-events-auto flex max-h-[calc(100dvh-200px)] w-[min(520px,calc(100vw-32px))] flex-col max-md:max-h-full max-md:w-full">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <span className="bp-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-dim)]">Sheets</span>
        <span className="bp-mono text-[10px] text-[var(--ink-faint)]">{sheets.length} in this browser</span>
        <button onClick={onClose} className="bp-mono ml-auto text-[11px] text-[var(--ink-dim)] hover:text-[var(--ink)]">close ✕</button>
      </div>
      <div className="border-b border-[var(--line)] px-4 py-3">
        <button
          onClick={() => {
            if (newSheet()) onNew();
            else fail();
          }}
          className="bp-btn bp-btn-primary w-full"
        >
          + New sheet
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
        {sheets.map((m) => {
          const isOpen = m.id === current;
          return (
            <li key={m.id} className={`rounded-sm border p-2.5 ${isOpen ? "border-[var(--spark)]" : "border-[var(--line)]"}`}>
              <div className="flex items-center gap-2">
                <input
                  defaultValue={m.name}
                  aria-label="Sheet name"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && renameSheet(m.id, e.target.value.trim())}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--ink)] outline-none focus:underline"
                />
                {isOpen && <span className="bp-mono text-[9px] uppercase tracking-[0.18em] text-[var(--spark)]">open</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="bp-mono text-[10px] text-[var(--ink-faint)]">
                  {m.cards} card{m.cards === 1 ? "" : "s"} · {ago(m.updatedAt)}
                </span>
                <span className="ml-auto flex gap-1">
                  {!isOpen && (
                    <button
                      onClick={() => {
                        if (switchSheet(m.id)) onClose();
                        else fail();
                      }}
                      className="bp-btn px-2 py-0.5 text-[11px]"
                    >
                      Open
                    </button>
                  )}
                  <button onClick={() => duplicateSheet(m.id) || fail()} className="bp-tool px-2 py-0.5 text-[11px]">
                    Duplicate
                  </button>
                  {confirm === m.id ? (
                    <>
                      <button
                        onClick={() => {
                          deleteSheet(m.id);
                          setConfirm(null);
                        }}
                        className="bp-btn bp-btn-danger px-2 py-0.5 text-[11px] text-[var(--warn)]"
                      >
                        Delete for good
                      </button>
                      <button onClick={() => setConfirm(null)} className="bp-tool px-2 py-0.5 text-[11px]">Keep</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirm(m.id)} className="bp-tool px-2 py-0.5 text-[11px]">Delete</button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11px] text-[var(--ink-faint)]">
        Sheets live in this browser only. Use Export to back one up or move it to another device.
      </p>
    </div>
  );
}
