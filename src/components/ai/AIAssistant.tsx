"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { BrainCircuit, CloudRain, Star, Sparkles, Wind, Moon, Thermometer, Sun, CloudFog } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";

export const AIAssistant = () => {
    const { language } = useStargazerStore();

    return (
        <VStack align="stretch" gap={4} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <Icon as={BrainCircuit} boxSize={5} color="var(--astro-gold)" className="pulse-glow" />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("AI_METEO_ORACLE", language)}</Text>
                </HStack>
                <Text fontSize="10px" color="var(--astro-teal)">{t("AI_ANALYSIS_OK", language)}</Text>
            </HStack>

            <Box borderTop="1px dashed rgba(255, 255, 255, 0.1)" my={1} />

            <VStack align="stretch" gap={4}>
                {/* Environmental Data */}
                <Box bg="rgba(0, 0, 0, 0.3)" p={4} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
                    <HStack justify="space-between" mb={4}>
                        <VStack align="start" gap={0}>
                            <Text fontSize="16px" fontWeight="bold" color="var(--astro-teal)">{t("AI_SEEING", language)} 0.8&quot;</Text>
                            <Text fontSize="9px" opacity={0.6}>{t("AI_ATM_CLARITY", language)} 94% (OPT)</Text>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <HStack><Icon as={Sun} boxSize={4} color="var(--astro-gold)" /><Text fontSize="12px" fontWeight="bold">{t("AI_CLEAR_NIGHT", language)}</Text></HStack>
                            <Text fontSize="9px" opacity={0.6}>{t("AI_NO_CLOUDS", language)}</Text>
                        </VStack>
                    </HStack>
                    
                    <HStack justify="space-between" fontSize="10px" opacity={0.8} bg="rgba(255,255,255,0.02)" p={2} borderRadius="md">
                        <HStack gap={1}><Icon as={Thermometer} boxSize={3.5} color="var(--astro-teal)"/><Text>-4°C</Text></HStack>
                        <HStack gap={1}><Icon as={Wind} boxSize={3.5} color="whiteAlpha.700"/><Text>5 km/h</Text></HStack>
                        <HStack gap={1}><Icon as={CloudFog} boxSize={3.5} color="whiteAlpha.700"/><Text>12% Hum</Text></HStack>
                        <HStack gap={1}><Icon as={Moon} boxSize={3.5} color="var(--astro-gold)"/><Text>12%</Text></HStack>
                    </HStack>
                </Box>

                {/* AI Suggestion */}
                <Box border="1px solid rgba(255, 179, 71, 0.3)" p={4} bg="rgba(255, 179, 71, 0.05)" position="relative" borderRadius="8px">
                    <Box position="absolute" top={-3} left={4} bg="#030509" px={2} border="1px solid rgba(255, 179, 71, 0.3)" borderRadius="sm">
                        <HStack gap={1}><Icon as={Star} boxSize={3} color="var(--astro-gold)" /><Text fontSize="8px" color="var(--astro-gold)" fontWeight="bold">{t("AI_ADVICE", language)}</Text></HStack>
                    </Box>
                    <VStack align="start" gap={3} mt={2}>
                        <Text fontSize="12px" fontWeight="bold" color="white">{t("AI_CONDITIONS_EXCELLENT", language)}</Text>
                        <Text fontSize="11px" opacity={0.8} lineHeight={1.6}>
                            {language === 'fr' ? "L'absence de vent et le seeing exceptionnel permettent une imagerie longue pose." : "Lack of wind and exceptional seeing allow for long exposure imaging."}
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
