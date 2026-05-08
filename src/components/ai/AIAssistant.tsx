"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { BrainCircuit, CloudRain, Star, Sparkles, Wind, Moon, Thermometer, Sun, CloudFog, Cloud } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { mockApi } from "@/services/mockApi";
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
            const data = await mockApi.getWeather(coords.lat, coords.lon);
            if (data.success) {
                setWeather({
                    temperature: data.temperature,
                    windSpeed: data.windSpeed,
                    humidity: data.humidity,
                    cloudCover: data.cloudCover,
                    seeing: data.seeing,
                    sunrise: data.sunrise,
                    sunset: data.sunset
                });
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
        
        // Calculate overall observation score (0-100)
        let score = 100;
        
        // Cloud cover impact (most important factor)
        if (weather.cloudCover > 70) score -= 60;
        else if (weather.cloudCover > 50) score -= 40;
        else if (weather.cloudCover > 30) score -= 20;
        else if (weather.cloudCover > 15) score -= 10;
        
        // Wind impact
        if (weather.windSpeed && weather.windSpeed > 25) score -= 20;
        else if (weather.windSpeed && weather.windSpeed > 15) score -= 10;
        else if (weather.windSpeed && weather.windSpeed > 8) score -= 5;
        
        // Humidity impact
        if (weather.humidity && weather.humidity > 80) score -= 15;
        else if (weather.humidity && weather.humidity > 70) score -= 10;
        else if (weather.humidity && weather.humidity > 60) score -= 5;
        
        // Seeing impact
        if (weather.seeing) {
            if (weather.seeing > 1.5) score -= 15;
            else if (weather.seeing > 1.2) score -= 10;
            else if (weather.seeing < 0.5) score += 10; // Excellent seeing
        }
        
        // Generate condition text based on score
        if (score >= 85) return language === 'fr' ? "Excellentes conditions" : "Excellent conditions";
        if (score >= 70) return language === 'fr' ? "Bonnes conditions" : "Good conditions";
        if (score >= 50) return language === 'fr' ? "Conditions acceptables" : "Acceptable conditions";
        if (score >= 30) return language === 'fr' ? "Conditions limites" : "Marginal conditions";
        return language === 'fr' ? "Conditions difficiles" : "Poor conditions";
    };

    const getAdvice = () => {
        if (loading) return t("AI_CONDITIONS_EXCELLENT", language);
        
        // Calculate observation score (same as getConditionText)
        let score = 100;
        
        if (weather.cloudCover > 70) score -= 60;
        else if (weather.cloudCover > 50) score -= 40;
        else if (weather.cloudCover > 30) score -= 20;
        else if (weather.cloudCover > 15) score -= 10;
        
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
        
        // Generate advice based on score (consistent with condition text)
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
        
        // score < 30
        return language === 'fr' 
            ? "Conditions très défavorables. Observation visuelle uniquement possible pendant de courtes périodes."
            : "Very poor conditions. Visual observation only possible during short periods.";
    };

    if (!mounted) return null;

    return (
        <VStack align="stretch" gap={4} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <BrainCircuit size={18} color="var(--astro-gold)" className="pulse-glow" />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("AI_METEO_ORACLE", language)}</Text>
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

            <VStack align="stretch" gap={4}>
                {/* Environmental Data */}
                <Box bg="rgba(0, 0, 0, 0.3)" p={4} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
                    <HStack justify="space-between" mb={4}>
                        <VStack align="start" gap={0}>
                            <Text fontSize="16px" fontWeight="bold" color="var(--astro-teal)">
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
                <Box bg="rgba(0, 0, 0, 0.3)" p={4} borderRadius="8px" borderLeft="2px solid var(--astro-gold)">
                    <HStack justify="space-between" mb={2}>
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
                <Box border="1px solid rgba(255, 179, 71, 0.3)" p={4} bg="rgba(255, 179, 71, 0.05)" position="relative" borderRadius="8px">
                    <Box position="absolute" top={-3} left={4} bg="#030509" px={2} border="1px solid rgba(255, 179, 71, 0.3)" borderRadius="sm">
                        <HStack gap={1}><Star size={12} color="var(--astro-gold)" /><Text fontSize="8px" color="var(--astro-gold)" fontWeight="bold">{t("AI_ADVICE", language)}</Text></HStack>
                    </Box>
                    <VStack align="start" gap={3} mt={2}>
                        <Text fontSize="12px" fontWeight="bold" color="white">{getAdvice()}</Text>
                        <Text fontSize="11px" opacity={0.8} lineHeight={1.6}>
                            {language === 'fr' ? 
                                (weather.windSpeed && weather.windSpeed > 10 ? 
                                    `Vent modéré (${weather.windSpeed.toFixed(0)} km/h). Réduire les temps d'exposition.` :
                                    "Conditions favorables pour l'imagerie longue pose."
                                ) :
                                (weather.windSpeed && weather.windSpeed > 10 ?
                                    `Moderate wind (${weather.windSpeed.toFixed(0)} km/h). Reduce exposure times.` :
                                    "Favorable conditions for long exposure imaging."
                                )
                            }
                            {" "}{t("AI_HORIZON_LIMITS", language)} <Text as="span" color="var(--astro-teal)" fontWeight="bold">3h45 {t("AI_CONTINUOUS_TRACKING", language)}</Text> {t("AI_ON_ORION", language)}
                        </Text>
                        <HStack w="full" mt={2}>
                            <Button 
                                size="sm" w="full" bg="rgba(255, 179, 71, 0.1)" 
                                border="1px solid var(--astro-gold)" color="var(--astro-gold)"
                                _hover={{ bg: "var(--astro-gold)", color: "black", boxShadow: "0 0 15px rgba(255, 179, 71, 0.4)" }}
                                fontSize="10px" py={4}
                            >
                                <Sparkles size={14} style={{ marginRight: '6px' }} />
                                {t("AI_START_SEQUENCE", language)}
                            </Button>
                        </HStack>
                    </VStack>
                </Box>
            </VStack>
        </VStack>
    );
};
