"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { BrainCircuit, Star, Wind, Moon, Thermometer, Sun, CloudFog, Cloud } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useState, useEffect } from "react";

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
                        sunset: data.daily?.sunset?.[0]?.split('T')?.[1]
                    });
                }
            } catch (err) {
                console.error("Failed to fetch weather", err);
            }
            setLoading(false);
        };

        fetchWeather();
        // Refresh weather every 5 minutes
        const interval = setInterval(fetchWeather, 300000);
        return () => clearInterval(interval);
    }, [envData.latitude, envData.longitude]);

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

    // Returns the same observation-quality score used in getConditionText().
    // Single source of truth so the title, condition label, and detailed
    // paragraph stay aligned with each other.
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

    // Short, single-word title shown above the AI advice paragraph.
    const getAdviceTitle = () => {
        if (loading || weather.cloudCover === undefined) return t("AI_ADVICE_TITLE_EXCELLENT", language);
        const score = getObservationScore();
        if (score >= 85) return t("AI_ADVICE_TITLE_EXCELLENT", language);
        if (score >= 70) return t("AI_ADVICE_TITLE_GOOD", language);
        if (score >= 50) return t("AI_ADVICE_TITLE_FAIR", language);
        if (score >= 30) return t("AI_ADVICE_TITLE_DIFFICULT", language);
        return t("AI_ADVICE_TITLE_POOR", language);
    };

    // Full-sentence advice paragraph shown under the title.
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
        <VStack align="stretch" gap={3} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <BrainCircuit size={16} color="var(--astro-gold)" className="pulse-glow" />
                    <Text fontSize="11px" fontWeight="bold" letterSpacing="0.1em">{t("AI_METEO_ORACLE", language)}</Text>
                </HStack>
                <HStack gap={2}>
                    <Button
                        size="xs"
                        onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}
                        bg="rgba(255, 255, 255, 0.1)"
                        borderColor="rgba(255, 255, 255, 0.2)"
                        color="var(--astro-starlight)"
                        w="50px"
                        fontSize="10px"
                        h="20px"
                        _hover={{ bg: "rgba(255, 255, 255, 0.2)" }}
                    >
                        {language.toUpperCase()}
                    </Button>
                    <Text fontSize="10px" color="var(--astro-teal)">{loading ? "Loading..." : t("AI_ANALYSIS_OK", language)}</Text>
                </HStack>
            </HStack>

            <Box borderTop="1px dashed rgba(255, 255, 255, 0.1)" my={1} />

            <VStack align="stretch" gap={3}>
                {/* Environmental Data */}
                <Box bg="rgba(0, 0, 0, 0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
                    <HStack justify="space-between" mb={2}>
                        <VStack align="start" gap={0}>
                            <Text fontSize="15px" fontWeight="bold" color="var(--astro-teal)">
                                {t("AI_SEEING", language)} {loading ? "--" : (weather.seeing?.toFixed(1) || "--")}&quot;
                            </Text>
                            <Text fontSize="9px" opacity={0.6}>
                                {weather.cloudCover !== undefined ? (
                                    weather.cloudCover > 50 
                                        ? `${weather.cloudCover.toFixed(0)}% ${language === 'fr' ? 'nuages' : 'clouds'}`
                                        : `${(100 - weather.cloudCover).toFixed(0)}% ${language === 'fr' ? 'dégagé' : 'clear'} ${weather.cloudCover < 20 ? '(OPT)' : ''}`
                                ) : "--"}
                            </Text>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <HStack>
                                {weather.cloudCover !== undefined && weather.cloudCover < 30 ? (
                                    <Sun size={16} color="var(--astro-gold)" />
                                ) : (
                                    <Cloud size={16} color="rgba(255,255,255,0.5)" />
                                )}
                                <Text fontSize="12px" fontWeight="bold">{getConditionText()}</Text>
                            </HStack>
                            <Text fontSize="9px" opacity={0.6}>
                                {weather.cloudCover !== undefined ? (
                                    weather.cloudCover > 50 
                                        ? `${(100 - weather.cloudCover).toFixed(0)}% ${language === 'fr' ? 'dégagé' : 'clear'}`
                                        : `${weather.cloudCover.toFixed(0)}% ${language === 'fr' ? 'nuages' : 'clouds'}`
                                ) : "--"}
                            </Text>
                        </VStack>
                    </HStack>
                    
                    <HStack justify="space-between" fontSize="10px" opacity={0.8} bg="rgba(255,255,255,0.02)" p={2} borderRadius="md">
                        <HStack gap={1}>
                            <Thermometer size={14} color="var(--astro-teal)"/>
                            <Text>{loading ? "--" : (weather.temperature?.toFixed(0) || "--")}°C</Text>
                        </HStack>
                        <HStack gap={1}>
                            <Wind size={14} color="rgba(255,255,255,0.7)"/>
                            <Text>{loading ? "--" : (weather.windSpeed?.toFixed(0) || "--")} km/h</Text>
                        </HStack>
                        <HStack gap={1}>
                            <CloudFog size={14} color="rgba(255,255,255,0.7)"/>
                            <Text>{loading ? "--" : (weather.humidity?.toFixed(0) || "--")}% Hum</Text>
                        </HStack>
                        <HStack gap={1}>
                            {weather.cloudCover !== undefined && weather.cloudCover < 30 ? (
                                <Sun size={14} color="var(--astro-gold)" />
                            ) : (
                                <Cloud size={14} color="rgba(255,255,255,0.7)" />
                            )}
                            <Text>{loading ? "--" : (weather.cloudCover || 0)}%</Text>
                        </HStack>
                    </HStack>
                </Box>
                
                {/* Ephemeris Section */}
                <Box bg="rgba(0, 0, 0, 0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-gold)">
                    <HStack justify="space-between" mb={1}>
                        <HStack gap={2}>
                            <Moon size={16} color="var(--astro-gold)" />
                            <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="whiteAlpha.800">EPHEMERIS</Text>
                        </HStack>
                    </HStack>
                    <HStack justify="space-between" fontSize="11px">
                        <VStack align="start" gap={0}>
                            <Text opacity={0.6} fontSize="9px">SUNRISE</Text>
                            <HStack>
                                <Sun size={12} color="#F6AD55" />
                                <Text fontWeight="bold">{weather.sunrise || "--:--"}</Text>
                            </HStack>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <Text opacity={0.6} fontSize="9px">SUNSET</Text>
                            <HStack>
                                <Moon size={12} color="#7986CB" />
                                <Text fontWeight="bold">{weather.sunset || "--:--"}</Text>
                            </HStack>
                        </VStack>
                    </HStack>
                </Box>

                {/* AI Suggestion */}
                <Box border="1px solid rgba(255, 179, 71, 0.3)" p={3} bg="rgba(255, 179, 71, 0.05)" position="relative" borderRadius="8px">
                    <Box position="absolute" top={-3} left={4} bg="#030509" px={2} border="1px solid rgba(255, 179, 71, 0.3)" borderRadius="sm">
                        <HStack gap={1}><Star size={12} color="var(--astro-gold)" /><Text fontSize="8px" color="var(--astro-gold)" fontWeight="bold">{t("AI_ADVICE", language)}</Text></HStack>
                    </Box>
                    <VStack align="start" gap={2} mt={1}>
                        <Text fontSize="13px" fontWeight="bold" color="var(--astro-gold)" letterSpacing="0.05em" className="hud-font">{getAdviceTitle()}</Text>
                        <Text fontSize="11px" opacity={0.85} lineHeight={1.5}>
                            {getAdviceDescription()}{" "}
                            {t("AI_HORIZON_LIMITS", language)} <Text as="span" color="var(--astro-teal)" fontWeight="bold">3h45 {t("AI_CONTINUOUS_TRACKING", language)}</Text> {t("AI_ON_ORION", language)}
                        </Text>
                    </VStack>
                </Box>
            </VStack>
        </VStack>
    );
};
