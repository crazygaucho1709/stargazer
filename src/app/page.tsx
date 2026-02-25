// src/app/page.tsx
"use client";

import { Box, VStack, HStack, Text, Heading, Icon, Flex } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { LiveView } from "@/components/viewport/LiveView";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useEffect, useState } from "react";
import { mockApi } from "@/services/mockApi";
import { ControlPod } from "@/components/ui/ControlPod";
import { Scan, Thermometer, Zap, Activity, Globe, Radio } from "lucide-react";

export default function Home() {
    const { setConnected } = useStargazerStore();
    const [scrambledText, setScrambledText] = useState("INITIATING DATA LINK...");

    useEffect(() => {
        const checkConnection = async () => {
            const status = await mockApi.ping();
            setConnected(status);
            setScrambledText(status ? "SYSTEM ONLINE // ENCRYPTED" : "LINK SEVERED // RECONNECTING");
        };
        checkConnection();
        const interval = setInterval(checkConnection, 10000);
        return () => clearInterval(interval);
    }, [setConnected]);

    return (
        <Box minH="100vh" w="100%" bg="#000000" color="white" position="relative" overflow="hidden">
            {/* Background Atmosphere */}
            <div className="nebula-bg" />
            <div className="scanline" />

            {/* HEADER HUD */}
            <Flex
                position="absolute"
                top="0"
                left="0"
                right="0"
                h="60px"
                px={10}
                align="center"
                justify="space-between"
                borderBottom="1px solid"
                borderColor="whiteAlpha.100"
                bg="rgba(0,0,0,0.4)"
                backdropFilter="blur(10px)"
                zIndex={20}
            >
                <HStack gap={6}>
                    <Box>
                        <Heading size="xs" color="whiteAlpha.800" className="hud-font">STARGAZER_OS</Heading>
                        <Text fontSize="7px" color="#00F0FF" letterSpacing="0.3em" fontWeight="bold">v4.2.0 // DEEP SPACE OPS</Text>
                    </Box>
                </HStack>

                <HStack gap={10}>
                    <VStack align="end" gap={0}>
                        <Text fontSize="8px" color="whiteAlpha.400">CONNECTION STATUS</Text>
                        <Text fontSize="10px" color="#00F0FF" fontWeight="bold" className="hud-font">{scrambledText}</Text>
                    </VStack>
                    <Icon as={Activity} boxSize={5} color="#00F0FF" className="pulse-cyan" />
                </HStack>
            </Flex>

            {/* Main HUD Architecture */}
            <Box
                w="full"
                h="100vh"
                display="flex"
                alignItems="center"
                justifyContent="center"
                position="relative"
                pt="60px"
            >
                {/* CENTER: STAR MAP RADAR */}
                <Box zIndex={5} scale={1.1}>
                    <LiveView />
                </Box>

                {/* RADIAL CONTROL PODS */}
                {/* TOP LEFT */}
                <Box position="absolute" top="100px" left="20%">
                    <ControlPod title="NAV_SYSTEM" size="140px" accentColor="#E60000" glowColor="rgba(230,0,0,0.2)">
                        <TelescopeControls variant="pad" />
                    </ControlPod>
                </Box>

                {/* TOP RIGHT */}
                <Box position="absolute" top="100px" right="20%">
                    <ControlPod title="IMAGING_ARRAY" size="140px" accentColor="#FFB300" glowColor="rgba(255,179,0,0.2)">
                        <CameraControls variant="circular" />
                    </ControlPod>
                </Box>

                {/* BOTTOM LEFT */}
                <Box position="absolute" bottom="100px" left="20%">
                    <ControlPod title="PRECISION_DRIVE" size="160px" accentColor="#00F0FF" glowColor="rgba(0,240,255,0.2)">
                        <TelescopeControls variant="jog" />
                    </ControlPod>
                </Box>

                {/* BOTTOM RIGHT */}
                <Box position="absolute" bottom="100px" right="20%">
                    <ControlPod title="GUIDING_SENSOR" size="160px" accentColor="#00F0FF" glowColor="rgba(0,240,255,0.2)">
                        <TelescopeControls variant="guiding" />
                    </ControlPod>
                </Box>

                {/* SIDE TELEMETRY PANELS */}
                {/* Left Panel */}
                <VStack
                    position="absolute"
                    left="40px"
                    top="50%"
                    transform="translateY(-50%)"
                    gap={6}
                    w="180px"
                >
                    <Box w="full" className="glass-panel" p={4} borderRadius="4px" borderLeft="4px solid #E60000">
                        <Text fontSize="8px" color="whiteAlpha.400" mb={3}>OPTICAL_SENSORS</Text>
                        <VStack align="start" gap={4}>
                            <Box w="full">
                                <Flex justify="space-between" mb={1}>
                                    <Text fontSize="9px">EXPOSURE</Text>
                                    <Text fontSize="9px" color="#E60000">500ms</Text>
                                </Flex>
                                <Box w="full" h="2px" bg="whiteAlpha.100">
                                    <Box w="60%" h="full" bg="#E60000" boxShadow="0 0 10px #E60000" />
                                </Box>
                            </Box>
                            <Box w="full">
                                <Flex justify="space-between" mb={1}>
                                    <Text fontSize="9px">ISO_GAIN</Text>
                                    <Text fontSize="9px" color="#E60000">1200</Text>
                                </Flex>
                                <Box w="full" h="2px" bg="whiteAlpha.100">
                                    <Box w="40%" h="full" bg="#E60000" boxShadow="0 0 10px #E60000" />
                                </Box>
                            </Box>
                        </VStack>
                    </Box>

                    <HStack w="full" className="glass-panel" p={3} borderRadius="4px" gap={4}>
                        <Icon as={Zap} color="#FFB300" boxSize={4} />
                        <Box>
                            <Text fontSize="7px" color="whiteAlpha.400">POWER_LEVEL</Text>
                            <Text fontSize="11px" fontWeight="bold">98.4%</Text>
                        </Box>
                    </HStack>
                </VStack>

                {/* Right Panel */}
                <VStack
                    position="absolute"
                    right="40px"
                    top="50%"
                    transform="translateY(-50%)"
                    gap={6}
                    w="180px"
                >
                    <Box w="full" className="glass-panel" p={4} borderRadius="4px" borderRight="4px solid #00F0FF">
                        <Text fontSize="8px" color="whiteAlpha.400" mb={3} textAlign="right">ENVIRONMENTAL_HUD</Text>
                        <VStack align="end" gap={4}>
                            <Box w="full">
                                <Flex justify="space-between" mb={1}>
                                    <Text fontSize="9px" color="#00F0FF">-5.2°C</Text>
                                    <Text fontSize="9px">OUTSIDE</Text>
                                </Flex>
                                <Box w="full" h="2px" bg="whiteAlpha.100">
                                    <Flex justify="end">
                                        <Box w="30%" h="full" bg="#00F0FF" boxShadow="0 0 10px #00F0FF" />
                                    </Flex>
                                </Box>
                            </Box>
                            <Box w="full">
                                <Flex justify="space-between" mb={1}>
                                    <Text fontSize="9px" color="#00F0FF">12%</Text>
                                    <Text fontSize="9px">HUMIDITY</Text>
                                </Flex>
                                <Box w="full" h="2px" bg="whiteAlpha.100">
                                    <Flex justify="end">
                                        <Box w="12%" h="full" bg="#00F0FF" boxShadow="0 0 10px #00F0FF" />
                                    </Flex>
                                </Box>
                            </Box>
                        </VStack>
                    </Box>

                    <HStack w="full" className="glass-panel" p={3} borderRadius="4px" gap={4} justify="end">
                        <Box textAlign="right">
                            <Text fontSize="7px" color="whiteAlpha.400">SIGNAL_STRENGTH</Text>
                            <Text fontSize="11px" fontWeight="bold">-42 dBm</Text>
                        </Box>
                        <Icon as={Radio} color="#00F0FF" boxSize={4} />
                    </HStack>
                </VStack>

                {/* BOTTOM TELEMETRY HUD */}
                <Flex
                    position="absolute"
                    bottom="30px"
                    left="50%"
                    transform="translateX(-50%)"
                    w="700px"
                    justify="space-between"
                    align="center"
                    px={10}
                >
                    <HStack gap={10}>
                        <HStack gap={3}>
                            <Icon as={Globe} boxSize={5} color="whiteAlpha.400" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="7px" color="whiteAlpha.400">HORIZON_REF</Text>
                                <Text fontSize="10px" className="hud-font">45.28N / 12.33E</Text>
                            </VStack>
                        </HStack>
                        <HStack gap={3}>
                            <Icon as={Thermometer} boxSize={5} color="whiteAlpha.400" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="7px" color="whiteAlpha.400">SENSOR_TEMP</Text>
                                <Text fontSize="10px" className="hud-font">-12.0°C</Text>
                            </VStack>
                        </HStack>
                    </HStack>

                    <Box w="1px" h="30px" bg="whiteAlpha.200" />

                    <HStack gap={8}>
                        <VStack align="end" gap={0}>
                            <Text fontSize="7px" color="whiteAlpha.400">SYSTEM_MEMORY</Text>
                            <Text fontSize="xs">4.2 GB / 16.0 GB</Text>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <Text fontSize="7px" color="whiteAlpha.400">UPTIME</Text>
                            <Text fontSize="xs">12:44:03</Text>
                        </VStack>
                    </HStack>
                </Flex>
            </Box>
        </Box>
    );
}
