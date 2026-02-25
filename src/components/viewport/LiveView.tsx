// src/components/viewport/LiveView.tsx
"use client";

import { Box, Flex, Text, Image, Icon, VStack, HStack } from "@chakra-ui/react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Crosshair, Target, Scan, ShieldCheck } from "lucide-react";

export const LiveView = () => {
    const { isExposing, isSlewing, ra, dec } = useStargazerStore();

    return (
        <Box
            position="relative"
            w="480px"
            h="480px"
            borderRadius="full"
            p="4px"
            bgGradient="linear(to-br, rgba(0, 240, 255, 0.5), transparent, rgba(230, 0, 0, 0.5))"
            boxShadow="0 0 60px rgba(0, 240, 255, 0.15)"
        >
            <Box
                position="relative"
                w="full"
                h="full"
                borderRadius="full"
                overflow="hidden"
                bg="black"
                className="glass-panel"
            >
                {/* Central Star/Nebula Image */}
                <Image
                    src="https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1600&q=80"
                    alt="Star Map"
                    objectFit="cover"
                    w="full"
                    h="full"
                    opacity={isExposing ? 0.9 : 0.5}
                    transition="opacity 1.5s ease-in-out"
                    filter="hue-rotate(330deg) saturate(1.2) contrast(1.1)"
                />

                {/* Radar Overlay Rings */}
                <Box position="absolute" inset="0" pointerEvents="none">
                    <Box position="absolute" inset="30px" borderRadius="full" border="1px solid" borderColor="whiteAlpha.100" />
                    <Box position="absolute" inset="100px" borderRadius="full" border="1px solid" borderColor="whiteAlpha.50" />
                    <Box position="absolute" inset="180px" borderRadius="full" border="1px solid" borderColor="whiteAlpha.100" />

                    {/* Radar Cross-sections */}
                    <Box position="absolute" top="50%" left="0" w="full" h="1px" bg="whiteAlpha.200" transform="translateY(-50%)" />
                    <Box position="absolute" top="0" left="50%" w="1px" h="full" bg="whiteAlpha.200" transform="translateX(-50%)" />

                    {/* Rotating Scanner Line */}
                    <Box
                        position="absolute"
                        top="50%" left="50%"
                        w="50%" h="1px"
                        bgGradient="linear(to-r, transparent, #00F0FF)"
                        transformOrigin="left"
                        style={{ animation: "radar-sweep 4s linear infinite" }}
                    />
                </Box>

                {/* Central Crosshair */}
                <Flex
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    color="#00F0FF"
                    opacity={0.5}
                    pointerEvents="none"
                >
                    <Icon as={Crosshair} boxSize="120px" className="pulse-cyan" />
                </Flex>

                {/* Coordinate HUD (Lower Center) */}
                <VStack
                    position="absolute"
                    bottom="60px"
                    left="50%"
                    transform="translateX(-50%)"
                    gap={1}
                    zIndex={10}
                    pointerEvents="none"
                    bg="rgba(0,0,0,0.6)"
                    px={6}
                    py={2}
                    borderRadius="md"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    backdropFilter="blur(5px)"
                >
                    <HStack gap={6}>
                        <VStack align="center" gap={0}>
                            <Text color="whiteAlpha.400" fontSize="7px" fontWeight="bold">RIGHT ASCENSION</Text>
                            <Text color="#00F0FF" fontSize="13px" className="hud-font text-glow-cyan">{ra}</Text>
                        </VStack>
                        <Box w="1px" h="20px" bg="whiteAlpha.200" />
                        <VStack align="center" gap={0}>
                            <Text color="whiteAlpha.400" fontSize="7px" fontWeight="bold">DECLINATION</Text>
                            <Text color="#00F0FF" fontSize="13px" className="hud-font text-glow-cyan">{dec}</Text>
                        </VStack>
                    </HStack>
                </VStack>

                {/* Status Indicators */}
                <HStack position="absolute" top="30px" left="50%" transform="translateX(-50%)" gap={4}>
                    {isSlewing && (
                        <Box
                            bg="rgba(255, 179, 0, 0.1)"
                            px="15px"
                            py="4px"
                            borderRadius="4px"
                            border="1px solid"
                            borderColor="#FFB300"
                            className="hud-font"
                        >
                            <Text color="#FFB300" fontSize="9px" fontWeight="900" className="pulse">SLEWING DRIVE ACTIVE</Text>
                        </Box>
                    )}
                    {isExposing && (
                        <Box
                            bg="rgba(0, 240, 255, 0.1)"
                            px="15px"
                            py="4px"
                            borderRadius="4px"
                            border="1px solid"
                            borderColor="#00F0FF"
                            className="hud-font"
                        >
                            <HStack gap={2}>
                                <Icon as={Scan} boxSize={3} color="#00F0FF" className="pulse" />
                                <Text color="#00F0FF" fontSize="9px" fontWeight="900">CCD CAPTURING...</Text>
                            </HStack>
                        </Box>
                    )}
                </HStack>

                {/* Decorative technical symbols */}
                <Box position="absolute" top="20px" left="20px" opacity={0.3}>
                    <Icon as={Target} color="white" boxSize={4} />
                </Box>
                <Box position="absolute" bottom="20px" right="20px" opacity={0.3}>
                    <Icon as={ShieldCheck} color="white" boxSize={4} />
                </Box>
            </Box>

            <style jsx global>{`
                @keyframes radar-sweep {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </Box>
    );
};
