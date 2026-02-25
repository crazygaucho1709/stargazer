// src/app/page.tsx
"use client";

import { Box, VStack, HStack, Text, Heading, Icon, Flex, Circle, Progress } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { LiveView } from "@/components/viewport/LiveView";
import { ObservationSuggestions } from "@/components/telescope/ObservationSuggestions";
import { ConfigurationMenu } from "@/components/ui/ConfigurationMenu";
import { ControlPod } from "@/components/ui/ControlPod";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useEffect, useState } from "react";
import { mockApi } from "@/services/mockApi";
import {
    Activity,
    Thermometer,
    Zap,
    Wind,
    CloudRain,
    Layers,
    ShieldCheck,
    Satellite,
    Cpu,
    Compass
} from "lucide-react";

export default function Home() {
    const { setConnected, isExposing } = useStargazerStore();
    const [scrambledText, setScrambledText] = useState("INITIATING SYNC...");
    const [stackProgress, setStackProgress] = useState(0);

    useEffect(() => {
        const checkConnection = async () => {
            const status = await mockApi.ping();
            setConnected(status);
            setScrambledText(status ? "SECURE_LINK // ACTIVE" : "SIGNAL_LOSS // RETRYING");
        };
        checkConnection();
        const interval = setInterval(checkConnection, 8000);
        return () => clearInterval(interval);
    }, [setConnected]);

    // Simulate auto-stacking progress when exposing
    useEffect(() => {
        let interval: any;
        if (isExposing) {
            setStackProgress(0);
            interval = setInterval(() => {
                setStackProgress(prev => (prev < 100 ? prev + 5 : 100));
            }, 100);
        } else {
            setStackProgress(0);
        }
        return () => clearInterval(interval);
    }, [isExposing]);

    return (
        <Box minH="100vh" w="100%" bg="#000" color="white" position="relative" overflow="hidden">
            {/* Background Atmosphere */}
            <Box className="nebula-bg" />
            <Box className="scanline" />

            {/* RADIAL GUIDES */}
            <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" zIndex={0} pointerEvents="none">
                <Box className="radial-guide" w="700px" h="700px" opacity={0.1} border="1px solid rgba(0, 240, 255, 0.3)" />
                <Box className="radial-guide" w="1000px" h="1000px" borderStyle="dashed" opacity={0.05} />
            </Box>

            {/* TOP HEADER */}
            <Flex
                position="absolute" top="0" w="full" h="80px" px={12}
                align="center" justify="space-between" zIndex={50}
                bgGradient="linear(to-b, rgba(0,0,0,0.9), transparent)"
            >
                <HStack gap={8}>
                    <VStack align="start" gap={0}>
                        <Heading size="sm" className="hud-font" bgGradient="linear(to-r, #00F0FF, #E60000)" bgClip="text">STARGAZER_UNIT_01</Heading>
                        <Text fontSize="8px" letterSpacing="0.5em" color="whiteAlpha.400" fontWeight="bold">v4.2.0 // DEEP_SPACE_OPS</Text>
                    </VStack>
                    <Box h="40px" w="1px" bg="whiteAlpha.100" />
                    <HStack gap={4}>
                        <Circle size="30px" border="1px solid" borderColor="green.400" className="glow-cyan">
                            <Icon as={ShieldCheck} boxSize={4} color="green.400" />
                        </Circle>
                        <Box>
                            <Text fontSize="7px" color="whiteAlpha.400">ENCRYPTION</Text>
                            <Text fontSize="10px" color="green.400" className="hud-font">GCM_256</Text>
                        </Box>
                    </HStack>
                </HStack>

                <HStack gap={12}>
                    <VStack align="end" gap={0}>
                        <Text fontSize="8px" color="whiteAlpha.400">UPLINK_STATUS</Text>
                        <Text fontSize="12px" className="hud-font text-glow-cyan" color="#00F0FF">{scrambledText}</Text>
                    </VStack>
                    <Icon as={Activity} boxSize={7} color="#00F0FF" className="pulse-cyan" />
                </HStack>
            </Flex>

            {/* MAIN HUD INTERFACE */}
            <Box w="full" h="100vh" display="flex" alignItems="center" justifyContent="center" position="relative">

                {/* CENTER HUB */}
                <Box zIndex={10} position="relative" transform="scale(1.1)">
                    <LiveView />
                </Box>

                {/* ORBITING FUNCTIONAL PODS */}

                {/* TOP LEFT: MOUNT PILOTAGE */}
                <Box position="absolute" top="10%" left="15%" zIndex={20}>
                    <ControlPod title="MOUNT_PILOT" size="200px" accentColor="#E60000" glowColor="rgba(230,0,0,0.3)">
                        <VStack gap={4}>
                            <TelescopeControls variant="pad" />
                            <HStack gap={4}>
                                <Icon as={Compass} boxSize={3} color="whiteAlpha.600" />
                                <Text fontSize="8px" color="whiteAlpha.600">ALT_AZ_DRIVE</Text>
                            </HStack>
                        </VStack>
                    </ControlPod>
                </Box>

                {/* TOP RIGHT: IMAGING & STACKING */}
                <Box position="absolute" top="10%" right="15%" zIndex={20}>
                    <ControlPod title="CCD_STACKING" size="200px" accentColor="#FFB300" glowColor="rgba(255,179,0,0.3)">
                        <VStack gap={3} w="full" px={4}>
                            <CameraControls variant="circular" />
                            {isExposing && (
                                <Box w="full" mt={2}>
                                    <Text fontSize="7px" mb={1} textAlign="center" color="#FFB300" fontWeight="bold">AUTO_STACKING...</Text>
                                    <Progress value={stackProgress} size="xs" colorScheme="orange" borderRadius="full" bg="whiteAlpha.100" />
                                </VStack>
                            )}
                            {!isExposing && (
                                <HStack gap={2} opacity={0.5}>
                                    <Icon as={Layers} boxSize={3} />
                                    <Text fontSize="8px">BUFFER_EMPTY</Text>
                                </HStack>
                            )}
                        </VStack>
                    </ControlPod>
                </Box>

                {/* BOTTOM LEFT: TARGET SUGGESTIONS */}
                <Box position="absolute" bottom="10%" left="15%" zIndex={20}>
                    <ControlPod title="TARGET_LIST" size="200px" accentColor="#00F0FF" glowColor="rgba(0,240,255,0.3)">
                        <ObservationSuggestions />
                    </ControlPod>
                </Box>

                {/* BOTTOM RIGHT: WEATHER HUD */}
                <Box position="absolute" bottom="10%" right="15%" zIndex={20}>
                    <ControlPod title="METEO_SENSORS" size="200px" accentColor="#00F0FF" glowColor="rgba(0,240,255,0.3)">
                        <VStack align="stretch" gap={4} w="full" px={6}>
                            <HStack justify="space-between">
                                <HStack gap={3}>
                                    <Icon as={Thermometer} boxSize={4} color="#E60000" />
                                    <Text fontSize="12px" className="hud-font">-12.5°C</Text>
                                </HStack>
                                <Text fontSize="7px" color="whiteAlpha.400">AMBIENT</Text>
                            </HStack>
                            <HStack justify="space-between">
                                <HStack gap={3}>
                                    <Icon as={Wind} boxSize={4} color="#00F0FF" />
                                    <Text fontSize="12px" className="hud-font">4.2 km/h</Text>
                                </HStack>
                                <Text fontSize="7px" color="whiteAlpha.400">WIND_SPD</Text>
                            </HStack>
                            <HStack justify="space-between">
                                <HStack gap={3}>
                                    <Icon as={CloudRain} boxSize={4} color="whiteAlpha.600" />
                                    <Text fontSize="12px" className="hud-font">12%</Text>
                                </HStack>
                                <Text fontSize="7px" color="whiteAlpha.400">HUMIDITY</Text>
                            </HStack>
                        </VStack>
                    </ControlPod>
                </Box>

                {/* SIDE TELEMETRY BUBBLES */}
                <Box position="absolute" left="6%" top="50%" transform="translateY(-50%)">
                    <VStack className="glass-panel" boxSize="110px" justify="center" p={4} border="1px solid #FFB300" bg="rgba(0,0,0,0.8)">
                        <Icon as={Zap} boxSize={6} color="#FFB300" />
                        <Text fontSize="7px" color="whiteAlpha.400">PWR</Text>
                        <Text fontSize="14px" className="hud-font">98.4%</Text>
                    </VStack>
                </Box>

                <Box position="absolute" right="6%" top="50%" transform="translateY(-50%)">
                    <VStack className="glass-panel" boxSize="110px" justify="center" p={4} border="1px solid #00F0FF" bg="rgba(0,0,0,0.8)">
                        <Icon as={Activity} boxSize={6} color="#00F0FF" />
                        <Text fontSize="7px" color="whiteAlpha.400">CPU</Text>
                        <Text fontSize="14px" className="hud-font">14.2%</Text>
                    </VStack>
                </Box>

                {/* BOTTOM PILL HUD */}
                <Box position="absolute" bottom="40px" left="50%" transform="translateX(-50%)" zIndex={60}>
                    <HStack
                        className="glass-panel" px={12} py={5} borderRadius="full"
                        gap={12} border="1px solid whiteAlpha.200"
                        bg="rgba(0,0,0,0.9)" backdropFilter="blur(20px)"
                    >
                        <HStack gap={5}>
                            <Icon as={Satellite} boxSize={5} color="#00F0FF" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="7px" color="whiteAlpha.400">SIGNAL</Text>
                                <Text fontSize="11px" className="hud-font">-42 dBm</Text>
                            </VStack>
                        </HStack>
                        <HStack gap={5}>
                            <Icon as={Globe} boxSize={5} color="whiteAlpha.500" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="7px" color="whiteAlpha.400">OBS_REF</Text>
                                <Text fontSize="11px" className="hud-font">STATION_ALFA</Text>
                            </VStack>
                        </HStack>
                    </HStack>
                </Box>

                {/* CONFIGURATION TRIGGER */}
                <ConfigurationMenu />
            </Box>

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </Box>
    );
}
