// src/components/viewport/LiveView.tsx
"use client";

import { Box, Flex, Text, Image, Icon, VStack, HStack, Button } from "@chakra-ui/react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Crosshair, Target, Scan, ShieldCheck, Camera, Globe } from "lucide-react";

export const LiveView = () => {
    const { isExposing, isSlewing, ra, dec, liveViewMode, setLiveViewMode } = useStargazerStore();

    const nasaImg = "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1600&q=80";
    const canonImg = "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1600&q=80";

    return (
        <Box
            position="relative"
            w="640px"
            h="640px"
            borderRadius="full"
            p="4px"
            boxShadow="0 0 60px rgba(255, 51, 51, 0.05)"
        >
            <Box
                position="relative"
                w="full"
                h="full"
                borderRadius="full"
                overflow="hidden"
                bg="black"
                className="astro-panel"
                border="1px solid whiteAlpha.200"
            >
                {/* Background Image Switcher */}
                <Image
                    src={liveViewMode === "NASA" ? nasaImg : canonImg}
                    alt="Viewport"
                    objectFit="cover"
                    w="full"
                    h="full"
                    opacity={isExposing ? 0.9 : 0.4}
                    transition="all 1s ease-in-out"
                    filter={liveViewMode === "NASA"
                        ? "hue-rotate(330deg) saturate(1.2) contrast(1.1)"
                        : "grayscale(0.5) sepia(0.2) contrast(1.2) brightness(0.8)"}
                />

                {/* Sensor Noise Overlay for Canon Mode */}
                {liveViewMode === "CANON" && (
                    <Box
                        position="absolute" inset="0" opacity={0.15} pointerEvents="none"
                        bg="url('https://transparenttextures.com/patterns/stardust.png')"
                        style={{ animation: "pulse 0.1s infinite alternate" }}
                    />
                )}

                {/* Central Crosshair */}
                <Flex
                    position="absolute" top="50%" left="50%"
                    transform="translate(-50%, -50%)"
                    color={liveViewMode === "NASA" ? "var(--astro-teal)" : "var(--astro-gold)"}
                    opacity={0.4}
                    pointerEvents="none"
                >
                    <Icon as={Crosshair} boxSize="150px" />
                </Flex>

                {/* MODE TOGGLE (Floating in viewport) */}
                <HStack
                    position="absolute" top="40px" left="50%" transform="translateX(-50%)"
                    bg="rgba(0,0,0,0.7)" p={1} borderRadius="full" border="1px solid whiteAlpha.200"
                    backdropFilter="blur(5px)" zIndex={20}
                >
                    <Button
                        size="xs" borderRadius="full"
                        variant={liveViewMode === "NASA" ? "solid" : "ghost"}
                        colorScheme={liveViewMode === "NASA" ? "cyan" : "gray"}
                        onClick={() => setLiveViewMode("NASA")}
                        leftIcon={<Globe size={10} />}
                        fontSize="8px" className="hud-font"
                    >
                        NASA_REF
                    </Button>
                    <Button
                        size="xs" borderRadius="full"
                        variant={liveViewMode === "CANON" ? "solid" : "ghost"}
                        colorScheme={liveViewMode === "CANON" ? "red" : "gray"}
                        onClick={() => setLiveViewMode("CANON")}
                        leftIcon={<Camera size={10} />}
                        fontSize="8px" className="hud-font"
                    >
                        LIVE_CANON
                    </Button>
                </HStack>

                {/* Coordinate HUD (Lower Center) */}
                <VStack
                    position="absolute" bottom="50px" left="50%"
                    transform="translateX(-50%)" gap={0}
                    zIndex={10} pointerEvents="none"
                    bg="rgba(0,0,0,0.8)" px={8} py={3}
                    borderRadius="full" border="1px solid whiteAlpha.200"
                >
                    <HStack gap={8}>
                        <VStack align="center" gap={0}>
                            <Text color="whiteAlpha.400" fontSize="7px" fontWeight="bold">RA_POS</Text>
                            <Text color="var(--astro-teal)" fontSize="14px" className="hud-font">{ra}</Text>
                        </VStack>
                        <Box w="1px" h="20px" bg="whiteAlpha.200" />
                        <VStack align="center" gap={0}>
                            <Text color="whiteAlpha.400" fontSize="7px" fontWeight="bold">DEC_VAL</Text>
                            <Text color="var(--astro-gold)" fontSize="14px" className="hud-font">{dec}</Text>
                        </VStack>
                    </HStack>
                </VStack>

                {/* HUD Symbols */}
                <Box position="absolute" top="15%" left="15%" opacity={0.2}><Icon as={Target} boxSize={3} /></Box>
                <Box position="absolute" top="15%" right="15%" opacity={0.2}><Icon as={Scan} boxSize={3} /></Box>
                <Box position="absolute" bottom="15%" left="15%" opacity={0.2}><Icon as={ShieldCheck} boxSize={3} /></Box>
            </Box>

            <style jsx global>{`
                @keyframes pulse {
                    from { opacity: 0.1; }
                    to { opacity: 0.2; }
                }
            `}</style>
        </Box>
    );
};
