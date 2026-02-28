"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { BrainCircuit, CloudRain, Star, Sparkles, Wind, Moon, Thermometer } from "lucide-react";

export const AIAssistant = () => {
    return (
        <VStack align="stretch" gap={4} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <Icon as={BrainCircuit} boxSize={5} color="var(--astro-gold)" className="pulse-glow" />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">METEO & A.I. ORACLE</Text>
                </HStack>
                <Text fontSize="10px" color="var(--astro-teal)">ANALYSE OK</Text>
            </HStack>

            <Box borderTop="1px dashed rgba(255, 255, 255, 0.1)" my={1} />

            <VStack align="stretch" gap={4}>
                {/* Environmental Data */}
                <Box bg="rgba(0, 0, 0, 0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
                    <HStack justify="space-between" mb={2}>
                        <VStack align="start" gap={0}>
                            <Text fontSize="14px" fontWeight="bold" color="var(--astro-teal)">SEEING: 0.8&quot;</Text>
                            <Text fontSize="8px" opacity={0.6}>ATM_CLARITY: 94% (OPT)</Text>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <HStack><Icon as={CloudRain} boxSize={3} color="var(--astro-teal)" /><Text fontSize="10px">12%</Text></HStack>
                            <Text fontSize="8px" opacity={0.6}>HUMIDITE</Text>
                        </VStack>
                    </HStack>
                    <HStack justify="space-between" fontSize="9px" opacity={0.8}>
                        <HStack><Icon as={Thermometer} boxSize={3} /><Text>-4°C</Text></HStack>
                        <HStack><Icon as={Wind} boxSize={3} /><Text>5 km/h</Text></HStack>
                        <HStack><Icon as={Moon} boxSize={3} /><Text>12% LUNE</Text></HStack>
                    </HStack>
                </Box>

                {/* AI Suggestion */}
                <Box border="1px solid rgba(255, 179, 71, 0.3)" p={3} bg="rgba(255, 179, 71, 0.05)" position="relative" borderRadius="8px">
                    <Box position="absolute" top={-2} left={4} bg="#030509" px={1}>
                        <HStack gap={1}><Icon as={Star} boxSize={3} color="var(--astro-gold)" /><Text fontSize="8px" color="var(--astro-gold)">AVIS I.A.</Text></HStack>
                    </Box>
                    <VStack align="start" gap={2} mt={2}>
                        <Text fontSize="11px" fontWeight="bold" color="white">CONDITIONS EXCELLENTES</Text>
                        <Text fontSize="10px" opacity={0.8} lineHeight={1.5}>
                            L&apos;absence de vent et le seeing exceptionnel permettent une imagerie longue pose.
                            Les limites d&apos;horizon actuelles (15° - 85°) autorisent <Text as="span" color="var(--astro-teal)" fontWeight="bold">3h45 de suivi continu</Text> sur la Nébuleuse d&apos;Orion (M42) avant butée.
                        </Text>
                        <HStack w="full" mt={2}>
                            <Button 
                                size="sm" w="full" bg="rgba(255, 179, 71, 0.1)" 
                                border="1px solid var(--astro-gold)" color="var(--astro-gold)"
                                _hover={{ bg: "var(--astro-gold)", color: "black", boxShadow: "0 0 15px rgba(255, 179, 71, 0.4)" }}
                                fontSize="10px" leftIcon={<Sparkles size={12} />}
                            >
                                LANCER SEQUENCE M42
                            </Button>
                        </HStack>
                    </VStack>
                </Box>
            </VStack>
        </VStack>
    );
};
