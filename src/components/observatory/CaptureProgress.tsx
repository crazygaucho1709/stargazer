// src/components/observatory/CaptureProgress.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Camera, CheckCircle2 } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MotionDiv = motion.div;

export const CaptureProgress = () => {
    const { captureProgress, stackingProgress, isExposing, language } = useStargazerStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (!mounted) return null;
    if (!isExposing && captureProgress === 0 && stackingProgress === 0) return null;

    const borderColor = isExposing ? "rgba(255, 200, 100, 0.3)" : "rgba(100, 255, 255, 0.2)";

    return createPortal(
        <AnimatePresence>
            <MotionDiv
                initial={{ opacity: 0, x: 50, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.95 }}
                style={{
                    position: "fixed",
                    bottom: "100px",
                    right: "40px",
                    zIndex: 10000,
                    width: "340px",
                    background: "rgba(10, 15, 30, 0.9)",
                    backdropFilter: "blur(16px)",
                    borderRadius: "1rem",
                    padding: "1.25rem",
                    border: `1px solid ${borderColor}`,
                    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(255,255,255,0.05)",
                }}
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", position: "relative" }}>
                    {/* Decorative Corners */}
                    <div style={{ position: "absolute", top: "-2px", left: "-2px", width: "10px", height: "10px", borderTop: "2px solid var(--astro-teal)", borderLeft: "2px solid var(--astro-teal)" }} />
                    <div style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", borderTop: "2px solid var(--astro-teal)", borderRight: "2px solid var(--astro-teal)" }} />

                    {/* Header row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <div className={isExposing ? "pulse-glow" : ""} style={{ position: "relative" }}>
                                <Camera size={20} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                                {isExposing && (
                                    <div style={{
                                        position: "absolute",
                                        top: "-50%",
                                        left: "-50%",
                                        width: "200%",
                                        height: "200%",
                                        borderRadius: "50%",
                                        border: "1px solid var(--astro-gold)",
                                        opacity: 0.3,
                                    }} className="ping-slow" />
                                )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                <span style={{ fontSize: "12px", fontWeight: "bold", color: "white", letterSpacing: "0.1em" }} className="hud-font">
                                    {isExposing ? "DATA ACQUISITION" : "PROCESSING STACK"}
                                </span>
                                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>
                                    SENS. EOS 600D • FRM_CAPT_01
                                </span>
                            </div>
                        </div>
                        <span style={{
                            background: isExposing ? "rgba(255, 180, 0, 0.2)" : "rgba(0, 255, 200, 0.2)",
                            color: isExposing ? "var(--astro-gold)" : "var(--astro-teal)",
                            borderRadius: "2px",
                            padding: "2px 8px",
                            fontSize: "8px",
                            letterSpacing: "0.1em",
                            border: "1px solid rgba(255,255,255,0.2)",
                            fontWeight: "bold",
                        }}>
                            {isExposing ? "ACTIVE_STREAM" : "INTEGRATION"}
                        </span>
                    </div>

                    {/* Capture Progress */}
                    <div style={{ position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <div style={{ width: "2px", height: "10px", background: "var(--astro-gold)" }} />
                                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em", fontWeight: "bold" }}>BUFFER_RAW</span>
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--astro-gold)", fontVariantNumeric: "tabular-nums" }} className="hud-font">
                                {captureProgress}%
                            </span>
                        </div>
                        <div style={{
                            width: "100%",
                            height: "6px",
                            background: "rgba(255,255,255,0.1)",
                            borderRadius: 0,
                            overflow: "hidden",
                            position: "relative",
                            border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                            <MotionDiv
                                style={{ height: "100%", background: "var(--astro-gold)", boxShadow: "0 0 10px var(--astro-gold)" }}
                                initial={{ width: 0 }}
                                animate={{ width: `${captureProgress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                            {/* Scanline overlay */}
                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                background: "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.3) 4px, rgba(0,0,0,0.3) 5px)",
                                pointerEvents: "none",
                            }} />
                        </div>
                    </div>

                    {/* Stacking Progress */}
                    <div style={{ position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <div style={{ width: "2px", height: "10px", background: "var(--astro-teal)" }} />
                                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em", fontWeight: "bold" }}>PROC_INTEGRATION</span>
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--astro-teal)", fontVariantNumeric: "tabular-nums" }} className="hud-font">
                                {stackingProgress}%
                            </span>
                        </div>
                        <div style={{
                            width: "100%",
                            height: "6px",
                            background: "rgba(255,255,255,0.1)",
                            borderRadius: 0,
                            overflow: "hidden",
                            position: "relative",
                            border: "1px solid rgba(255,255,255,0.05)",
                        }}>
                            <MotionDiv
                                style={{ height: "100%", background: "var(--astro-teal)", boxShadow: "0 0 10px var(--astro-teal)" }}
                                initial={{ width: 0 }}
                                animate={{ width: `${stackingProgress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                            {/* Scanline overlay */}
                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                                background: "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.3) 4px, rgba(0,0,0,0.3) 5px)",
                                pointerEvents: "none",
                            }} />
                        </div>
                    </div>

                    {/* Completion banner */}
                    <AnimatePresence>
                        {stackingProgress === 100 && (
                            <MotionDiv
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                    color: "var(--astro-teal)",
                                    fontSize: "10px",
                                    marginTop: "0.25rem",
                                    background: "rgba(0, 255, 180, 0.05)",
                                    padding: "0.5rem",
                                    borderRadius: 0,
                                    border: "1px solid rgba(0, 255, 180, 0.2)",
                                }}
                            >
                                <CheckCircle2 size={12} />
                                <span style={{ fontWeight: "bold", letterSpacing: "0.1em" }}>MASTER_FRAME_SYNCHRONIZED_OK</span>
                            </MotionDiv>
                        )}
                    </AnimatePresence>
                </div>
            </MotionDiv>
        </AnimatePresence>,
        document.body
    );
};
