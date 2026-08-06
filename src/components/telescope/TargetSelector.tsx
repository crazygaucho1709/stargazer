// src/components/telescope/TargetSelector.tsx
"use client";

import React, { useState, useMemo } from "react";
import { Search, Star, Target, Zap, AlertCircle, Navigation, Moon, ArrowUpDown } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { useGoTo } from "@/hooks/useGoTo";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import {
    calculateLimitingMagnitude,
    calculateRecommendedExposure,
    calculateRecommendedStackCount,
    isObjectObservable,
    getObservationQuality,
    formatMagnitude,
} from "@/lib/magnitudeUtils";
import { rankTargets, RankedTarget } from "@/lib/targetRanking";
import { notification } from "@/lib/notificationService";

interface TargetSelectorProps {
    onSelectTarget?: (obj: CelestialObject) => void;
}

type SortMode = "score" | "magnitude" | "altitude";

function Spinner() {
    return <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

const scoreColor = (s: number): string => {
    if (s >= 60) return "#68D391";
    if (s >= 40) return "var(--astro-teal)";
    if (s >= 20) return "var(--astro-gold)";
    return "#FC8181";
};

const catalogBadgeStyle = (catalog: string): React.CSSProperties => {
    if (catalog === "Messier")
        return { background: "rgba(236,201,75,0.25)", color: "#ECC94B", border: "1px solid rgba(236,201,75,0.5)" };
    if (catalog === "Caldwell")
        return { background: "rgba(159,122,234,0.25)", color: "#B794F4", border: "1px solid rgba(159,122,234,0.5)" };
    return { background: "rgba(90,122,234,0.25)", color: "#90CDF4", border: "1px solid rgba(90,122,234,0.5)" };
};

const selectStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.3)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    padding: "6px 10px",
    flex: 1,
    fontSize: "12px",
    cursor: "pointer",
};

