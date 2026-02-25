// src/components/viewport/LiveView.tsx
"use client";

import { Box, Flex, Text, Image, Icon, VStack } from "@chakra-ui/react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Crosshair, Target, Scan } from "lucide-react";

export const LiveView = () => {
    const { isExposing, isSlewing, ra, dec } = useStargazerStore();

    return (
        <Box
            position="relative"
            w="420px"
            h="420px"
            borderRadius="full"
            overflow="hidden"
            border="4px solid"
            borderColor="rgba(208, 0, 0, 0.4)"
            boxShadow="0 0 50px rgba(208, 0, 0, 0.2), inset 0 0 60px rgba(0,0,0,0.8)"
            bg="black"
        >
            {/* Central Star/Nebula Image */}
            <Image
                src="https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1600&q=80"
                alt="Star Map"
                objectFit="cover"
                w="full"
                h="full"
                opacity={isExposing ? 0.9 : 0.6}
                transition="opacity 1.5s ease-in-out"
                filter="hue-rotate(330deg)" // Adjusting towards the red/amber theme
            />

            {/* Radar Overlay Rings */}
            <Box position="absolute" inset="0" pointerEvents="none">
                <Box position="absolute" inset="40px" borderRadius="full" border="1px solid" borderColor="whiteAlpha.100" />
                <Box position="absolute" inset="100px" borderRadius="full" border="1px solid" borderColor="whiteAlpha.50" />
                <Box position="absolute" inset="160px" borderRadius="full" border="1px solid" borderColor="whiteAlpha.50" />

                {/* Radar Cross-sections */}
                <Box position="absolute" top="50%" left="0" w="full" h="1px" bg="whiteAlpha.100" transform="translateY(-50%)" />
                <Box position="absolute" top="0" left="50%" w="1px" h="full" bg="whiteAlpha.100" transform="translateX(-50%)" />

                {/* Diagonal Markers */}
                <Box position="absolute" top="50%" left="0" w="full" h="1px" bg="whiteAlpha.50" transform="translateY(-50%) rotate(45deg)" />
                <Box position="absolute" top="50%" left="0" w="full" h="1px" bg="whiteAlpha.50" transform="translateY(-50%) rotate(-45deg)" />
            </Box>

            {/* Central Crosshair */}
            <Flex
                position="absolute"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                color="#D00000"
                opacity={0.4}
                pointerEvents="none"
            >
                <Icon as={Crosshair} boxSize="100px" />
            </Flex>

            {/* Coordinate HUD (Lower Center) */}
            <VStack
                position="absolute"
                bottom="40px"
                left="50%"
                transform="translateX(-50%)"
                gap={0}
                zIndex={10}
                pointerEvents="none"
            >
                <HStack gap={4}>
                    <Text color="white" fontSize="11px" fontFamily="mono" fontWeight="900" className="text-glow-red">RA {ra}</Text>
                    <Text color="white" fontSize="11px" fontFamily="mono" fontWeight="900" className="text-glow-red">DEC {dec}</Text>
                </HStack>
                <Text color="whiteAlpha.400" fontSize="8px" fontWeight="bold" letterSpacing="0.2em">TRACKING STATION</Text>
            </VStack>

            {/* Slewing/Exposing Indicators */}
            {isSlewing && (
                <Box
                    position="absolute"
                    top="40px"
                    left="50%"
                    transform="translateX(-50%)"
                    bg="rgba(255, 179, 0, 0.2)"
                    px="15px"
                    py="5px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="#FFB300"
                >
                    <Text color="#FFB300" fontSize="10px" fontWeight="900" className="pulse">SLEWING DRIVE...</Text>
                </Box>
            )}

            {isExposing && (
                <Box
                    position="absolute"
                    top="40px"
                    left="50%"
                    transform="translateX(-50%)"
                    bg="rgba(208, 0, 0, 0.2)"
                    px="15px"
                    py="5px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="#D00000"
                >
                    <HStack gap={2}>
                        <Icon as={Scan} boxSize={3} color="white" className="pulse" />
                        <Text color="white" fontSize="10px" fontWeight="900">CCD EXPOSING...</Text>
                    </HStack>
                </Box>
            )}

            {/* Simulated Constellations (CSS/SVG lines would be better but let's use a grain/grid) */}
            <div
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    pointerEvents: 'none',
                    opacity: 0.1,
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 0)',
                    backgroundSize: '30px 30px'
                }}
            />
        </Box>
    );
};

import { HStack } from "@chakra-ui/react";
