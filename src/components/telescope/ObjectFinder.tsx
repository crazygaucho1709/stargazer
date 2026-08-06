// src/components/telescope/ObjectFinder.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Star, Telescope, MapPin, Clock, Compass, Navigation } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { CELESTIAL_CATALOG, getVisibleObjects, CelestialObject } from "@/data/celestialCatalog";
import { t } from "@/i18n/translations";
import { useGoTo } from "@/hooks/useGoTo";

interface ObjectFinderProps {
    onSlew?: (ra: number, dec: number) => void;
}

function Spinner() {
    return <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

const getTypeColor = (type: string) => {
    switch (type) {
        case "Galaxy":
            return "#FF6B6B";
        case "Nebula":
            return "#4ECDC4";
        case "Star Cluster":
            return "#FFE66D";
        case "Planetary Nebula":
            return "#95E1D3";
        case "Supernova Remnant":
            return "#F38181";
        default:
            return "#00F0FF";
    }
};

const getDifficultyBg = (diff: string) => {
    switch (diff) {
        case "Easy":
            return { bg: "rgba(72,187,120,0.35)", border: "rgba(72,187,120,0.7)" };
        case "Medium":
            return { bg: "rgba(236,201,75,0.35)", border: "rgba(236,201,75,0.7)" };
        case "Hard":
            return { bg: "rgba(245,101,101,0.35)", border: "rgba(245,101,101,0.7)" };
        default:
            return { bg: "rgba(107,114,128,0.35)", border: "rgba(107,114,128,0.7)" };
    }
};

export const ObjectFinder = ({ onSlew }: ObjectFinderProps) => {
    const { language, setPosition, config, mountLimits, selectedObjectId, setSelectedObjectId } =
        useStargazerStore();
    const goTo = useGoTo();
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<string>("all");
    const [filterDifficulty, setFilterDifficulty] = useState<string>("all");
    const [visibleObjects, setVisibleObjects] = useState<CelestialObject[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Calculate visible objects based on current time and location
    useEffect(() => {
        const lat = parseFloat(config.latitude) || 48.8566;
        const lon = parseFloat(config.longitude) || 2.3522;

        const objects = getVisibleObjects(currentTime, lat, lon, mountLimits.minAlt || 15);
        setVisibleObjects(objects);
    }, [currentTime, config.latitude, config.longitude, mountLimits.minAlt]);

    // Derive selected object from shared store ID
    const selectedObject = useMemo(() => {
        if (!selectedObjectId) return null;
        return CELESTIAL_CATALOG.find((o) => o.id === selectedObjectId) || null;
    }, [selectedObjectId]);

    // Filter objects based on search and filters
    const filteredObjects = useMemo(() => {
        return visibleObjects.filter((obj) => {
            const matchesSearch =
                obj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                obj.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                obj.constellation.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesType = filterType === "all" || obj.type === filterType;
            const matchesDifficulty = filterDifficulty === "all" || obj.difficulty === filterDifficulty;

            return matchesSearch && matchesType && matchesDifficulty;
        });
    }, [visibleObjects, searchQuery, filterType, filterDifficulty]);

    const handleSlewToObject = async (obj: CelestialObject) => {
        setSelectedObjectId(obj.id);
        const ok = await goTo.goto(obj.ra_deg, obj.dec_deg);
        if (ok) {
            setPosition(obj.ra, obj.dec, 45, 180); // Placeholder alt/az (mis à jour par le poll coords)
            goTo.waitForSlew(); // Lance la résolution en arrière-plan
        }
        if (onSlew) onSlew(obj.ra_deg, obj.dec_deg);
    };

    const selectStyle: React.CSSProperties = {
        background: "rgba(255,255,255,0.05)",
        border: "none",
        color: "white",
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        cursor: "pointer",
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Telescope size={20} style={{ color: "var(--astro-teal)" }} />
                    <span className="text-[14px] font-bold tracking-[0.1em] text-white">
                        {language === "fr" ? "CHERCHEUR D'OBJETS" : "OBJECT FINDER"}
                    </span>
                </div>
                <div
                    className="px-2 py-0.5 rounded text-[10px] font-bold"
                    style={{
                        color: "var(--astro-teal)",
                        background: "rgba(0,240,255,0.12)",
                        border: "1px solid rgba(0,240,255,0.4)",
                    }}
                >
                    {visibleObjects.length} {language === "fr" ? "visibles" : "visible"}
                </div>
            </div>

            {/* Search & Filters */}
            <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.3)" }}>
                <div className="flex flex-col gap-3">
                    {/* Search Input */}
                    <div className="flex items-center gap-2">
                        <Search size={16} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
                        <input
                            type="text"
                            placeholder={language === "fr" ? "Rechercher M31, Orion..." : "Search M31, Orion..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 bg-white/5 border-none outline-none text-white text-[12px] placeholder-white/30 focus:bg-white/10 rounded px-2 py-1 transition-colors"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2">
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            style={{ ...selectStyle, width: "110px" }}
                        >
                            <option value="all">{language === "fr" ? "Tous types" : "All types"}</option>
                            <option value="Galaxy">{language === "fr" ? "Galaxies" : "Galaxies"}</option>
                            <option value="Nebula">{language === "fr" ? "Nébuleuses" : "Nebulae"}</option>
                            <option value="Star Cluster">{language === "fr" ? "Amas" : "Clusters"}</option>
                            <option value="Planetary Nebula">
                                {language === "fr" ? "Néb. Planétaires" : "Planetary"}
                            </option>
                        </select>

                        <select
                            value={filterDifficulty}
                            onChange={(e) => setFilterDifficulty(e.target.value)}
                            style={{ ...selectStyle, width: "100px" }}
                        >
                            <option value="all">{language === "fr" ? "Tous niveaux" : "All levels"}</option>
                            <option value="Easy">{language === "fr" ? "Facile" : "Easy"}</option>
                            <option value="Medium">{language === "fr" ? "Moyen" : "Medium"}</option>
                            <option value="Hard">{language === "fr" ? "Difficile" : "Hard"}</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Object List */}
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {filteredObjects.map((obj) => (
                    <div
                        key={obj.id}
                        className="p-3 rounded-lg cursor-pointer transition-all duration-200"
                        style={{
                            background:
                                selectedObject?.id === obj.id
                                    ? "rgba(0,240,255,0.1)"
                                    : "rgba(255,255,255,0.03)",
                            border: `1px solid ${
                                selectedObject?.id === obj.id ? "var(--astro-teal)" : "transparent"
                            }`,
                        }}
                        onMouseEnter={(e) => {
                            if (selectedObject?.id !== obj.id) {
                                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (selectedObject?.id !== obj.id) {
                                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                            }
                        }}
                        onClick={() => setSelectedObjectId(obj.id)}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Star size={12} style={{ color: getTypeColor(obj.type) }} />
                                <span className="text-[12px] font-bold text-white">{obj.id}</span>
                                <span className="text-[11px] text-white/70">{obj.name}</span>
                            </div>
                            <div
                                className="text-[10px] font-bold text-white rounded px-1.5 py-0.5"
                                style={{
                                    background: getDifficultyBg(obj.difficulty).bg,
                                    border: `1px solid ${getDifficultyBg(obj.difficulty).border}`,
                                }}
                            >
                                {obj.magnitude.toFixed(1)}m
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-[10px] text-white/50">
                                <span>{obj.constellation}</span>
                                <span>•</span>
                                <span style={{ color: getTypeColor(obj.type) }}>{obj.type}</span>
                            </div>

                            <button
                                className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded transition-colors"
                                style={{ background: "var(--astro-teal)", color: "black" }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "white")}
                                onMouseLeave={(e) =>
                                    (e.currentTarget.style.background = "var(--astro-teal)")
                                }
                                disabled={goTo.isSlewing && selectedObject?.id === obj.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSlewToObject(obj);
                                }}
                            >
                                {goTo.isSlewing && selectedObject?.id === obj.id ? (
                                    <Spinner />
                                ) : (
                                    <Navigation size={12} />
                                )}
                                GOTO
                            </button>
                        </div>
                    </div>
                ))}

                {filteredObjects.length === 0 && (
                    <p className="text-[12px] text-white/50 text-center py-4">
                        {language === "fr"
                            ? "Aucun objet trouvé. Essayez d'autres critères."
                            : "No objects found. Try different criteria."}
                    </p>
                )}
            </div>

            {/* Selected Object Details */}
            {selectedObject && (
                <div
                    className="p-4 rounded-lg"
                    style={{
                        background: "rgba(0,0,0,0.4)",
                        borderLeft: "3px solid var(--astro-teal)",
                    }}
                >
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[14px] font-bold" style={{ color: "var(--astro-teal)" }}>
                                {selectedObject.name}
                            </span>
                            <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded"
                                style={{
                                    background: "rgba(0,240,255,0.15)",
                                    color: "var(--astro-teal)",
                                    border: "1px solid rgba(0,240,255,0.4)",
                                }}
                            >
                                {selectedObject.id}
                            </span>
                        </div>

                        <p className="text-[11px] text-white/70">{selectedObject.description}</p>

                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="flex items-center gap-1">
                                <Compass size={12} style={{ color: "rgba(255,255,255,0.5)" }} />
                                <span className="text-white/60">RA: {selectedObject.ra}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <MapPin size={12} style={{ color: "rgba(255,255,255,0.5)" }} />
                                <span className="text-white/60">DEC: {selectedObject.dec}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Star size={12} style={{ color: "rgba(255,255,255,0.5)" }} />
                                <span className="text-white/60">{selectedObject.size_arcmin}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock size={12} style={{ color: "rgba(255,255,255,0.5)" }} />
                                <span className="text-white/60">
                                    {selectedObject.best_months.slice(0, 2).join(", ")}
                                </span>
                            </div>
                        </div>

                        <button
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded font-bold transition-colors disabled:opacity-60"
                            style={{ background: "var(--astro-teal)", color: "black" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "white")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--astro-teal)")}
                            disabled={goTo.isSlewing}
                            onClick={() => handleSlewToObject(selectedObject)}
                        >
                            {goTo.isSlewing ? <Spinner /> : <Navigation size={16} />}
                            {language === "fr" ? "SLEW VERS L'OBJET" : "SLEW TO OBJECT"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
