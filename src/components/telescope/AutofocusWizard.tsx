// src/components/telescope/AutofocusWizard.tsx
"use client";

/**
 * Focus numérique de session (pas de focuser motorisé : le 600D est monté en
 * bague T directe sur le tube).
 *
 * Flux :
 *  1. L'utilisateur pointe une étoile brillante et fait la mise au point à la
 *     molette du télescope (une seule fois).
 *  2. Le wizard capture une image technique (preview supprimé), attend sa
 *     réception réelle, puis appelle POST /focus/calibrate : mesure du HFR de
 *     référence + paramètres de netteté proposés par Gemini Vision (fallback
 *     dérivé du HFR si l'IA est indisponible).
 *  3. Le profil est sauvegardé côté backend et appliqué automatiquement à
 *     toutes les captures suivantes de la session.
 */

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Activity, X, Sparkles, Focus, RotateCcw } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

function Spinner() {
    return <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

const MotionDiv = motion.div;

interface FocusProfile {
    active: boolean;
    hfr_ref?: number | null;
    ai_used?: boolean;
    calibrated_at?: string;
    sharpen_radius?: number;
    sharpen_amount?: number;
    denoise_strength?: number;
    comment?: string;
}

type Phase = "idle" | "capturing" | "calibrating" | "done" | "error";

export const AutofocusWizard = ({
    onClose,
    autoStart,
    onComplete,
}: {
    onClose: () => void;
    autoStart?: boolean;
    onComplete?: () => void;
}) => {
    const { language } = useStargazerStore();
    const [phase, setPhase] = useState<Phase>("idle");
    const [logs, setLogs] = useState<{ msg: string; type: "info" | "success" | "error" }[]>([]);
    const [profile, setProfile] = useState<FocusProfile | null>(null);
    const [previewAfter, setPreviewAfter] = useState<string | null>(null);
    const abortRef = useRef(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const L = (fr: string, en: string) => (language === "fr" ? fr : en);
    const log = (msg: string, type: "info" | "success" | "error" = "info") =>
        setLogs((p) => [...p, { msg, type }]);

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    useEffect(() => {
        return () => { abortRef.current = true; };
    }, []);

    // Charger le profil existant à l'ouverture
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/indi?endpoint=focus/profile", { cache: "no-store" });
                const raw = await res.json();
                // Le proxy GET /api/indi enveloppe la réponse dans un tableau
                const data = Array.isArray(raw) ? raw[0] : raw;
                if (data?.success && data.profile?.active) {
                    setProfile(data.profile);
                    setPhase("done");
                }
            } catch {
                // backend injoignable — l'état idle avec instructions reste correct
            }
        })();
    }, []);

    useEffect(() => {
        if (autoStart) runCalibration();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart]);

    const runCalibration = async () => {
        abortRef.current = false;
        setLogs([]);
        setPreviewAfter(null);
        setPhase("capturing");
        log(L("📷 Capture de l'étoile de référence (2s)...", "📷 Capturing reference star (2s)..."));

        try {
            // 1. Capture technique (pas de modal preview).
            // IMPORTANT : endpoint en query string — le proxy /api/indi ne lit pas
            // le champ endpoint du body, et le dispatcher générique /command du
            // backend perdrait le flag preview:false.
            const capRes = await fetch("/api/indi?endpoint=ccd/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ exposure: 2.0, preview: false }),
            });
            const capData = await capRes.json();
            if (!capData.success) throw new Error(capData.error ?? L("Capture refusée", "Capture refused"));

            // 2. Attendre la réception réelle de l'image (max 60s)
            let captured = false;
            for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 1000));
                if (abortRef.current) return;
                const stRes = await fetch("/api/indi?endpoint=capture/state", { cache: "no-store" });
                const stRaw = await stRes.json();
                const st = Array.isArray(stRaw) ? stRaw[0] : stRaw;
                if (st?.phase === "complete") { captured = true; break; }
                if (st?.phase === "error") throw new Error(st.error ?? L("Capture échouée", "Capture failed"));
            }
            if (!captured) throw new Error(L("Image jamais reçue (timeout)", "Image never received (timeout)"));
            log(L("✅ Image reçue — analyse en cours...", "✅ Image received — analyzing..."), "success");

            // 3. Calibration backend (HFR + Gemini Vision)
            setPhase("calibrating");
            log(L("🤖 Mesure HFR + analyse Gemini Vision...", "🤖 HFR measurement + Gemini Vision analysis..."));
            const calRes = await fetch("/api/indi?endpoint=focus/calibrate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const cal = await calRes.json();
            if (!cal.success) throw new Error(cal.error ?? L("Calibration échouée", "Calibration failed"));

            setProfile(cal.profile as FocusProfile);
            setPreviewAfter(cal.preview_after ?? null);
            setPhase("done");
            log(
                L(
                    `✅ Focus numérique calibré — HFR réf ${cal.profile.hfr_ref ?? "n/a"}, netteté r=${cal.profile.sharpen_radius}px ×${cal.profile.sharpen_amount}${cal.profile.ai_used ? " (Gemini)" : " (fallback HFR)"}`,
                    `✅ Numerical focus calibrated — ref HFR ${cal.profile.hfr_ref ?? "n/a"}, sharpen r=${cal.profile.sharpen_radius}px ×${cal.profile.sharpen_amount}${cal.profile.ai_used ? " (Gemini)" : " (HFR fallback)"}`
                ),
                "success"
            );
            if (cal.profile.comment) log(`💬 ${cal.profile.comment}`);
            log(L("Le profil s'applique désormais à toutes les captures de la session.", "The profile now applies to every capture this session."), "success");
            notification.success(L("Focus numérique actif", "Numerical focus active"), {
                description: cal.profile.comment, source: "Autofocus",
            });
            if (onComplete) onComplete();
        } catch (e: any) {
            setPhase("error");
            log(`❌ ${e.message ?? L("Erreur inconnue", "Unknown error")}`, "error");
            notification.error(L("Calibration du focus échouée", "Focus calibration failed"), {
                description: e.message, source: "Autofocus",
            });
        }
    };

    const resetProfile = async () => {
        try {
            await fetch("/api/indi?endpoint=focus/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            setProfile(null);
            setPreviewAfter(null);
            setPhase("idle");
            setLogs([]);
            notification.info(L("Profil de focus numérique désactivé", "Numerical focus profile disabled"), { source: "Autofocus" });
        } catch (e: any) {
            notification.error(L("Réinitialisation échouée", "Reset failed"), { description: e.message, source: "Autofocus" });
        }
    };

    const busy = phase === "capturing" || phase === "calibrating";

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
        >
            <MotionDiv
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="w-[480px] mx-auto rounded-xl overflow-hidden"
                style={{
                    background: "rgba(10, 15, 30, 0.95)",
                    border: "1px solid var(--astro-teal)",
                    boxShadow: "0 25px 50px -12px rgba(0,240,255,0.25)",
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,240,255,0.05)" }}>
                    <div className="flex items-center gap-2">
                        <Activity size={20} style={{ color: "var(--astro-teal)" }} />
                        <span className="text-white font-bold tracking-[0.05em]">
                            {L("FOCUS NUMÉRIQUE IA", "AI NUMERICAL FOCUS")}
                        </span>
                    </div>
                    <button className="text-gray-400 hover:text-white transition-colors p-1 rounded" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 flex flex-col gap-4">
                    {/* Instructions */}
                    {phase === "idle" && (
                        <div className="rounded-md p-3 text-sm text-gray-300 leading-relaxed"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <p className="font-semibold text-white mb-2">{L("Avant de calibrer :", "Before calibrating:")}</p>
                            <ol className="list-decimal ml-4 space-y-1">
                                <li>{L("Pointez une étoile brillante (GoTo depuis la carte du ciel).", "Point a bright star (GoTo from the sky map).")}</li>
                                <li>{L("Faites la mise au point manuellement à la molette du télescope, en vous aidant du live view.", "Focus manually with the telescope knob, using live view.")}</li>
                                <li>{L("Lancez la calibration : le HFR de référence est mesuré et Gemini calcule le traitement de netteté appliqué à toutes les captures de la session.", "Run calibration: the reference HFR is measured and Gemini computes the sharpening applied to all session captures.")}</li>
                            </ol>
                        </div>
                    )}

                    {/* Profil actif */}
                    {profile?.active && phase === "done" && (
                        <div className="rounded-md p-3 text-xs"
                            style={{ background: "rgba(72,187,120,0.08)", border: "1px solid rgba(72,187,120,0.3)" }}>
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={13} style={{ color: "#48BB78" }} />
                                <span className="font-semibold text-sm" style={{ color: "#48BB78" }}>
                                    {L("Focus numérique actif", "Numerical focus active")}
                                    {profile.ai_used ? " · Gemini" : ` · ${L("fallback HFR", "HFR fallback")}`}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-gray-300 font-mono">
                                <span>HFR réf : {profile.hfr_ref ?? "n/a"}</span>
                                <span>Netteté : r{profile.sharpen_radius}px ×{profile.sharpen_amount}</span>
                                <span>{L("Débruitage", "Denoise")} : {profile.denoise_strength}</span>
                            </div>
                            {profile.comment && <p className="mt-2 text-gray-400 italic">💬 {profile.comment}</p>}
                            {profile.calibrated_at && <p className="mt-1 text-gray-500">{L("Calibré à", "Calibrated at")} {profile.calibrated_at}</p>}
                        </div>
                    )}

                    {/* Aperçu après traitement */}
                    {previewAfter && (
                        <div className="rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewAfter} alt="Aperçu après traitement" style={{ width: "100%", display: "block" }} />
                            <div className="px-2 py-1 text-[10px] text-gray-400" style={{ background: "rgba(0,0,0,0.6)" }}>
                                {L("Aperçu avec le profil appliqué", "Preview with profile applied")}
                            </div>
                        </div>
                    )}

                    {/* Logs */}
                    {logs.length > 0 && (
                        <div className="rounded-md p-3 max-h-[140px] overflow-y-auto font-mono text-[11px] space-y-1"
                            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            {logs.map((l, i) => (
                                <div key={i} style={{ color: l.type === "success" ? "#48BB78" : l.type === "error" ? "#FC8181" : "#A0AEC0" }}>
                                    {l.msg}
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={runCalibration}
                            disabled={busy}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-semibold text-sm cursor-pointer transition-colors"
                            style={{
                                background: busy ? "rgba(0,240,255,0.08)" : "rgba(0,240,255,0.15)",
                                border: "1px solid var(--astro-teal)",
                                color: "var(--astro-teal)",
                                opacity: busy ? 0.6 : 1,
                            }}
                        >
                            {busy ? <Spinner /> : <Focus size={15} />}
                            {phase === "capturing" ? L("Capture en cours...", "Capturing...")
                                : phase === "calibrating" ? L("Analyse IA...", "AI analysis...")
                                : profile?.active ? L("Recalibrer", "Recalibrate")
                                : L("Calibrer le focus numérique", "Calibrate numerical focus")}
                        </button>
                        {profile?.active && !busy && (
                            <button
                                onClick={resetProfile}
                                className="flex items-center gap-1.5 px-3 py-2.5 rounded-md text-sm cursor-pointer"
                                style={{ background: "rgba(252,165,165,0.1)", border: "1px solid rgba(252,165,165,0.3)", color: "#FCA5A5" }}
                                title={L("Désactiver le profil", "Disable profile")}
                            >
                                <RotateCcw size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </MotionDiv>
        </div>
    );
};

export default AutofocusWizard;
