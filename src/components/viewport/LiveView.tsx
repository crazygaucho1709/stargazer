// src/components/viewport/LiveView.tsx
"use client";

import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { Crosshair, Camera, Globe, ZoomIn, ZoomOut, Play, Square, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { HfrOverlay } from "@/components/observatory/HfrOverlay";
import { CaptureProgress } from "@/components/observatory/CaptureProgress";
import { useLiveView } from "@/hooks/useLiveView";

export const LiveView = () => {
    const { isExposing, isSlewing, ra, dec, alt, az, liveViewMode, setLiveViewMode, zoom, setZoom, language, config, isConfigMenuOpen } = useStargazerStore();
    const liveView = useLiveView();
    const [ccdError, setCcdError] = useState(false);

    useEffect(() => {
        if (liveViewMode !== "CANON") {
            if (liveView.isLive) liveView.stop();
            setCcdError(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveViewMode]);

    useEffect(() => {
        if (isConfigMenuOpen && liveView.isLive) {
            liveView.stop();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfigMenuOpen]);

    const [lastActivity, setLastActivity] = useState(Date.now());
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    useEffect(() => {
        if (!liveView.isLive) {
            setShowSafetyModal(false);
            return;
        }

        const handleActivity = () => setLastActivity(Date.now());
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('mousedown', handleActivity);
        window.addEventListener('touchstart', handleActivity);

        const checkInactivity = setInterval(() => {
            const idleTime = Date.now() - lastActivity;
            if (idleTime > 600000 && !showSafetyModal) {
                setShowSafetyModal(true);
            }
            if (idleTime > 900000) {
                liveView.stop();
                setShowSafetyModal(false);
            }
        }, 10000);

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('mousedown', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            clearInterval(checkInactivity);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveView.isLive, lastActivity, showSafetyModal]);

    const cleanRa = String(ra).replace(/[hms]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanDec = String(dec).replace(/[°'"]/g, ' ').replace(/\s+/g, ' ').trim();
    const aladinUrl = `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(`${cleanRa} ${cleanDec}`)}&fov=${10 / zoom}&lang=${language}`;

    return (
        <div
            className="absolute inset-0 w-screen h-screen overflow-hidden"
            style={{ zIndex: 0, background: "#030509" }}
        >
            {/* Safety Modal Overlay */}
            {showSafetyModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100]"
                    style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}>
                    <div className="flex flex-col items-center gap-6 p-10 rounded-2xl text-center max-w-[400px] pulse-glow"
                        style={{
                            background: "rgba(10, 20, 40, 0.95)",
                            border: "2px solid var(--astro-gold)",
                            boxShadow: "0 0 50px rgba(255, 179, 71, 0.3)",
                        }}>
                        <AlertTriangle size={48} style={{ color: "var(--astro-gold)" }} />
                        <div className="flex flex-col gap-2">
                            <h2 className="hud-font text-white font-bold text-lg">VEILLE SÉCURITÉ</h2>
                            <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                                {language === 'fr'
                                    ? "Inactivité détectée. Le flux direct sera coupé dans 5 minutes pour préserver la connexion avec l'Astroberry."
                                    : "Inactivity detected. Live feed will be cut in 5 minutes to preserve connection with Astroberry."}
                            </p>
                        </div>
                        <button
                            className="w-full h-10 rounded-lg font-bold text-black transition-colors cursor-pointer"
                            style={{ background: "var(--astro-gold)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "white")}
                            onMouseLeave={e => (e.currentTarget.style.background = "var(--astro-gold)")}
                            onClick={() => setLastActivity(Date.now())}
                        >
                            {language === 'fr' ? "MAINTENIR LE LIEN" : "KEEP CONNECTION"}
                        </button>
                    </div>
                </div>
            )}

            <div className="relative w-full h-full">
                {/* Background / Stream */}
                <div
                    className="absolute flex items-center justify-center"
                    style={{ inset: liveViewMode === "CANON" ? "-200px" : "0" }}
                >
                    {liveViewMode === "NASA" ? (
                        <div className="w-full h-full" style={{ background: "#030509" }} />
                    ) : ccdError ? (
                        <div className="flex items-center justify-center w-full h-full" style={{ background: "#112233" }}>
                            <span style={{ color: "var(--astro-gold)", fontSize: "18px" }}>{t("CANON_CONNECTION_ERROR", language)}</span>
                        </div>
                    ) : liveView.streamUrl ? (
                        <div className="absolute top-0 left-0 w-full h-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={liveView.streamUrl}
                                alt="Canon Live View"
                                crossOrigin="anonymous"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                    transform: `scale(${zoom})`,
                                    transformOrigin: 'center center',
                                    background: '#000',
                                }}
                                onLoad={() => setCcdError(false)}
                                onError={() => setCcdError(true)}
                                referrerPolicy="no-referrer"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center w-full h-full" style={{ background: "#000" }}>
                            <div className="flex flex-col items-center gap-3">
                                <Camera size={48} style={{ color: "var(--astro-teal)", opacity: 0.5 }} />
                                <span className="hud-font text-sm" style={{ color: "var(--astro-teal)" }}>{t("CANON_STANDBY", language)}</span>
                                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>{t("CANON_STANDBY_HINT", language)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Vignette */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "radial-gradient(circle at center, transparent 30%, rgba(3, 5, 9, 0.8) 100%)" }}
                />

                {/* Sensor Noise Overlay — Canon mode */}
                {liveViewMode === "CANON" && (
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            opacity: 0.15,
                            backgroundImage: "url('https://transparenttextures.com/patterns/stardust.png')",
                            animation: "pulse 0.1s infinite alternate",
                        }}
                    />
                )}

                {/* Central Crosshair */}
                <div
                    className="absolute pointer-events-none"
                    style={{
                        top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)",
                        color: liveViewMode === "NASA" ? "var(--astro-teal)" : "var(--astro-gold)",
                        opacity: 0.6,
                    }}
                >
                    <Crosshair size={180} strokeWidth={1} />
                </div>

                {/* Decorative focus rings */}
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                        width: "80vh", height: "80vh",
                        border: "1px dashed rgba(255,255,255,0.05)",
                    }}
                />
                <div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                        width: "50vh", height: "50vh",
                        border: "1px solid rgba(255, 51, 51, 0.1)",
                    }}
                />

                {/* Zoom Controls */}
                <div
                    className="absolute flex flex-col items-center gap-4 p-3 rounded-full z-20"
                    style={{
                        right: "40px", top: "50%", transform: "translateY(-50%)",
                        background: "rgba(10, 20, 40, 0.6)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    }}
                >
                    <button
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: "rgba(255,255,255,0.7)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--astro-teal)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
                        onClick={() => setZoom(Math.min(10, zoom + 0.5))}
                    >
                        <ZoomIn size={18} />
                    </button>
                    <span className="hud-font text-[12px] font-bold" style={{ color: "var(--astro-teal)" }}>
                        {zoom.toFixed(1)}x
                    </span>
                    <button
                        className="p-1 rounded transition-colors cursor-pointer"
                        style={{ color: "rgba(255,255,255,0.7)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--astro-teal)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
                        onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                    >
                        <ZoomOut size={18} />
                    </button>
                </div>

                {/* Mode Toggle + Live View Controls */}
                <div
                    className="absolute flex items-center gap-2 p-1.5 rounded-full z-20"
                    style={{
                        top: "100px", left: "50%", transform: "translateX(-50%)",
                        background: "rgba(10, 20, 40, 0.7)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                    }}
                >
                    <button
                        className="flex items-center gap-1.5 h-7 px-6 rounded-full text-[10px] hud-font transition-colors cursor-pointer"
                        style={{
                            background: liveViewMode === "NASA" ? "var(--astro-teal)" : "transparent",
                            color: liveViewMode === "NASA" ? "black" : "rgba(255,255,255,0.7)",
                        }}
                        onMouseEnter={e => { if (liveViewMode !== "NASA") (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                        onMouseLeave={e => { if (liveViewMode !== "NASA") (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => setLiveViewMode("NASA")}
                    >
                        <Globe size={14} />
                        {t("SKY_MAP", language)}
                    </button>
                    <button
                        className="flex items-center gap-1.5 h-7 px-6 rounded-full text-[10px] hud-font transition-colors cursor-pointer"
                        style={{
                            background: liveViewMode === "CANON" ? "var(--astro-gold)" : "transparent",
                            color: liveViewMode === "CANON" ? "black" : "rgba(255,255,255,0.7)",
                        }}
                        onMouseEnter={e => { if (liveViewMode !== "CANON") (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                        onMouseLeave={e => { if (liveViewMode !== "CANON") (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => setLiveViewMode("CANON")}
                    >
                        <Camera size={14} />
                        {t("LIVE_SENSOR", language)}
                    </button>

                    {liveViewMode === "CANON" && (
                        <button
                            className="flex items-center gap-1 h-7 px-4 rounded-full text-[10px] hud-font text-white transition-colors cursor-pointer"
                            style={{
                                background: liveView.isLive ? "#E53E3E" : "#38A169",
                                animation: liveView.isLive ? "pulse 1s infinite" : undefined,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = liveView.isLive ? "#C53030" : "#276749"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = liveView.isLive ? "#E53E3E" : "#38A169"; }}
                            onClick={liveView.isLive ? liveView.stop : liveView.start}
                        >
                            {liveView.isLive ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                            <span className="ml-1">{liveView.isLive ? "STOP" : "LIVE"}</span>
                            {liveView.status && (
                                <span className="ml-1 text-[8px] opacity-80">({liveView.status})</span>
                            )}
                        </button>
                    )}
                </div>

                {/* Coordinate HUD */}
                <div
                    className="absolute flex flex-col items-center gap-0 pointer-events-none z-10"
                    style={{
                        bottom: "130px", left: "50%", transform: "translateX(-50%)",
                        background: "rgba(10, 20, 40, 0.8)",
                        padding: "16px 40px",
                        borderRadius: "9999px",
                        border: "1px solid rgba(255,255,255,0.1)",
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                    }}
                >
                    <div className="flex items-center gap-10">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-bold opacity-60" style={{ color: "var(--astro-starlight)" }}>{t("RIGHT_ASCENSION", language)}</span>
                            <span className="hud-font text-[18px]" style={{ color: "var(--astro-teal)" }}>{ra}</span>
                        </div>
                        <div className="w-px h-[30px]" style={{ background: "rgba(255,255,255,0.1)" }} />
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-bold opacity-60" style={{ color: "var(--astro-starlight)" }}>{t("DECLINATION", language)}</span>
                            <span className="hud-font text-[18px]" style={{ color: "var(--astro-gold)" }}>{dec}</span>
                        </div>
                    </div>
                </div>

                {/* Overlays */}
                {liveViewMode === "CANON" && config.showHfrOverlay && <HfrOverlay />}
                <CaptureProgress />
            </div>
        </div>
    );
};
