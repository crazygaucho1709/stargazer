// src/components/camera/FocusCurve.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star } from "lucide-react";
import { notification } from "@/lib/notificationService";

interface FocusPoint {
  position: number;
  hfr: number;
  timestamp: number;
}

export interface FocusCurveProps {
  isVisible: boolean;
  onClose: () => void;
  onMoveTo?: (position: number) => void;
}

const MAX_POINTS = 50;
const SVG_W = 400;
const SVG_H = 200;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 36;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

function toSvgX(pos: number, minPos: number, maxPos: number): number {
  if (maxPos === minPos) return PAD_L + PLOT_W / 2;
  return PAD_L + ((pos - minPos) / (maxPos - minPos)) * PLOT_W;
}

function toSvgY(hfr: number, minHfr: number, maxHfr: number): number {
  if (maxHfr === minHfr) return PAD_T + PLOT_H / 2;
  // HFR smaller = better = higher on chart (lower Y)
  return PAD_T + ((hfr - minHfr) / (maxHfr - minHfr)) * PLOT_H;
}

const GRID_LINES = 4;

export const FocusCurve: React.FC<FocusCurveProps> = ({ isVisible, onClose, onMoveTo }) => {
  const [points, setPoints] = useState<FocusPoint[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    const es = new EventSource("/api/indi/focuser/stream");
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data: FocusPoint = JSON.parse(e.data);
        setPoints((prev) => {
          const next = [...prev, data];
          return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
        });
      } catch {
        // malformed frame — ignore
      }
    };

    es.onerror = () => {
      notification.error("Focus stream error", {
        source: "FocusCurve",
        description: "SSE connection to /api/indi/focuser/stream lost.",
      });
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isVisible) {
      setPoints([]);
      connect();
    } else {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    }
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isVisible, connect]);

  // Derived values
  const hasData = points.length > 0;
  const minHfrPoint = hasData
    ? points.reduce((best, p) => (p.hfr < best.hfr ? p : best), points[0])
    : null;
  const currentPoint = hasData ? points[points.length - 1] : null;

  const allPositions = points.map((p) => p.position);
  const allHfrs = points.map((p) => p.hfr);
  const minPos = hasData ? Math.min(...allPositions) : 0;
  const maxPos = hasData ? Math.max(...allPositions) : 1000;
  const minHfr = hasData ? Math.min(...allHfrs) : 0;
  const maxHfr = hasData ? Math.max(...allHfrs) : 10;
  // Add a bit of padding on Y so points don't sit on the edge
  const hfrRange = maxHfr - minHfr || 1;
  const hfrPadded = hfrRange * 0.15;
  const yMin = Math.max(0, minHfr - hfrPadded);
  const yMax = maxHfr + hfrPadded;

  const svgX = (pos: number) => toSvgX(pos, minPos, maxPos);
  const svgY = (hfr: number) => toSvgY(hfr, yMin, yMax);

  // Build polyline points
  const linePoints = points.map((p) => `${svgX(p.position)},${svgY(p.hfr)}`).join(" ");

  // Grid Y values
  const gridYValues = Array.from({ length: GRID_LINES + 1 }, (_, i) =>
    yMin + (i / GRID_LINES) * (yMax - yMin)
  );

  // Grid X values (position ticks)
  const posRange = maxPos - minPos || 1;
  const gridXValues = Array.from({ length: 5 }, (_, i) =>
    minPos + (i / 4) * posRange
  );

  const handleMoveToBest = () => {
    if (minHfrPoint && onMoveTo) {
      onMoveTo(minHfrPoint.position);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          style={{
            background: "rgba(8, 12, 28, 0.97)",
            border: "1px solid rgba(0,240,255,0.35)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,240,255,0.12)",
            overflow: "hidden",
            width: "100%",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              background: "rgba(0,240,255,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  color: "#00F0FF",
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                }}
              >
                FOCUS CURVE
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {currentPoint && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#6B7280", fontSize: 10 }}>HFR</span>
                  <span
                    style={{
                      color: "#00F0FF",
                      fontSize: 22,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {currentPoint.hfr.toFixed(2)}
                  </span>
                  {minHfrPoint && currentPoint.position === minHfrPoint.position && (
                    <Star
                      size={14}
                      fill="var(--astro-gold, #F6C90E)"
                      stroke="var(--astro-gold, #F6C90E)"
                    />
                  )}
                </div>
              )}
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#6B7280",
                  padding: 2,
                  display: "flex",
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* SVG Chart */}
          <div style={{ padding: "8px 12px 0" }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              width="100%"
              style={{ display: "block" }}
              aria-label="HFR focus curve"
            >
              <defs>
                <filter id="fc-glow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="fc-gold-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Grid horizontal lines */}
              {gridYValues.map((hfr, i) => {
                const y = svgY(hfr);
                return (
                  <g key={i}>
                    <line
                      x1={PAD_L}
                      y1={y}
                      x2={SVG_W - PAD_R}
                      y2={y}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L - 4}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={8}
                      fill="#00F0FF"
                      opacity={0.6}
                    >
                      {hfr.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {/* Grid vertical lines */}
              {gridXValues.map((pos, i) => {
                const x = svgX(pos);
                return (
                  <g key={i}>
                    <line
                      x1={x}
                      y1={PAD_T}
                      x2={x}
                      y2={SVG_H - PAD_B}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={SVG_H - PAD_B + 12}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#00F0FF"
                      opacity={0.6}
                    >
                      {Math.round(pos)}
                    </text>
                  </g>
                );
              })}

              {/* Axis borders */}
              <line
                x1={PAD_L}
                y1={PAD_T}
                x2={PAD_L}
                y2={SVG_H - PAD_B}
                stroke="rgba(0,240,255,0.3)"
                strokeWidth={1}
              />
              <line
                x1={PAD_L}
                y1={SVG_H - PAD_B}
                x2={SVG_W - PAD_R}
                y2={SVG_H - PAD_B}
                stroke="rgba(0,240,255,0.3)"
                strokeWidth={1}
              />

              {/* Axis labels */}
              <text
                x={PAD_L - 28}
                y={PAD_T + PLOT_H / 2}
                textAnchor="middle"
                fontSize={8}
                fill="#00F0FF"
                opacity={0.8}
                transform={`rotate(-90, ${PAD_L - 28}, ${PAD_T + PLOT_H / 2})`}
              >
                HFR
              </text>
              <text
                x={PAD_L + PLOT_W / 2}
                y={SVG_H - 2}
                textAnchor="middle"
                fontSize={8}
                fill="#00F0FF"
                opacity={0.8}
              >
                POSITION (steps)
              </text>

              {/* Data line (no library, pure SVG) */}
              {points.length > 1 && (
                <polyline
                  points={linePoints}
                  fill="none"
                  stroke="#00F0FF"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  filter="url(#fc-glow)"
                  opacity={0.85}
                />
              )}

              {/* Data dots */}
              {points.map((p, i) => {
                const x = svgX(p.position);
                const y = svgY(p.hfr);
                const isMin = minHfrPoint && p === minHfrPoint;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={isMin ? 0 : 2.5}
                    fill={isMin ? "transparent" : "#00F0FF"}
                    opacity={isMin ? 0 : 0.7}
                  />
                );
              })}

              {/* Min HFR gold star/crosshair */}
              {minHfrPoint && (() => {
                const x = svgX(minHfrPoint.position);
                const y = svgY(minHfrPoint.hfr);
                const gold = "var(--astro-gold, #F6C90E)";
                const arm = 6;
                return (
                  <g filter="url(#fc-gold-glow)">
                    {/* Crosshair lines */}
                    <line x1={x - arm} y1={y} x2={x + arm} y2={y} stroke={gold} strokeWidth={1.5} opacity={0.9} />
                    <line x1={x} y1={y - arm} x2={x} y2={y + arm} stroke={gold} strokeWidth={1.5} opacity={0.9} />
                    {/* Star points (simplified 4-point) */}
                    <polygon
                      points={`
                        ${x},${y - arm * 0.7}
                        ${x + arm * 0.25},${y - arm * 0.25}
                        ${x + arm * 0.7},${y}
                        ${x + arm * 0.25},${y + arm * 0.25}
                        ${x},${y + arm * 0.7}
                        ${x - arm * 0.25},${y + arm * 0.25}
                        ${x - arm * 0.7},${y}
                        ${x - arm * 0.25},${y - arm * 0.25}
                      `}
                      fill={gold}
                      opacity={0.95}
                    />
                    {/* Center dot */}
                    <circle cx={x} cy={y} r={2} fill={gold} />
                  </g>
                );
              })()}

              {/* Placeholder when no data */}
              {!hasData && (
                <text
                  x={SVG_W / 2}
                  y={SVG_H / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill="rgba(255,255,255,0.2)"
                >
                  Waiting for focus data…
                </text>
              )}
            </svg>
          </div>

          {/* Footer info row + action */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px 12px",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", gap: 16, fontSize: 10, color: "#9CA3AF" }}>
              <span>
                <span style={{ color: "#6B7280" }}>Position </span>
                <span style={{ color: "white", fontVariantNumeric: "tabular-nums" }}>
                  {currentPoint ? currentPoint.position.toLocaleString() : "—"}
                </span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.15)" }}>│</span>
              <span>
                <span style={{ color: "#6B7280" }}>Min pos </span>
                <span
                  style={{
                    color: "var(--astro-gold, #F6C90E)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {minHfrPoint ? minHfrPoint.position.toLocaleString() : "—"}
                </span>
              </span>
            </div>

            {onMoveTo && minHfrPoint && (
              <button
                onClick={handleMoveToBest}
                style={{
                  background: "var(--astro-gold, #F6C90E)",
                  color: "black",
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Move to Best Focus
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
