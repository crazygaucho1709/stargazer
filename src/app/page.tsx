"use client";

import { Box, VStack, HStack, Text, Icon, Flex } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { LiveView } from "@/components/viewport/LiveView";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MountCalibration } from "@/components/telescope/MountCalibration";
import { AstroPod } from "@/components/ui/AstroPod";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useEffect, useState } from "react";
import { mockApi } from "@/services/mockApi";
import {
    Activity, ShieldCheck, Database, Zap, Binary, Globe, Radio, Orbit
} from "lucide-react";

export default function Home() {
    const { setConnected, isExposing } = useStargazerStore();
    const [statusText, setStatusText] = useState("ESTABLISHING LINK...");

    useEffect(() => {
        const checkConnection = async () => {
            const status = await mockApi.ping();
            setConnected(status);
            setStatusText(status ? "TELESCOPE SYNCED" : "LINK OFFLINE");
        };
        checkConnection();
        const interval = setInterval(checkConnection, 8000);
        return () => clearInterval(interval);
    }, [setConnected]);

    return (
        <Box minH="100vh" w="100%" position="relative" overflow="hidden">
            {/* Background Atmosphere */}
            <Box className="astro-grid" />

            {/* TOP HEADER */}
            <Flex
                position="absolute" top="0" w="full" h="70px" px={10}
                align="center" justify="space-between" zIndex={50}
                borderBottom="1px solid rgba(255, 255, 255, 0.05)"
                bg="rgba(3, 5, 9, 0.7)" backdropFilter="blur(20px)"
            >
                <HStack gap={6}>
                    <Icon as={Orbit} boxSize={7} color="var(--astro-teal)" className="pulse-glow" />
                    <VStack align="start" gap={0}>
                        <Text fontSize="18px" className="hud-font" color="var(--astro-starlight)">STARGAZER_OS</Text>
                        <Text fontSize="10px" letterSpacing="0.2em" color="var(--astro-teal)" opacity={0.8}>REMOTE OBSERVATORY CONTROL</Text>
                    </VStack>
                </HStack>

                <HStack gap={12}>
                    <VStack align="end" gap={0}>
                        <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>MOUNT</Text>
                        <Text fontSize="11px" className="hud-font" color="var(--astro-teal)">NEXSTAR 4SE</Text>
                    </VStack>
                    <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                    <VStack align="end" gap={0}>
                        <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>IMAGER</Text>
                        <Text fontSize="11px" className="hud-font" color="var(--astro-teal)">CANON EOS 650D</Text>
                    </VStack>
                    <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                    <VStack align="end" gap={0}>
                        <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>SYSTEM STATUS</Text>
                        <Text fontSize="12px" className="hud-font" color={statusText.includes("SYNCED") ? "var(--astro-teal)" : "var(--astro-gold)"}>{statusText}</Text>
                    </VStack>
                </HStack>
            </Flex>

            {/* MAIN HUD INTERFACE */}
            <Box w="full" h="100vh" display="flex" pt="70px" p={8} position="relative" justifyContent="center" alignItems="center">
                
                {/* LEFT COLUMN: Controls & Calibration */}
                <VStack position="absolute" left="50px" top="110px" gap={8} align="flex-start" zIndex={20}>
                    <AstroPod title="MOUNT CONTROL" width="320px" glowColor="teal">
                        <VStack gap={5}>
                            <TelescopeControls variant="pad" />
                            <HStack justify="space-between" w="full" mt={2} fontSize="10px" color="var(--astro-starlight)" opacity={0.8}>
                                <Text>TRACKING: SIDEREAL</Text>
                                <Text>ERROR: 0.04&quot;</Text>
                            </HStack>
                        </VStack>
                    </AstroPod>

                    <AstroPod title="LIMITS CONFIG" width="320px" glowColor="gold">
                        <MountCalibration />
                    </AstroPod>
                </VStack>

                {/* CENTER HUB: Large Viewport */}
                <Box zIndex={10} position="relative" transform="scale(1.15)">
                    {/* Clean decorative rings */}
                    <Box 
                        position="absolute" inset="-30px" 
                        border="1px solid rgba(255, 51, 51, 0.1)" borderRadius="full" 
                        style={{ animation: 'spin 120s linear infinite' }}
                    />
                    <Box 
                        position="absolute" inset="-60px" 
                        border="1px dashed rgba(255, 255, 255, 0.05)" borderRadius="full" 
                        style={{ animation: 'spin 80s linear reverse infinite' }}
                    />
                    <LiveView />
                </Box>

                {/* RIGHT COLUMN: Camera & Stats/Weather */}
                <VStack position="absolute" right="50px" top="110px" gap={8} align="flex-end" zIndex={20}>
                    <AstroPod title="IMAGING SENSOR" width="320px" glowColor="teal">
                        <VStack gap={5} w="full">
                            <CameraControls variant="circular" />
                            <Box w="full" bg="rgba(0,0,0,0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
                                <HStack justify="space-between" fontSize="10px" color="var(--astro-starlight)">
                                    <Text>SENSOR TEMP: -15°C</Text>
                                    <Text>COOLER: 85%</Text>
                                </HStack>
                            </Box>
                        </VStack>
                    </AstroPod>

                    <AstroPod title="OBSERVATION CONDITIONS" width="320px" glowColor="cobalt">
                        <AIAssistant />
                    </AstroPod>
                </VStack>

                {/* BOTTOM FLOATING BAR: Environmental Coordinates */}
                <Box position="absolute" bottom="40px" left="50%" transform="translateX(-50%)" zIndex={60}>
                    <HStack 
                        className="astro-panel"
                        px={8} py={3} borderRadius="full"
                        gap={12}
                    >
                        <HStack gap={4}>
                            <Icon as={Globe} boxSize={5} color="var(--astro-teal)" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>LOCATION</Text>
                                <Text fontSize="11px" className="hud-font">OBSERVATORY_01</Text>
                            </VStack>
                        </HStack>
                        <Box h="20px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                        <HStack gap={4}>
                            <Icon as={Radio} boxSize={5} color="var(--astro-teal)" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>LATENCY</Text>
                                <Text fontSize="11px" className="hud-font">12ms</Text>
                            </VStack>
                        </HStack>
                        <Box h="20px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                        <HStack gap={4}>
                            <Icon as={Activity} boxSize={5} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>SEQUENCE</Text>
                                <Text fontSize="11px" className="hud-font">{isExposing ? "CAPTURING" : "STANDBY"}</Text>
                            </VStack>
                        </HStack>
                    </HStack>
                </Box>
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
