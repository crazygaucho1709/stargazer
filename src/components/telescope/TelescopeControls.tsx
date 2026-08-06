// src/components/telescope/TelescopeControls.tsx
"use client";

import {
    ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, RotateCcw,
    ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, Moon, Sun, Star,
} from "lucide-react";
import React from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { useJog } from "@/hooks/useJog";
import { notification } from "@/lib/notificationService";

interface TelescopeControlsProps {
    variant: "pad" | "jog" | "guiding";
}

interface PadButtonProps {
    icon: React.ElementType;
    glowColor?: string;
    onClick?: () => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerUp?: (e: React.PointerEvent) => void;
    onPointerCancel?: (e: React.PointerEvent) => void;
}

const PadButton = ({ icon: DirIcon, glowColor = "var(--astro-teal)", onClick, onPointerDown, onPointerUp, onPointerCancel }: PadButtonProps) => (
    <button
        className="w-10 h-10 flex items-center justify-center rounded-full text-[--astro-starlight] bg-white/5 transition-all duration-200 hover:bg-white/10 hover:scale-110 active:text-black cursor-pointer"
        style={{ touchAction: "none" }}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 0 15px ${glowColor}`)}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = "")}
    >
        <DirIcon size={20} />
    </button>
);

export const TelescopeControls = ({ variant }: TelescopeControlsProps) => {
    const { isSlewing, setSlewing, config, detectedMount } = useStargazerStore();
    const { execute } = useAstroAction();
    const jog = useJog();
    const [slewRate, setSlewRate] = React.useState(5);

    const JOG_TIMEOUT = 3000;

    const handleRateChange = async (value: number) => {
        const prevDir = jog.activeDir;
        if (prevDir) jog.stopJog();
        setSlewRate(value);
        await execute('/api/indi/mount', `SET RATE ${value}x`, {
            body: { action: 'rate', rate: value, device: detectedMount, ip: config.astroberryUrl },
            showGlobalLoader: false,
            timeout: JOG_TIMEOUT,
            retries: 0,
        });
        if (prevDir) jog.startJog(prevDir);
    };

    const handleSync = async () => {
        await execute('/api/mount/sync_current', "SYNCING MOUNT", {
            method: 'POST',
            showGlobalLoader: true,
        });
    };

    if (variant === "jog" || variant === "guiding") return null;

    if (variant === "pad") {
        return (
            <div className="flex flex-col items-center gap-0 w-[180px]">
                <div className="relative w-[180px] h-[180px] flex items-center justify-center">
                    {/* Compass rings */}
                    <div className="absolute inset-0 rounded-full border border-white/5" />
                    <div className="absolute inset-5 rounded-full border border-dashed border-red-500/20" style={{ animation: 'spin 40s linear infinite' }} />

                    {/* Cardinal markers */}
                    <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[8px] text-white/25 font-bold">N</span>
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-white/25 font-bold">S</span>
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-white/25 font-bold">W</span>
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-white/25 font-bold">E</span>

                    {/* Cardinal pads */}
                    <div className="absolute top-[15px]">
                        <PadButton icon={ChevronUp}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('up'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>
                    <div className="absolute bottom-[15px]">
                        <PadButton icon={ChevronDown}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('down'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>
                    <div className="absolute left-[15px]">
                        <PadButton icon={ChevronLeft}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('left'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>
                    <div className="absolute right-[15px]">
                        <PadButton icon={ChevronRight}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('right'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>

                    {/* Diagonal pads */}
                    <div className="absolute top-[25px] left-[25px]">
                        <PadButton icon={ArrowUpLeft}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('up-left'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>
                    <div className="absolute top-[25px] right-[25px]">
                        <PadButton icon={ArrowUpRight}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('up-right'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>
                    <div className="absolute bottom-[25px] left-[25px]">
                        <PadButton icon={ArrowDownLeft}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('down-left'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>
                    <div className="absolute bottom-[25px] right-[25px]">
                        <PadButton icon={ArrowDownRight}
                            onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('down-right'); }}
                            onPointerUp={e => { e.preventDefault(); jog.stopJog(); }}
                            onPointerCancel={e => { e.preventDefault(); jog.stopJog(); }} />
                    </div>

                    {/* Sync button */}
                    <div className="absolute bottom-[20px] left-[20px]">
                        <PadButton icon={RotateCcw} glowColor="var(--astro-gold)" onClick={handleSync} />
                    </div>

                    {/* Central target */}
                    <div
                        className={`w-[46px] h-[46px] rounded-full border-2 bg-[rgba(10,20,40,0.8)] flex items-center justify-center z-[2] ${isSlewing ? "pulse-glow" : ""}`}
                        style={{ borderColor: isSlewing ? "var(--astro-gold)" : "var(--astro-teal)" }}
                    >
                        <Target size={20} style={{ color: isSlewing ? "var(--astro-gold)" : "var(--astro-teal)" }} />
                    </div>
                </div>

                {/* Slew rate slider */}
                <div className="w-[160px] pt-2">
                    <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-white/40">1x</span>
                        <span className="text-[11px] text-[--astro-teal] font-bold">{slewRate}x</span>
                        <span className="text-[10px] text-white/40">9x</span>
                    </div>
                    <input
                        type="range" min={1} max={9} step={1} value={slewRate}
                        onChange={e => handleRateChange(parseInt(e.target.value))}
                        className="slew-rate-slider"
                        style={{
                            width: '100%', height: '8px', cursor: 'pointer',
                            WebkitAppearance: 'none', appearance: 'none',
                            background: `linear-gradient(to right, var(--astro-teal) 0%, var(--astro-teal) ${((slewRate - 1) / 8) * 100}%, rgba(255,255,255,0.2) ${((slewRate - 1) / 8) * 100}%, rgba(255,255,255,0.2) 100%)`,
                            borderRadius: '4px', outline: 'none',
                        }}
                    />
                </div>
            </div>
        );
    }

    return null;
};

// ─── TrackingModeSelector ─────────────────────────────────────────────────────

type TrackRate = "SIDEREAL" | "LUNAR" | "SOLAR";

const RATE_OPTIONS: { rate: TrackRate; label: string; icon: React.ElementType; desc: string }[] = [
    { rate: "SIDEREAL", label: "Sidéral", icon: Star, desc: "Étoiles" },
    { rate: "LUNAR",    label: "Lunaire", icon: Moon, desc: "Lune"   },
    { rate: "SOLAR",    label: "Solaire", icon: Sun,  desc: "Soleil" },
];

export const TrackingModeSelector = () => {
    const { trackingRate, setTrackingRate, config, detectedMount } = useStargazerStore();
    const [loading, setLoading] = React.useState<TrackRate | null>(null);

    const handleSelect = async (rate: TrackRate) => {
        if (rate === trackingRate) return;
        setLoading(rate);
        try {
            const baseUrl = config.astroberryUrl?.replace(/\/+$/, "") || "http://localhost:5005";
            const res = await fetch(`${baseUrl}/mount/tracking-rate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rate, device: detectedMount }),
            });
            const data = await res.json();
            if (data.success) setTrackingRate(rate);
        } catch (e: unknown) {
            notification.error("Erreur mode suivi", {
                source: "Monture",
                description: e instanceof Error ? e.message : "Impossible de changer le mode de suivi",
            });
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 uppercase tracking-wider text-center">Mode suivi</span>
            <div className="flex gap-1 justify-center">
                {RATE_OPTIONS.map(({ rate, label, icon: Ico, desc }) => {
                    const active = trackingRate === rate;
                    const isLoading = loading === rate;
                    return (
                        <button
                            key={rate}
                            title={desc}
                            disabled={isLoading}
                            onClick={() => handleSelect(rate)}
                            className={[
                                "flex items-center gap-1 h-7 px-2 rounded-md border text-[10px] transition-colors duration-150 cursor-pointer",
                                active
                                    ? "bg-teal-600 text-white border-teal-400 hover:bg-teal-500"
                                    : "bg-white/[0.04] text-white/60 border-white/10 hover:bg-white/[0.08] hover:text-white",
                            ].join(" ")}
                        >
                            {isLoading
                                ? <div className="w-3 h-3 border border-white/20 border-t-white rounded-full animate-spin" />
                                : <Ico size={10} />}
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
