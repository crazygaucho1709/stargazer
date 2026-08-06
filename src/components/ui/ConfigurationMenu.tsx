// src/components/ui/ConfigurationMenu.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Settings, Cpu, Radio, Zap, ShieldCheck, X, Camera, Telescope, Gamepad2, Compass, Layers, Wand2, Power, Globe, LocateFixed, Activity, RefreshCw, CheckCircle, XCircle, Loader
} from "lucide-react";
import { useAiAuth } from "@/hooks/useAiAuth";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useAstroAction } from "@/hooks/useAstroAction";
import { CalibrationWizard } from "@/components/telescope/CalibrationWizard";
import { AutoAlignWizard } from "@/components/telescope/AutoAlignWizard";
import { ObjectFinder } from "@/components/telescope/ObjectFinder";
import { CaptureAndStack } from "@/components/camera/CaptureAndStack";
import { clientApiUrl } from "@/lib/clientApi";
import { AutofocusWizard } from "@/components/telescope/AutofocusWizard";
import ObservatoryPanel from "@/components/observatory/ObservatoryPanel";
import { notification } from "@/lib/notificationService";
import { validateUrl, validateRequired, validateLatitude, validateLongitude, validatePositiveInt, validateMinAlt, validateMaxAlt } from "@/lib/validation";
import { createPortal } from "react-dom";

function Spinner() {
    return <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
    return (
        <div className="w-full">
            <p className="text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</p>
            {children}
            {error && <p className="text-[10px] mt-1" style={{ color: "#FC8181" }}>{error}</p>}
        </div>
    );
}

