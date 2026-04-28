"use client";

import { Box, VStack, HStack, Text, Icon, Flex, Grid } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { LiveView } from "@/components/viewport/LiveView";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MountCalibration } from "@/components/telescope/MountCalibration";
import { AstroPod } from "@/components/ui/AstroPod";
import { ConfigurationMenu } from "@/components/ui/ConfigurationMenu";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEffect, useState } from "react";
import { mockApi } from "@/services/mockApi";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import {
    Activity, ShieldCheck, Database, Zap, Binary, Globe, Radio, Orbit, Clock, MapPin, Compass, Thermometer
} from "lucide-react";

export default function Home() {
    const { setConnected, isExposing, alt, az, language } = useStargazerStore();
    const [statusText, setStatusText] = useState(t("ESTABLISHING_LINK", language));
    const envData = useEnvironmentData();

    const [wasConnected, setWasConnected] = useState(false);

    useEffect(() => {
        const checkConnection = async () => {
            const storeState = useStargazerStore.getState();
            const res = await mockApi.ping(storeState.config.astroberryUrl, storeState.config.driverInstance);
            
            setConnected(res.success);
            if (res.success) {
                setStatusText(t("SYSTEM_ONLINE", language));
                // Auto-sync GPS when first coming online or if we haven't synced yet
                if (!wasConnected && envData.latitude !== null && envData.longitude !== null) {
                    // Try to push the location if the hardware supports it
                    mockApi.syncLocation(envData.latitude, envData.longitude, storeState.config.driverInstance);
                }
                setWasConnected(true);
            } else {
                setStatusText(`${t("LINK_OFFLINE", language)} - ${res.error || 'Unknown Error'}`);
                setWasConnected(false);
            }
        };
        checkConnection();
        const interval = setInterval(checkConnection, 8000);
        return () => clearInterval(interval);
    }, [setConnected, language, wasConnected, envData.latitude, envData.longitude]);

    return (
        <Box h="100vh" w="100vw" position="relative" overflow="hidden" bg="#030509">
            {/* Background Atmosphere & Viewport */}
            <LiveView />
            
            {/* Vignette Overlay */}
            <Box position="absolute" inset="0" pointerEvents="none" zIndex={1} bg="radial-gradient(circle at center, transparent 40%, rgba(3, 5, 9, 0.95) 100%)" />

            {/* MAIN HUD INTERFACE - STRICT LAYOUT TO PREVENT OVERLAP */}
            <Flex direction="column" h="full" w="full" position="relative" zIndex={20} pointerEvents="none">
                
                {/* TOP HEADER PANEL */}
                <Flex
                    w="full" h="70px" px={8}
                    align="center" justify="space-between"
                    borderBottom="1px solid rgba(255, 255, 255, 0.05)"
                    bg="rgba(3, 5, 9, 0.85)" backdropFilter="blur(20px)"
                    pointerEvents="auto"
                >
                    <HStack gap={6}>
                        <Icon as={Orbit} boxSize={7} color="var(--astro-teal)" className="pulse-glow" />
                        <VStack align="start" gap={0}>
                            <Text fontSize="18px" className="hud-font" color="var(--astro-starlight)" lineHeight={1}>{t("APP_TITLE", language)}</Text>
                            <Text fontSize="9px" letterSpacing="0.2em" color="var(--astro-teal)" opacity={0.8}>{t("APP_SUBTITLE", language)}</Text>
                        </VStack>
                    </HStack>

                    {/* Environment & GPS Stats in Top Bar */}
                    <HStack gap={8} opacity={0.9}>
                        <HStack gap={3}>
                            <Icon as={Clock} boxSize={4} color="var(--astro-starlight)" opacity={0.6}/>
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("SYS_TIME", language)}</Text>
                                <HStack gap={2}>
                                    <Text fontSize="11px" className="hud-font" color="white">{envData.date || "---"}</Text>
                                    <Text fontSize="11px" className="hud-font" color="var(--astro-teal)">{envData.time || t("SYNCING", language)}</Text>
                                </HStack>
                            </VStack>
                        </HStack>
                        <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                        
                        <HStack gap={3}>
                            <Icon as={MapPin} boxSize={4} color="var(--astro-starlight)" opacity={0.6}/>
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("GPS_COORD", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color="var(--astro-teal)">
                                    {envData.latitude !== null ? `${envData.latitude.toFixed(4)}°, ${envData.longitude?.toFixed(4)}°` : t("ACQUIRING", language)}
                                </Text>
                            </VStack>
                        </HStack>
                        <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />

                        <HStack gap={3}>
                            <Icon as={Compass} boxSize={4} color="var(--astro-gold)" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("POSITION", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color="var(--astro-gold)">
                                    {alt.toFixed(2)}° / {az.toFixed(2)}°
                                </Text>
                            </VStack>
                        </HStack>
                        <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />

                        <HStack gap={3}>
                            <Icon as={Thermometer} boxSize={4} color="var(--astro-starlight)" opacity={0.6} />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("EXT_WEATHER", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color="white">
                                    {envData.weather ? `${envData.weather.temperature}°C, ${envData.weather.description}` : t("SCANNING", language)}
                                </Text>
                            </VStack>
                        </HStack>
                    </HStack>

                    <HStack gap={8}>
                        <VStack align="end" gap={0}>
                            <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("SYSTEM_STATUS", language)}</Text>
                            <HStack gap={2}>
                                <Text fontSize="12px" className="hud-font" color={statusText.includes("ONLINE") ? "var(--astro-teal)" : "var(--astro-gold)"}>{statusText}</Text>
                                <Box w="6px" h="6px" borderRadius="full" bg={statusText.includes("ONLINE") ? "var(--astro-teal)" : "var(--astro-gold)"} className="pulse-glow" />
                            </HStack>
                        </VStack>
                        {/* Settings Button */}
                        <Box pointerEvents="auto" position="relative" w="40px" h="40px">
                            <ConfigurationMenu />
                        </Box>
                    </HStack>
                </Flex>

                {/* MIDDLE PANELS (Left and Right Columns) */}
                <Flex flex={1} justify="space-between" align="stretch" p={8} pb={12}>
                    
                    {/* LEFT COLUMN: Controls & Mount */}
                    <VStack w="360px" justify="space-between" align="stretch" h="full" pointerEvents="auto">
                        <AstroPod title={t("MOUNT_NAVIGATOR", language)} glowColor="teal">
                            <VStack gap={5}>
                                <TelescopeControls variant="pad" />
                                <HStack justify="space-between" w="full" mt={2} fontSize="10px" color="var(--astro-starlight)" opacity={0.8}>
                                    <Text>{t("TRK", language)} {t("SIDEREAL", language)}</Text>
                                    <Text>{t("ERR", language)} 0.04&quot;</Text>
                                </HStack>
                            </VStack>
                        </AstroPod>

                        <AstroPod title={t("LIMITS_CONFIG", language)} glowColor="gold">
                            <MountCalibration />
                        </AstroPod>
                    </VStack>

                    {/* CENTER EMPTY SPACE FOR VIEWPORT CROSSHAIRS */}
                    <Flex flex={1} align="flex-end" justify="center" pb={10}>
                        {/* Bottom Center Mini Bar */}
                        <HStack 
                            className="astro-panel"
                            px={8} py={3} borderRadius="full"
                            gap={10} pointerEvents="auto"
                            bg="rgba(10, 20, 40, 0.85)" border="1px solid rgba(255,255,255,0.1)"
                        >
                            <HStack gap={4}>
                                <Icon as={Radio} boxSize={4} color="var(--astro-teal)" />
                                <VStack align="start" gap={0}>
                                    <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("LATENCY", language)}</Text>
                                    <Text fontSize="11px" className="hud-font">12ms</Text>
                                </VStack>
                            </HStack>
                            <Box h="16px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                            <HStack gap={4}>
                                <Icon as={Activity} boxSize={4} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                                <VStack align="start" gap={0}>
                                    <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("SEQUENCE", language)}</Text>
                                    <Text fontSize="11px" className="hud-font" color={isExposing ? "var(--astro-gold)" : "white"}>
                                        {isExposing ? t("CAPTURING", language) : t("STANDBY", language)}
                                    </Text>
                                </VStack>
                            </HStack>
                        </HStack>
                    </Flex>

                    {/* RIGHT COLUMN: Sensor & Oracle Only */}
                    <VStack w="360px" justify="flex-start" align="stretch" h="full" pointerEvents="auto" gap={4}>
                        <AstroPod title={t("IMAGING_SENSOR", language)} glowColor="teal">
                            <VStack gap={5} w="full">
                                <CameraControls variant="circular" />
                                <Box w="full" bg="rgba(0,0,0,0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
                                    <HStack justify="space-between" fontSize="10px" color="var(--astro-starlight)">
                                        <Text>{t("SENSOR_TEMP", language)} -15°C</Text>
                                        <Text>{t("COOLER", language)} 85%</Text>
                                    </HStack>
                                </Box>
                            </VStack>
                        </AstroPod>

                        <AstroPod title={t("METEO_ORACLE", language)} glowColor="cobalt">
                            <AIAssistant />
                        </AstroPod>
                    </VStack>
                </Flex>

            </Flex>

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .hud-font {
                    font-family: 'Courier New', Courier, monospace;
                    letter-spacing: 0.05em;
                }
            `}</style>
        </Box>
    );
}