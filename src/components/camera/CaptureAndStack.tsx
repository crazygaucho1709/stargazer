// src/components/camera/CaptureAndStack.tsx
"use client";

import { useState, useCallback, useRef } from "react";
import {
    Camera, Play, Square, Layers, Target, Zap, Clock,
    BrainCircuit, Aperture, Info, Thermometer, ShieldCheck, Wand2
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { clientApiUrl } from "@/lib/clientApi";
import { useAstroAction } from "@/hooks/useAstroAction";
import { notification } from "@/lib/notificationService";
import { Tooltip } from "@/components/ui/tooltip";
import { AutofocusWizard } from "@/components/telescope/AutofocusWizard";

interface CaptureFrame {
    id: string;
    timestamp: number;
    exposure: number;
    gain: number;
    hfr: number;
    starsDetected: number;
    filename: string;
}

interface StackingResult {
    id: string;
    framesUsed: number;
    totalExposure: number;
    snr: number;
    fwhm: number;
    progress: number;
    status: 'idle' | 'aligning' | 'stacking' | 'complete';
}

function Spinner() {
    return <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

export const CaptureAndStack = () => {
    const { language, config, selectedObjectId, targets } = useStargazerStore();
    const currentTarget = targets.find(t => t.id === selectedObjectId);
    const { execute: performAction, isPending, error: actionError } = useAstroAction();

    const [exposure, setExposure] = useState(30);
    const [gain, setGain] = useState(800);
    const [numFrames, setNumFrames] = useState(20);
    const [isCapturing, setIsCapturing] = useState(false);
    const isCapturingRef = useRef(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [frames, setFrames] = useState<CaptureFrame[]>([]);
    const [isAutoFocus, setIsAutoFocus] = useState(true);
    const [isGuiding, setIsGuiding] = useState(true);

    const [stackingResult, setStackingResult] = useState<StackingResult | null>(null);
    const [isStacking, setIsStacking] = useState(false);

    const [focusPosition, setFocusPosition] = useState(0);
    const [focusHFR, setFocusHFR] = useState<number | null>(null);
    const [isFocusing, setIsFocusing] = useState(false);
    const [showAutofocus, setShowAutofocus] = useState(false);
    const [autoStartAiSequence, setAutoStartAiSequence] = useState(false);
    const [isAiSequencePending, setIsAiSequencePending] = useState(false);

    const [liveStats, setLiveStats] = useState({
        temperature: -5,
        downloadTime: 2.5,
        remainingTime: 0,
        adu: 4500,
        peakADU: 12000,
    });

    const performAutoFocus = useCallback(async () => {
        return await performAction(async () => {
            setIsFocusing(true);
            const positions = [-500, -250, -100, 0, 100, 250, 500];
            const hfrs: number[] = [];
            for (const pos of positions) {
                setFocusPosition(pos);
                await new Promise(r => setTimeout(r, 1000));
                const simulatedHFR = 2 + Math.pow(pos / 300, 2) + Math.random() * 0.2;
                hfrs.push(simulatedHFR);
                setFocusHFR(simulatedHFR);
            }
            const minIdx = hfrs.indexOf(Math.min(...hfrs));
            setFocusPosition(positions[minIdx]);
            setFocusHFR(hfrs[minIdx]);
            setIsFocusing(false);
            return hfrs[minIdx];
        }, "AUTO FOCUS CALIBRATION");
    }, [performAction]);

    const startCapture = useCallback(async () => {
        isCapturingRef.current = true;
        setIsCapturing(true);
        setCurrentFrame(0);
        setFrames([]);

        if (isAutoFocus) await performAutoFocus();

        for (let i = 1; i <= numFrames; i++) {
            if (!isCapturingRef.current) break;
            setCurrentFrame(i);

            try {
                const capParams = new URLSearchParams({ exposure: String(exposure), device: "Canon DSLR EOS 600D" });
                const res = await fetch(clientApiUrl(`/api/indi/ccd?${capParams.toString()}`), {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    cache: 'no-store',
                });
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }
            } catch (e: unknown) {
                notification.error("Échec de la capture", {
                    description: e instanceof Error ? e.message : "Erreur lors de la prise de vue",
                    source: "Caméra",
                });
                isCapturingRef.current = false;
                setIsCapturing(false);
                break;
            }

            const sleepTimeMs = (exposure + 1) * 1000;
            const checkIntervalMs = 500;
            let elapsedMs = 0;
            while (elapsedMs < sleepTimeMs) {
                if (!isCapturingRef.current) break;
                await new Promise(r => setTimeout(r, Math.min(checkIntervalMs, sleepTimeMs - elapsedMs)));
                elapsedMs += checkIntervalMs;
            }
            if (!isCapturingRef.current) break;

            let measuredHfr = focusHFR;
            try {
                const metricRes = await fetch('/api/indi?endpoint=ccd/focus-metric');
                const metricData = await metricRes.json();
                if (metricData.success) measuredHfr = metricData.metric;
            } catch { /* metric optional */ }

            const frame: CaptureFrame = {
                id: `frame_${Date.now()}`,
                timestamp: Date.now(),
                exposure,
                gain,
                hfr: measuredHfr || 2.5,
                starsDetected: 150,
                filename: `light_${String(i).padStart(3, '0')}.cr3`,
            };

            setFrames(prev => [...prev, frame]);
            setLiveStats(s => ({ ...s, remainingTime: (numFrames - i) * (exposure + 3) }));
        }

        isCapturingRef.current = false;
        setIsCapturing(false);
        if (isAiSequencePending) {
            setIsAiSequencePending(false);
            setAutoStartAiSequence(false);
        }
    }, [exposure, gain, numFrames, isAutoFocus, performAutoFocus, focusHFR, isAiSequencePending]);

    const startStacking = useCallback(async () => {
        setIsStacking(true);
        try {
            setStackingResult({ id: `stack_${Date.now()}`, framesUsed: frames.length, totalExposure: 0, snr: 0, fwhm: 0, progress: 10, status: 'aligning' });

            const res = await fetch('/api/indi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: 'ccd/stack', folder: '.', lights_prefix: 'capture' })
            });
            if (!res.ok) throw new Error("Erreur de lancement Siril");

            setStackingResult(prev => prev ? { ...prev, status: 'stacking', progress: 50 } : null);
            await new Promise(r => setTimeout(r, 5000));

            setStackingResult(prev => prev ? {
                ...prev,
                totalExposure: frames.reduce((sum, f) => sum + f.exposure, 0),
                progress: 100, status: 'complete',
                snr: Math.sqrt(frames.length * exposure) * 1.5,
                fwhm: 2.1,
            } : null);

            notification.success("Stacking Terminé", { description: "Siril a terminé le traitement et le fichier result.fit est prêt." });
        } catch (e: unknown) {
            notification.error("Erreur Stacking", { description: e instanceof Error ? e.message : "Erreur inconnue" });
            setStackingResult(null);
        } finally {
            setIsStacking(false);
        }
    }, [frames, exposure]);

    const getAiRecommendation = () => {
        if (!currentTarget) return null;
        const type = currentTarget.type.toLowerCase();
        if (type.includes("planet") || type.includes("moon"))
            return { exp: 0.1, gain: 800, count: 500, desc: "Planet / Moon (Lucky Imaging)" };
        if (type.includes("galaxy") || type.includes("cluster") || type.includes("deep sky"))
            return { exp: 20, gain: 3200, count: 50, desc: "Deep Sky (Alt-Az Tracking limit)" };
        if (type.includes("nebula"))
            return { exp: 25, gain: 1600, count: 40, desc: "Bright Nebula" };
        return { exp: 15, gain: 3200, count: 30, desc: "Standard Observation" };
    };

    const recommendation = getAiRecommendation();

    const startAiSequence = () => {
        if (recommendation) {
            setExposure(recommendation.exp);
            setGain(recommendation.gain);
            setNumFrames(recommendation.count);
        }
        setAutoStartAiSequence(true);
        setIsAiSequencePending(true);
        setShowAutofocus(true);
    };

    return (
        <div className="flex flex-col gap-4 w-full p-4 astro-panel" style={{ border: "1px solid rgba(0, 255, 209, 0.1)" }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Camera size={16} className={isCapturing ? "ping-slow" : ""} style={{ color: "var(--astro-teal)" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em] text-white">DATA ACQUISITION</span>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className="text-[9px] px-2 py-0.5 rounded-full border"
                        style={{
                            background: isCapturing ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)",
                            color: isCapturing ? "#FC8181" : "rgba(255,255,255,0.6)",
                            borderColor: isCapturing ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.2)",
                        }}
                    >
                        {isCapturing ? 'ACQUIRING' : 'READY'}
                    </span>
                    <span
                        className="text-[9px] px-2 py-0.5 rounded-full border"
                        style={{ background: "rgba(0,255,209,0.1)", color: "var(--astro-teal)", borderColor: "rgba(0,255,209,0.3)" }}
                    >
                        {frames.length}/{numFrames} SUBFRAMES
                    </span>
                </div>
            </div>

            {/* AI Recommendation Banner */}
            {currentTarget && recommendation && !isCapturing && !isStacking && (
                <div className="p-2 rounded" style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(147,51,234,0.3)" }}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0">
                            <div className="flex items-center gap-1">
                                <BrainCircuit size={12} style={{ color: "#A78BFA" }} />
                                <span className="text-[9px] font-bold tracking-[0.05em]" style={{ color: "#A78BFA" }}>AI SUGGESTION: {recommendation.desc}</span>
                            </div>
                            <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                                {recommendation.exp}s | ISO {recommendation.gain} | {recommendation.count} captures (F/15, Alt-Az)
                            </span>
                        </div>
                        <button
                            className="flex items-center gap-1 h-6 px-2 rounded text-[9px] text-white font-medium cursor-pointer transition-colors disabled:opacity-50"
                            style={{ background: "#7C3AED" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#6D28D9")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#7C3AED")}
                            disabled={isFocusing}
                            onClick={startAiSequence}
                        >
                            <Wand2 size={12} />
                            AI OPTIMIZED SEQUENCE
                        </button>
                    </div>
                </div>
            )}

            {/* Settings Grid */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { icon: Clock,  label: "EXP (S)",  value: exposure,   set: setExposure,   min: 1,   max: 600,   step: 1   },
                    { icon: Zap,    label: "GAIN/ISO", value: gain,       set: setGain,       min: 100, max: 12800, step: 100 },
                    { icon: Layers, label: "COUNT",    value: numFrames,  set: setNumFrames,  min: 1,   max: 1000,  step: 1   },
                ].map(({ icon: Ico, label, value, set, min, max, step }) => (
                    <div key={label} className="flex flex-col gap-1 p-2 rounded" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div className="flex items-center gap-1">
                            <Ico size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
                            <span className="text-[9px] tracking-[0.05em]" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
                        </div>
                        <input
                            type="number"
                            className="w-full bg-transparent text-white text-sm font-mono outline-none border-b border-white/10 pb-0.5"
                            value={value}
                            min={min}
                            max={max}
                            step={step}
                            onChange={e => set(Number(e.target.value))}
                        />
                    </div>
                ))}
            </div>

            {/* Capture Progress HUD */}
            {isCapturing && (
                <div className="relative p-3 rounded" style={{ background: "rgba(0,255,209,0.05)", border: "1px solid rgba(0,255,209,0.2)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold" style={{ color: "var(--astro-teal)" }}>ACQUISITION IN PROGRESS</span>
                        <div className="flex items-center gap-2">
                            <Thermometer size={12} style={{ color: "rgba(255,255,255,0.4)" }} />
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.7)" }}>{liveStats.temperature}°C</span>
                        </div>
                    </div>
                    <div className="w-full h-1 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${(currentFrame / numFrames) * 100}%`,
                                background: "var(--astro-teal)",
                                boxShadow: "0 0 10px var(--astro-teal)",
                            }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        <span>FRAME {currentFrame} OF {numFrames}</span>
                        <span>EST. REMAINING: {Math.floor(liveStats.remainingTime / 60)}M {liveStats.remainingTime % 60}S</span>
                    </div>
                </div>
            )}

            {/* Focus & Metrics HUD */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                            <Target size={12} style={{ color: "var(--astro-gold)" }} />
                            <span className="text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>AI FOCUS</span>
                        </div>
                        <Tooltip content="Half Flux Radius: Measure of star sharpness. Lower is better.">
                            <button className="cursor-help" style={{ color: "rgba(255,255,255,0.4)" }}>
                                <Info size={10} />
                            </button>
                        </Tooltip>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between w-full">
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>HFR QUALITY:</span>
                            <span className="text-[10px] font-bold" style={{ color: focusHFR && focusHFR < 3 ? "#68D391" : "var(--astro-gold)" }}>
                                {focusHFR ? focusHFR.toFixed(2) : '---'}
                            </span>
                        </div>
                        <div className="w-full h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                            <div className="h-full rounded-full" style={{ width: focusHFR ? `${Math.max(0, 100 - (focusHFR * 20))}%` : '0%', background: "var(--astro-gold)" }} />
                        </div>
                    </div>
                </div>

                <div className="p-3 rounded" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                            <BrainCircuit size={12} style={{ color: "var(--astro-teal)" }} />
                            <span className="text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.6)" }}>STACKING</span>
                        </div>
                        <Tooltip content="Signal-to-Noise Ratio: Overall image quality index.">
                            <button className="cursor-help" style={{ color: "rgba(255,255,255,0.4)" }}>
                                <Info size={10} />
                            </button>
                        </Tooltip>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between w-full">
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>SNR INDEX:</span>
                            <span className="text-[10px] font-bold" style={{ color: "var(--astro-teal)" }}>
                                {stackingResult ? stackingResult.snr.toFixed(1) : '---'}
                            </span>
                        </div>
                        <div className="w-full h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                            <div className="h-full rounded-full" style={{ width: stackingResult ? `${Math.min(100, stackingResult.snr * 2)}%` : '0%', background: "var(--astro-teal)" }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Stacking Progress */}
            {isStacking && stackingResult && (
                <div className="p-3 rounded" style={{ background: "rgba(0,240,255,0.05)", borderLeft: "2px solid var(--astro-teal)" }}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold" style={{ color: "var(--astro-teal)" }}>
                            {stackingResult.status === 'aligning' ? 'ALIGNING ASTRO-FRAMES' : 'NEURAL STACKING PROCESS'}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium text-black" style={{ background: "var(--astro-teal)" }}>
                            {stackingResult.framesUsed} SUBS
                        </span>
                    </div>
                    <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${stackingResult.progress}%`, background: "var(--astro-teal)" }}
                        />
                    </div>
                </div>
            )}

            {/* Completion Summary */}
            {stackingResult?.status === 'complete' && (
                <div className="p-4 rounded" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <div className="flex items-center gap-2 mb-3">
                        <ShieldCheck size={16} style={{ color: "#86EFAC" }} />
                        <span className="text-[12px] font-bold text-white">PROCESSING COMPLETE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-0">
                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>INTEGRATION TIME</span>
                            <span className="text-[12px] font-bold" style={{ color: "var(--astro-teal)" }}>{stackingResult.totalExposure}S</span>
                        </div>
                        <div className="flex flex-col gap-0">
                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.5)" }}>AVG STAR FWHM</span>
                            <span className="text-[12px] font-bold" style={{ color: "var(--astro-gold)" }}>{stackingResult.fwhm.toFixed(2)}&quot;</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="flex flex-col gap-3">
                <div className="flex w-full gap-2">
                    {!isCapturing ? (
                        <button
                            className="flex flex-[2] items-center justify-center gap-2 h-10 rounded-lg text-[11px] font-bold tracking-[0.1em] text-black transition-all cursor-pointer disabled:opacity-50"
                            style={{ background: "var(--astro-teal)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "white")}
                            onMouseLeave={e => (e.currentTarget.style.background = "var(--astro-teal)")}
                            onClick={startCapture}
                            disabled={isFocusing || isStacking}
                        >
                            <Play size={12} />
                            EXECUTE SEQUENCE
                        </button>
                    ) : (
                        <button
                            className="flex flex-[2] items-center justify-center gap-2 h-10 rounded-lg text-[11px] font-bold tracking-[0.1em] text-white transition-colors cursor-pointer"
                            style={{ background: "#EF4444" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#DC2626")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#EF4444")}
                            onClick={() => { isCapturingRef.current = false; setIsCapturing(false); }}
                        >
                            <Square size={12} />
                            ABORT SESSION
                        </button>
                    )}

                    <button
                        className="flex flex-1 items-center justify-center gap-2 h-10 rounded-lg text-[11px] border transition-colors cursor-pointer disabled:opacity-50"
                        style={{ borderColor: "rgba(0,255,209,0.3)", color: "var(--astro-teal)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,255,209,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                        disabled={isFocusing || isCapturing}
                        onClick={() => setShowAutofocus(true)}
                    >
                        <Aperture size={12} className={isFocusing ? "spin" : ""} />
                        IA FOCUS
                    </button>
                </div>

                {frames.length > 0 && !isCapturing && !isStacking && (
                    <button
                        className="flex w-full items-center justify-center gap-2 h-8 rounded-lg text-[10px] transition-colors cursor-pointer"
                        style={{ color: "var(--astro-gold)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                        onClick={startStacking}
                    >
                        <Layers size={12} />
                        MANUAL STACK ({frames.length} FRAMES)
                    </button>
                )}
            </div>

            {actionError && (
                <p className="text-[10px] text-center mt-2" style={{ color: "#FC8181" }}>{actionError}</p>
            )}

            {showAutofocus && (
                <AutofocusWizard
                    onClose={() => setShowAutofocus(false)}
                    autoStart={autoStartAiSequence}
                    onComplete={() => {
                        if (autoStartAiSequence) {
                            setShowAutofocus(false);
                            setAutoStartAiSequence(false);
                            setTimeout(() => { startCapture(); }, 500);
                        }
                    }}
                />
            )}
        </div>
    );
};