const INPUT_CLS = "w-full px-3 py-2 rounded text-white text-sm outline-none transition-colors";
const INPUT_STYLE = { background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)" };
const SELECT_STYLE: React.CSSProperties = { width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" };

export const ConfigurationMenu = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("hardware");
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const { config, updateConfig, language, setLanguage, setConfigMenuOpen } = useStargazerStore();

    const onOpen = () => { setIsOpen(true); setConfigMenuOpen(true); };
    const onClose = () => { setIsOpen(false); setConfigMenuOpen(false); };

    useEffect(() => () => { setConfigMenuOpen(false); }, [setConfigMenuOpen]);

    const tabs = [
        { id: "autoalign",   label: language === 'fr' ? "ALIGNEMENT & CALIBRATION" : "ALIGNMENT & CALIBRATION", icon: LocateFixed },
        { id: "hardware",    label: t("TAB_HARDWARE", language),                               icon: Cpu },
        { id: "mount",       label: t("TAB_MOUNT", language),                                  icon: Telescope },
        { id: "camera",      label: t("TAB_CAMERA", language),                                 icon: Camera },
        { id: "objects",     label: language === 'fr' ? "CATALOGUE" : "CATALOG",              icon: Compass },
        { id: "capture",     label: t("TAB_CAPTURE", language),                                icon: Layers },
        { id: "gamepad",     label: t("TAB_GAMEPAD", language),                                icon: Gamepad2 },
        { id: "system",      label: t("TAB_SYSTEM", language),                                 icon: Globe },
        { id: "bridge",      label: language === 'fr' ? "RÉSEAU & LOGS" : "NETWORK & LOGS",  icon: Activity },
        { id: "observatory", label: language === 'fr' ? "OBSERVATOIRE" : "OBSERVATORY",       icon: Radio },
    ];

    return (
        <>
            <button
                aria-label="Configuration"
                className="p-2 rounded transition-all duration-[400ms] cursor-pointer"
                style={{ color: "var(--astro-teal)" }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(0, 240, 255, 0.1)";
                    (e.currentTarget as HTMLElement).style.transform = "rotate(90deg)";
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.transform = "";
                }}
                onClick={onOpen}
            >
                <Settings size={22} />
            </button>

            {mounted && createPortal(
                <>
                    {/* Backdrop */}
                    {isOpen && (
                        <div
                            className="fixed inset-0 z-[9998]"
                            style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(20px)" }}
                            onClick={onClose}
                        />
                    )}

                    {/* Sliding Panel */}
                    <div
                        className="fixed top-[5%] h-[90vh] w-[90vw] max-w-[1200px] flex flex-col overflow-hidden z-[9999] text-white transition-all duration-[400ms]"
                        style={{
                            right: isOpen ? "5%" : "-100%",
                            background: "rgba(5, 5, 10, 0.95)",
                            border: "1px solid rgba(0, 240, 255, 0.2)",
                            borderRadius: "16px",
                            boxShadow: "-5px 0 50px rgba(0,240,255,0.1)",
                            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                    >
                        {/* Header */}
                        <div
                            className="relative flex items-center gap-4 p-6"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
                        >
                            <Wand2 size={24} style={{ color: "#00F0FF" }} />
                            <div className="flex flex-col gap-0">
                                <h2 className="hud-font font-bold tracking-[0.1em] text-lg">{t("CONFIG_TITLE", language)}</h2>
                                <span className="text-[10px] tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.5)" }}>{t("CONFIG_SUBTITLE", language)}</span>
                            </div>
                            <button
                                className="absolute top-6 right-6 p-2 rounded transition-colors cursor-pointer"
                                style={{ color: "rgba(255,255,255,0.6)" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,51,51,0.2)"; (e.currentTarget as HTMLElement).style.color = "var(--astro-gold)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
                                onClick={onClose}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex flex-1 overflow-hidden">
                            {/* Sidebar */}
                            <div className="flex flex-col gap-2 w-[280px] p-4 overflow-y-auto" style={{ borderRight: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}>
                                {tabs.map(tab => {
                                    const active = activeTab === tab.id;
                                    const Ico = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            className="flex items-center gap-3 w-full py-3 px-3 rounded text-left transition-colors cursor-pointer"
                                            style={{
                                                background: active ? "rgba(0, 240, 255, 0.1)" : "transparent",
                                                color: active ? "#00F0FF" : "rgba(255,255,255,0.7)",
                                                borderLeft: active ? "3px solid #00F0FF" : "3px solid transparent",
                                            }}
                                            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                                            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <Ico size={20} />
                                            <span className="text-[12px] font-bold tracking-[0.05em]">{tab.label.toUpperCase()}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                                {activeTab === "autoalign"   && <AlignmentTab language={language} />}
                                {activeTab === "hardware"    && <HardwareTab config={config} updateConfig={updateConfig} language={language} />}
                                {activeTab === "mount"       && <MountTab config={config} updateConfig={updateConfig} language={language} />}
                                {activeTab === "camera"      && <CameraTab config={config} updateConfig={updateConfig} language={language} />}
                                {activeTab === "objects"     && <ObjectsTab language={language} />}
                                {activeTab === "capture"     && <CaptureAndStack />}
                                {activeTab === "gamepad"     && <GamepadTab language={language} />}
                                {activeTab === "system"      && <SystemTab config={config} updateConfig={updateConfig} language={language} setLanguage={setLanguage} />}
                                {activeTab === "bridge"      && <BridgeTab config={config} language={language} />}
                                {activeTab === "observatory" && <ObservatoryPanel />}
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
};

/* ─── Tab wrappers ─────────────────────────────────────────────────────────── */

/**
 * AlignmentTab — fusion Auto-Align IA + Calibration manuelle.
 * Deux modes sous un seul onglet : l'auto-alignement autonome (plate solving)
 * et la calibration manuelle guidée (limites alt/az, park, alignement étoile).
 */
const AlignmentTab = ({ language }: { language: string }) => {
    const [mode, setMode] = useState<"auto" | "manual">("auto");
    const fr = language === "fr";

    const modes: Array<{ id: "auto" | "manual"; label: string; icon: React.ElementType }> = [
        { id: "auto",   label: fr ? "Auto IA" : "Auto AI",                icon: LocateFixed },
        { id: "manual", label: fr ? "Calibration manuelle" : "Manual calibration", icon: Wand2 },
    ];

    return (
        <div className="flex flex-col gap-6">
            {/* Mode toggle */}
            <div className="flex gap-2 p-1 rounded-lg w-fit" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {modes.map(({ id, label, icon: Ico }) => {
                    const active = mode === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setMode(id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-bold transition-colors cursor-pointer"
                            style={{
                                background: active ? "rgba(0,240,255,0.12)" : "transparent",
                                color: active ? "#00F0FF" : "rgba(255,255,255,0.55)",
                                border: active ? "1px solid rgba(0,240,255,0.4)" : "1px solid transparent",
                            }}
                        >
                            <Ico size={15} />
                            {label}
                        </button>
                    );
                })}
            </div>

            {mode === "auto" ? (
                <div className="p-6 rounded-lg" style={{ background: "rgba(0,255,209,0.04)", border: "1px solid rgba(0,255,209,0.18)" }}>
                    <div className="flex items-center gap-3 mb-4">
                        <LocateFixed size={24} style={{ color: "var(--astro-teal)" }} />
                        <div className="flex flex-col gap-0">
                            <h3 className="text-white font-bold">{fr ? 'Auto-Alignement IA' : 'Auto-Align AI'}</h3>
                            <span className="text-[10px] tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.5)" }}>
                                {fr
                                    ? 'Localisation autonome par plate solving — 3 captures — triangulation'
                                    : 'Autonomous localization via plate solving — 3 captures — triangulation'}
                            </span>
                        </div>
                    </div>
                    <AutoAlignWizard />
                </div>
            ) : (
                <div className="p-6 rounded-lg" style={{ background: "rgba(0, 240, 255, 0.05)", border: "1px solid rgba(0, 240, 255, 0.2)" }}>
                    <div className="flex items-center gap-3 mb-4">
                        <Wand2 size={24} style={{ color: "#00F0FF" }} />
                        <div className="flex flex-col gap-0">
                            <h3 className="text-white font-bold">{fr ? 'Calibration manuelle' : 'Manual calibration'}</h3>
                            <span className="text-[10px] tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.5)" }}>
                                {fr
                                    ? 'Séquence guidée — limites alt/az, park, test caméra, alignement étoile'
                                    : 'Guided sequence — alt/az limits, park, camera test, star alignment'}
                            </span>
                        </div>
                    </div>
                    <CalibrationWizard />
                </div>
            )}
        </div>
    );
};

/* ─── Hardware Tab ─────────────────────────────────────────────────────────── */

const HardwareTab = ({ config, updateConfig, language }: any) => {
    const { execute, isPending } = useAstroAction();
    const [errors, setErrors] = useState<Record<string, string | null>>({});
    const setError = (field: string, msg: string | null) => setErrors(p => ({ ...p, [field]: msg }));

    const handleTest = async () => {
        const urlErr = validateUrl(config.astroberryUrl);
        const drvErr = validateRequired(config.driverInstance);
        setError("astroberryUrl", urlErr);
        setError("driverInstance", drvErr);
        if (urlErr || drvErr) { notification.warning("Corrigez les erreurs avant de tester", { source: "Configuration" }); return; }
        await execute(
            async () => { const res = await fetch('/api/indi/health-full'); return res.json(); },
            language === 'fr' ? "TEST DE CONNEXION" : "CONNECTION TEST",
            { loadingMessage: language === 'fr' ? "VÉRIFICATION DE LA LIAISON..." : "VERIFYING LINK..." }
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{t("HW_DESC", language)}</p>

            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Radio size={16} style={{ color: "#00F0FF" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em]">{t("HW_ASTROBERRY", language)}</span>
                </div>
                <div className="flex flex-col gap-4">
                    <Field label={t("HW_SERVER_URL", language)} error={errors.astroberryUrl}>
                        <input
                            className={INPUT_CLS}
                            style={{ ...INPUT_STYLE, borderColor: errors.astroberryUrl ? "#FC8181" : "rgba(255,255,255,0.2)" }}
                            value={config.astroberryUrl}
                            onChange={e => { updateConfig({ astroberryUrl: e.target.value }); setError("astroberryUrl", null); }}
                            onBlur={() => setError("astroberryUrl", validateUrl(config.astroberryUrl))}
                        />
                    </Field>
                    <div className="flex gap-4 w-full">
                        <Field label={t("HW_DRIVER", language)} error={errors.driverInstance}>
                            <input
                                className={INPUT_CLS}
                                style={{ ...INPUT_STYLE, borderColor: errors.driverInstance ? "#FC8181" : "rgba(255,255,255,0.2)" }}
                                value={config.driverInstance}
                                onChange={e => { updateConfig({ driverInstance: e.target.value }); setError("driverInstance", null); }}
                                onBlur={() => setError("driverInstance", validateRequired(config.driverInstance))}
                            />
                        </Field>
                        <Field label={t("HW_BAUD", language)}>
                            <select value={config.baudRate} onChange={e => updateConfig({ baudRate: e.target.value })} style={SELECT_STYLE}>
                                <option value="9600">9600</option>
                                <option value="115200">115200</option>
                            </select>
                        </Field>
                    </div>
                    <button
                        className="flex items-center justify-center gap-2 w-full h-9 rounded text-sm border transition-colors cursor-pointer disabled:opacity-50"
                        style={{ borderColor: "#00F0FF", color: "#00F0FF" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,240,255,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                        onClick={handleTest}
                        disabled={isPending}
                    >
                        {isPending && <Spinner />}
                        {t("HW_BTN_TEST", language)}
                    </button>
                </div>
            </div>

            <div className="h-px" style={{ background: "rgba(255,255,255,0.1)" }} />

            <AiAuthPanel language={language} />
        </div>
    );
};

function AiAuthPanel({ language }: { language: string }) {
    const auth = useAiAuth();
    const [claudeKey, setClaudeKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [showInput, setShowInput] = useState(false);

    const saveClaudeKey = async () => {
        if (!claudeKey.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/ai/claude/key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: claudeKey.trim() }),
            });
            if (!res.ok) {
                const d = await res.json();
                notification.error(d.detail || "Erreur", { source: "AI Auth" });
            } else {
                notification.success(language === "fr" ? "Clé Claude enregistrée" : "Claude key saved", { source: "AI Auth" });
                setClaudeKey("");
                setShowInput(false);
                // re-poll auth status
                window.dispatchEvent(new Event("ai-auth-refresh"));
            }
        } catch (e: unknown) {
            notification.error(e instanceof Error ? e.message : "Erreur", { source: "AI Auth" });
        } finally {
            setSaving(false);
        }
    };

    const removeClaudeKey = async () => {
        try {
            await fetch("/api/ai/claude/key", { method: "DELETE" });
            notification.success(language === "fr" ? "Clé Claude supprimée" : "Claude key removed", { source: "AI Auth" });
            window.dispatchEvent(new Event("ai-auth-refresh"));
        } catch (e: unknown) {
            notification.error(e instanceof Error ? e.message : "Erreur", { source: "AI Auth" });
        }
    };

    const fr = language === "fr";

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <Wand2 size={16} style={{ color: "var(--astro-gold)" }} />
                <span className="text-[12px] font-bold tracking-[0.1em]" style={{ color: "var(--astro-gold)" }}>
                    {fr ? "INTELLIGENCE ARTIFICIELLE" : "ARTIFICIAL INTELLIGENCE"}
                </span>
            </div>

            <div className="flex flex-col gap-3 p-4 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>

                {/* ── Gemini (service account) ── */}
                <div className="flex items-center justify-between p-3 rounded-lg"
                    style={{
                        background: auth.gemini ? "rgba(37,99,235,0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${auth.gemini ? "rgba(37,99,235,0.35)" : "rgba(255,255,255,0.08)"}`,
                    }}>
                    <div className="flex items-center gap-3">
                        {auth.loading
                            ? <Loader size={14} className="animate-spin" style={{ color: "rgba(255,255,255,0.4)" }} />
                            : auth.gemini
                                ? <CheckCircle size={14} style={{ color: "#4ADE80" }} />
                                : <XCircle size={14} style={{ color: "#F87171" }} />}
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[12px] font-bold" style={{ color: auth.gemini ? "#fff" : "rgba(255,255,255,0.4)" }}>Gemini</span>
                                {auth.provider === "gemini" && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#2563EB", color: "#fff" }}>ACTIF</span>
                                )}
                            </div>
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                {auth.gemini_sa
                                    ? `Service Account · ${auth.gemini_sa.split("@")[0]}`
                                    : fr ? "Firebase Admin SDK (firebase-adminsdk.json)" : "Firebase Admin SDK (firebase-adminsdk.json)"}
                            </span>
                        </div>
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: auth.gemini ? "#4ADE80" : "#F87171" }}>
                        {auth.loading ? "…" : auth.gemini ? (fr ? "Connecté" : "Connected") : (fr ? "Manquant" : "Missing")}
                    </span>
                </div>

                {/* ── Claude (vault) ── */}
                <div className="flex flex-col rounded-lg overflow-hidden"
                    style={{
                        background: auth.claude ? "rgba(217,119,6,0.08)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${auth.claude ? "rgba(217,119,6,0.35)" : "rgba(255,255,255,0.08)"}`,
                    }}>
                    <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                            {auth.loading
                                ? <Loader size={14} className="animate-spin" style={{ color: "rgba(255,255,255,0.4)" }} />
                                : auth.claude
                                    ? <CheckCircle size={14} style={{ color: "#4ADE80" }} />
                                    : <XCircle size={14} style={{ color: "#F87171" }} />}
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-bold" style={{ color: auth.claude ? "#fff" : "rgba(255,255,255,0.4)" }}>Claude</span>
                                    {auth.provider === "claude" && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#D97706", color: "#fff" }}>ACTIF</span>
                                    )}
                                </div>
                                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                                    {fr ? "Vault serveur (server/.env)" : "Server vault (server/.env)"}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {auth.claude && (
                                <button
                                    className="text-[10px] px-2 py-1 rounded border cursor-pointer transition-colors"
                                    style={{ borderColor: "rgba(248,113,113,0.4)", color: "#F87171" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.1)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                                    onClick={removeClaudeKey}
                                >
                                    {fr ? "Supprimer" : "Remove"}
                                </button>
                            )}
                            {!auth.claude && (
                                <button
                                    className="text-[10px] px-2 py-1 rounded border cursor-pointer transition-colors"
                                    style={{ borderColor: "rgba(217,119,6,0.5)", color: "#D97706" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(217,119,6,0.1)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                                    onClick={() => setShowInput(v => !v)}
                                >
                                    {fr ? "Saisir la clé" : "Enter key"}
                                </button>
                            )}
                            <span className="text-[10px] font-bold" style={{ color: auth.claude ? "#4ADE80" : "#F87171" }}>
                                {auth.loading ? "…" : auth.claude ? (fr ? "Configuré" : "Configured") : (fr ? "Non configuré" : "Not set")}
                            </span>
                        </div>
                    </div>

                    {showInput && !auth.claude && (
                        <div className="flex gap-2 px-3 pb-3">
                            <input
                                type="password"
                                placeholder="sk-ant-api03-…"
                                value={claudeKey}
                                onChange={e => setClaudeKey(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && saveClaudeKey()}
                                className={INPUT_CLS + " flex-1 text-[11px]"}
                                style={{ ...INPUT_STYLE, background: "rgba(0,0,0,0.5)" }}
                            />
                            <button
                                className="px-3 py-1 rounded text-[11px] font-bold text-black cursor-pointer disabled:opacity-50"
                                style={{ background: "#D97706" }}
                                onClick={saveClaudeKey}
                                disabled={saving || !claudeKey.trim()}
                            >
                                {saving ? "…" : fr ? "Enregistrer" : "Save"}
                            </button>
                        </div>
                    )}
                </div>

                {!auth.loading && !auth.claude && !auth.gemini && (
                    <div className="mt-1 p-3 rounded text-[10px]" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "rgba(251,191,36,0.9)", lineHeight: 1.6 }}>
                        {fr
                            ? <>Aucun provider actif. Activez l&apos;API <strong>Generative Language</strong> dans la console GCP (projet&nbsp;<code className="font-mono">stargazer-3b7c3</code>) pour Gemini, ou saisissez votre clé Claude ci-dessus.</>
                            : <>No active provider. Enable the <strong>Generative Language API</strong> in GCP console (project&nbsp;<code className="font-mono">stargazer-3b7c3</code>) for Gemini, or enter your Claude key above.</>}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Mount Tab ─────────────────────────────────────────────────────────────── */

const MountTab = ({ config, updateConfig, language }: any) => {
    const { mountLimits, setMountLimits } = useStargazerStore();
    const [errors, setErrors] = useState<Record<string, string | null>>({});
    const setError = (field: string, msg: string | null) => setErrors(p => ({ ...p, [field]: msg }));

    return (
        <div className="flex flex-col gap-8">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{t("MNT_DESC", language)}</p>

            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Compass size={16} style={{ color: "#00F0FF" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em]">{t("MNT_TRACKING", language)}</span>
                </div>
                <div className="flex flex-col gap-5 p-5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0">
                            <span className="text-[12px] text-white">{t("MNT_AUTO_TRACK", language)}</span>
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{t("MNT_AUTO_TRACK_DESC", language)}</span>
                        </div>
                        <input type="checkbox" checked={config.autoTracking} onChange={e => updateConfig({ autoTracking: e.target.checked })} style={{ accentColor: "#00F0FF", width: "18px", height: "18px" }} />
                    </div>
                    <div className="h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
                    <div className="w-full">
                        <p className="text-[10px] mb-4" style={{ color: "rgba(255,255,255,0.7)" }}>{t("MNT_SLEW", language)}</p>
                        <input type="range" min="0" max="9" step="1" value={config.slewSpeed} onChange={e => updateConfig({ slewSpeed: parseInt(e.target.value) })} style={{ width: "100%", accentColor: "#00F0FF" }} />
                        <div className="flex justify-between mt-2">
                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>{t("MNT_FINE", language)}</span>
                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>{t("MNT_MAX", language)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck size={16} style={{ color: "#00F0FF" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em]">{t("MNT_LIMITS", language)}</span>
                </div>
                <div className="flex gap-4">
                    <div className="flex-1 p-4 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <Field label={t("MNT_MIN_ALT", language)} error={errors.minAlt}>
                            <input
                                type="number"
                                className={INPUT_CLS}
                                style={{ ...INPUT_STYLE, borderColor: errors.minAlt ? "#FC8181" : "rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)" }}
                                value={mountLimits.minAlt}
                                onChange={e => { setMountLimits({ minAlt: parseFloat(e.target.value) }); setError("minAlt", null); }}
                                onBlur={() => setError("minAlt", validateMinAlt(mountLimits.minAlt))}
                            />
                        </Field>
                    </div>
                    <div className="flex-1 p-4 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <Field label={t("MNT_MAX_ALT", language)} error={errors.maxAlt}>
                            <input
                                type="number"
                                className={INPUT_CLS}
                                style={{ ...INPUT_STYLE, borderColor: errors.maxAlt ? "#FC8181" : "rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)" }}
                                value={mountLimits.maxAlt}
                                onChange={e => { setMountLimits({ maxAlt: parseFloat(e.target.value) }); setError("maxAlt", null); }}
                                onBlur={() => setError("maxAlt", validateMaxAlt(mountLimits.maxAlt))}
                            />
                        </Field>
                    </div>
                </div>
                {!errors.minAlt && !errors.maxAlt && mountLimits.minAlt >= mountLimits.maxAlt && (
                    <p className="text-[10px] mt-2" style={{ color: "var(--astro-gold)" }}>
                        {language === 'fr' ? "L'altitude minimum doit être inférieure à l'altitude maximum" : "Min altitude must be less than max altitude"}
                    </p>
                )}
            </div>
        </div>
    );
};

/* ─── Camera Tab ────────────────────────────────────────────────────────────── */

const CameraTab = ({ config, updateConfig, language }: any) => {
    const { execute, isPending } = useAstroAction();
    const [lastHfr, setLastHfr] = useState<number | null>(null);
    const [showAutofocus, setShowAutofocus] = useState(false);

    return (
        <div className="flex flex-col gap-8">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{t("CAM_DESC", language)}</p>

            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Camera size={16} style={{ color: "#00F0FF" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em]">{t("CAM_TITLE", language)}</span>
                </div>
                <div className="flex gap-4 p-5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <Field label={t("CAM_FORMAT", language)}>
                        <select value={config.captureFormat} onChange={e => updateConfig({ captureFormat: e.target.value })} style={SELECT_STYLE}>
                            <option value="RAW">RAW (CR2)</option>
                            <option value="JPEG">JPEG (Fine)</option>
                            <option value="RAW+JPEG">RAW + JPEG</option>
                        </select>
                    </Field>
                    <Field label={t("CAM_COOLING", language)}>
                        <select value={config.sensorCooling ? 'ON' : 'OFF'} onChange={e => updateConfig({ sensorCooling: e.target.value === 'ON' })} style={SELECT_STYLE}>
                            <option value="ON">ON (-15°C Target)</option>
                            <option value="OFF">OFF</option>
                        </select>
                    </Field>
                </div>
            </div>

            <div>
                <div className="flex items-center gap-2 mb-4">
                    <LocateFixed size={16} style={{ color: "var(--astro-gold)" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em]" style={{ color: "var(--astro-gold)" }}>{t("CAM_AI_FOCUS_TITLE", language)}</span>
                </div>
                <div className="flex flex-col gap-5 p-5 rounded-lg" style={{ background: "rgba(255, 179, 71, 0.05)", border: "1px solid rgba(255, 179, 71, 0.2)" }}>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.8)" }}>{t("CAM_AI_FOCUS_DESC", language)}</p>
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0">
                            <span className="text-[12px] text-white">{t("CAM_AI_FOCUS_EN", language)}</span>
                            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>{t("CAM_AI_FOCUS_EN_DESC", language)}</span>
                        </div>
                        <input type="checkbox" checked={config.aiFocus} onChange={e => updateConfig({ aiFocus: e.target.checked })} style={{ accentColor: "var(--astro-gold)", width: "18px", height: "18px" }} />
                    </div>
                    <button
                        className="flex items-center justify-center gap-2 w-full h-10 rounded-lg font-bold text-black cursor-pointer disabled:opacity-50"
                        style={{ background: "var(--astro-gold)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#e69c3a")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--astro-gold)")}
                        onClick={() => setShowAutofocus(true)}
                        disabled={isPending}
                    >
                        {isPending && <Spinner />}
                        {lastHfr !== null ? `HFR CALIBRATED: ${lastHfr.toFixed(2)}` : t("CAM_AI_FOCUS_BTN", language)}
                    </button>
                </div>
            </div>

            {showAutofocus && <AutofocusWizard onClose={() => setShowAutofocus(false)} />}
        </div>
    );
};

/* ─── Gamepad Tab ───────────────────────────────────────────────────────────── */

const GamepadTab = ({ language }: any) => (
    <div className="flex flex-col gap-8">
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{t("GP_DESC", language)}</p>

        <div className="flex flex-col items-center p-6 rounded-lg text-center" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <Gamepad2 size={48} style={{ color: "rgba(255,255,255,0.4)", marginBottom: "16px" }} />
            <h3 className="text-white font-bold mb-2">{t("GP_NO_PAD", language)}</h3>
            <p className="text-[11px] mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>{t("GP_NO_PAD_DESC", language)}</p>
            <button className="h-8 px-4 rounded border text-sm transition-colors cursor-pointer" style={{ borderColor: "#00F0FF", color: "#00F0FF" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,240,255,0.1)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                {t("GP_SCAN", language)}
            </button>
        </div>

        <div className="opacity-50 pointer-events-none">
            <div className="flex items-center gap-2 mb-4"><Settings size={16} /><span className="text-[12px] font-bold tracking-[0.1em]">{t("GP_MAP", language)}</span></div>
            <div className="flex flex-col gap-3">
                {[
                    ["Left Stick (X/Y)", "Mount Azimuth / Altitude"],
                    ["Right Stick (Y)", "Focuser In / Out"],
                    ["D-Pad", "Micro-Step Jogging"],
                    ["R1 / R2", "Increase / Decrease Slew Speed"],
                    ["Cross / A", "Start Exposure"],
                ].map(([l, r]) => (
                    <div key={l} className="flex justify-between p-3 rounded-md" style={{ background: "rgba(0,0,0,0.5)" }}>
                        <span className="text-[11px]">{l}</span>
                        <span className="text-[11px]" style={{ color: "#00F0FF" }}>{r}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

/* ─── Objects Tab ───────────────────────────────────────────────────────────── */

const ObjectsTab = ({ language }: any) => (
    <div className="flex flex-col gap-6 h-full">
        <div className="p-4 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <ObjectFinder />
        </div>
    </div>
);

/* ─── System Tab ────────────────────────────────────────────────────────────── */

const SystemTab = ({ config, updateConfig, language, setLanguage }: any) => {
    const { execute, isPending } = useAstroAction();
    const envData = useEnvironmentData();
    const [errors, setErrors] = useState<Record<string, string | null>>({});
    const setError = (field: string, msg: string | null) => setErrors(p => ({ ...p, [field]: msg }));

    const handleSyncLoc = async () => {
        const latErr = validateLatitude(config.latitude);
        const lngErr = validateLongitude(config.longitude);
        setError("latitude", latErr);
        setError("longitude", lngErr);

        let lat = parseFloat(String(config.latitude).replace(',', '.').trim());
        let lon = parseFloat(String(config.longitude).replace(',', '.').trim());

        if (latErr || lngErr) {
            if (envData.latitude !== null && envData.longitude !== null) {
                lat = envData.latitude; lon = envData.longitude;
            } else {
                notification.warning("Coordonnées invalides et pas de signal GPS", { source: "Configuration" });
                return;
            }
        }

        await execute(
            async () => {
                const res = await fetch('/api/indi', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: 'mount/location', lat, lon, device: config.driverInstance || "Celestron GPS" })
                });
                return res.json();
            },
            language === 'fr' ? "SYNCHRONISATION" : "SYNCING",
            { loadingMessage: language === 'fr' ? "SYNCHRONISATION DE LA POSITION..." : "SYNCING LOCATION...", successMessage: `Location synced: ${lat.toFixed(4)}, ${lon.toFixed(4)}` }
        );
    };

    return (
        <div className="flex flex-col gap-8">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{t("SYS_DESC", language)}</p>

            <div className="flex gap-6 items-start">
                <Field label={t("SYS_UNIT", language)}>
                    <select value={config.unitSystem} onChange={e => updateConfig({ unitSystem: e.target.value })} style={SELECT_STYLE}>
                        <option value="METRIC">Metric (Celsius, km/h)</option>
                        <option value="IMPERIAL">Imperial (Fahrenheit, mph)</option>
                    </select>
                </Field>
                <Field label={t("SYS_LANG", language)}>
                    <select value={language} onChange={e => setLanguage(e.target.value as 'en' | 'fr')} style={SELECT_STYLE}>
                        <option value="en">English</option>
                        <option value="fr">Français</option>
                    </select>
                </Field>
            </div>

            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Globe size={16} style={{ color: "#00F0FF" }} />
                    <span className="text-[12px] font-bold tracking-[0.1em]">{t("SYS_LOC_TITLE", language)}</span>
                </div>
                <div className="flex flex-col gap-4 p-5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>{t("SYS_LOC_DESC", language)}</p>
                    <div className="flex gap-4 w-full">
                        <Field label={t("SYS_LAT", language)} error={errors.latitude}>
                            <input
                                className={INPUT_CLS}
                                style={{ ...INPUT_STYLE, borderColor: errors.latitude ? "#FC8181" : "rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)" }}
                                placeholder="48.8566"
                                value={config.latitude}
                                onChange={e => { updateConfig({ latitude: e.target.value }); setError("latitude", null); }}
                                onBlur={() => setError("latitude", validateLatitude(config.latitude))}
                            />
                        </Field>
                        <Field label={t("SYS_LON", language)} error={errors.longitude}>
                            <input
                                className={INPUT_CLS}
                                style={{ ...INPUT_STYLE, borderColor: errors.longitude ? "#FC8181" : "rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)" }}
                                placeholder="2.3522"
                                value={config.longitude}
                                onChange={e => { updateConfig({ longitude: e.target.value }); setError("longitude", null); }}
                                onBlur={() => setError("longitude", validateLongitude(config.longitude))}
                            />
                        </Field>
                    </div>
                    <button
                        className="flex items-center justify-center gap-2 w-full h-9 rounded border text-sm transition-colors cursor-pointer disabled:opacity-50"
                        style={{ borderColor: "#00F0FF", color: "#00F0FF" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,240,255,0.1)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                        onClick={handleSyncLoc}
                        disabled={isPending}
                    >
                        {isPending && <Spinner />}
                        {t("SYS_APPLY_LOC", language)}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── Bridge Tab ────────────────────────────────────────────────────────────── */

const BridgeTab = ({ config, language }: any) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' });

    const fetchLogs = useCallback(async () => {
        try {
            const logParams = new URLSearchParams({ ip: config.astroberryUrl || "" });
            const res = await fetch(clientApiUrl(`/api/indi/logs?${logParams.toString()}`));
            const data = await res.json();
            if (data.logs) setLogs(data.logs);
        } catch (e: unknown) {
            notification.warning("Impossible de charger les logs", {
                description: e instanceof Error ? e.message : "Erreur inconnue",
                source: "Bridge",
            });
        }
    }, [config.astroberryUrl]);

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [fetchLogs]);

    const handleAction = async (action: 'reconnect' | 'restart_kstars' | 'autofix') => {
        setStatus({ type: 'loading', msg: '' });
        try {
            const endpoint = action === 'autofix' ? '/api/indi/autofix' : '/api/indi/reconnect';
            const res = await fetch(clientApiUrl(endpoint), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ip: config.astroberryUrl })
            });
            const data = await res.json();
            if (action === 'autofix') {
                setStatus({ type: data.success ? 'success' : 'error', msg: data.actions ? data.actions.join(' -> ') : (data.error || 'Erreur inconnue') });
            } else {
                setStatus({ type: data.success ? 'success' : 'error', msg: data.message || data.error });
            }
        } catch (e: unknown) {
            setStatus({ type: 'error', msg: e instanceof Error ? e.message : "Erreur inconnue" });
        }
    };

    return (
        <div className="flex flex-col gap-8 h-full">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                {language === 'fr' ? "Gérez la connexion au bridge INDI et consultez les logs en temps réel." : "Manage the INDI bridge connection and view real-time logs."}
            </p>

            <div className="flex gap-4">
                <button
                    className="flex flex-1 items-center justify-center gap-2 h-10 rounded-lg font-bold text-black cursor-pointer disabled:opacity-50"
                    style={{ background: "var(--astro-gold)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#e69c3a")}
                    onMouseLeave={e => (e.currentTarget.style.background = "var(--astro-gold)")}
                    onClick={() => handleAction('autofix')}
                    disabled={status.type === 'loading'}
                >
                    <RefreshCw size={16} />
                    {language === 'fr' ? "Auto-Diagnostic & Fix" : "Auto-Diagnostic & Fix"}
                </button>
                <button
                    className="flex flex-1 items-center justify-center gap-2 h-10 rounded-lg border transition-colors cursor-pointer disabled:opacity-50"
                    style={{ borderColor: "#FC8181", color: "#FC8181" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(252,129,129,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                    onClick={() => handleAction('restart_kstars')}
                    disabled={status.type === 'loading'}
                >
                    <Power size={16} />
                    {language === 'fr' ? "Redémarrer KStars (Mac)" : "Restart KStars (Mac)"}
                </button>
            </div>

            {status.msg && (
                <p
                    className="text-[12px] p-2 rounded-md border"
                    style={{
                        background: status.type === 'success' ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)',
                        color: status.type === 'success' ? '#68D391' : '#FC8181',
                        borderColor: status.type === 'success' ? 'rgba(72,187,120,0.4)' : 'rgba(252,129,129,0.4)',
                    }}
                >
                    {status.msg}
                </p>
            )}

            <div className="flex flex-col flex-1 min-h-[400px] rounded-lg p-4" style={{ background: "black", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Activity size={16} style={{ color: "#00F0FF" }} />
                        <span className="text-[12px] font-bold tracking-[0.1em]" style={{ color: "#00F0FF" }}>BRIDGE LOGS</span>
                    </div>
                    <button
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: "rgba(255,255,255,0.6)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "white")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
                        onClick={fetchLogs}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col-reverse">
                    <div className="flex flex-col gap-1">
                        {logs.slice().reverse().map((log, i) => {
                            const isError = log.includes("ERROR") || log.includes("failed");
                            const isWarning = log.includes("WARNING");
                            const isSuccess = log.includes("✅") || log.includes("Connected");
                            const color = isError ? "#FC8181" : isWarning ? "#ECC94B" : isSuccess ? "#68D391" : "rgba(255,255,255,0.8)";
                            return (
                                <p key={i} className="text-[10px] font-mono pb-1 break-all" style={{ color, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                    {log}
                                </p>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
