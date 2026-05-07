"use client";

import { Box, VStack, HStack, Text, Icon, Flex, Grid, Circle } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { LiveView } from "@/components/viewport/LiveView";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MountCalibration } from "@/components/telescope/MountCalibration";
import { AstroPod } from "@/components/ui/AstroPod";
import { ConfigurationMenu } from "@/components/ui/ConfigurationMenu";
import { GlobalLoader } from "@/components/ui/GlobalLoader";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEffect, useState } from "react";
import { mockApi } from "@/services/mockApi";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import {
    Activity, Zap, Orbit, Clock, MapPin, Compass, Thermometer, Power, Telescope
} from "lucide-react";

export default function Home() {
    const { isConnected: connected, setConnected, isExposing, alt, az, language, isLoading } = useStargazerStore();
    const [statusText, setStatusText] = useState("");
    const envData = useEnvironmentData();
    const [mounted, setMounted] = useState(false);

    const [wasConnected, setWasConnected] = useState(false);

    useEffect(() => {
        setMounted(true);
        setStatusText(t("ESTABLISHING_LINK", language));
    }, [language]);

    useEffect(() => {
        if (!mounted) return;

        const checkConnection = async () => {
            const storeState = useStargazerStore.getState();
            const res = await mockApi.ping(storeState.config.astroberryUrl, storeState.config.driverInstance);
            
            setConnected(res.success);
            if (res.success) {
                setStatusText(t("SYSTEM_ONLINE", language));
                if (!wasConnected && envData.latitude !== null && envData.longitude !== null) {
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
    }, [setConnected, language, wasConnected, envData.latitude, envData.longitude, mounted]);

    if (!mounted) {
        return <Box h="100vh" w="100vw" bg="#030509" />;
    }

    return (
        <Box h="100vh" w="100vw" position="relative" overflow="hidden" bg="#030509">
            <GlobalLoader />
            <LiveView />
            
            <Box position="absolute" inset="0" pointerEvents="none" zIndex={1} bg="radial-gradient(circle at center, transparent 40%, rgba(3, 5, 9, 0.95) 100%)" />

            <Flex direction="column" h="full" w="full" position="relative" zIndex={20} pointerEvents="none">
                
                <Flex
                    w="full" h="70px" px={8}
                    align="center" justify="space-between"
                    borderBottom="1px solid rgba(255, 255, 255, 0.05)"
                    bg="rgba(3, 5, 9, 0.85)" backdropFilter="blur(20px)"
                    pointerEvents="auto"
                >
                    <HStack gap={6}>
                        <VStack align="start" gap={1}>
                            <Orbit size={28} color="var(--astro-teal)" className="pulse-glow" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="18px" className="hud-font" color="var(--astro-starlight)" lineHeight={1}>{t("APP_TITLE", language)}</Text>
                                <Text fontSize="9px" letterSpacing="0.2em" color="var(--astro-teal)" opacity={0.8}>{t("APP_SUBTITLE", language)}</Text>
                            </VStack>
                        </VStack>
                    </HStack>

                    <HStack gap={8} opacity={0.9}>
                        <HStack gap={3}>
                            <Clock size={16} color="var(--astro-starlight)" opacity={0.6}/>
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
                            <MapPin size={16} color="var(--astro-starlight)" opacity={0.6}/>
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("GPS_COORD", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color="var(--astro-teal)">
                                    {envData.latitude !== null ? `${envData.latitude.toFixed(4)}°, ${envData.longitude?.toFixed(4)}°` : t("ACQUIRING", language)}
                                </Text>
                            </VStack>
                        </HStack>
                        <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />

                        <HStack gap={3}>
                            <Compass size={16} color="var(--astro-gold)" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("POSITION", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color="var(--astro-gold)">
                                    {alt.toFixed(2)}° / {az.toFixed(2)}°
                                </Text>
                            </VStack>
                        </HStack>
                        <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />

                        <HStack gap={3}>
                            {connected ? (
                                <Circle size="8px" bg="var(--astro-teal)" boxShadow="0 0 8px var(--astro-teal)" />
                            ) : (
                                <Circle size="8px" bg="var(--astro-error)" boxShadow="0 0 8px var(--astro-error)" />
                            )}
                            <Text fontSize="11px" className="hud-font" color={connected ? "var(--astro-teal)" : "var(--astro-error)"} letterSpacing="0.1em">
                                {connected ? "SYS_STABLE" : "SYS_OFFLINE"}
                            </Text>
                        </HStack>
                        <Box h="24px" w="1px" bg="rgba(255, 255, 255, 0.1)" />

                        <HStack gap={3}>
                            <Thermometer size={16} color="var(--astro-starlight)" opacity={0.6} />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("EXT_WEATHER", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color="white">
                                    {envData.weather ? `${envData.weather.temperature}°C, ${envData.weather.description}` : t("SCANNING", language)}
                                </Text>
                            </VStack>
                        </HStack>
                    </HStack>

                    <HStack gap={8}>
                        <VStack align="end" gap={2}>
                            <HStack gap={4}>
                                <VStack align="end" gap={0}>
                                    <Text fontSize="10px" color="var(--astro-teal)" fontWeight="bold" letterSpacing="0.1em">{connected ? t("ACTIVE_LINK", language) : t("LINK_ERROR", language)}</Text>
                                    <Text fontSize="8px" opacity={0.6}>{statusText}</Text>
                                </VStack>
                                <Box p={1} borderRadius="full" border="1px solid" borderColor={connected ? "var(--astro-teal)" : "var(--astro-gold)"}>
                                    <Zap size={14} color={connected ? "var(--astro-teal)" : "var(--astro-gold)"} />
                                </Box>
                            </HStack>
                            <ConfigurationMenu />
                        </VStack>
                    </HStack>
                </Flex>

                <Flex flex={1} justify="space-between" align="stretch" p={8} pb={12}>
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

                    <Flex flex={1} align="flex-end" justify="center" pb={10}>
                        <HStack 
                            className="astro-panel"
                            px={8} py={3} borderRadius="full"
                            gap={10} pointerEvents="auto"
                            bg="rgba(10, 20, 40, 0.85)" border="1px solid rgba(255,255,255,0.1)"
                        >
                            <HStack gap={4}>
                                <Box className={connected ? "pulse-glow" : ""} color={connected ? "var(--astro-teal)" : "whiteAlpha.400"}>
                                    <Power size={14} />
                                </Box>
                                <Text fontSize="10px" color={connected ? "var(--astro-starlight)" : "whiteAlpha.400"}>
                                    {connected ? "BRIDGE_UP" : "BRIDGE_DOWN"}
                                </Text>
                            </HStack>
                            <Box h="16px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                            <HStack gap={4}>
                                <Activity size={16} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} />
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