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
    const glows = sessionState === "ERROR" || sessionState === "SLEWING";

    return (
        <div
            className="flex items-center gap-2 px-3 py-1 rounded-full"
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
            <div
                className={`w-1.5 h-1.5 rounded-full ${sessionState === "CAPTURING" ? "ping-slow" : ""}`}
                style={{ background: color, boxShadow: glows ? `0 0 8px ${color}` : "none" }}
            />
            <IconComp size={12} style={{ color }} />
            <span className="hud-font text-[10px] font-bold tracking-[0.08em]" style={{ color }}>
                {label}
            </span>
        </div>
    );
};
