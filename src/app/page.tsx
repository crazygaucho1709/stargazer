// src/app/page.tsx
"use client";

import { Box, Flex, Grid, VStack, HStack, Text, Heading, Icon } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { LiveView } from "@/components/viewport/LiveView";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useEffect, useState } from "react";
import { mockApi } from "@/services/mockApi";
import { ControlPod } from "@/components/ui/ControlPod";
import { Scan, Thermometer, Wind, CloudRain, Sun } from "lucide-react";

export default function Home() {
    const { setConnected } = useStargazerStore();

    useEffect(() => {
        const checkConnection = async () => {
            const status = await mockApi.ping();
            setConnected(status);
        };
        checkConnection();
        const interval = setInterval(checkConnection, 10000);
        return () => clearInterval(interval);
    }, [setConnected]);

    return (
        <Box minH="100vh" w="100%" bg="#000000" color="white" position="relative" display="flex" alignItems="center" justifyContent="center" py={10}>
            {/* Dynamic Nebula Background */}
            <div className="nebula-bg" />

            {/* Main Radial Architecture */}
            <Box position="relative" zIndex={1} display="flex" alignItems="center" justifyContent="center">

                {/* CENTER: STAR MAP RADAR */}
                <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    zIndex={5}
                >
                    <LiveView />
                </Box>

                {/* TOP PODS */}
                <Box position="absolute" top="20px" left="50px">
                    <ControlPod title="Telescope" size="160px" accentColor="#D00000" glowColor="rgba(208, 0, 0, 0.2)">
                        <TelescopeControls variant="pad" />
                    </ControlPod>
                </Box>

                <Box position="absolute" top="20px" right="50px">
                    <ControlPod title="Camera" size="160px" accentColor="#FF7D00" glowColor="rgba(255, 125, 0, 0.2)">
                        <CameraControls variant="circular" />
                    </ControlPod>
                </Box>

                {/* BOTTOM PODS */}
                <Box position="absolute" bottom="20px" left="50px">
                    <ControlPod title="Precision" size="180px" accentColor="#D00000" glowColor="rgba(208, 0, 0, 0.2)">
                        <TelescopeControls variant="jog" />
                    </ControlPod>
                </Box>

                <Box position="absolute" bottom="20px" right="50px">
                    <ControlPod title="Guiding" size="180px" accentColor="#FF7D00" glowColor="rgba(255, 125, 0, 0.2)">
                        <TelescopeControls variant="guiding" />
                    </ControlPod>
                </Box>

                {/* SIDE PANEL HUDs (Glass panels) */}
                {/* Exposure/Gain Panel - Left */}
                <Box
                    position="absolute"
                    left="0"
                    top="50%"
                    transform="translateY(-50%)"
                    w="140px"
                    className="glass-panel"
                    p="15px"
                    borderRadius="15px"
                >
                    <VStack align="start" gap={4}>
                        <Box w="full">
                            <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.1em" mb={1}>EXPOSURE</Text>
                            <Text fontSize="12px" color="#D00000" fontWeight="bold">500 ms</Text>
                            <Box w="full" h="2px" bg="whiteAlpha.100" mt={1} position="relative">
                                <Box w="60%" h="full" bg="#D00000" />
                            </Box>
                        </Box>
                        <Box w="full">
                            <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.1em" mb={1}>GAIN</Text>
                            <Text fontSize="12px" color="#D00000" fontWeight="bold">15</Text>
                            <Box w="full" h="2px" bg="whiteAlpha.100" mt={1} position="relative">
                                <Box w="30%" h="full" bg="#D00000" />
                            </Box>
                        </Box>
                    </VStack>
                </Box>

                {/* Weather/Focuser Panel - Right */}
                <Box
                    position="absolute"
                    right="0"
                    top="50%"
                    transform="translateY(-50%)"
                    w="140px"
                    className="glass-panel"
                    p="15px"
                    borderRadius="15px"
                >
                    <VStack align="start" gap={4}>
                        <Box w="full">
                            <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.1em" mb={1}>FOCUSER</Text>
                            <Text fontSize="12px" color="#FF7D00" fontWeight="bold">33.0</Text>
                            <Box w="full" h="2px" bg="whiteAlpha.100" mt={1} position="relative">
                                <Box w="80%" h="full" bg="#FF7D00" />
                            </Box>
                        </Box>
                        <Box w="full">
                            <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.1em" mb={1}>WEATHER</Text>
                            <HStack justify="space-between">
                                <Text fontSize="12px" color="#FF7D00" fontWeight="bold">38%</Text>
                                <Icon as={CloudRain} boxSize={3} color="whiteAlpha.400" />
                            </HStack>
                        </Box>
                    </VStack>
                </Box>

                {/* BOTTOM TELEMETRY HUD */}
                <Box
                    position="absolute"
                    bottom="-60px"
                    left="50%"
                    transform="translateX(-50%)"
                    w="500px"
                    className="glass-panel"
                    p="12px"
                    borderRadius="15px"
                >
                    <HStack justify="center" gap={10}>
                        <HStack gap={3}>
                            <VStack align="start" gap={0}>
                                <Text fontSize="7px" color="whiteAlpha.400">DEPTH</Text>
                                <Text fontSize="xs" fontWeight="bold">80°</Text>
                            </VStack>
                            <Icon as={Scan} boxSize={4} color="whiteAlpha.400" />
                        </HStack>
                        <Box w="1px" h="20px" bg="whiteAlpha.100" />
                        <HStack gap={3}>
                            <VStack align="start" gap={0}>
                                <Text fontSize="7px" color="whiteAlpha.400">WEATHER</Text>
                                <Text fontSize="xs" fontWeight="bold">30°</Text>
                            </VStack>
                            <Icon as={Thermometer} boxSize={4} color="whiteAlpha.400" />
                        </HStack>
                    </HStack>
                </Box>
            </Box>
        </Box>
    );
}
