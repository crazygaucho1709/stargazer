// src/components/camera/CaptureProgressPanel.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
    Camera, Layers, CheckCircle2, AlertTriangle, Square,
    Play, Clock, ChevronDown, ChevronUp
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useCapture } from "@/hooks/useCapture";

function formatDuration(seconds: number): string {
    if (seconds <= 0) return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
    if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
}

const LOG_COLORS: Record<string, string> = {
    info:    "rgba(255,255,255,0.6)",
    success: "#68D391",
    error:   "#FC8181",
    warn:    "#F6AD55",
};

function ProgressBar({ value, color = "var(--astro-teal)" }: { value: number; color?: string }) {
    return (
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
                className="h-full rounded-full"
                style={{
                    width: `${Math.min(100, Math.max(0, value))}%`,
                    background: color,
                    transition: "width 0.6s ease-out",
                }}
            />
        </div>
    );
}

const PHASE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
    idle:      { label: "En attente", bg: "rgba(255,255,255,0.1)",  color: "rgba(255,255,255,0.7)" },
    capturing: { label: "Capture",    bg: "rgba(59,130,246,0.2)",   color: "#93C5FD" },
    stacking:  { label: "Stacking",   bg: "rgba(147,51,234,0.2)",   color: "#C4B5FD" },
    complete:  { label: "Terminé",    bg: "rgba(34,197,94,0.2)",    color: "#86EFAC" },
    error:     { label: "Erreur",     bg: "rgba(239,68,68,0.2)",    color: "#FCA5A5" },
};

function PhaseBadge({ phase }: { phase: string }) {
    const s = PHASE_STYLES[phase] ?? PHASE_STYLES["idle"];
    return (
        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: s.bg, color: s.color }}>
            {s.label}
        </span>
    );
}

function Spinner() {
    return <div className="w-3 h-3 rounded-full border-2 border-blue-300/30 border-t-blue-300 animate-spin" />;
}

interface CaptureProgressPanelProps {
    onClose?: () => void;
}

