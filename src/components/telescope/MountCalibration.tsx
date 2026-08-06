// src/components/telescope/MountCalibration.tsx
"use client";

import { MoveUpRight, Settings, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { notification } from "@/lib/notificationService";
import { useJog } from "@/hooks/useJog";
import { JogPad } from "./JogPad";

export const MountCalibration = () => {
    const { mountLimits, setMountLimits, alt, az, language } = useStargazerStore();
    const [step, setStep] = useState<"idle" | "maxAlt" | "minAlt" | "maxAz" | "minAz">("idle");
    const jog = useJog();

    const handleSaveLimit = () => {
        if (step === "maxAlt") {
            setMountLimits({ ...mountLimits, maxAlt: alt });
            setStep("minAlt");
        } else if (step === "minAlt") {
            setMountLimits({ ...mountLimits, minAlt: alt });
            setStep("maxAz");
        } else if (step === "maxAz") {
            setMountLimits({ ...mountLimits, maxAz: az });
            setStep("minAz");
        } else if (step === "minAz") {
            const finalLimits = { ...mountLimits, minAz: az };
            setMountLimits(finalLimits);
            setStep("idle");

            fetch('/api/indi/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mountLimits: finalLimits })
            }).then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                notification.success("Limites sauvegardées", {
                    description: "Les nouvelles limites ont été enregistrées.",
                    source: "Configuration"
                });
            }).catch((err) => {
                notification.error("Échec de la sauvegarde", {
                    description: err?.message || "Impossible de sauvegarder la configuration",
                    source: "Système",
                });
            });
        }
    };

    const getStepHint = () => {
        switch (step) {
            case "maxAlt": return language === 'fr' ? "Montez au maximum" : "Move to max altitude";
            case "minAlt": return language === 'fr' ? "Descendez au minimum" : "Move to min altitude";
            case "maxAz": return language === 'fr' ? "Tournez à droite" : "Rotate right";
            case "minAz": return language === 'fr' ? "Tournez à gauche" : "Rotate left";
            default: return "";
        }
    };

    const getStepInstruction = () => {
        switch (step) {
            case "maxAlt": return t("CALIB_STEP_MAX_ALT", language);
            case "minAlt": return t("CALIB_STEP_MIN_ALT", language);
            case "maxAz": return t("CALIB_STEP_MAX_AZ", language);
            case "minAz": return t("CALIB_STEP_MIN_AZ", language);
            default: return "";
        }
    };

    const isCalibrating = step !== "idle";

    return (
        <div className="flex flex-col gap-4 w-full" style={{ color: "var(--astro-starlight)" }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={isCalibrating ? "pulse-glow" : ""} style={{ color: "var(--astro-teal)" }}>
                        <Settings size={16} />
                    </span>
                    <span className="text-[12px] font-bold tracking-[0.1em]">{t("CALIB_LIMITS_TITLE", language)}</span>
                </div>
                {isCalibrating && (
                    <span className="text-[10px] pulse-glow" style={{ color: "var(--astro-gold)" }}>
                        {t("CALIB_IN_PROGRESS", language)}
                    </span>
                )}
            </div>

            <div className="border-t border-dashed border-white/10 my-1" />

            {!isCalibrating ? (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-[10px] opacity-80">
                        <div className="flex flex-col gap-0">
                            <span style={{ color: "var(--astro-teal)" }}>{t("CALIB_ALTITUDE", language)}</span>
                            <span>{mountLimits.minAlt.toFixed(1)}° ➔ {mountLimits.maxAlt.toFixed(1)}°</span>
                        </div>
                        <div className="flex flex-col items-end gap-0">
                            <span style={{ color: "var(--astro-teal)" }}>{t("CALIB_AZIMUTH", language)}</span>
                            <span>{mountLimits.minAz.toFixed(1)}° ➔ {mountLimits.maxAz.toFixed(1)}°</span>
                        </div>
                    </div>

                    <button
                        className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border text-[10px] transition-all duration-200 cursor-pointer hover:text-black"
                        style={{
                            background: "rgba(255, 51, 51, 0.1)",
                            borderColor: "var(--astro-teal)",
                            color: "var(--astro-teal)",
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = "var(--astro-teal)";
                            (e.currentTarget as HTMLElement).style.color = "black";
                            (e.currentTarget as HTMLElement).style.boxShadow = "0 0 15px rgba(255, 51, 51, 0.4)";
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = "rgba(255, 51, 51, 0.1)";
                            (e.currentTarget as HTMLElement).style.color = "var(--astro-teal)";
                            (e.currentTarget as HTMLElement).style.boxShadow = "";
                        }}
                        onClick={() => setStep("maxAlt")}
                    >
                        <MoveUpRight size={12} />
                        {t("CALIB_WIZARD_BTN", language)}
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-3 p-3 rounded-lg" style={{
                    background: "rgba(0, 0, 0, 0.3)",
                    borderLeft: "2px solid var(--astro-gold)",
                }}>
                    <div className="flex items-center gap-2">
                        <span style={{ color: "var(--astro-gold)" }}><AlertTriangle size={16} /></span>
                        <span className="text-[10px] font-bold" style={{ color: "var(--astro-gold)" }}>{step.toUpperCase()}</span>
                    </div>
                    <p className="text-[10px] leading-[1.4]">{getStepInstruction()}</p>
                    <p className="text-[9px] italic" style={{ color: "var(--astro-teal)" }}>{getStepHint()}</p>

                    <div className="flex items-center justify-center gap-2 py-2">
                        {jog.activeDir && (
                            <span className="text-[8px] font-bold" style={{ color: "var(--astro-teal)", animation: 'pulse 0.6s infinite alternate' }}>
                                ▶ {jog.activeDir.toUpperCase()}
                            </span>
                        )}
                        <JogPad jog={jog} size="md" />
                    </div>

                    <div className="flex items-center justify-between p-2 rounded"
                        style={{ background: "#030509", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div className="flex flex-col gap-0">
                            <span className="text-[8px] opacity-60">{t("CALIB_CURRENT_POS", language)}</span>
                            <span className="text-[12px] hud-font" style={{ color: "var(--astro-teal)" }}>
                                {step.includes("Alt") ? `ALT: ${alt.toFixed(1)}°` : `AZ: ${az.toFixed(1)}°`}
                            </span>
                        </div>
                        <button
                            className="h-8 px-3 rounded-md text-black font-semibold text-[12px] transition-colors cursor-pointer disabled:opacity-40"
                            style={{ background: "var(--astro-teal)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "white")}
                            onMouseLeave={e => (e.currentTarget.style.background = "var(--astro-teal)")}
                            onClick={handleSaveLimit}
                            disabled={jog.isMoving}
                        >
                            {t("CALIB_VALIDATE", language)}
                        </button>
                    </div>

                    <button
                        className="text-[10px] text-white/40 hover:text-white/70 transition-colors mt-1 cursor-pointer disabled:opacity-30"
                        onClick={() => setStep("idle")}
                        disabled={jog.isMoving}
                    >
                        {t("CALIB_CANCEL", language)}
                    </button>
                </div>
            )}
        </div>
    );
};
