// src/components/telescope/TargetSelector.tsx
"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
    Box, VStack, HStack, Text, Input, Button, Badge, Icon, Spinner,
} from "@chakra-ui/react";
import { Search, Star, Target, Camera, Zap, AlertCircle, Navigation, Moon, ArrowUpDown } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
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

interface TargetSelectorProps {
    onSelectTarget?: (obj: CelestialObject) => void;
}

type SortMode = "score" | "magnitude" | "altitude";

export const TargetSelector: React.FC<TargetSelectorProps> = ({ onSelectTarget }) => {
    const { language, config } = useStargazerStore();
    const { execute } = useAstroAction();

    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState<string>("all");
    const [filterConstellation, setFilterConstellation] = useState<string>("all");
    const [sortMode, setSortMode] = useState<SortMode>("score");
    const [exposureTime, setExposureTime] = useState(config.exposureTime || 10);
    const [stackCount, setStackCount] = useState(config.frameCount || 10);
    const [showSettings, setShowSettings] = useState(false);

    const lat = parseFloat(config.latitude) || 48.8566;
    const lon = parseFloat(config.longitude) || 2.3522;

    // Ranked targets computed on every render (pure function)
    const rankedTargets = useMemo(() => {
        return rankTargets(CELESTIAL_CATALOG, new Date(), lat, lon, 15);
    }, [lat, lon]);

    const limitingMagnitude = useMemo(() =>
        calculateLimitingMagnitude(exposureTime, stackCount),
        [exposureTime, stackCount],
    );

    const filteredTargets = useMemo(() => {
        let list = rankedTargets;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter((o) =>
                o.name.toLowerCase().includes(q) ||
                o.id.toLowerCase().includes(q) ||
                o.constellation.toLowerCase().includes(q),
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

    const handleSelectObject = (obj: CelestialObject) => {
        if (onSelectTarget) onSelectTarget(obj);
    };

    const handleGoto = async (obj: CelestialObject) => {
        await execute("/api/indi/mount", `GOTO ${obj.id}`, {
            body: {
                action: "goto",
                ra: obj.ra_deg,
                dec: obj.dec_deg,
                device: "Celestron GPS",
                ip: config.astroberryUrl,
            },
        });
    };

    const qualityColors: Record<string, string> = {
        excellent: "green",
        good: "cyan",
        fair: "yellow",
        poor: "orange",
        impossible: "red",
    };

    const scoreColor = (s: number) => {
        if (s >= 60) return "green.400";
        if (s >= 40) return "var(--astro-teal)";
        if (s >= 20) return "var(--astro-gold)";
        return "red.400";
    };

    const visibleCount = filteredTargets.filter((o) => o.isVisible).length;

    return (
        <Box w="full" h="full" bg="rgba(10, 20, 40, 0.95)" p={4} overflowY="auto">
            {/* Header */}
            <Box mb={4} p={3} borderRadius="md" bg="rgba(0, 0, 0, 0.3)" border="1px solid var(--astro-teal)">
                <HStack justify="space-between" mb={2}>
                    <VStack align="start" gap={0}>
                        <Text color="var(--astro-teal)" fontSize="sm" fontWeight="bold">
                            {language === "fr" ? "RECOMMANDATIONS IA" : "AI RECOMMENDATIONS"}
                        </Text>
                        <HStack gap={4}>
                            <Text color="white" fontSize="2xl" fontWeight="bold">
                                {formatMagnitude(limitingMagnitude)}
                            </Text>
                            <Badge colorScheme="cyan" fontSize="sm">mag</Badge>
                            <Badge colorScheme="green" fontSize="sm">
                                {visibleCount}/{filteredTargets.length} visibles
                            </Badge>
                        </HStack>
                    </VStack>
                    <VStack align="end" gap={0}>
                        <Text color="gray.400" fontSize="xs">{exposureTime}s × {stackCount}f</Text>
                        <Text color="gray.500" fontSize="xs">{formatMagnitude(limitingMagnitude)} mag</Text>
                    </VStack>
                </HStack>

                <Button size="xs" variant="ghost" color="var(--astro-teal)" onClick={() => setShowSettings(!showSettings)}>
                    <Icon as={Zap} boxSize={3} mr={1} />
                    {showSettings ? "Masquer" : "Ajuster"} paramètres
                </Button>

                {showSettings && (
                    <VStack mt={3} gap={3}>
                        <Box w="full">
                            <HStack justify="space-between" mb={1}>
                                <Text color="gray.400" fontSize="xs">Exposition (s)</Text>
                                <HStack>
                                    <Button size="xs" onClick={() => setExposureTime(Math.max(0.5, exposureTime - 1))}>-</Button>
                                    <Text color="white" fontSize="sm" minW="50px" textAlign="center">{exposureTime}s</Text>
                                    <Button size="xs" onClick={() => setExposureTime(Math.min(300, exposureTime + 1))}>+</Button>
                                </HStack>
                            </HStack>
                        </Box>
                        <Box w="full">
                            <HStack justify="space-between" mb={1}>
                                <Text color="gray.400" fontSize="xs">Stack frames</Text>
                                <HStack>
                                    <Button size="xs" onClick={() => setStackCount(Math.max(1, stackCount - 5))}>-</Button>
                                    <Text color="white" fontSize="sm" minW="50px" textAlign="center">{stackCount}</Text>
                                    <Button size="xs" onClick={() => setStackCount(Math.min(500, stackCount + 5))}>+</Button>
                                </HStack>
                            </HStack>
                        </Box>
                    </VStack>
                )}
            </Box>

            {/* Search + Filters */}
            <VStack gap={2} mb={4}>
                <HStack w="full">
                    <Box position="relative" flex={1}>
                        <Input
                            placeholder={language === "fr" ? "Rechercher..." : "Search..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            bg="rgba(0, 0, 0, 0.3)"
                            border="1px solid rgba(255,255,255,0.1)"
                            color="white"
                            size="sm"
                        />
                        <Icon as={Search} position="absolute" right={3} top="50%" transform="translateY(-50%)" color="gray.500" boxSize={4} />
                    </Box>
                </HStack>

                <HStack w="full" gap={2}>
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                        style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 10px", flex: 1, fontSize: "sm" }}>
                        <option value="all">Tous types</option>
                        {objectTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                    <select value={filterConstellation} onChange={(e) => setFilterConstellation(e.target.value)}
                        style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "6px 10px", flex: 1, fontSize: "sm" }}>
                        <option value="all">Toutes constellations</option>
                        {constellations.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                </HStack>

                {/* Sort toggles */}
                <HStack w="full" gap={1}>
                    {(["score", "magnitude", "altitude"] as SortMode[]).map((mode) => (
                        <Button
                            key={mode}
                            size="xs" flex={1}
                            variant={sortMode === mode ? "solid" : "outline"}
                            bg={sortMode === mode ? "var(--astro-teal)" : "transparent"}
                            color={sortMode === mode ? "black" : "gray.400"}
                            borderColor="rgba(255,255,255,0.15)"
                            onClick={() => setSortMode(mode)}
                            fontSize="9px"
                        >
                            <Icon as={ArrowUpDown} boxSize={3} mr={1} />
                            {mode === "score" ? "SCORE" : mode === "magnitude" ? "MAG" : "ALT"}
                        </Button>
                    ))}
                </HStack>
            </VStack>

            {/* Objects list */}
            <VStack gap={2} align="stretch">
                {filteredTargets.map((obj: RankedTarget) => {
                    const observable = isObjectObservable(obj.magnitude, exposureTime, stackCount);
                    const quality = getObservationQuality(obj.magnitude, exposureTime, stackCount);

                    return (
                        <Box
                            key={obj.id}
                            p={3} borderRadius="md"
                            bg={obj.isVisible ? "rgba(0, 50, 50, 0.3)" : "rgba(30, 20, 20, 0.3)"}
                            border="1px solid"
                            borderColor={obj.isVisible ? "rgba(0, 240, 255, 0.3)" : "rgba(255, 100, 100, 0.2)"}
                            opacity={obj.isVisible ? 1 : 0.5}
                            cursor={obj.isVisible ? "pointer" : "not-allowed"}
                            _hover={obj.isVisible ? { bg: "rgba(0, 80, 80, 0.5)", transform: "translateX(4px)", transition: "all 0.2s" } : {}}
                            onClick={() => obj.isVisible && handleSelectObject(obj)}
                        >
                            {/* Row 1: ID + Name + Score */}
                            <HStack justify="space-between" mb={1}>
                                <HStack>
                                    <Badge colorScheme={obj.catalog === "Messier" ? "yellow" : obj.catalog === "Caldwell" ? "purple" : "blue"} fontSize="xs">{obj.id}</Badge>
                                    <Text color="white" fontWeight="bold" fontSize="sm">{obj.name}</Text>
                                </HStack>
                                <HStack gap={2}>
                                    {obj.isVisible && (
                                        <Text fontSize="sm" fontWeight="bold" color={scoreColor(obj.score)}>
                                            {obj.score}/100
                                        </Text>
                                    )}
                                </HStack>
                            </HStack>

                            {/* Row 2: Constellation · Type · Magnitude */}
                            <HStack justify="space-between" mb={1}>
                                <Text color="gray.400" fontSize="xs">
                                    {obj.constellation} · {obj.type}
                                </Text>
                                <HStack>
                                    <Icon as={Star} boxSize={3} color="var(--astro-gold)" />
                                    <Text color={observable ? "cyan.300" : "red.300"} fontSize="sm">{formatMagnitude(obj.magnitude)} mag</Text>
                                </HStack>
                            </HStack>

                            {/* Row 3: Altitude + Moon + Best For */}
                            <HStack gap={3} fontSize="10px" color="gray.400" flexWrap="wrap">
                                <Text>Alt: {obj.altitude.toFixed(0)}°</Text>
                                <HStack gap={1}>
                                    <Icon as={Moon} boxSize={3} color={obj.moonSeparation > 30 ? "green.400" : "yellow.400"} />
                                    <Text>{obj.moonSeparation.toFixed(0)}°</Text>
                                </HStack>
                                {obj.bestFor.map((tag) => (
                                    <Badge key={tag} colorScheme="cyan" fontSize="8px" variant="outline">{tag}</Badge>
                                ))}
                                {!obj.isVisible && (
                                    <Badge colorScheme="red" fontSize="8px">Sous l&apos;horizon</Badge>
                                )}
                                {obj.isVisible && !observable && (
                                    <Badge colorScheme="orange" fontSize="8px">Trop faible</Badge>
                                )}
                            </HStack>

                            {/* Row 4: Actions */}
                            {obj.isVisible && (
                                <HStack mt={2} gap={2}>
                                    <Button size="xs" flex={1} bg="var(--astro-teal)" color="black"
                                        _hover={{ bg: "cyan.300" }}
                                        onClick={(e) => { e.stopPropagation(); handleAutoExpose(obj); }}>
                                        <Icon as={Zap} boxSize={3} mr={1} />
                                        AUTO
                                    </Button>
                                    <Button size="xs" flex={1} bg="green.600" color="white"
                                        _hover={{ bg: "green.500" }}
                                        onClick={(e) => { e.stopPropagation(); handleGoto(obj); }}>
                                        <Icon as={Target} boxSize={3} mr={1} />
                                        GOTO
                                    </Button>
                                </HStack>
                            )}
                        </Box>
                    );
                })}
            </VStack>

            {filteredTargets.length === 0 && (
                <Box textAlign="center" py={8}>
                    <Icon as={AlertCircle} boxSize={8} color="gray.500" mb={2} />
                    <Text color="gray.500" fontSize="sm">Aucun objet trouvé</Text>
                </Box>
            )}

            {/* Summary */}
            <Box mt={4} pt={3} borderTop="1px solid rgba(255,255,255,0.1)">
                <HStack justify="space-between">
                    <Text color="gray.500" fontSize="xs">{filteredTargets.length} objets</Text>
                    <Text color="gray.500" fontSize="xs">{visibleCount} visibles</Text>
                </HStack>
            </Box>
        </Box>
    );
};
