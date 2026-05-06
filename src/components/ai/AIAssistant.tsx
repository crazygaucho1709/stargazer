"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { BrainCircuit, CloudRain, Star, Sparkles, Wind, Moon, Thermometer, Sun, CloudFog, Cloud } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { mockApi } from "@/services/mockApi";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useState, useEffect } from "react";

export const AIAssistant = () => {
    const { language, ra, dec } = useStargazerStore();
    const envData = useEnvironmentData();
    const [weather, setWeather] = useState<{
        temperature?: number;
        windSpeed?: number;
        humidity?: number;
        cloudCover?: number;
        seeing?: number;
    }>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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
                    seeing: data.seeing
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
        
        if (weather.cloudCover < 20) return t("AI_CLEAR_NIGHT", language);
        if (weather.cloudCover < 50) return language === 'fr' ? "Nuageux partiel" : "Partly cloudy";
        return language === 'fr' ? "Nuageux" : "Cloudy";
    };

    const getAdvice = () => {
        if (loading) return t("AI_CONDITIONS_EXCELLENT", language);
        
        if (weather.cloudCover && weather.cloudCover > 50) {
            return language === 'fr' ? "Conditions non optimales pour l'imagerie" : "Suboptimal conditions for imaging";
        }
        if (weather.windSpeed && weather.windSpeed > 15) {
            return language === 'fr' ? "Vent élevé - réduire temps d'exposition" : "High wind - reduce exposure time";
        }
        return t("AI_CONDITIONS_EXCELLENT", language);
    };

    return (
        <VStack align="stretch" gap={4} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <Icon as={BrainCircuit} boxSize={5} color="var(--astro-gold)" className="pulse-glow" />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("AI_METEO_ORACLE", language)}</Text>
                </HStack>
                <Text fontSize="10px" color="var(--astro-teal)">{loading ? "Loading..." : t("AI_ANALYSIS_OK", language)}</Text>
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
                                <Icon as={weather.cloudCover && weather.cloudCover < 30 ? Sun : Cloud} boxSize={4} color={weather.cloudCover && weather.cloudCover < 30 ? "var(--astro-gold)" : "whiteAlpha.500"} />
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
                            <Icon as={Thermometer} boxSize={3.5} color="var(--astro-teal)"/>
                            <Text>{loading ? "--" : (weather.temperature?.toFixed(0) || "--")}°C</Text>
                        </HStack>
                        <HStack gap={1}>
                            <Icon as={Wind} boxSize={3.5} color="whiteAlpha.700"/>
                            <Text>{loading ? "--" : (weather.windSpeed?.toFixed(0) || "--")} km/h</Text>
                        </HStack>
                        <HStack gap={1}>
                            <Icon as={CloudFog} boxSize={3.5} color="whiteAlpha.700"/>
                            <Text>{loading ? "--" : (weather.humidity?.toFixed(0) || "--")}% Hum</Text>
                        </HStack>
                        <HStack gap={1}>
                            <Icon as={weather.cloudCover && weather.cloudCover < 50 ? Sun : Cloud} boxSize={3.5} color={weather.cloudCover && weather.cloudCover < 30 ? "var(--astro-gold)" : "whiteAlpha.700"}/>
                            <Text>{loading ? "--" : (weather.cloudCover || 0)}%</Text>
                        </HStack>
                    </HStack>
                </Box>

                {/* AI Suggestion */}
                <Box border="1px solid rgba(255, 179, 71, 0.3)" p={4} bg="rgba(255, 179, 71, 0.05)" position="relative" borderRadius="8px">
                    <Box position="absolute" top={-3} left={4} bg="#030509" px={2} border="1px solid rgba(255, 179, 71, 0.3)" borderRadius="sm">
                        <HStack gap={1}><Icon as={Star} boxSize={3} color="var(--astro-gold)" /><Text fontSize="8px" color="var(--astro-gold)" fontWeight="bold">{t("AI_ADVICE", language)}</Text></HStack>
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
