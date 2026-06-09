"use client";

import { Box, VStack, HStack, Text, Icon, Flex, Grid, Circle } from "@chakra-ui/react";
import { TelescopeControls, TrackingModeSelector } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { CaptureProgressPanel } from "@/components/camera/CaptureProgressPanel";
import { MiseEnStationWizard } from "@/components/telescope/MiseEnStationWizard";
import { SkyMap } from "@/components/viewport/SkyMap";
import { AIAssistant } from "@/components/ai/AIAssistant";
import { MountCalibration } from "@/components/telescope/MountCalibration";
import { AstroPod } from "@/components/ui/AstroPod";
import { ConfigurationMenu } from "@/components/ui/ConfigurationMenu";
import { GlobalLoader } from "@/components/ui/GlobalLoader";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEffect, useState } from "react";
import { LiveView } from "@/components/viewport/LiveView";
import { canObservatoryTransition, ObservatoryEvent } from "@/lib/observatoryMachine";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useMountCoords } from "@/hooks/useMountCoords";
import { notification } from "@/lib/notificationService";
import { NotificationCenter } from "@/components/ui/NotificationCenter";
import { SessionIndicator } from "@/components/ui/SessionIndicator";
import {
    Activity, Zap, Orbit, Clock, MapPin, Compass, Thermometer, Power, Telescope
} from "lucide-react";

// ── Sun altitude (crépuscule) — même algo que /sensor ───────────────────────
function calcSunAlt(latStr: string, lonStr: string): number | null {
    const lat = parseFloat(latStr), lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) return null;
    const rad = Math.PI / 180, d = new Date();
    const D = d.getTime() / 86400000 - 10957;
    const g = (357.529 + 0.98560028 * D) * rad;
    const q = 280.459 + 0.98564736 * D;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const e = 23.439 * rad;
    const sinDec = Math.sin(e) * Math.sin(L);
    const dec = Math.asin(sinDec);
    const UT = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    const GMST = (6.697375 + 0.0657098242 * D + UT) % 24;
    const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad / 15;
    const LHA = ((GMST + lon / 15 - RA) % 24) * 15 * rad;
    return Math.asin(Math.sin(lat * rad) * sinDec + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(LHA)) / rad;
}

