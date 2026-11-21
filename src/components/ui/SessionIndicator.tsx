// src/components/ui/SessionIndicator.tsx
"use client";

import { Activity, Zap, Orbit } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { STATE_LABELS, STATE_COLORS, SessionState } from "@/lib/sessionMachine";

const STATE_ICONS: Record<SessionState, React.ElementType> = {
    IDLE:       Activity,
    PARKED:     Orbit,
    UNPARKING:  Orbit,
    TRACKING:   Activity,
    SLEWING:    Zap,
    GUIDING:    Activity,
    CAPTURING:  Zap,
    STACKING:   Zap,
    STOPPING:   Activity,
    ERROR:      Activity,
};

export const SessionIndicator = () => {
    const sessionState = useStargazerStore((s) => s.sessionState);
    const language = useStargazerStore((s) => s.language);
    const lang = language === "fr" ? "fr" : "en";
    const label = STATE_LABELS[sessionState][lang];
    const color = STATE_COLORS[sessionState];
    const IconComp = STATE_ICONS[sessionState];
    const glows = sessionState === "ERROR" || sessionState === "SLEWING" || sessionState === "CAPTURING";

    return (
        <div
            className="inline-flex items-center gap-2 px-2.5 min-h-[var(--size-touch)] rounded-lg shrink-0"
            style={{
                background: "rgba(15, 23, 42, 0.65)",
                border: "1px solid rgba(148, 163, 184, 0.16)",
            }}
            role="status"
            aria-label={`État de session : ${label}`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${sessionState === "CAPTURING" ? "ping-slow" : ""}`}
                style={{ background: color, boxShadow: glows ? `0 0 8px ${color}` : "none" }}
                aria-hidden
            />
            <IconComp size={13} style={{ color }} aria-hidden />
            <span className="hud-font text-hud-2xs font-semibold tracking-[0.08em] whitespace-nowrap" style={{ color }}>
                {label}
            </span>
        </div>
    );
};
