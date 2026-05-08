// src/components/viewport/LiveView.tsx
"use client";

import { Box, Flex, Text, Icon, VStack, HStack, Button, Heading } from "@chakra-ui/react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { Crosshair, Target, Scan, ShieldCheck, Camera, Globe, ZoomIn, ZoomOut, Play, Square, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { HfrOverlay } from "@/components/observatory/HfrOverlay";
import { CaptureProgress } from "@/components/observatory/CaptureProgress";

export const LiveView = () => {
    const { isExposing, isSlewing, ra, dec, alt, az, liveViewMode, setLiveViewMode, zoom, setZoom, language, config } = useStargazerStore();
    const [ccdImage, setCcdImage] = useState<string | null>(null);
    const [ccdError, setCcdError] = useState(false);
    const [isLiveStreaming, setIsLiveStreaming] = useState(false);
    const [streamStatus, setStreamStatus] = useState<string>("");

    const [bridgeIp, setBridgeIp] = useState("localhost");

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setBridgeIp(window.location.hostname);
        }
    }, []);

    // Canon DSLR live view: switching to CANON mode by itself MUST NOT open
    // the shutter or fetch frames from the camera. The shutter only opens
    // when the user explicitly clicks the green "LIVE" button (which calls
    // startLiveView() and posts /ccd/stream/start), and closes when they
    // click "STOP". So while we're in CANON mode but not streaming, just
    // show the placeholder — no polling, no auto-fetch.
    useEffect(() => {
        if (liveViewMode !== "CANON") return;
        setCcdError(false);
        // When isLiveStreaming flips off (user clicked STOP), make sure any
        // previous stream/object URL is cleared so the placeholder reappears.
        if (!isLiveStreaming) {
            setCcdImage(null);
        }
    }, [liveViewMode, isLiveStreaming]);

    const startLiveView = async () => {
        try {
            setStreamStatus("Starting...");
            await fetch('/api/indi/liveview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' })
            });
            setCcdImage(`/api/indi/stream?t=${Date.now()}`);
            setIsLiveStreaming(true);
            setStreamStatus("LIVE");
        } catch (e) {
            setStreamStatus("Error");
        }
    };

    const stopLiveView = async () => {
        try {
            await fetch('/api/indi/liveview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop' })
            });
            setIsLiveStreaming(false);
            setCcdImage(null);
            setStreamStatus("");
        } catch (e) {
            console.error(e);
        }
    };

    // Safety Watchdog: Auto-cut live view after inactivity
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [showSafetyModal, setShowSafetyModal] = useState(false);

    useEffect(() => {
        if (!isLiveStreaming) {
            setShowSafetyModal(false);
            return;
        }

        const handleActivity = () => setLastActivity(Date.now());
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('mousedown', handleActivity);
        window.addEventListener('touchstart', handleActivity);

        const checkInactivity = setInterval(() => {
            const idleTime = Date.now() - lastActivity;
            
            // 10 minutes = 600,000 ms
            if (idleTime > 600000 && !showSafetyModal) {
                setShowSafetyModal(true);
            }
            
            // 15 minutes = 900,000 ms
            if (idleTime > 900000) {
                stopLiveView();
                setShowSafetyModal(false);
            }
        }, 10000); // check every 10s

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('mousedown', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            clearInterval(checkInactivity);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLiveStreaming, lastActivity, showSafetyModal]);

    // Format coordinates to avoid Aladin trying to resolve them as names (which causes CORS/SESAME errors)
    const cleanRa = String(ra).replace(/[hms]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanDec = String(dec).replace(/[°'"]/g, ' ').replace(/\s+/g, ' ').trim();
    const aladinUrl = `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(`${cleanRa} ${cleanDec}`)}&fov=${10 / zoom}&lang=${language}`;

    return (
        <Box
            position="absolute"
            inset="0"
            w="100vw"
            h="100vh"
            zIndex={0}
            overflow="hidden"
            bg="#030509"
        >
            {/* Safety Modal Overlay */}
            {showSafetyModal && (
                <Box 
                    position="fixed" inset="0" bg="rgba(0,0,0,0.85)" zIndex={100}
                    backdropFilter="blur(10px)" display="flex" alignItems="center" justifyContent="center"
                >
                    <VStack 
                        bg="rgba(10, 20, 40, 0.95)" p={10} borderRadius="16px" 
                        border="2px solid var(--astro-gold)" maxW="400px" textAlign="center" gap={6}
                        boxShadow="0 0 50px rgba(255, 179, 71, 0.3)"
                        className="pulse-glow"
                    >
                        <Icon as={AlertTriangle} boxSize={12} color="var(--astro-gold)" />
                        <VStack gap={2}>
                            <Heading size="md" color="white" className="hud-font">VEILLE SÉCURITÉ</Heading>
                            <Text color="whiteAlpha.800" fontSize="14px">
                                {language === 'fr' 
                                    ? "Inactivité détectée. Le flux direct sera coupé dans 5 minutes pour préserver la connexion avec l'Astroberry."
                                    : "Inactivity detected. Live feed will be cut in 5 minutes to preserve connection with Astroberry."}
                            </Text>
                        </VStack>
                        <Button 
                            w="full" bg="var(--astro-gold)" color="black" _hover={{ bg: "white" }}
                            onClick={() => setLastActivity(Date.now())}
                        >
                            {language === 'fr' ? "MAINTENIR LE LIEN" : "KEEP CONNECTION"}
                        </Button>
                    </VStack>
                </Box>
            )}

            <Box
                position="relative"
                w="full"
                h="full"
            >
                {/* Background Image Switcher */}
                <Box
                    position="absolute"
                    inset={liveViewMode === "CANON" ? "-200px" : "0"}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                >
                    {liveViewMode === "NASA" ? (
                        <Box w="full" h="full" bg="black" pointerEvents="none" opacity={isExposing ? 0.8 : 1}>
                            <iframe 
                                src={aladinUrl} 
                                width="100%" 
                                height="100%" 
                                frameBorder="0" 
                                style={{ filter: "hue-rotate(330deg) saturate(1.2) contrast(1.1)", pointerEvents: "none" }}
                            />
                        </Box>
                    ) : ccdError ? (
                        <Box display="flex" alignItems="center" justifyContent="center" w="100%" h="100%" bg="#112233">
                            <Text color="var(--astro-gold)" fontSize="18px">{t("CANON_CONNECTION_ERROR", language)}</Text>
                        </Box>
                    ) : ccdImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={ccdImage}
                            alt="Canon Live View"
                            onLoad={() => setCcdError(false)}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                opacity: isExposing ? 0.9 : 1,
                        transform: `scale(${zoom})`,
                                transformOrigin: "center center",
                        transition: "transform 0.1s ease-out",
                                background: "#000"
                            }}
                        />
                    ) : (
                        <Box display="flex" alignItems="center" justifyContent="center" w="100%" h="100%" bg="#000">
                            <VStack gap={3}>
                                <Icon as={Camera} boxSize={12} color="var(--astro-teal)" opacity={0.5} />
                                <Text color="var(--astro-teal)" fontSize="14px" className="hud-font">{t("CANON_STANDBY", language)}</Text>
                                <Text color="whiteAlpha.500" fontSize="11px">{t("CANON_STANDBY_HINT", language)}</Text>
                            </VStack>
                        </Box>
                    )}
                </Box>

                {/* Vignette effect for depth */}
                <Box 
                    position="absolute" inset="0" pointerEvents="none"
                    bg="radial-gradient(circle at center, transparent 30%, rgba(3, 5, 9, 0.8) 100%)"
                />

                {/* Sensor Noise Overlay for Canon Mode */}
                {liveViewMode === "CANON" && (
                    <Box
                        position="absolute" inset="0" opacity={0.15} pointerEvents="none"
                        bg="url('https://transparenttextures.com/patterns/stardust.png')"
                        style={{ animation: "pulse 0.1s infinite alternate" }}
                    />
                )}

                {/* Central Crosshair */}
                <Flex
                    position="absolute" top="50%" left="50%"
                    transform="translate(-50%, -50%)"
                    color={liveViewMode === "NASA" ? "var(--astro-teal)" : "var(--astro-gold)"}
                    opacity={0.6}
                    pointerEvents="none"
                >
                    <Icon as={Crosshair} boxSize="180px" strokeWidth={1} />
                </Flex>

                {/* Large decorative focus rings */}
                <Box 
                    position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)"
                    w="80vh" h="80vh" border="1px dashed rgba(255,255,255,0.05)" borderRadius="full"
                    pointerEvents="none"
                />
                <Box 
                    position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)"
                    w="50vh" h="50vh" border="1px solid rgba(255, 51, 51, 0.1)" borderRadius="full"
                    pointerEvents="none"
                />

                {/* Zoom Control UI */}
                <VStack
                    position="absolute" right="40px" top="50%" transform="translateY(-50%)"
                    bg="rgba(10, 20, 40, 0.6)" p={3} borderRadius="full" border="1px solid rgba(255, 255, 255, 0.1)"
                    backdropFilter="blur(10px)" zIndex={20} gap={4}
                    boxShadow="0 10px 30px rgba(0,0,0,0.5)"
                >
                    <Button 
                        size="sm" variant="ghost" color="whiteAlpha.700" 
                        _hover={{ color: "var(--astro-teal)", bg: "rgba(255, 51, 51, 0.1)" }}
                        onClick={() => setZoom(Math.min(10, zoom + 0.5))}
                    >
                        <ZoomIn size={18} />
                    </Button>
                    <Text fontSize="12px" className="hud-font" color="var(--astro-teal)" fontWeight="bold">
                        {zoom.toFixed(1)}x
                    </Text>
                    <Button 
                        size="sm" variant="ghost" color="whiteAlpha.700" 
                        _hover={{ color: "var(--astro-teal)", bg: "rgba(255, 51, 51, 0.1)" }}
                        onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                    >
                        <ZoomOut size={18} />
                    </Button>
                </VStack>

                {/* MODE TOGGLE + LIVE VIEW CONTROLS */}
                <HStack
                    position="absolute" top="100px" left="50%" transform="translateX(-50%)"
                    bg="rgba(10, 20, 40, 0.7)" p={1.5} borderRadius="full" border="1px solid rgba(255,255,255,0.1)"
                    backdropFilter="blur(10px)" zIndex={20} boxShadow="0 10px 30px rgba(0,0,0,0.5)"
                    gap={2}
                >
                    <Button
                        size="sm" borderRadius="full" px={6}
                        variant={liveViewMode === "NASA" ? "solid" : "ghost"}
                        colorScheme={liveViewMode === "NASA" ? "red" : "gray"}
                        bg={liveViewMode === "NASA" ? "var(--astro-teal)" : "transparent"}
                        color={liveViewMode === "NASA" ? "black" : "whiteAlpha.700"}
                        onClick={() => setLiveViewMode("NASA")}
                        fontSize="10px" className="hud-font"
                        _hover={liveViewMode !== "NASA" ? { bg: "rgba(255,255,255,0.1)" } : undefined}
                    >
                        <Globe size={14} style={{ marginRight: '6px' }} />
                        {t("SKY_MAP", language)}
                    </Button>
                    <Button
                        size="sm" borderRadius="full" px={6}
                        variant={liveViewMode === "CANON" ? "solid" : "ghost"}
                        colorScheme={liveViewMode === "CANON" ? "orange" : "gray"}
                        bg={liveViewMode === "CANON" ? "var(--astro-gold)" : "transparent"}
                        color={liveViewMode === "CANON" ? "black" : "whiteAlpha.700"}
                        onClick={() => setLiveViewMode("CANON")}
                        fontSize="10px" className="hud-font"
                        _hover={liveViewMode !== "CANON" ? { bg: "rgba(255,255,255,0.1)" } : undefined}
                    >
                        <Camera size={14} style={{ marginRight: '6px' }} />
                        {t("LIVE_SENSOR", language)}
                    </Button>
                    
                    {/* LIVE VIEW START/STOP BUTTON - Only in CANON mode */}
                    {liveViewMode === "CANON" && (
                        <Button
                            size="sm" borderRadius="full" px={4}
                            variant="solid"
                            bg={isLiveStreaming ? "red.500" : "green.500"}
                            color="white"
                            onClick={isLiveStreaming ? stopLiveView : startLiveView}
                            fontSize="10px" className="hud-font"
                            _hover={{ bg: isLiveStreaming ? "red.600" : "green.600" }}
                            animation={isLiveStreaming ? "pulse 1s infinite" : undefined}
                        >
                            {isLiveStreaming ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                            <Text ml={1}>{isLiveStreaming ? "STOP" : "LIVE"}</Text>
                            {streamStatus && (
                                <Text ml={1} fontSize="8px" opacity={0.8}>({streamStatus})</Text>
                            )}
                        </Button>
                    )}
                </HStack>

                {/* Coordinate HUD (Lower Center) */}
                <VStack
                    position="absolute" bottom="130px" left="50%"
                    transform="translateX(-50%)" gap={0}
                    zIndex={10} pointerEvents="none"
                    bg="rgba(10, 20, 40, 0.8)" px={10} py={4}
                    borderRadius="full" border="1px solid rgba(255,255,255,0.1)"
                    backdropFilter="blur(10px)" boxShadow="0 10px 40px rgba(0,0,0,0.5)"
                >
                    <HStack gap={10}>
                        <VStack align="center" gap={1}>
                            <Text color="var(--astro-starlight)" fontSize="9px" fontWeight="bold" opacity={0.6}>{t("RIGHT_ASCENSION", language)}</Text>
                            <Text color="var(--astro-teal)" fontSize="18px" className="hud-font">{ra}</Text>
                        </VStack>
                        <Box w="1px" h="30px" bg="rgba(255,255,255,0.1)" />
                        <VStack align="center" gap={1}>
                            <Text color="var(--astro-starlight)" fontSize="9px" fontWeight="bold" opacity={0.6}>{t("DECLINATION", language)}</Text>
                            <Text color="var(--astro-gold)" fontSize="18px" className="hud-font">{dec}</Text>
                        </VStack>
                    </HStack>
                </VStack>

                {/* Overlays */}
                {liveViewMode === "CANON" && config.showHfrOverlay && <HfrOverlay />}
                <CaptureProgress />
            </Box>

            <style jsx global>{`
                @keyframes pulse {
                    from { opacity: 0.1; }
                    to { opacity: 0.2; }
                }
            `}</style>
        </Box>
    );
};
