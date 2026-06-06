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
import { canObservatoryTransition, ObservatoryEvent } from "@/lib/observatoryMachine";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { notification } from "@/lib/notificationService";
import { NotificationCenter } from "@/components/ui/NotificationCenter";
import { SessionIndicator } from "@/components/ui/SessionIndicator";
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
            try {
                // We use the same endpoint as ping but more frequently for telemetry
                const res = await fetch(`/api/indi?endpoint=health`, { cache: 'no-store' });
                
                if (res.ok) {
                    const data = await res.json();
                    // data is [ { status, mount_connected, indi_connected, ... } ]
                    if (Array.isArray(data) && data.length > 0) {
                        const health = data[0];
                        const isOk = health.status === "True";
                        setConnected(isOk);
                        
                        if (isOk) {
                            setStatusText(t("SYSTEM_ONLINE", language));
                            setWasConnected(true);
                            
                            // Sync observatory state with backend health data
                            const store = useStargazerStore.getState();
                            
                            // Update subsystem health
                            if (health.indi_connected) store.updateSubsystem("indi_bridge", { status: "nominal" });
                            if (health.mount_connected) store.updateSubsystem("mount", { status: "nominal" });
                            if (health.ccd_connected) store.updateSubsystem("ccd", { status: "nominal" });
                            
                            // Auto-advance state machine
                            if (store.observatoryState === "OFFLINE") {
                                store.sendObservatoryEvent("START");
                            }
                            
                            const events: { check: boolean; event: ObservatoryEvent }[] = [
                                { check: health.indi_connected, event: "INDI_READY" },
                                { check: health.mount_connected, event: "MOUNT_CONNECTED" },
                                { check: health.ccd_connected, event: "CCD_CONNECTED" },
                                { check: !!(health.indi_connected && health.mount_connected && health.ccd_connected), event: "WEATHER_CONNECTED" },
                            ];
                            
                            for (const { check, event } of events) {
                                if (check) {
                                    const s = useStargazerStore.getState();
                                    if (canObservatoryTransition(s.observatoryState, event)) {
                                        s.sendObservatoryEvent(event);
                                    }
                                }
                            }
                            
                            // If backend provided coordinates, update store
                            if (health.ra && health.dec) {
                                useStargazerStore.getState().setPosition(health.ra, health.dec);
                            }
                        } else {
                            setStatusText(t("LINK_OFFLINE", language));
                            setWasConnected(false);
                        }
                    }
                }
            } catch (err: any) {
                setConnected(false);
                setStatusText(`${t("LINK_OFFLINE", language)}`);
                notification.warning(`${t("LINK_OFFLINE", language)}`, {
                  description: err?.message || "Vérifie que le serveur backend est allumé",
                  source: "Système",
                });
                setWasConnected(false);
            }
        };

        checkConnection();
        const interval = setInterval(checkConnection, 2000); // 2s polling
        return () => clearInterval(interval);
    }, [setConnected, language, mounted]);

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
                    w="full" h="56px" px={6}
                    align="center" justify="space-between"
                    borderBottom="1px solid rgba(255, 255, 255, 0.05)"
                    bg="rgba(3, 5, 9, 0.85)" backdropFilter="blur(20px)"
                    pointerEvents="auto"
                >
                    <HStack gap={4}>
                        <HStack align="center" gap={3}>
                            <Orbit size={22} color="var(--astro-teal)" className="pulse-glow" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="15px" className="hud-font" color="var(--astro-starlight)" lineHeight={1}>{t("APP_TITLE", language)}</Text>
                                <Text fontSize="8px" letterSpacing="0.2em" color="var(--astro-teal)" opacity={0.8}>{t("APP_SUBTITLE", language)}</Text>
                            </VStack>
                        </HStack>
                    </HStack>

                    <HStack gap={6} opacity={0.9}>
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
                            <SessionIndicator />
                            <NotificationCenter />
                            <ConfigurationMenu />
                        </VStack>
                    </HStack>
                </Flex>

                <Flex flex={1} justify="space-between" align="stretch" px={5} pt={3} pb={3} minH={0}>
                    <VStack
                        w="340px" align="stretch" h="full" pointerEvents="auto" gap={3}
                        overflowY="auto" overflowX="hidden" pr={1}
                        className="hud-scroll"
                    >
                        <AstroPod title={t("MOUNT_NAVIGATOR", language)} glowColor="teal">
                            <VStack gap={3}>
                                <TelescopeControls variant="pad" />
                                <HStack justify="space-between" w="full" mt={1} fontSize="10px" color="var(--astro-starlight)" opacity={0.8}>
                                    <Text>{t("TRK", language)} {t("SIDEREAL", language)}</Text>
                                    <Text>{t("ERR", language)} 0.04&quot;</Text>
                                </HStack>
                            </VStack>
                        </AstroPod>

                        <AstroPod title={t("LIMITS_CONFIG", language)} glowColor="gold">
                            <MountCalibration />
                        </AstroPod>
                    </VStack>

                    <Box flex={1} pointerEvents="none" />

                    {/* RIGHT COLUMN: Sensor & Oracle Only */}
                    <VStack
                        w="340px" align="stretch" h="full" pointerEvents="auto" gap={3}
                        overflowY="auto" overflowX="hidden" pl={1}
                        className="hud-scroll"
                    >
                        <AstroPod title={t("IMAGING_SENSOR", language)} glowColor="teal">
                            <VStack gap={3} w="full">
                                <CameraControls variant="circular" />
                                <Box w="full" bg="rgba(0,0,0,0.3)" p={2} borderRadius="8px" borderLeft="2px solid var(--astro-teal)">
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

                {/* Bottom-center status pill: lifted out of the main Flex so the
                    side columns get the full available height instead of
                    being squeezed by the pill's footprint. */}
                <Flex
                    position="absolute" bottom={3} left="50%" transform="translateX(-50%)"
                    zIndex={30} pointerEvents="auto"
                >
                    <HStack
                        className="astro-panel"
                        px={6} py={2} borderRadius="full"
                        gap={6}
                        bg="rgba(10, 20, 40, 0.85)" border="1px solid rgba(255,255,255,0.1)"
                    >
                        <HStack gap={3}>
                            <Box className={connected ? "pulse-glow" : ""} color={connected ? "var(--astro-teal)" : "whiteAlpha.400"}>
                                <Power size={14} />
                            </Box>
                            <Text fontSize="10px" color={connected ? "var(--astro-starlight)" : "whiteAlpha.400"}>
                                {connected ? "BRIDGE_UP" : "BRIDGE_DOWN"}
                            </Text>
                        </HStack>
                        <Box h="14px" w="1px" bg="rgba(255, 255, 255, 0.1)" />
                        <HStack gap={3}>
                            <Activity size={14} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                            <VStack align="start" gap={0}>
                                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>{t("SEQUENCE", language)}</Text>
                                <Text fontSize="11px" className="hud-font" color={isExposing ? "var(--astro-gold)" : "white"}>
                                    {isExposing ? t("CAPTURING", language) : t("STANDBY", language)}
                                </Text>
                            </VStack>
                        </HStack>
                    </HStack>
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
