// src/components/camera/CameraControls.tsx
"use client";

import { Camera, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Aperture, Brain, Eye, Crosshair, HelpCircle } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { AutofocusWizard } from "@/components/telescope/AutofocusWizard";
import { useState } from "react";

interface CameraControlsProps {
    variant?: "standard" | "circular";
}

// Poses courtes pour la mise au point et le cadrage, longues pour le ciel profond.
const EXPOSURE_PRESETS = [0.5, 1, 2, 3, 5, 10, 15, 30];
// Valeurs exposées par le Canon 600D sur CCD_ISO ; le backend refuse toute
// valeur que le boîtier n'annonce pas et liste alors celles disponibles.
const ISO_PRESETS = [100, 200, 400, 800, 1600, 3200, 6400];

function Spinner() {
    return <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

const ControlButton = ({ icon: DirIcon, onClick, glowColor = "var(--astro-teal)", isLoading = false, tooltip }: { icon: React.ElementType, onClick?: () => void, glowColor?: string, isLoading?: boolean,
    /* Obligatoire : ce bouton n'a jamais de texte, le typage garantit qu'il
       porte toujours un nom pour un lecteur d'ecran. */
    tooltip: string }) => (
    <Tooltip content={tooltip} showArrow>
        <button
            className="w-[var(--size-touch)] h-[var(--size-touch)] flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer"
            aria-label={tooltip}
            style={{ color: "var(--astro-starlight)", background: "rgba(255,255,255,0.05)" }}
            onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.1)";
                el.style.boxShadow = `0 0 15px ${glowColor}`;
            }}
            onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "rgba(255,255,255,0.05)";
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

        // La barre suit le temps de pose réel. L'ancienne montait de 5 % toutes
        // les 100 ms : pleine en 2 s quelle que soit la pose, donc fausse dès
        // qu'on dépassait 2 s. Plafonnée à 95 % tant que l'image n'est pas revenue
        // (descente du miroir et transfert ne sont pas mesurables d'ici).
        const exposure = config.exposureTime || 2.0;
        const startedAt = performance.now();
        let raf = 0;
        const tick = () => {
            const pct = ((performance.now() - startedAt) / (exposure * 1000)) * 95;
            setCaptureProgress(Math.min(95, pct));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        await execute(`/api/indi?endpoint=ccd/capture`, "IMAGE CAPTURE", {
            body: {
                action: 'capture',
                exposure,
                iso: config.isoGain || null,
                device: detectedCcd
            },
            showGlobalLoader: false
        });

        cancelAnimationFrame(raf);
        setCaptureProgress(100);
        setExposing(false);
        setTimeout(() => { setCaptureProgress(0); }, 3000);
    };

    if (variant === "circular") {
        return (
            <div className="flex flex-col items-center w-full gap-3">
                {/* Circular focus pad */}
                <div className="relative w-[140px] h-[140px] my-1">
                    {/* Outer HUD ring */}
                    <div
                        className="absolute rounded-full border border-dashed border-white/10 pointer-events-none"
                        style={{ inset: "-8px", animation: "spin 24s linear infinite" }}
                    />
                    <div
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{
                            border: "2px solid rgba(148, 163, 184, 0.12)",
                            background: "radial-gradient(circle at 50% 40%, rgba(15, 23, 42, 0.7), rgba(3, 7, 18, 0.92))",
                            boxShadow: "inset 0 0 24px rgba(0,0,0,0.85), 0 8px 24px rgba(0,0,0,0.45)",
                        }}
                    />

                    {/* Central shutter button — positioned OUTSIDE Tooltip so centering is exact */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2]">
                        <Tooltip content={isExposing ? "EXPOSURE IN PROGRESS" : "START EXPOSURE"} showArrow>
                            <button
                                type="button"
                                aria-label={isExposing ? "Exposition en cours" : "Déclencher une pose"}
                                disabled={isExposing}
                                className={`flex items-center justify-center rounded-full transition-all duration-200 ${isExposing ? "pulse-glow" : "hover:scale-105"}`}
                                style={{
                                    width: "52px",
                                    height: "52px",
                                    background: isExposing ? "var(--astro-teal)" : "color-mix(in srgb, var(--astro-teal) 8%, transparent)",
                                    border: `1.5px solid ${isExposing ? "#ffffff" : "var(--astro-teal)"}`,
                                    boxShadow: isExposing ? "0 0 18px color-mix(in srgb, var(--astro-teal) 45%, transparent)" : "0 0 14px color-mix(in srgb, var(--astro-teal) 16%, transparent)",
                                    cursor: isExposing ? "not-allowed" : "pointer",
                                }}
                                onClick={!isExposing ? handleShoot : undefined}
                            >
                                {isExposing ? (
                                    <div className="flex flex-col items-center gap-0">
                                        <Spinner />
                                        <span className="text-hud-2xs text-slate-950 font-bold mt-0.5">BUSY</span>
                                    </div>
                                ) : (
                                    <Camera size={22} style={{ color: "var(--astro-teal)" }} />
                                )}
                            </button>
                        </Tooltip>
                    </div>

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

                {/* Réglages de pose. Le temps de pose et l'ISO existaient dans la
                    configuration mais aucun écran ne permettait de les changer :
                    le déclencheur tirait toujours 3 s à l'ISO courant du boîtier. */}
                <div className="flex flex-col w-full gap-2.5 pt-3 border-t border-white/10">
                    {([
                        {
                            label: "Temps de pose", options: EXPOSURE_PRESETS,
                            current: config.exposureTime,
                            fmt: (v: number) => (v < 1 ? `1/${Math.round(1 / v)}` : `${v}s`),
                            set: (v: number) => updateConfig({ exposureTime: v }),
                        },
                        {
                            label: "ISO", options: ISO_PRESETS,
                            current: Number(config.isoGain),
                            fmt: (v: number) => String(v),
                            set: (v: number) => updateConfig({ isoGain: String(v) }),
                        },
                    ]).map(({ label, options, current, fmt, set }) => (
                        <div key={label} className="flex flex-col gap-1" role="group" aria-label={label}>
                            <div className="flex items-baseline justify-between">
                                <span className="text-hud-2xs uppercase tracking-wider text-white/50">{label}</span>
                                <span className="text-hud-xs font-bold hud-numeric text-[--astro-teal]">{fmt(current)}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                                {options.map((v) => {
                                    const active = v === current;
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            disabled={isExposing}
                                            aria-pressed={active}
                                            onClick={() => set(v)}
                                            className={[
                                                "min-w-0 min-h-[var(--size-touch)] px-1 rounded-lg border text-hud-xs hud-numeric",
                                                "transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                                                active
                                                    ? "bg-[--astro-teal]/15 text-[--astro-teal] border-[--astro-teal]/45 font-bold"
                                                    : "bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/[0.09] hover:text-white",
                                            ].join(" ")}
                                        >
                                            {fmt(v)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
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
                                <span className="text-hud-xs font-bold tracking-[0.05em]" style={{ color: "rgba(255,255,255,0.9)" }}>AI FOCUS CORRECTIONS</span>
                                <Tooltip content="Automatically adjusts focus during long sessions based on temperature and star analysis (HFR). Helps maintain sharpness as the telescope cools." showArrow>
                                    <HelpCircle size={12} style={{ color: "rgba(255,255,255,0.4)", cursor: "help" }} />
                                </Tooltip>
                            </div>
                            <button
                                className="h-5 px-2 rounded text-hud-2xs text-left transition-colors cursor-pointer disabled:opacity-40"
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
                                    <span className="text-hud-xs font-bold tracking-[0.05em]" style={{ color: "rgba(255,255,255,0.9)" }}>HFR OVERLAY</span>
                                    <Tooltip content="Superimposes Half Flux Radius (HFR) metrics on the direct view to help you visualize focus quality across the field." showArrow>
                                        <HelpCircle size={12} style={{ color: "rgba(255,255,255,0.4)", cursor: "help" }} />
                                    </Tooltip>
                                </div>
                                <span className="text-hud-2xs" style={{ color: "rgba(255,255,255,0.5)" }}>Real-time star metrics</span>
                            </div>
                        </div>
                        <Switch
                            checked={config.showHfrOverlay}
                            onChange={(checked) => {
                                // Activer l'incrustation n'invente plus de mesure
                                // (elle affichait 3.24 d'office) : elle n'apparaît
                                // que lorsqu'un HFR réel a été calculé.
                                updateConfig({ showHfrOverlay: checked });
                                if (!checked) setHfr(null);
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
            <span className="text-hud-2xs tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.4)" }}>CAMERA SYSTEM ACTIVE</span>
        </div>
    );
};