export const TargetSelector: React.FC<TargetSelectorProps> = ({ onSelectTarget }) => {
    const { language, config } = useStargazerStore();
    const { execute } = useAstroAction();
    const goTo = useGoTo();

    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<string>("all");
    const [filterConstellation, setFilterConstellation] = useState<string>("all");
    const [sortMode, setSortMode] = useState<SortMode>("score");
    const [exposureTime, setExposureTime] = useState(config.exposureTime || 10);
    const [stackCount, setStackCount] = useState(config.frameCount || 10);
    const [showSettings, setShowSettings] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState<string | null>(null);

    const lat = parseFloat(config.latitude) || 48.8566;
    const lon = parseFloat(config.longitude) || 2.3522;

    // Ranked targets computed on every render (pure function)
    const rankedTargets = useMemo(() => {
        return rankTargets(CELESTIAL_CATALOG, new Date(), lat, lon, 15);
    }, [lat, lon]);

    const limitingMagnitude = useMemo(
        () => calculateLimitingMagnitude(exposureTime, stackCount),
        [exposureTime, stackCount]
    );

    const filteredTargets = useMemo(() => {
        let list = rankedTargets;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (o) =>
                    o.name.toLowerCase().includes(q) ||
                    o.id.toLowerCase().includes(q) ||
                    o.constellation.toLowerCase().includes(q)
            );
        }
        if (filterType !== "all") {
            list = list.filter((o) => o.type === filterType);
        }
        if (filterConstellation !== "all") {
            list = list.filter((o) => o.constellation === filterConstellation);
        }

        switch (sortMode) {
            case "magnitude":
                list = [...list].sort((a, b) => a.magnitude - b.magnitude);
                break;
            case "altitude":
                list = [...list].sort((a, b) => b.altitude - a.altitude);
                break;
            case "score":
            default:
                list = [...list].sort((a, b) => {
                    if (a.isVisible !== b.isVisible) return a.isVisible ? -1 : 1;
                    return b.score - a.score;
                });
                break;
        }

        return list;
    }, [rankedTargets, searchQuery, filterType, filterConstellation, sortMode]);

    const constellations = useMemo(() => {
        const s = new Set(CELESTIAL_CATALOG.map((o) => o.constellation));
        return Array.from(s).sort();
    }, []);

    const objectTypes = useMemo(() => {
        const s = new Set(CELESTIAL_CATALOG.map((o) => o.type));
        return Array.from(s).sort();
    }, []);

    const handleAutoExpose = (obj: CelestialObject) => {
        const recExp = calculateRecommendedExposure(obj.magnitude, 1);
        const recStack = calculateRecommendedStackCount(obj.magnitude, recExp);
        setExposureTime(Math.round(recExp));
        setStackCount(recStack);
        useStargazerStore.getState().updateConfig({
            exposureTime: Math.round(recExp),
            frameCount: recStack,
        });
    };

    const handleAIOptimize = async (obj: CelestialObject) => {
        setIsOptimizing(obj.id);
        try {
            const res = await fetch("/api/ai/sequence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetName: obj.name }),
            });
            if (!res.ok) throw new Error("Erreur IA");
            const data = await res.json();

            setExposureTime(data.exposureTime);
            setStackCount(data.frameCount);
            useStargazerStore.getState().updateConfig({
                exposureTime: data.exposureTime,
                isoGain: data.isoGain,
                frameCount: data.frameCount,
            });
        } catch (e: unknown) {
            if (e instanceof Error) {
                notification.error("Erreur", {
                    source: "TargetSelector",
                    description: `AI Optimize Error: ${e.message}`,
                });
            }
        } finally {
            setIsOptimizing(null);
        }
    };

    const handleSelectObject = (obj: CelestialObject) => {
        if (onSelectTarget) onSelectTarget(obj);
    };

    const handleGoto = async (obj: CelestialObject) => {
        const ok = await goTo.goto(obj.ra_deg, obj.dec_deg);
        if (ok) goTo.waitForSlew();
    };

    const visibleCount = filteredTargets.filter((o) => o.isVisible).length;

    return (
        <div
            className="w-full h-full p-4 overflow-y-auto"
            style={{ background: "rgba(10, 20, 40, 0.95)" }}
        >
            {/* Header */}
            <div
                className="mb-4 p-3 rounded-md"
                style={{ background: "rgba(0, 0, 0, 0.3)", border: "1px solid var(--astro-teal)" }}
            >
                <div className="flex items-start justify-between mb-2">
                    <div className="flex flex-col gap-0">
                        <span className="text-sm font-bold" style={{ color: "var(--astro-teal)" }}>
                            {language === "fr" ? "RECOMMANDATIONS IA" : "AI RECOMMENDATIONS"}
                        </span>
                        <div className="flex items-center gap-4">
                            <span className="text-white text-2xl font-bold">
                                {formatMagnitude(limitingMagnitude)}
                            </span>
                            <span
                                className="text-sm font-bold px-2 py-0.5 rounded"
                                style={{
                                    background: "rgba(0,240,255,0.15)",
                                    color: "var(--astro-teal)",
                                    border: "1px solid rgba(0,240,255,0.4)",
                                }}
                            >
                                mag
                            </span>
                            <span
                                className="text-sm font-bold px-2 py-0.5 rounded"
                                style={{
                                    background: "rgba(72,187,120,0.2)",
                                    color: "#68D391",
                                    border: "1px solid rgba(72,187,120,0.4)",
                                }}
                            >
                                {visibleCount}/{filteredTargets.length} visibles
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-0">
                        <span className="text-gray-400 text-xs">
                            {exposureTime}s × {stackCount}f
                        </span>
                        <span className="text-gray-500 text-xs">{formatMagnitude(limitingMagnitude)} mag</span>
                    </div>
                </div>

                <button
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors hover:bg-white/5"
                    style={{ color: "var(--astro-teal)" }}
                    onClick={() => setShowSettings(!showSettings)}
                >
                    <Zap size={12} />
                    {showSettings ? "Masquer" : "Ajuster"} paramètres
                </button>

                {showSettings && (
                    <div className="mt-3 flex flex-col gap-3">
                        {/* Exposition */}
                        <div className="w-full">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-gray-400 text-xs">Exposition (s)</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                                        onClick={() =>
                                            setExposureTime(Math.max(0.5, exposureTime - 1))
                                        }
                                    >
                                        -
                                    </button>
                                    <span className="text-white text-sm min-w-[50px] text-center">
                                        {exposureTime}s
                                    </span>
                                    <button
                                        className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                                        onClick={() =>
                                            setExposureTime(Math.min(300, exposureTime + 1))
                                        }
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                        {/* Stack frames */}
                        <div className="w-full">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-gray-400 text-xs">Stack frames</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                                        onClick={() =>
                                            setStackCount(Math.max(1, stackCount - 5))
                                        }
                                    >
                                        -
                                    </button>
                                    <span className="text-white text-sm min-w-[50px] text-center">
                                        {stackCount}
                                    </span>
                                    <button
                                        className="text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                                        onClick={() =>
                                            setStackCount(Math.min(500, stackCount + 5))
                                        }
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Search + Filters */}
            <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center w-full relative">
                    <input
                        type="text"
                        placeholder={language === "fr" ? "Rechercher..." : "Search..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full text-white text-sm placeholder-gray-500 outline-none rounded px-3 py-1.5 pr-8"
                        style={{
                            background: "rgba(0, 0, 0, 0.3)",
                            border: "1px solid rgba(255,255,255,0.1)",
                        }}
                    />
                    <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
                </div>

                <div className="flex items-center gap-2 w-full">
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="all">Tous types</option>
                        {objectTypes.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>
                    <select
                        value={filterConstellation}
                        onChange={(e) => setFilterConstellation(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="all">Toutes constellations</option>
                        {constellations.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Sort toggles */}
                <div className="flex items-center gap-1 w-full">
                    {(["score", "magnitude", "altitude"] as SortMode[]).map((mode) => (
                        <button
                            key={mode}
                            className="flex items-center justify-center gap-1 flex-1 text-[9px] font-bold py-1 px-1 rounded transition-colors"
                            style={{
                                background: sortMode === mode ? "var(--astro-teal)" : "transparent",
                                color: sortMode === mode ? "black" : "#9CA3AF",
                                border: "1px solid rgba(255,255,255,0.15)",
                            }}
                            onClick={() => setSortMode(mode)}
                        >
                            <ArrowUpDown size={12} />
                            {mode === "score" ? "SCORE" : mode === "magnitude" ? "MAG" : "ALT"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Objects list */}
            <div className="flex flex-col gap-2">
                {filteredTargets.map((obj: RankedTarget) => {
                    const observable = isObjectObservable(obj.magnitude, exposureTime, stackCount);
                    const quality = getObservationQuality(obj.magnitude, exposureTime, stackCount);

                    return (
                        <div
                            key={obj.id}
                            className="p-3 rounded-md transition-all duration-200"
                            style={{
                                background: obj.isVisible
                                    ? "rgba(0, 50, 50, 0.3)"
                                    : "rgba(30, 20, 20, 0.3)",
                                border: `1px solid ${
                                    obj.isVisible
                                        ? "rgba(0, 240, 255, 0.3)"
                                        : "rgba(255, 100, 100, 0.2)"
                                }`,
                                opacity: obj.isVisible ? 1 : 0.5,
                                cursor: obj.isVisible ? "pointer" : "not-allowed",
                            }}
                            onMouseEnter={(e) => {
                                if (obj.isVisible) {
                                    e.currentTarget.style.background = "rgba(0, 80, 80, 0.5)";
                                    e.currentTarget.style.transform = "translateX(4px)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (obj.isVisible) {
                                    e.currentTarget.style.background = "rgba(0, 50, 50, 0.3)";
                                    e.currentTarget.style.transform = "translateX(0)";
                                }
                            }}
                            onClick={() => obj.isVisible && handleSelectObject(obj)}
                        >
                            {/* Row 1: ID + Name + Score */}
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="text-xs font-bold px-1.5 py-0.5 rounded"
                                        style={catalogBadgeStyle(obj.catalog)}
                                    >
                                        {obj.id}
                                    </span>
                                    <span className="text-white font-bold text-sm">{obj.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {obj.isVisible && (
                                        <span
                                            className="text-sm font-bold"
                                            style={{ color: scoreColor(obj.score) }}
                                        >
                                            {obj.score}/100
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Row 2: Constellation · Type · Magnitude */}
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-gray-400 text-xs">
                                    {obj.constellation} · {obj.type}
                                </span>
                                <div className="flex items-center gap-1">
                                    <Star size={12} style={{ color: "var(--astro-gold)" }} />
                                    <span
                                        className="text-sm"
                                        style={{ color: observable ? "#76E4F7" : "#FC8181" }}
                                    >
                                        {formatMagnitude(obj.magnitude)} mag
                                    </span>
                                </div>
                            </div>

                            {/* Row 3: Altitude + Moon + Tags */}
                            <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                                <span>Alt: {obj.altitude.toFixed(0)}°</span>
                                <div className="flex items-center gap-1">
                                    <Moon
                                        size={12}
                                        style={{
                                            color:
                                                obj.moonSeparation > 30 ? "#68D391" : "#ECC94B",
                                        }}
                                    />
                                    <span>{obj.moonSeparation.toFixed(0)}°</span>
                                </div>
                                {obj.bestFor.map((tag) => (
                                    <span
                                        key={tag}
                                        className="text-[8px] font-bold px-1 py-0.5 rounded"
                                        style={{
                                            color: "var(--astro-teal)",
                                            border: "1px solid rgba(0,240,255,0.4)",
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                                {!obj.isVisible && (
                                    <span
                                        className="text-[8px] font-bold px-1 py-0.5 rounded"
                                        style={{
                                            background: "rgba(245,101,101,0.2)",
                                            color: "#FC8181",
                                            border: "1px solid rgba(245,101,101,0.4)",
                                        }}
                                    >
                                        Sous l&apos;horizon
                                    </span>
                                )}
                                {obj.isVisible && !observable && (
                                    <span
                                        className="text-[8px] font-bold px-1 py-0.5 rounded"
                                        style={{
                                            background: "rgba(237,137,54,0.2)",
                                            color: "#ED8936",
                                            border: "1px solid rgba(237,137,54,0.4)",
                                        }}
                                    >
                                        Trop faible
                                    </span>
                                )}
                            </div>

                            {/* Row 4: Actions */}
                            {obj.isVisible && (
                                <div className="flex items-center gap-2 mt-2">
                                    <button
                                        className="flex items-center justify-center gap-1 flex-1 text-xs font-bold py-1 px-2 rounded transition-colors"
                                        style={{ background: "var(--astro-teal)", color: "black" }}
                                        onMouseEnter={(e) =>
                                            (e.currentTarget.style.background = "#67E8F9")
                                        }
                                        onMouseLeave={(e) =>
                                            (e.currentTarget.style.background = "var(--astro-teal)")
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAutoExpose(obj);
                                        }}
                                    >
                                        <Zap size={12} />
                                        AUTO
                                    </button>
                                    <button
                                        className="flex items-center justify-center gap-1 flex-1 text-xs font-bold py-1 px-2 rounded transition-colors disabled:opacity-60"
                                        style={{ background: "var(--astro-gold)", color: "black" }}
                                        onMouseEnter={(e) => {
                                            if (isOptimizing !== obj.id)
                                                e.currentTarget.style.background = "#FCD34D";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "var(--astro-gold)";
                                        }}
                                        disabled={isOptimizing === obj.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAIOptimize(obj);
                                        }}
                                    >
                                        {isOptimizing === obj.id ? (
                                            <Spinner />
                                        ) : (
                                            <Star size={12} />
                                        )}
                                        OPTI IA
                                    </button>
                                    <button
                                        className="flex items-center justify-center gap-1 flex-1 text-xs font-bold py-1 px-2 rounded transition-colors"
                                        style={{ background: "#276749", color: "white" }}
                                        onMouseEnter={(e) =>
                                            (e.currentTarget.style.background = "#2F855A")
                                        }
                                        onMouseLeave={(e) =>
                                            (e.currentTarget.style.background = "#276749")
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleGoto(obj);
                                        }}
                                    >
                                        <Target size={12} />
                                        GOTO
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {filteredTargets.length === 0 && (
                <div className="text-center py-8">
                    <AlertCircle size={32} className="text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Aucun objet trouvé</p>
                </div>
            )}

            {/* Summary */}
            <div
                className="mt-4 pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
            >
                <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">{filteredTargets.length} objets</span>
                    <span className="text-gray-500 text-xs">{visibleCount} visibles</span>
                </div>
            </div>
        </div>
    );
};
