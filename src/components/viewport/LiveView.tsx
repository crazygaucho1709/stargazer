// src/components/viewport/LiveView.tsx
"use client";

import { Box, Flex, Text, Icon, VStack, HStack, Button } from "@chakra-ui/react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { Crosshair, Target, Scan, ShieldCheck, Camera, Globe, ZoomIn, ZoomOut, Play, Square } from "lucide-react";
import { useState, useEffect } from "react";

export const LiveView = () => {
    const { isExposing, isSlewing, ra, dec, alt, az, liveViewMode, setLiveViewMode, zoom, setZoom, language, config } = useStargazerStore();
    const [ccdImage, setCcdImage] = useState<string | null>(null);
    const [ccdError, setCcdError] = useState(false);
    const [isLiveStreaming, setIsLiveStreaming] = useState(false);
    const [streamStatus, setStreamStatus] = useState<string>("");

    const bridgeIp = config.astroberryUrl.replace('http://', '').replace(':8624', '');

    // Calculate pan based on alt and az to simulate telescope slewing
    const panX = -(az - 180) * 15; 
    const panY = -(alt - 45) * 15; 

    // Canon DSLR live view - Poll for latest frame
    useEffect(() => {
        if (liveViewMode !== "CANON") return;
        
        setCcdError(false);
        
        // Set the latest frame URL with cache-busting (use API proxy to avoid CORS)
        const updateFrame = () => {
            setCcdImage(`/api/indi/latest-image?t=${Date.now()}`);
        };
        
        // Initial frame
        updateFrame();
        
        // Poll for new frames (higher rate when streaming)
        const interval = setInterval(updateFrame, isLiveStreaming ? 500 : 3000);
        
        return () => clearInterval(interval);
        
    }, [liveViewMode, bridgeIp, isLiveStreaming]);

    const startLiveView = async () => {
        try {
            setStreamStatus("Starting...");
            const res = await fetch(`http://${bridgeIp}:5000/ccd/liveview/start`, { method: 'POST' });
            if (res.ok) {
                setIsLiveStreaming(true);
                setStreamStatus("LIVE");
            }
        } catch (e) {
            setStreamStatus("Error");
        }
    };

    const stopLiveView = async () => {
        try {
            await fetch(`http://${bridgeIp}:5000/ccd/liveview/stop`, { method: 'POST' });
            setIsLiveStreaming(false);
            setStreamStatus("");
        } catch (e) {
            console.error(e);
        }
    };

    const aladinUrl = `https://aladin.cds.unistra.fr/AladinLite/?target=${encodeURIComponent(ra + ' ' + dec)}&fov=${10 / zoom}&lang=${language}`;

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
                            <Text color="var(--astro-gold)" fontSize="18px">Canon Connection Error</Text>
                        </Box>
                    ) : ccdImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={ccdImage}
                            alt="Canon Live View"
                            onLoad={() => console.log('Canon image loaded:', ccdImage?.substring(0, 50))}
                            onError={(e) => {
                                console.error('Canon image failed:', ccdImage, e);
                                // Retry with fresh timestamp via API proxy
                                setCcdImage(`/api/indi/latest-image?t=${Date.now()}_retry`);
                            }}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                opacity: isExposing ? 0.9 : 1,
                                transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
                                transformOrigin: "center center",
                                transition: isSlewing ? "transform 0.5s linear" : "transform 0.1s ease-out",
                                background: "#000"
                            }}
                        />
                    ) : (
                        <Box display="flex" alignItems="center" justifyContent="center" w="100%" h="100%" bg="#000">
                            <VStack gap={3}>
                                <Icon as={Camera} boxSize={12} color="var(--astro-teal)" opacity={0.5} />
                                <Text color="var(--astro-teal)" fontSize="14px">Initializing Canon EOS 600D...</Text>
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
