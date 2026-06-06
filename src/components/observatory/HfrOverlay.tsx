"use client";

import { Box, Text, VStack, HStack, Icon, Badge, Center, Portal } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Target, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";

const MotionBox = motion.create(Box);

export const HfrOverlay = () => {
    const { hfr, language } = useStargazerStore();
    const [hfrHistory, setHfrHistory] = useState<number[]>([]);

    useEffect(() => {
        if (hfr !== null) {
            setHfrHistory(prev => [...prev.slice(-15), hfr]);
        } else {
            setHfrHistory([]);
        }
    }, [hfr]);

    if (hfr === null) return null;

    const isPerfect = hfr < 1.8;
    const isGood = hfr < 2.8;
    const isBlurry = hfr >= 2.8;

    const getStatusText = () => {
        if (isPerfect) return language === 'fr' ? "FOCUS PARFAIT" : "PERFECT FOCUS";
        if (isGood) return language === 'fr' ? "FOCUS CORRECT" : "GOOD FOCUS";
        return language === 'fr' ? "HORS FOCUS" : "OUT OF FOCUS";
    };

    const getStatusColor = () => {
        if (isPerfect) return "var(--astro-teal)";
        if (isGood) return "var(--astro-gold)";
        return "var(--astro-error)";
    };

    return (
        <Portal>
            <MotionBox
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                position="absolute"
                top="30px"
                left="30px"
                bg="rgba(10, 15, 30, 0.85)"
                backdropFilter="blur(16px)"
                borderRadius="2xl"
                p={5}
                border="1px solid"
                borderColor={getStatusColor()}
                boxShadow={`0 15px 40px rgba(0,0,0,0.6), 0 0 20px ${getStatusColor()}33`}
                zIndex="overlay"
                minW="260px"
            >
                <VStack align="stretch" gap={4}>
                    <HStack justify="space-between" w="full">
                        <HStack gap={2} color="var(--astro-teal)">
                            <Icon as={Activity} boxSize={4} />
                            <Text fontSize="10px" fontWeight="bold" letterSpacing="0.2em" className="hud-font">
                                OPTICAL AI
                            </Text>
                        </HStack>
                        <Badge 
                            variant="subtle" 
                            bg={`${getStatusColor()}22`} 
                            color={getStatusColor()} 
                            fontSize="9px" 
                            px={2} 
                            borderRadius="full"
                            border="1px solid"
                            borderColor={`${getStatusColor()}44`}
                        >
                            {getStatusText()}
                        </Badge>
                    </HStack>
                    
                    <HStack align="center" gap={4}>
                        <Box>
                            <Text fontSize="9px" color="whiteAlpha.500" mb={0.5} letterSpacing="0.05em">HALF-FLUX RADIUS</Text>
                            <HStack align="baseline" gap={2}>
                                <Text fontSize="38px" color="white" fontWeight="bold" className="hud-font" lineHeight="1">
                                    {hfr.toFixed(2)}
                                </Text>
                                <Text fontSize="12px" color="whiteAlpha.400">px</Text>
                            </HStack>
                        </Box>
                        <Center flex={1}>
                            <Icon 
                                as={isPerfect ? ShieldCheck : isGood ? CheckCircle2 : AlertCircle} 
                                color={getStatusColor()} 
                                boxSize={10}
                                className={isBlurry ? "pulse-glow" : ""}
                            />
                        </Center>
                    </HStack>

                    {/* Focus Trend Sparkline */}
                    <VStack align="stretch" gap={1.5}>
                        <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.1em">FOCUS TREND (LOWER IS BETTER)</Text>
                        <HStack h="30px" w="full" align="end" gap="3px" bg="rgba(0,0,0,0.2)" p={1.5} borderRadius="lg">
                            {hfrHistory.length > 0 ? hfrHistory.map((val, i) => {
                                const height = Math.min(100, Math.max(10, (6 - val) / 6 * 100));
                                return (
                                    <MotionBox 
                                        key={i} 
                                        flex={1} 
                                        h={`${height}%`} 
                                        bg={i === hfrHistory.length - 1 ? getStatusColor() : "whiteAlpha.200"} 
                                        borderRadius="1px"
                                        initial={{ scaleY: 0 }}
                                        animate={{ scaleY: 1 }}
                                        transition={{ duration: 0.3 }}
                                    />
                                );
                            }) : (
                                <Text fontSize="8px" color="whiteAlpha.300" w="full" textAlign="center">WAITING FOR SENSOR DATA...</Text>
                            )}
                        </HStack>
                    </VStack>

                    <Box pt={3} borderTop="1px solid rgba(255,255,255,0.1)">
                        <HStack gap={3} align="start">
                            <Icon as={Target} boxSize={3} color="var(--astro-teal)" mt={0.5} />
                            <Text fontSize="10px" color="whiteAlpha.900" lineHeight="1.5">
                                {language === 'fr' 
                                    ? "Action : Ajustez la mise au point jusqu'à ce que l'indicateur devienne VERT." 
                                    : "Instruction: Adjust focus until indicator turns GREEN."}
                            </Text>
                        </HStack>
                    </Box>
                </VStack>
            </MotionBox>
        </Portal>
    );
};
