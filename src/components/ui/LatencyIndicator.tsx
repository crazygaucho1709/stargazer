// src/components/ui/LatencyIndicator.tsx
"use client";

/**
 * LatencyIndicator — affiche la latence SSE avec un dot coloré.
 *
 * Vert  : < 100 ms
 * Ambre : 100–500 ms
 * Rouge : > 500 ms ou null (déconnecté)
 *
 * Usage : <LatencyIndicator latencyMs={latencyMs} />
 */

import React from "react";

interface LatencyIndicatorProps {
  latencyMs: number | null;
  /** Affiche un label texte avant la valeur. Default: "SSE" */
  label?: string;
}

type Status = "ok" | "warn" | "error";

function getStatus(ms: number | null): Status {
  if (ms === null) return "error";
  if (ms < 100) return "ok";
  if (ms <= 500) return "warn";
  return "error";
}

const DOT_COLOR: Record<Status, string> = {
  ok: "#4ade80",    // green-400
  warn: "#fbbf24",  // amber-400
  error: "#f87171", // red-400
};

const TEXT_COLOR: Record<Status, string> = {
  ok: "#86efac",    // green-300
  warn: "#fde68a",  // amber-200
  error: "#fca5a5", // red-300
};

export function LatencyIndicator({
  latencyMs,
  label = "SSE",
}: LatencyIndicatorProps) {
  const status = getStatus(latencyMs);
  const dotColor = DOT_COLOR[status];
  const textColor = TEXT_COLOR[status];

  const valueText =
    latencyMs === null ? "—" : `${latencyMs}ms`;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: "10px",
        letterSpacing: "0.04em",
        color: textColor,
        userSelect: "none",
      }}
      title={`Latence SSE${latencyMs !== null ? ` : ${latencyMs}ms` : " : déconnecté"}`}
    >
      {/* Dot */}
      <span
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: dotColor,
          boxShadow: status === "ok" ? `0 0 4px ${dotColor}` : "none",
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ opacity: 0.6 }}>{label}</span>
      )}
      <span>{valueText}</span>
    </span>
  );
}
