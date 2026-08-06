// src/components/ui/KeyboardShortcutsHint.tsx
"use client";

import { useState } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["↑"], label: "Jog Nord" },
  { keys: ["↓"], label: "Jog Sud" },
  { keys: ["←"], label: "Jog Ouest" },
  { keys: ["→"], label: "Jog Est" },
  { keys: ["Esc"], label: "Arrêt mouvement" },
  { keys: ["Espace"], label: "Toggle tracking" },
  { keys: ["+"], label: "Vitesse +" },
  { keys: ["−"], label: "Vitesse −" },
];

export function KeyboardShortcutsHint() {
  const { isConnected } = useStargazerStore();
  const [open, setOpen] = useState(false);

  if (!isConnected) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.25rem",
        left: "1.25rem",
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "0.5rem",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Courier New', monospace",
      }}
    >
      {open && (
        <div
          style={{
            background: "rgba(0,0,0,0.92)",
            border: "1px solid rgba(0,255,180,0.2)",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            backdropFilter: "blur(8px)",
            boxShadow: "0 0 24px rgba(0,255,180,0.08)",
            minWidth: "220px",
          }}
        >
          <div
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.15em",
              color: "#00ffb4",
              textTransform: "uppercase",
              marginBottom: "0.6rem",
              opacity: 0.7,
            }}
          >
            Raccourcis clavier
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.label}>
                  <td style={{ paddingBottom: "0.3rem", paddingRight: "0.75rem", verticalAlign: "middle" }}>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          style={{
                            display: "inline-block",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderBottom: "2px solid rgba(255,255,255,0.1)",
                            borderRadius: "0.25rem",
                            padding: "0.05rem 0.4rem",
                            fontSize: "0.7rem",
                            color: "#e0ffe8",
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </td>
                  <td
                    style={{
                      fontSize: "0.7rem",
                      color: "rgba(255,255,255,0.55)",
                      paddingBottom: "0.3rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Masquer les raccourcis" : "Afficher les raccourcis clavier"}
        style={{
          background: open ? "rgba(0,255,180,0.12)" : "rgba(0,0,0,0.7)",
          border: "1px solid rgba(0,255,180,0.25)",
          borderRadius: "0.4rem",
          color: open ? "#00ffb4" : "rgba(255,255,255,0.45)",
          cursor: "pointer",
          width: "2.1rem",
          height: "2.1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(6px)",
          transition: "color 0.15s, background 0.15s, border-color 0.15s",
          padding: 0,
        }}
        aria-label="Raccourcis clavier"
      >
        {/* Keyboard icon — inline SVG, no dependency */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <rect x="3" y="5.5" width="2" height="1.5" rx="0.3" fill="currentColor" />
          <rect x="7" y="5.5" width="2" height="1.5" rx="0.3" fill="currentColor" />
          <rect x="11" y="5.5" width="2" height="1.5" rx="0.3" fill="currentColor" />
          <rect x="3" y="8.5" width="2" height="1.5" rx="0.3" fill="currentColor" />
          <rect x="5.5" y="8.5" width="5" height="1.5" rx="0.3" fill="currentColor" />
          <rect x="11" y="8.5" width="2" height="1.5" rx="0.3" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
