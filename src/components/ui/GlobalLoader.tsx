// src/components/ui/GlobalLoader.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Orbit, Activity, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const Particle = ({ i }: { i: number }) => {
    const randomX = Math.random() * 100;
    const randomY = Math.random() * 100;
    const randomDelay = Math.random() * 5;
    const randomDuration = 10 + Math.random() * 20;

    return (
        <motion.div
            className="absolute w-0.5 h-0.5 rounded-full"
            style={{ background: "var(--astro-teal)" }}
            initial={{ left: `${randomX}%`, top: `${randomY}%`, opacity: 0 }}
            animate={{
                top: ["0%", "100%"],
                opacity: [0, 0.8, 0],
                x: [0, Math.random() * 50 - 25],
            }}
            transition={{
                duration: randomDuration,
                repeat: Infinity,
                delay: randomDelay,
                ease: "linear",
            }}
        />
    );
};

export const GlobalLoader = () => {
    const { isGlobalLoading, globalLoadingMessage } = useStargazerStore();
    const [glitchText, setGlitchText] = useState("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (isGlobalLoading) {
            const message = globalLoadingMessage || "EXECUTING_COMMAND";
            let i = 0;
            const timer = setInterval(() => {
                setGlitchText(message.substring(0, i));
                i++;
                if (i > message.length) clearInterval(timer);
            }, 50);
            return () => clearInterval(timer);
        }
    }, [isGlobalLoading, globalLoadingMessage]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isGlobalLoading && (
                <motion.div
                    className="fixed inset-0 flex items-center justify-center overflow-hidden z-[9999]"
                    style={{ background: "rgba(2, 4, 8, 0.95)", backdropFilter: "blur(40px)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    {/* Particle System */}
                    <div className="absolute inset-0 pointer-events-none opacity-30">
                        {Array.from({ length: 40 }).map((_, i) => <Particle key={i} i={i} />)}
                    </div>

                    {/* Scanning Grid */}
                    <div className="absolute inset-0 pointer-events-none">
                        <motion.div
                            className="w-full h-full"
                            style={{
                                opacity: 0.03,
                                backgroundImage: "radial-gradient(var(--astro-teal) 1px, transparent 0)",
                                backgroundSize: "40px 40px",
                            }}
                            animate={{ backgroundPosition: ["0px 0px", "40px 40px"] }}
                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                        />
                        <div
                            className="absolute h-px w-full scanline"
                            style={{
                                background: "linear-gradient(90deg, transparent, var(--astro-teal), transparent)",
                                boxShadow: "0 0 20px var(--astro-teal)",
                            }}
                        />
                    </div>

                    {/* Main HUD */}
                    <div className="relative flex flex-col items-center gap-16 w-full">
                        {/* Central Core */}
                        <div className="relative w-[300px] h-[300px]">
                            {/* Large ring */}
                            <motion.div
                                className="absolute rounded-full"
                                style={{ inset: "-40px", border: "1px solid rgba(255, 51, 51, 0.1)" }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            />
                            <div
                                className="absolute px-2 rounded-sm"
                                style={{
                                    top: "-42px", left: "50%", transform: "translateX(-50%)",
                                    background: "rgba(2,4,8,1)",
                                    border: "1px solid rgba(255,51,51,0.2)",
                                }}
                            >
                                <span className="hud-font text-[8px]" style={{ color: "var(--astro-teal)" }}>AZ_LIMIT_LOCK</span>
                            </div>

                            {/* Rotating arcs */}
                            <motion.div
                                className="absolute rounded-full"
                                style={{
                                    inset: "-20px",
                                    border: "4px double transparent",
                                    borderTopColor: "rgba(255, 51, 51, 0.4)",
                                    borderBottomColor: "rgba(255, 51, 51, 0.4)",
                                }}
                                animate={{ rotate: -360 }}
                                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            />
                            <motion.div
                                className="absolute rounded-full"
                                style={{ inset: "20px", border: "1px dashed rgba(255, 51, 51, 0.3)" }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                            />

                            {/* Inner glow */}
                            <div
                                className="absolute pulse-glow rounded-full"
                                style={{
                                    inset: "50px",
                                    background: "radial-gradient(circle, rgba(255, 51, 51, 0.1) 0%, transparent 70%)",
                                }}
                            />

                            {/* Central icon */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <motion.div
                                    animate={{
                                        scale: [0.95, 1.05, 0.95],
                                        filter: ["hue-rotate(0deg)", "hue-rotate(15deg)", "hue-rotate(0deg)"],
                                    }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <Orbit size={120} color="var(--astro-teal)" className="pulse-glow" />
                                </motion.div>
                            </div>

                            {/* Orbital dots */}
                            {[0, 90, 180, 270].map((angle, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute"
                                    style={{ top: "50%", left: "50%", transformOrigin: "0 130px", marginTop: "-65px" }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 15 + i * 5, repeat: Infinity, ease: "linear" }}
                                >
                                    <div style={{ transform: `rotate(${angle}deg)` }}>
                                        <div
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{ background: "var(--astro-gold)", boxShadow: "0 0 10px var(--astro-gold)" }}
                                        />
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Text & Status HUD */}
                        <div className="flex flex-col items-center gap-8 w-full">
                            <div className="flex flex-col items-center gap-2">
                                <div className="relative">
                                    <motion.span
                                        className="hud-font text-white font-black text-center uppercase tracking-[0.3em] block"
                                        style={{ fontSize: "42px", textShadow: "0 0 20px var(--astro-teal)" }}
                                    >
                                        {glitchText}
                                        <motion.span
                                            animate={{ opacity: [1, 0] }}
                                            transition={{ duration: 0.5, repeat: Infinity }}
                                        >_</motion.span>
                                    </motion.span>
                                </div>
                                <div className="flex items-center gap-10 opacity-60">
                                    <span className="hud-font text-[10px]" style={{ color: "var(--astro-teal)" }}>LAT: -17.6008</span>
                                    <span className="hud-font text-[10px]" style={{ color: "var(--astro-teal)" }}>LON: -149.6091</span>
                                    <span className="hud-font text-[10px]" style={{ color: "var(--astro-teal)" }}>SYS: READY</span>
                                </div>
                            </div>

                            {/* Data stream banner */}
                            <div
                                className="relative flex items-center gap-6 px-10 py-4 rounded-sm overflow-hidden"
                                style={{ background: "rgba(255, 51, 51, 0.05)", border: "1px solid rgba(255, 51, 51, 0.2)" }}
                            >
                                <motion.div
                                    className="absolute top-0 h-px w-full"
                                    style={{ background: "var(--astro-teal)" }}
                                    initial={{ left: "-100%" }}
                                    animate={{ left: "100%" }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                />
                                <div className="flex items-center gap-3">
                                    <Activity size={16} color="var(--astro-teal)" className="pulse-glow" />
                                    <span className="hud-font text-[11px] font-bold tracking-[0.2em]" style={{ color: "var(--astro-teal)" }}>
                                        ASTROBERRY UP-LINK ESTABLISHED
                                    </span>
                                </div>
                                <div className="w-px h-5" style={{ background: "rgba(255, 51, 51, 0.3)" }} />
                                <div className="flex items-center gap-3">
                                    <Terminal size={16} color="var(--astro-gold)" />
                                    <span className="hud-font text-[11px] font-bold tracking-[0.2em]" style={{ color: "var(--astro-gold)" }}>
                                        INDI STREAM ACTIVE
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Corner decorations */}
                        <div className="absolute opacity-30" style={{ top: "-100px", left: "-100px", width: "120px", height: "120px", borderTop: "1px solid var(--astro-teal)", borderLeft: "1px solid var(--astro-teal)" }} />
                        <div className="absolute opacity-30" style={{ top: "-100px", right: "-100px", width: "120px", height: "120px", borderTop: "1px solid var(--astro-teal)", borderRight: "1px solid var(--astro-teal)" }} />
                        <div className="absolute opacity-30" style={{ bottom: "-100px", left: "-100px", width: "120px", height: "120px", borderBottom: "1px solid var(--astro-teal)", borderLeft: "1px solid var(--astro-teal)" }} />
                        <div className="absolute opacity-30" style={{ bottom: "-100px", right: "-100px", width: "120px", height: "120px", borderBottom: "1px solid var(--astro-teal)", borderRight: "1px solid var(--astro-teal)" }} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