export const CaptureProgressPanel = ({ onClose }: CaptureProgressPanelProps) => {
    const { detectedCcd } = useStargazerStore();
    const capture = useCapture();

    const [exposure, setExposure] = useState(30);
    const [count, setCount] = useState(20);
    const [gain, setGain] = useState(400);
    const [showLog, setShowLog] = useState(false);

    const logEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (showLog) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [capture.state.log, showLog]);

    const { state } = capture;
    const isRunning = state.running;
    const isDone    = state.phase === "complete";
    const isError   = state.phase === "error";
    const frameProgress = state.total_frames > 0
        ? (state.current_frame / state.total_frames) * 100 : 0;
    const progressColor = isDone ? "#68D391" : isError ? "#FC8181" : "var(--astro-teal)";

    return (
        <div
            className="w-full rounded-xl p-4"
            style={{
                background: "rgba(2, 8, 23, 0.95)",
                border: "1px solid rgba(255,255,255,0.2)",
                backdropFilter: "blur(12px)",
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Camera size={16} style={{ color: "#93C5FD" }} />
                    <span className="text-sm font-bold text-white">Séquence de capture</span>
                </div>
                <div className="flex items-center gap-2">
                    <PhaseBadge phase={state.phase} />
                    {onClose && (
                        <button
                            className="text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                            style={{ color: "rgba(255,255,255,0.4)" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                            onClick={onClose}
                        >✕</button>
                    )}
                </div>
            </div>

            {/* Params — only when idle */}
            {!isRunning && state.phase === "idle" && (
                <>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {[
                            { label: "Exposition", value: exposure, set: setExposure, step: 5, min: 1, max: 300, fmt: (v: number) => `${v}s` },
                            { label: "Frames",     value: count,    set: setCount,    step: 5, min: 1, max: 200, fmt: (v: number) => `${v}` },
                            { label: "Gain ISO",   value: gain,     set: setGain,     step: 100, min: 100, max: 6400, fmt: (v: number) => `${v}` },
                        ].map(({ label, value, set, step, min, max, fmt }) => (
                            <div key={label} className="flex flex-col gap-0.5">
                                <span className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        className="text-[10px] px-1 cursor-pointer"
                                        style={{ color: "rgba(255,255,255,0.5)" }}
                                        onClick={() => set(Math.max(min, value - step))}
                                    >−</button>
                                    <span className="text-sm text-white font-mono text-center min-w-[40px]">{fmt(value)}</span>
                                    <button
                                        className="text-[10px] px-1 cursor-pointer"
                                        style={{ color: "rgba(255,255,255,0.5)" }}
                                        onClick={() => set(Math.min(max, value + step))}
                                    >+</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[10px] mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Durée estimée: {formatDuration(exposure * count)} · {detectedCcd || "Canon DSLR"}
                    </p>
                </>
            )}

            {/* Progress */}
            {(isRunning || isDone || isError) && (
                <div className="flex flex-col gap-3 mb-3">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                {isRunning && <Spinner />}
                                <Camera size={12} style={{ color: "#93C5FD" }} />
                                <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                                    Frame {state.current_frame}/{state.total_frames}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                    <Clock size={10} style={{ color: "rgba(255,255,255,0.4)" }} />
                                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                                        {formatDuration(state.elapsed_s)}
                                    </span>
                                </div>
                                {state.eta_s > 0 && (
                                    <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
                                        ETA {formatDuration(state.eta_s)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <ProgressBar value={frameProgress} color={progressColor} />
                    </div>

                    {state.stack_count > 0 && (
                        <div className="flex items-center gap-2">
                            <Layers size={12} style={{ color: "#C4B5FD" }} />
                            <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                                Stack: <span style={{ color: "#C4B5FD" }}>{state.stack_count} frames</span>
                            </span>
                            {state.hfr && (
                                <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                                    HFR: <span style={{ color: "#5EEAD4" }}>{state.hfr.toFixed(2)}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {isError && state.error && (
                        <div className="flex items-center gap-2 p-2 rounded-md" style={{ background: "rgba(127,29,29,0.5)", border: "1px solid rgba(220,38,38,0.5)" }}>
                            <AlertTriangle size={12} style={{ color: "#FCA5A5" }} />
                            <span className="text-xs" style={{ color: "#FCA5A5" }}>{state.error}</span>
                        </div>
                    )}

                    {isDone && (
                        <div className="flex items-center justify-center gap-1">
                            <CheckCircle2 size={12} style={{ color: "#86EFAC" }} />
                            <span className="text-xs" style={{ color: "#86EFAC" }}>Séquence terminée — {state.stack_count} frames</span>
                        </div>
                    )}
                </div>
            )}

            {/* Thumbnail + metrics */}
            {state.last_thumbnail && (
                <div className="flex items-center gap-3 mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={state.last_thumbnail} alt="Stack preview"
                        style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Dernier stack</span>
                        {state.hfr && (
                            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>HFR: <span style={{ color: "#5EEAD4" }}>{state.hfr.toFixed(2)}</span></span>
                        )}
                        {state.snr && (
                            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>SNR: <span style={{ color: "#FDE047" }}>{state.snr.toFixed(1)}</span></span>
                        )}
                        <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>{state.stack_count} frames empilées</span>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className={`flex gap-2 ${capture.startError ? "mb-3" : ""}`}>
                {!isRunning ? (
                    <button
                        className="flex flex-1 items-center justify-center gap-1 h-8 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                        style={{ background: "#3B82F6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#2563EB")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#3B82F6")}
                        disabled={capture.starting}
                        onClick={() => capture.start({ exposure, count, gain, device: detectedCcd || null })}
                    >
                        {capture.starting ? <Spinner /> : <Play size={12} />}
                        <span>{isDone ? "Nouvelle séquence" : "Démarrer"}</span>
                    </button>
                ) : (
                    <button
                        className="flex flex-1 items-center justify-center gap-1 h-8 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                        style={{ border: "1px solid #EF4444", color: "#EF4444" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                        onClick={capture.stop}
                    >
                        <Square size={12} />
                        <span>Arrêter</span>
                    </button>
                )}
            </div>

            {capture.startError && (
                <div className="flex items-center gap-2 p-2 rounded-md mt-3" style={{ background: "rgba(127,29,29,0.5)", border: "1px solid rgba(220,38,38,0.5)" }}>
                    <AlertTriangle size={12} style={{ color: "#FCA5A5" }} />
                    <span className="text-xs" style={{ color: "#FCA5A5" }}>{capture.startError}</span>
                </div>
            )}

            {/* Log toggle */}
            {state.log.length > 0 && (
                <>
                    <div className="h-px mt-3 mb-2" style={{ background: "rgba(255,255,255,0.1)" }} />
                    <button
                        className="flex w-full items-center justify-center gap-1 text-[10px] transition-colors cursor-pointer"
                        style={{ color: "rgba(255,255,255,0.5)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                        onClick={() => setShowLog(!showLog)}
                    >
                        <span>Journal ({state.log.length})</span>
                        {showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    {showLog && (
                        <div
                            className="mt-2 p-2 rounded-md text-[10px] font-mono overflow-y-auto max-h-[120px]"
                            style={{ background: "rgba(0,0,0,0.3)" }}
                        >
                            {state.log.map((entry, i) => (
                                <div key={i} className="flex gap-2 mb-0.5">
                                    <span style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{entry.time}</span>
                                    <span style={{ color: LOG_COLORS[entry.type] ?? "rgba(255,255,255,0.6)" }}>{entry.msg}</span>
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CaptureProgressPanel;
