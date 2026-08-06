// src/components/ai/AIAssistant.tsx
"use client";

import { BrainCircuit, Star, Wind, Moon, Thermometer, Sun, CloudFog, Cloud } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useState, useEffect } from "react";
import { notification } from "@/lib/notificationService";

export const AIAssistant = () => {
    const { language, ra, dec, setLanguage } = useStargazerStore();
    const envData = useEnvironmentData();
    const [mounted, setMounted] = useState(false);
    const [weather, setWeather] = useState<{
        temperature?: number;
        windSpeed?: number;
        humidity?: number;
        cloudCover?: number;
        seeing?: number;
        sunrise?: string;
        sunset?: string;
    }>({});
    const [loading, setLoading] = useState(true);
    const [langHovered, setLangHovered] = useState(false);

    useEffect(() => {
        setMounted(true);
        const fetchWeather = async () => {
            setLoading(true);
            // Use actual GPS coordinates from environment, fallback to Tahiti
            const coords = envData.latitude !== null
                ? { lat: envData.latitude, lon: envData.longitude! }
                : { lat: -17.6797, lon: -149.4068 }; // Tahiti fallback
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover&daily=sunrise,sunset&timezone=auto`);
                if (res.ok) {
                    const data = await res.json();
                    setWeather({
                        temperature: data.current?.temperature_2m,
                        windSpeed: data.current?.wind_speed_10m,
                        humidity: data.current?.relative_humidity_2m,
                        cloudCover: data.current?.cloud_cover,
                        seeing: 2.5, // Not provided by open-meteo easily, using placeholder
                        sunrise: data.daily?.sunrise?.[0]?.split('T')?.[1],
                        sunset: data.daily?.sunset?.[0]?.split('T')?.[1],
                    });
                }
            } catch (e: unknown) {
                notification.error("Erreur météo", {
                    source: "AIAssistant",
                    description: e instanceof Error ? e.message : "Failed to fetch weather data",
                });
            }
            setLoading(false);
        };

        fetchWeather();
        // Refresh weather every 5 minutes
        const interval = setInterval(fetchWeather, 300000);
        return () => clearInterval(interval);
    }, [envData.latitude, envData.longitude]);

    const getObservationScore = () => {
        let score = 100;

        if (weather.cloudCover !== undefined) {
            if (weather.cloudCover > 70) score -= 60;
            else if (weather.cloudCover > 50) score -= 40;
            else if (weather.cloudCover > 30) score -= 20;
            else if (weather.cloudCover > 15) score -= 10;
        }

        if (weather.windSpeed && weather.windSpeed > 25) score -= 20;
        else if (weather.windSpeed && weather.windSpeed > 15) score -= 10;
        else if (weather.windSpeed && weather.windSpeed > 8) score -= 5;

        if (weather.humidity && weather.humidity > 80) score -= 15;
        else if (weather.humidity && weather.humidity > 70) score -= 10;
        else if (weather.humidity && weather.humidity > 60) score -= 5;

        if (weather.seeing) {
            if (weather.seeing > 1.5) score -= 15;
            else if (weather.seeing > 1.2) score -= 10;
            else if (weather.seeing < 0.5) score += 10;
        }

        return score;
    };

    const getConditionText = () => {
        if (loading) return t("AI_ANALYSIS_OK", language);
        if (!weather.cloudCover) return t("AI_ANALYSIS_OK", language);
        const score = getObservationScore();
        if (score >= 85) return language === 'fr' ? "Excellentes conditions" : "Excellent conditions";
        if (score >= 70) return language === 'fr' ? "Bonnes conditions" : "Good conditions";
        if (score >= 50) return language === 'fr' ? "Conditions acceptables" : "Acceptable conditions";
        if (score >= 30) return language === 'fr' ? "Conditions limites" : "Marginal conditions";
        return language === 'fr' ? "Conditions difficiles" : "Poor conditions";
    };

    const getAdviceTitle = () => {
        if (loading || weather.cloudCover === undefined) return t("AI_ADVICE_TITLE_EXCELLENT", language);
        const score = getObservationScore();
        if (score >= 85) return t("AI_ADVICE_TITLE_EXCELLENT", language);
        if (score >= 70) return t("AI_ADVICE_TITLE_GOOD", language);
        if (score >= 50) return t("AI_ADVICE_TITLE_FAIR", language);
        if (score >= 30) return t("AI_ADVICE_TITLE_DIFFICULT", language);
        return t("AI_ADVICE_TITLE_POOR", language);
    };

    const getAdviceDescription = () => {
        if (loading || weather.cloudCover === undefined) {
            return language === 'fr'
                ? "Analyse des conditions en cours..."
                : "Analysing conditions...";
        }
        const score = getObservationScore();

        if (score >= 85) {
            return language === 'fr'
                ? "Conditions parfaites pour l'astrophotographie longue exposition et planétaire."
                : "Perfect conditions for long exposure and planetary astrophotography.";
        }
        if (score >= 70) {
            return language === 'fr'
                ? "Bonnes conditions pour l'imagerie deep-sky. Temps d'exposition modérés recommandés."
                : "Good conditions for deep-sky imaging. Moderate exposure times recommended.";
        }
        if (score >= 50) {
            return language === 'fr'
                ? "Conditions acceptables pour les cibles lumineuses uniquement. Courtes expositions recommandées."
                : "Acceptable conditions for bright targets only. Short exposures recommended.";
        }
        if (score >= 30) {
            return language === 'fr'
                ? "Conditions difficiles. Imagerie longue exposition déconseillée. Attendre une amélioration."
                : "Difficult conditions. Long exposure imaging not recommended. Wait for improvement.";
        }
        return language === 'fr'
            ? "Conditions très défavorables. Observation visuelle uniquement possible pendant de courtes périodes."
            : "Very poor conditions. Visual observation only possible during short periods.";
    };

    if (!mounted) return null;

    return (
        <div className="flex flex-col gap-3 w-full" style={{ color: "var(--astro-starlight)" }}>
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BrainCircuit size={16} color="var(--astro-gold)" className="pulse-glow" />
                    <span style={{ fontSize: "11px", fontWeight: "bold", letterSpacing: "0.1em" }}>
                        {t("AI_METEO_ORACLE", language)}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
                        onMouseEnter={() => setLangHovered(true)}
                        onMouseLeave={() => setLangHovered(false)}
                        style={{
                            background: langHovered ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            color: "var(--astro-starlight)",
                            width: "50px",
                            fontSize: "10px",
                            height: "20px",
                            borderRadius: "4px",
                            cursor: "pointer",
                        }}
                    >
                        {language.toUpperCase()}
                    </button>
                    <span style={{ fontSize: "10px", color: "var(--astro-teal)" }}>
                        {loading ? "Loading..." : t("AI_ANALYSIS_OK", language)}
                    </span>
                </div>
            </div>

            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />

            <div className="flex flex-col gap-3">
                {/* Environmental Data */}
                <div
                    style={{
                        background: "rgba(0,0,0,0.3)",
                        padding: "12px",
                        borderRadius: "8px",
                        borderLeft: "2px solid var(--astro-teal)",
                    }}
                >
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex flex-col gap-0">
                            <span style={{ fontSize: "15px", fontWeight: "bold", color: "var(--astro-teal)" }}>
                                {t("AI_SEEING", language)} {loading ? "--" : (weather.seeing?.toFixed(1) || "--")}&quot;
                            </span>
                            <span style={{ fontSize: "9px", opacity: 0.6 }}>
                                {weather.cloudCover !== undefined ? (
                                    weather.cloudCover > 50
                                        ? `${weather.cloudCover.toFixed(0)}% ${language === 'fr' ? 'nuages' : 'clouds'}`
                                        : `${(100 - weather.cloudCover).toFixed(0)}% ${language === 'fr' ? 'dégagé' : 'clear'} ${weather.cloudCover < 20 ? '(OPT)' : ''}`
                                ) : "--"}
                            </span>
                        </div>
                        <div className="flex flex-col items-end gap-0">
                            <div className="flex items-center gap-1">
                                {weather.cloudCover !== undefined && weather.cloudCover < 30 ? (
                                    <Sun size={16} color="var(--astro-gold)" />
                                ) : (
                                    <Cloud size={16} color="rgba(255,255,255,0.5)" />
                                )}
                                <span style={{ fontSize: "12px", fontWeight: "bold" }}>{getConditionText()}</span>
                            </div>
                            <span style={{ fontSize: "9px", opacity: 0.6 }}>
                                {weather.cloudCover !== undefined ? (
                                    weather.cloudCover > 50
                                        ? `${(100 - weather.cloudCover).toFixed(0)}% ${language === 'fr' ? 'dégagé' : 'clear'}`
                                        : `${weather.cloudCover.toFixed(0)}% ${language === 'fr' ? 'nuages' : 'clouds'}`
                                ) : "--"}
                            </span>
                        </div>
                    </div>

                    <div
                        className="flex items-center justify-between"
                        style={{
                            fontSize: "10px",
                            opacity: 0.8,
                            background: "rgba(255,255,255,0.02)",
                            padding: "8px",
                            borderRadius: "6px",
                        }}
                    >
                        <div className="flex items-center gap-1">
                            <Thermometer size={14} color="var(--astro-teal)" />
                            <span>{loading ? "--" : (weather.temperature?.toFixed(0) || "--")}°C</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Wind size={14} color="rgba(255,255,255,0.7)" />
                            <span>{loading ? "--" : (weather.windSpeed?.toFixed(0) || "--")} km/h</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <CloudFog size={14} color="rgba(255,255,255,0.7)" />
                            <span>{loading ? "--" : (weather.humidity?.toFixed(0) || "--")}% Hum</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {weather.cloudCover !== undefined && weather.cloudCover < 30 ? (
                                <Sun size={14} color="var(--astro-gold)" />
                            ) : (
                                <Cloud size={14} color="rgba(255,255,255,0.7)" />
                            )}
                            <span>{loading ? "--" : (weather.cloudCover || 0)}%</span>
                        </div>
                    </div>
                </div>

                {/* Ephemeris Section */}
                <div
                    style={{
                        background: "rgba(0,0,0,0.3)",
                        padding: "12px",
                        borderRadius: "8px",
                        borderLeft: "2px solid var(--astro-gold)",
                    }}
                >
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <Moon size={16} color="var(--astro-gold)" />
                            <span style={{ fontSize: "12px", fontWeight: "bold", letterSpacing: "0.1em", color: "rgba(255,255,255,0.8)" }}>
                                EPHEMERIS
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between" style={{ fontSize: "11px" }}>
                        <div className="flex flex-col gap-0">
                            <span style={{ opacity: 0.6, fontSize: "9px" }}>SUNRISE</span>
                            <div className="flex items-center gap-1">
                                <Sun size={12} color="#F6AD55" />
                                <span style={{ fontWeight: "bold" }}>{weather.sunrise || "--:--"}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-0">
                            <span style={{ opacity: 0.6, fontSize: "9px" }}>SUNSET</span>
                            <div className="flex items-center gap-1">
                                <Moon size={12} color="#7986CB" />
                                <span style={{ fontWeight: "bold" }}>{weather.sunset || "--:--"}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Suggestion */}
                <div
                    style={{
                        border: "1px solid rgba(255,179,71,0.3)",
                        padding: "12px",
                        background: "rgba(255,179,71,0.05)",
                        position: "relative",
                        borderRadius: "8px",
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            top: "-12px",
                            left: "16px",
                            background: "#030509",
                            padding: "0 8px",
                            border: "1px solid rgba(255,179,71,0.3)",
                            borderRadius: "4px",
                        }}
                    >
                        <div className="flex items-center gap-1">
                            <Star size={12} color="var(--astro-gold)" />
                            <span style={{ fontSize: "8px", color: "var(--astro-gold)", fontWeight: "bold" }}>
                                {t("AI_ADVICE", language)}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 mt-1">
                        <span
                            className="hud-font"
                            style={{ fontSize: "13px", fontWeight: "bold", color: "var(--astro-gold)", letterSpacing: "0.05em" }}
                        >
                            {getAdviceTitle()}
                        </span>
                        <p style={{ fontSize: "11px", opacity: 0.85, lineHeight: 1.5, margin: 0 }}>
                            {getAdviceDescription()}{" "}
                            {t("AI_HORIZON_LIMITS", language)}{" "}
                            <span style={{ color: "var(--astro-teal)", fontWeight: "bold" }}>
                                3h45 {t("AI_CONTINUOUS_TRACKING", language)}
                            </span>{" "}
                            {t("AI_ON_ORION", language)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
