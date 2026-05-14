// src/components/viewport/SkyMap.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Spinner, Center, Text, VStack, HStack, Input, Icon, Flex, Button } from "@chakra-ui/react";
import { Search, Crosshair, Map as MapIcon, Layers } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";

declare global {
    interface Window {
        A: any;
    }
}

export const SkyMap = () => {
    const { ra, dec, zoom, language, detectedMount, config } = useStargazerStore();
    const { execute } = useAstroAction();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const aladinRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [layersOpen, setLayersOpen] = useState(false);

    // Initialisation d'Aladin Lite JS
    useEffect(() => {
        if (!mapContainerRef.current) return;

        let retryCount = 0;
        const maxRetries = 20;

        const initAladin = () => {
            if (typeof window.A === 'undefined') {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(initAladin, 500);
                } else {
                    setLoading(false);
                    console.error("Aladin Lite failed to load after multiple retries");
                }
                return;
            }

            try {
                // Cleanup previous instance
                if (mapContainerRef.current) mapContainerRef.current.innerHTML = '';

                const cleanRa = String(ra).replace(/[hms]/g, ' ').replace(/\s+/g, ' ').trim();
                const cleanDec = String(dec).replace(/[°'"]/g, ' ').replace(/\s+/g, ' ').trim();

                aladinRef.current = window.A.aladin(mapContainerRef.current, {
                    survey: "P/DSS2/color",
                    fov: 15 / zoom,
                    target: `${cleanRa} ${cleanDec}`,
                    showReticle: true,
                    showLayersControl: false,
                    showGotoControl: false,
                    showFullscreenControl: false,
                    showFrame: false,
                    fullScreen: false
                });

                // Add informational layers
                aladinRef.current.setConstellation(true);
                aladinRef.current.setGrid(true);
                
                // Add SIMBAD catalog for labels
                const simbad = window.A.catalog({ 
                    name: 'SIMBAD', 
                    color: '#20fffa', 
                    onClick: 'showTable',
                    limit: 100
                });
                aladinRef.current.addCatalog(simbad);
                
                setLoading(false);
            } catch (err) {
                console.error("Error during Aladin init:", err);
                setLoading(false);
            }
        };

        // Load script if missing
        if (!document.getElementById('aladin-script')) {
            const script = document.createElement('script');
            script.id = 'aladin-script';
            script.src = 'https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js';
            script.async = true;
            script.onload = initAladin;
            script.onerror = () => {
                console.error("Script load failed");
                setLoading(false);
            };
            document.head.appendChild(script);
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.css';
            document.head.appendChild(link);
        } else {
            initAladin();
        }

        return () => {
            // No cleanup needed for Aladin JS usually
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync position when telescope moves
    useEffect(() => {
        if (aladinRef.current) {
            const cleanRa = String(ra).replace(/[hms]/g, ' ').replace(/\s+/g, ' ').trim();
            const cleanDec = String(dec).replace(/[°'"]/g, ' ').replace(/\s+/g, ' ').trim();
            aladinRef.current.gotoRaDec(cleanRa, cleanDec);
        }
    }, [ra, dec]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || !aladinRef.current) return;
        aladinRef.current.gotoObject(searchQuery);
    };

    const handleSlewToMap = async () => {
        if (!aladinRef.current) return;
        const [raDeg, decDeg] = aladinRef.current.getRaDec();
        await execute('/api/indi/mount', `GOTO MAP TARGET`, {
            body: {
                action: 'goto',
                ra: raDeg,
                dec: decDeg,
                device: detectedMount,
                ip: config.astroberryUrl
            }
        });
    };

    return (
        <Box w="full" h="full" bg="black" position="relative" overflow="hidden">
            {/* Search Bar Overlay */}
            <Box 
                position="absolute" top="20px" left="50%" transform="translateX(-50%)" 
                zIndex={10} w="400px" pointerEvents="auto"
            >
                <form onSubmit={handleSearch}>
                    <Flex 
                        align="center" 
                        bg="rgba(10, 20, 40, 0.95)" 
                        borderRadius="full" 
                        border="2px solid rgba(255,255,255,0.1)"
                        px={4} py={1}
                        boxShadow="0 10px 30px rgba(0,0,0,0.5)"
                    >
                        <Search size={16} color="var(--astro-teal)" />
                        <Input
                            placeholder={language === 'fr' ? "Rechercher un objet..." : "Search object..."}
                            variant="flushed" border="none" outline="none" _focus={{ border: "none", outline: "none" }}
                            bg="transparent" color="white" fontSize="md" ml={3}
                            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Button 
                            size="xs" variant="ghost" color="var(--astro-gold)" 
                            onClick={handleSlewToMap}
                            ml={2} borderRadius="full" px={3}
                        >
                            GOTO
                        </Button>
                    </Flex>
                </form>
            </Box>

            {/* Floating Layer Controls */}
            <VStack 
                position="absolute" top="80px" right="20px" zIndex={10} 
                gap={2} pointerEvents="auto"
            >
                <Button 
                    size="sm" borderRadius="full" bg="rgba(10, 20, 40, 0.8)" 
                    color="var(--astro-teal)" border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => {
                        if (aladinRef.current) {
                            aladinRef.current.setConstellation(!aladinRef.current.getConstellation());
                        }
                    }}
                >
                    CONSTELLATIONS
                </Button>
                <Button 
                    size="sm" borderRadius="full" bg="rgba(10, 20, 40, 0.8)" 
                    color="var(--astro-teal)" border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => {
                        if (aladinRef.current) {
                            aladinRef.current.setGrid(!aladinRef.current.getGrid());
                        }
                    }}
                >
                    GRILLE
                </Button>
            </VStack>

            {loading && (
                <Center position="absolute" inset="0" zIndex={5} bg="black">
                    <VStack gap={4}>
                        <Spinner color="var(--astro-teal)" size="xl" borderWidth="4px" />
                        <Text color="var(--astro-teal)" fontSize="12px" className="hud-font">INITIALIZING SKY ENGINE...</Text>
                    </VStack>
                </Center>
            )}

            <div 
                ref={mapContainerRef} 
                style={{ width: '100%', height: '100%', background: 'black' }}
            />
            
            {/* HUD Overlay */}
            <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" pointerEvents="none" zIndex={6}>
                <VStack gap={2}>
                    <Icon as={Crosshair} boxSize="80px" color="var(--astro-gold)" opacity={0.3} />
                </VStack>
            </Box>
        </Box>
    );
};