function TwilightBadge({ lat, lon }: { lat: string; lon: string }) {
    const [sunAlt, setSunAlt] = useState<number | null>(null);
    useEffect(() => {
        const tick = () => setSunAlt(calcSunAlt(lat, lon));
        tick();
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, [lat, lon]);
    if (sunAlt == null) return null;
    const { label, color } = sunAlt > 0 ? { label: "☀ JOUR", color: "#ffd700" }
        : sunAlt > -6 ? { label: "🌅 CIVIL", color: "#ff9944" }
        : sunAlt > -12 ? { label: "🌆 NAUTIQUE", color: "#cc88ff" }
        : sunAlt > -18 ? { label: "🌌 ASTRO", color: "#8888ff" }
        : { label: "🔭 NUIT NOIRE", color: "#00ffb4" };
    return (
        <HStack gap={2}>
            <VStack align="start" gap={0}>
                <Text fontSize="8px" color="var(--astro-starlight)" opacity={0.6}>CRÉPUSCULE</Text>
                <Text fontSize="11px" className="hud-font" color={color} fontWeight="bold">
                    {label}
                </Text>
            </VStack>
            <Text fontSize="9px" color={color} opacity={0.6}>{sunAlt.toFixed(1)}°</Text>
        </HStack>
    );
}

export default function Home() {
    const { isConnected: connected, setConnected, isExposing, alt, az, language, isLoading, liveViewMode, config } = useStargazerStore();
    const [statusText, setStatusText] = useState("");
    const envData = useEnvironmentData();
    // SSE temps réel pour RA/DEC — remplace le polling health pour les coords
    useMountCoords();
    const [mounted, setMounted] = useState(false);
    const [showMiseEnStation, setShowMiseEnStation] = useState(false);
    const [showCapturePanel, setShowCapturePanel] = useState(false);

    const [wasConnected, setWasConnected] = useState(false);

    useEffect(() => {
        setMounted(true);
        setStatusText(t("ESTABLISHING_LINK", language));

        // Load configuration from backend disk store.
        // We never overwrite a locally-stored aiKey with an empty server value.
        const loadServerConfig = async () => {
            try {
                const res = await fetch('/api/indi/config');
                if (res.ok) {
                    const serverConfig = await res.json();
                    if (serverConfig && Object.keys(serverConfig).length > 0) {
                        const localKey = useStargazerStore.getState().config.aiKey;
                        // Preserve local aiKey if the server doesn't have one
                        if (localKey && !serverConfig.aiKey) {
                            serverConfig.aiKey = localKey;
                        }
                        useStargazerStore.getState().updateConfig(serverConfig, false);
                    }
                }
            } catch (e) {
                console.error("Failed to load server configuration:", e);
            }
        };
        loadServerConfig();
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
                            
                            // Coords (RA/DEC) are now pushed via SSE /coords/stream — no update needed here
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
        // Base poll: 2s. During slew: accelerate to 500ms for real-time marker tracking.
        let interval = setInterval(checkConnection, 2000);
        const slewInterval = setInterval(() => {
            const { isSlewing } = useStargazerStore.getState();
            clearInterval(interval);
            interval = setInterval(checkConnection, isSlewing ? 500 : 2000);
        }, 1000);
        return () => { clearInterval(interval); clearInterval(slewInterval); };
    }, [setConnected, language, mounted]);

    if (!mounted) {
        return <Box h="100vh" w="100vw" bg="#030509" />;
    }

    return (
        <Box style={{ height: '100dvh', width: '100dvw', paddingTop: 'env(safe-area-inset-top)' }} position="relative" overflow="hidden" bg="#030509">
            <GlobalLoader />
            <LiveView />
            
            {/* Subtle vignette — keep edges readable without blocking controls */}
            <Box position="absolute" inset="0" pointerEvents="none" zIndex={1} bg="radial-gradient(circle at center, transparent 60%, rgba(3, 5, 9, 0.25) 100%)" />

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

                        <TwilightBadge lat={config.latitude} lon={config.longitude} />
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
                                <TrackingModeSelector />
                                <HStack justify="space-between" w="full" mt={1} fontSize="10px" color="var(--astro-starlight)" opacity={0.8}>
                                    <Text>{t("ERR", language)} 0.04&quot;</Text>
                                    <Box
                                        as="button"
                                        fontSize="9px"
                                        color="teal.300"
                                        _hover={{ color: "teal.100" }}
                                        onClick={() => setShowMiseEnStation(!showMiseEnStation)}
                                        cursor="pointer"
                                    >
                                        {showMiseEnStation ? "▲ Fermer wizard" : "⊕ Mise en station"}
                                    </Box>
                                </HStack>
                            </VStack>
                        </AstroPod>

                        {showMiseEnStation && (
                            <MiseEnStationWizard onClose={() => setShowMiseEnStation(false)} />
                        )}

                        <AstroPod title={t("LIMITS_CONFIG", language)} glowColor="gold">
                            <MountCalibration />
                        </AstroPod>
                    </VStack>

                    {/* Centre : Sky Map interactive — contain:paint clips all z-indexed children */}
                    {/* When CANON mode is active, hide SkyMap to let LiveView Canon stream show through */}
                    <Box flex={1} pointerEvents={liveViewMode === "CANON" ? "none" : "auto"} position="relative" borderRadius="lg" overflow="hidden" mx={2} style={{ contain: 'paint' }}>
                        {liveViewMode !== "CANON" && <SkyMap />}
                    </Box>

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
                                <Box
                                    as="button"
                                    w="full"
                                    fontSize="9px"
                                    color={showCapturePanel ? "blue.300" : "whiteAlpha.500"}
                                    bg={showCapturePanel ? "rgba(66,153,225,0.1)" : "rgba(255,255,255,0.03)"}
                                    border="1px solid"
                                    borderColor={showCapturePanel ? "blue.700" : "whiteAlpha.100"}
                                    borderRadius="md"
                                    py={1}
                                    px={2}
                                    textAlign="center"
                                    cursor="pointer"
                                    _hover={{ color: "blue.200", borderColor: "blue.600" }}
                                    onClick={() => setShowCapturePanel(!showCapturePanel)}
                                >
                                    {showCapturePanel ? "▲ Fermer séquence" : "▶ Séquence de capture"}
                                </Box>
                            </VStack>
                        </AstroPod>

                        {showCapturePanel && (
                            <CaptureProgressPanel onClose={() => setShowCapturePanel(false)} />
                        )}

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
