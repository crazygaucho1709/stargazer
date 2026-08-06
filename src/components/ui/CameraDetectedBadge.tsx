// src/components/ui/CameraDetectedBadge.tsx
"use client";

import { useStargazerStore } from "@/store/useStargazerStore";

interface CameraDetectedBadgeProps {
    onOpenCamera?: () => void;
}

export function CameraDetectedBadge({ onOpenCamera }: CameraDetectedBadgeProps) {
    const detectedCcd   = useStargazerStore((s) => s.detectedCcd);
    const liveViewMode  = useStargazerStore((s) => s.liveViewMode);
    const isConnected   = useStargazerStore((s) => s.isConnected);
    const sessionState  = useStargazerStore((s) => s.sessionState);

    const isStreaming = sessionState === "CAPTURING" || sessionState === "STACKING";
    const hasCamera   = isConnected && detectedCcd;

    const dotColor  = !hasCamera   ? "#6b7280"   // gray-500
                    : isStreaming   ? "#16a34a"   // green-600
                    :                "#d97706";   // amber-600

    const badgeBg   = !hasCamera   ? "rgba(55, 65, 81, 0.6)"
                    : isStreaming   ? "rgba(20, 83, 45, 0.5)"
                    :                "rgba(120, 53, 15, 0.35)";

    const borderColor = !hasCamera ? "rgba(107,114,128,0.3)"
                      : isStreaming ? "rgba(22,163,74,0.4)"
                      :               "rgba(217,119,6,0.4)";

    const modeLabel = liveViewMode === "CANON" ? "Canon" : "CCD";
    const label     = hasCamera ? `${detectedCcd} · ${modeLabel}` : "Aucune caméra";

    return (
        <button
            onClick={onOpenCamera}
            title={hasCamera ? `Cliquer pour ouvrir les contrôles caméra (${modeLabel})` : "Aucune caméra détectée"}
            style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "6px",
                padding:        "4px 10px 4px 8px",
                borderRadius:   "20px",
                background:     badgeBg,
                border:         `1px solid ${borderColor}`,
                backdropFilter: "blur(8px)",
                cursor:         onOpenCamera ? "pointer" : "default",
                fontSize:       "11px",
                fontFamily:     "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                color:          "#cbd5e1",
                transition:     "background 0.2s, border-color 0.2s",
                whiteSpace:     "nowrap",
                lineHeight:     "1",
            }}
        >
            {/* Dot indicator */}
            <span
                style={{
                    width:        "7px",
                    height:       "7px",
                    borderRadius: "50%",
                    background:   dotColor,
                    flexShrink:   0,
                    boxShadow:    hasCamera ? `0 0 6px ${dotColor}` : "none",
                    transition:   "background 0.2s, box-shadow 0.2s",
                }}
            />

            {/* Camera icon (SVG inline, no extra dep) */}
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.7, flexShrink: 0 }}
            >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
            </svg>

            {/* Label */}
            <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }}>
                {label}
            </span>
        </button>
    );
}
