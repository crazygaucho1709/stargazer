// src/components/camera/CameraControls.tsx
"use client";

import { Camera, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Aperture, Brain, Eye, Crosshair, HelpCircle, Globe, Video } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { AutofocusWizard } from "@/components/telescope/AutofocusWizard";
import { useState } from "react";

interface CameraControlsProps {
    variant?: "standard" | "circular";
}

function Spinner() {
    return <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

const ControlButton = ({ icon: DirIcon, onClick, glowColor = "var(--astro-teal)", isLoading = false, tooltip }: { icon: React.ElementType, onClick?: () => void, glowColor?: string, isLoading?: boolean, tooltip?: string }) => (
    <Tooltip content={tooltip} showArrow>
        <button
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer"
            style={{ color: "var(--astro-starlight)", background: "rgba(255,255,255,0.05)" }}
            onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.1)";
                el.style.transform = "scale(1.1)";
                el.style.boxShadow = `0 0 15px ${glowColor}`;
            }}
            onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.05)";
                el.style.transform = "";
                el.style.boxShadow = "";
            }}
            onClick={onClick}
        >
            {isLoading ? <Spinner /> : <DirIcon size={18} />}
        </button>
    </Tooltip>
);

export const CameraControls = ({ variant = "standard" }: CameraControlsProps) => {
    const {
        isExposing,
        setExposing,
        config,
        updateConfig,
        setCaptureProgress,
        setStackingProgress,
        setHfr,
        language,
        detectedCcd,
        liveViewMode,
        setLiveViewMode,
    } = useStargazerStore();

    const { execute, isPending } = useAstroAction();
    const [lastHfr, setLastHfr] = useState<number | null>(null);
    const [showAutofocus, setShowAutofocus] = useState(false);

    const handleFocusAction = async (direction: string) => {
        await execute('/api/indi', `FOCUS ${direction}`, {
            body: {
                action: 'focus',
                direction,
                steps: 50,
                device: detectedCcd
            },
            showGlobalLoader: false
        });
    };

    const handleCalibrateFocus = async () => {
        setShowAutofocus(true);
    };

    const handleShoot = async () => {
        setExposing(true);
        setCaptureProgress(0);
        setStackingProgress(0);

        let currentCap = 0;
        const interval = setInterval(() => {
            currentCap = Math.min(currentCap + 5, 100);
            setCaptureProgress(currentCap);
        }, 100);

        await execute(`/api/indi?endpoint=ccd/capture`, "IMAGE CAPTURE", {
            body: {
                action: 'capture',
                exposure: config.exposureTime || 2.0,
                device: detectedCcd
            },
            showGlobalLoader: false
        });

        clearInterval(interval);
        setCaptureProgress(100);
        setExposing(false);
        setTimeout(() => { setCaptureProgress(0); }, 3000);
    };

    if (variant === "circular") {
        return (
            <div className="flex flex-col items-center w-full gap-3">
                {/* Live view mode toggle */}
                <div
                    className="flex w-full gap-1 p-1 rounded-full"
                    style={{
                        background: "rgba(10, 20, 40, 0.6)",
                        border: "1px solid rgba(255,255,255,0.08)",
                    }}
                >
                    <button
                        className="flex flex-1 items-center justify-center gap-1 h-6 rounded-full text-[9px] hud-font transition-colors cursor-pointer"
                        style={{
                            background: liveViewMode === "NASA" ? "var(--astro-teal)" : "transparent",
                            color: liveViewMode === "NASA" ? "black" : "rgba(255,255,255,0.6)",
                        }}
                        onMouseEnter={e => { if (liveViewMode !== "NASA") (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                        onMouseLeave={e => { if (liveViewMode !== "NASA") (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => setLiveViewMode("NASA")}
                    >
                        <Globe size={11} />
                        SKY MAP
                    </button>
                    <button
                        className="flex flex-1 items-center justify-center gap-1 h-6 rounded-full text-[9px] hud-font transition-colors cursor-pointer"
                        style={{
                            background: liveViewMode === "CANON" ? "var(--astro-gold)" : "transparent",
                            color: liveViewMode === "CANON" ? "black" : "rgba(255,255,255,0.6)",
                        }}
                        onMouseEnter={e => { if (liveViewMode !== "CANON") (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                        onMouseLeave={e => { if (liveViewMode !== "CANON") (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => setLiveViewMode("CANON")}
                    >
                        <Video size={11} />
                        LIVE VIEW
                    </button>
                </div>

                {/* Circular focus pad */}
                <div className="relative w-[140px] h-[140px]">
                    {/* Outer HUD ring */}
                    <div
                        className="absolute rounded-full border border-dashed border-white/10"
                        style={{ inset: "-10px", animation: "spin 20s linear infinite" }}
                    />
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{
                            border: "4px solid rgba(255,255,255,0.05)",
                            background: "rgba(10, 20, 40, 0.3)",
                            boxShadow: "inset 0 0 30px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5)",
                        }}
                    />

                    {/* Central shutter button */}
                    <Tooltip content={isExposing ? "EXPOSURE IN PROGRESS" : "START EXPOSURE"} showArrow>
                        <div
                            className={`absolute flex items-center justify-center rounded-full z-[2] transition-all duration-300 ${isExposing ? "pulse-glow" : ""}`}
                            style={{
                                top: "50%", left: "50%",
                                transform: "translate(-50%, -50%)",
                                width: "56px", height: "56px",
                                background: isExposing ? "var(--astro-teal)" : "rgba(255,255,255,0.03)",
                                border: `2px solid ${isExposing ? "white" : "var(--astro-teal)"}`,
                                cursor: isExposing ? "not-allowed" : "pointer",
                            }}
                            onClick={!isExposing ? handleShoot : undefined}
                            onMouseEnter={e => {
                                if (!isExposing) (e.currentTarget as HTMLElement).style.background = "rgba(0, 255, 180, 0.1)";
                            }}
                            onMouseLeave={e => {
                                if (!isExposing) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                            }}
                        >
                            {isExposing ? (
                                <div className="flex flex-col items-center gap-0">
                                    <Spinner />
                                    <span className="text-[8px] text-black font-bold mt-1">BUSY</span>
                                </div>
                            ) : (
                                <Camera size={24} style={{ color: "var(--astro-teal)" }} />
                            )}
                        </div>
                    </Tooltip>

                    {/* Focus cardinal buttons */}
                    <div className="absolute top-[6px]" style={{ left: "50%", transform: "translateX(-50%)" }}>
                        <ControlButton icon={ChevronUp} onClick={() => handleFocusAction('IN')} isLoading={isPending} tooltip="FOCUS IN (FINE)" />
                    </div>
                    <div className="absolute bottom-[6px]" style={{ left: "50%", transform: "translateX(-50%)" }}>
                        <ControlButton icon={ChevronDown} onClick={() => handleFocusAction('OUT')} isLoading={isPending} tooltip="FOCUS OUT (FINE)" />
                    </div>
                    <div className="absolute left-[6px]" style={{ top: "50%", transform: "translateY(-50%)" }}>
                        <ControlButton icon={ChevronLeft} onClick={() => handleFocusAction('IN')} isLoading={isPending} tooltip="FOCUS IN" />
                    </div>
                    <div className="absolute right-[6px]" style={{ top: "50%", transform: "translateY(-50%)" }}>
                        <ControlButton icon={ChevronRight} onClick={() => handleFocusAction('OUT')} isLoading={isPending} tooltip="FOCUS OUT" />
                    </div>

                    {/* Decorative HUD elements */}
                    <div className="absolute top-[20%] left-[20%] opacity-20" style={{ color: "var(--astro-starlight)" }}><Crosshair size={10} /></div>
                    <div className="absolute bottom-[20%] right-[20%] opacity-20" style={{ color: "var(--astro-starlight)" }}><Aperture size={10} /></div>
                </div>

                {/* AI & HUD Controls */}
                <div className="flex flex-col w-full gap-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                    <div
                        className="flex w-full items-center justify-between p-2 rounded-lg"
                        style={{ background: "rgba(0,255,180,0.03)", border: "1px solid rgba(0,255,180,0.1)" }}
                    >
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <Brain size={14} style={{ color: "var(--astro-teal)" }} />
                                <span className="text-[10px] font-bold tracking-[0.05em]" style={{ color: "rgba(255,255,255,0.9)" }}>AI FOCUS CORRECTIONS</span>
                                <Tooltip content="Automatically adjusts focus during long sessions based on temperature and star analysis (HFR). Helps maintain sharpness as the telescope cools." showArrow>
                                    <HelpCircle size={12} style={{ color: "rgba(255,255,255,0.4)", cursor: "help" }} />
                                </Tooltip>
                            </div>
                            <button
                                className="h-5 px-2 rounded text-[9px] text-left transition-colors cursor-pointer disabled:opacity-40"
                                style={{ color: "var(--astro-gold)" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "")}
                                onClick={handleCalibrateFocus}
                                disabled={isPending}
                            >
                                {lastHfr ? `HFR: ${lastHfr.toFixed(2)} - RE-CALIBRATE` : "INITIAL CALIBRATION"}
                            </button>
                        </div>
                        <Switch
                            checked={config.showAiFocusCorrections}
                            onChange={(checked) => updateConfig({ showAiFocusCorrections: checked })}
                        />
                    </div>

                    <div
                        className="flex w-full items-center justify-between p-2 rounded-lg"
                        style={{ background: "rgba(255,215,0,0.03)", border: "1px solid rgba(255,215,0,0.1)" }}
                    >
                        <div className="flex items-center gap-2">
                            <Eye size={14} style={{ color: "var(--astro-gold)" }} />
                            <div className="flex flex-col gap-0">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold tracking-[0.05em]" style={{ color: "rgba(255,255,255,0.9)" }}>HFR OVERLAY</span>
                                    <Tooltip content="Superimposes Half Flux Radius (HFR) metrics on the direct view to help you visualize focus quality across the field." showArrow>
                                        <HelpCircle size={12} style={{ color: "rgba(255,255,255,0.4)", cursor: "help" }} />
                                    </Tooltip>
                                </div>
                                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.5)" }}>Real-time star metrics</span>
                            </div>
                        </div>
                        <Switch
                            checked={config.showHfrOverlay}
                            onChange={(checked) => {
                                updateConfig({ showHfrOverlay: checked });
                                if (checked) setHfr(3.24);
                                else setHfr(null);
                            }}
                        />
                    </div>
                </div>

                {showAutofocus && (
                    <AutofocusWizard onClose={() => setShowAutofocus(false)} />
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 w-full">
            <span className="text-[9px] tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.4)" }}>CAMERA SYSTEM ACTIVE</span>
        </div>
    );
};
