// src/components/observatory/HfrOverlay.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Activity, Target, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { createPortal } from "react-dom";

const MotionDiv = motion.div;

export const HfrOverlay = () => {
    const { hfr, language } = useStargazerStore();
    const [hfrHistory, setHfrHistory] = useState<number[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (hfr !== null) {
            setHfrHistory(prev => [...prev.slice(-15), hfr]);
        } else {
            setHfrHistory([]);
        }
    }, [hfr]);

    if (hfr === null) return null;
    if (!mounted) return null;

    const isPerfect = hfr < 1.8;
    const isGood = hfr < 2.8;
    const isBlurry = hfr >= 2.8;

    const getStatusText = () => {
        if (isPerfect) return language === 'fr' ? "FOCUS PARFAIT" : "PERFECT FOCUS";
        if (isGood) return language === 'fr' ? "FOCUS CORRECT" : "GOOD FOCUS";
        return language === 'fr' ? "HORS FOCUS" : "OUT OF FOCUS";
    };

    const getStatusColor = () => {
        if (isPerfect) return "var(--astro-teal)";
        if (isGood) return "var(--astro-gold)";
        return "var(--astro-error)";
    };

    const StatusIcon = isPerfect ? ShieldCheck : isGood ? CheckCircle2 : AlertCircle;

    return createPortal(
        <MotionDiv
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
                position: "absolute",
                top: "30px",
                left: "30px",
                background: "rgba(10, 15, 30, 0.85)",
                backdropFilter: "blur(16px)",
                borderRadius: "1rem",
                padding: "1.25rem",
                border: `1px solid ${getStatusColor()}`,
                boxShadow: `0 15px 40px rgba(0,0,0,0.6), 0 0 20px ${getStatusColor()}33`,
                zIndex: 1400,
                minWidth: "260px",
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--astro-teal)" }}>
                        <Activity size={16} />
                        <span style={{ fontSize: "10px", fontWeight: "bold", letterSpacing: "0.2em" }} className="hud-font">
                            OPTICAL AI
                        </span>
                    </div>
                    <span style={{
                        background: `${getStatusColor()}22`,
                        color: getStatusColor(),
                        fontSize: "9px",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        border: `1px solid ${getStatusColor()}44`,
                        fontWeight: "bold",
                    }}>
                        {getStatusText()}
                    </span>
                </div>

                {/* HFR value + icon */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div>
                        <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", marginBottom: "2px", letterSpacing: "0.05em" }}>HALF-FLUX RADIUS</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                            <span style={{ fontSize: "38px", color: "white", fontWeight: "bold", lineHeight: "1" }} className="hud-font">
                                {hfr.toFixed(2)}
                            </span>
                            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>px</span>
                        </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <StatusIcon
                            size={40}
                            color={getStatusColor()}
                            className={isBlurry ? "pulse-glow" : ""}
                        />
                    </div>
                </div>

                {/* Focus Trend Sparkline */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    <p style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>FOCUS TREND (LOWER IS BETTER)</p>
                    <div style={{
                        height: "30px",
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-end",
                        gap: "3px",
                        background: "rgba(0,0,0,0.2)",
                        padding: "6px",
                        borderRadius: "0.5rem",
                    }}>
                        {hfrHistory.length > 0 ? hfrHistory.map((val, i) => {
                            const height = Math.min(100, Math.max(10, (6 - val) / 6 * 100));
                            return (
                                <MotionDiv
                                    key={i}
                                    style={{
                                        flex: 1,
                                        background: i === hfrHistory.length - 1 ? getStatusColor() : "rgba(255,255,255,0.2)",
                                        borderRadius: "1px",
                                    }}
                                    initial={{ scaleY: 0 }}
                                    animate={{ scaleY: 1, height: `${height}%` }}
                                    transition={{ duration: 0.3 }}
                                />
                            );
                        }) : (
                            <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", width: "100%", textAlign: "center" }}>
                                WAITING FOR SENSOR DATA...
                            </span>
                        )}
                    </div>
                </div>

                {/* Instruction */}
                <div style={{ paddingTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                        <Target size={12} color="var(--astro-teal)" style={{ marginTop: "2px", flexShrink: 0 }} />
                        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.9)", lineHeight: "1.5" }}>
                            {language === 'fr'
                                ? "Action : Ajustez la mise au point jusqu'à ce que l'indicateur devienne VERT."
                                : "Instruction: Adjust focus until indicator turns GREEN."}
                        </p>
                    </div>
                </div>
            </div>
        </MotionDiv>,
        document.body
    );
};
