// src/components/viewport/SkyMap.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Box, Spinner, Center, Text, VStack, HStack, Input, Icon, Flex, Button, Badge } from "@chakra-ui/react";
import { Search, Crosshair, Map as MapIcon, Layers, Star, Target, Navigation, AlertCircle } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";

declare global {
    interface Window {
        A: any;
    }
}

// Parse RA string to decimal degrees
function parseRaToDecimal(ra: string): number {
    if (!ra) return 0;
    const str = String(ra).trim();
    // Match formats: "05h 35m 17s", "05:35:17", "83.821"
    const match = str.match(/([+-]?\d+\.?\d*)[h°:\s]\s*(\d+)?[m':\s]?\s*(\d+\.?\d*)?[s"]?/);
    if (match) {
        const hours = parseFloat(match[1]);
        const mins = match[2] ? parseFloat(match[2]) : 0;
        const secs = match[3] ? parseFloat(match[3]) : 0;
        return 15 * (hours + mins/60 + secs/3600); // Convert to degrees
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed * 15; // Assume input is hours, convert to degrees
}

// Parse DEC string to decimal degrees
function parseDecToDecimal(dec: string): number {
    if (!dec) return 0;
    const str = String(dec).trim();
    // Match formats: "-05° 23' 28\"", "-05:23:28", "-5.391"
    const match = str.match(/([+-]?\d+\.?\d*)[°:\s]\s*(\d+)?['":\s]?\s*(\d+\.?\d*)?["]?/);
    if (match) {
        const deg = parseFloat(match[1]);
        const mins = match[2] ? parseFloat(match[2]) : 0;
        const secs = match[3] ? parseFloat(match[3]) : 0;
        const sign = deg < 0 || str.startsWith('-') ? -1 : 1;
        return sign * (Math.abs(deg) + mins/60 + secs/3600);
    }
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

// Fallback sky canvas when Aladin fails to load - Simple star chart
const SkyFallback = ({ objects, onSelect, mountRa, mountDec }: { 
    objects: CelestialObject[], 
    onSelect: (obj: CelestialObject) => void,
    mountRa?: string,
    mountDec?: string
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mounted, setMounted] = useState(false);
    const [hoveredObj, setHoveredObj] = useState<CelestialObject | null>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

    useEffect(() => {
        setMounted(true);
        const updateSize = () => {
            const container = document.getElementById('fallback-canvas-container');
            if (container) {
                setCanvasSize({ w: container.clientWidth, h: container.clientHeight });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Convert mount position to canvas coords
    const getMountPosition = useCallback(() => {
        if (!mountRa || !mountDec) return { x: canvasSize.w / 2, y: canvasSize.h / 2 };
        const raVal = parseRaToDecimal(mountRa);
        const decVal = parseDecToDecimal(mountDec);
        const raNorm = ((raVal - raVal + 180) % 360) / 360;
        const decNorm = (decVal + 90) / 180;
        return {
            x: raNorm * canvasSize.w,
            y: (1 - decNorm) * canvasSize.h
        };
    }, [mountRa, mountDec, canvasSize]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        canvas.width = canvasSize.w;
        canvas.height = canvasSize.h;

        // Black background with gradient
        const gradient = ctx.createRadialGradient(
            canvasSize.w / 2, canvasSize.h / 2, 0,
            canvasSize.w / 2, canvasSize.h / 2, canvasSize.w * 0.7
        );
        gradient.addColorStop(0, '#000820');
        gradient.addColorStop(1, '#000010');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

        // Draw coordinate grid
        ctx.strokeStyle = '#1a2a3a';
        ctx.lineWidth = 1;
        
        // RA lines (vertical)
        for (let i = 0; i < 12; i++) {
            const x = (i / 12) * canvasSize.w;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasSize.h);
            ctx.stroke();
        }
        // DEC lines (horizontal)
        for (let i = 0; i < 8; i++) {
            const y = (i / 8) * canvasSize.h;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvasSize.w, y);
            ctx.stroke();
        }

        const mountPos = getMountPosition();

        // Draw objects from catalog
        objects.forEach((obj) => {
            // Project using simple equirectangular centered on mount
            const raNorm = ((obj.ra_deg - parseRaToDecimal(mountRa || '0') + 180 + 360) % 360) / 360;
            const decNorm = (obj.dec_deg + 90) / 180;
            
            let x = raNorm * canvasSize.w;
            let y = (1 - decNorm) * canvasSize.h;
            
            // Wrap around for objects near the edge
            if (x < -50) x += canvasSize.w;
            if (x > canvasSize.w + 50) x -= canvasSize.w;
            
            // Skip if out of view
            if (y < -50 || y > canvasSize.h + 50) return;

            const isHovered = hoveredObj?.id === obj.id;
            const mag = obj.magnitude;
            const size = Math.max(3, Math.min(12, 10 - mag * 0.8));
            const brightness = Math.max(0.3, 1 - mag / 12);

            // Glow for bright objects
            if (mag < 4) {
                const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
                glow.addColorStop(0, `rgba(255, 255, 255, ${brightness * 0.3})`);
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
            }

            // Object circle
            ctx.fillStyle = `rgba(255, ${220 - mag * 10}, ${100 + mag * 20}, ${brightness})`;
            ctx.beginPath();
            ctx.arc(x, y, isHovered ? size + 3 : size, 0, Math.PI * 2);
            ctx.fill();

            // Label
            if (mag < 6 || isHovered) {
                ctx.fillStyle = isHovered ? '#fff' : '#ffd700';
                ctx.font = isHovered ? 'bold 12px sans-serif' : '10px sans-serif';
                ctx.fillText(obj.id, x + size + 4, y + 4);
            }
        });

        // Draw mount position crosshair
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        const mx = mountPos.x;
        const my = mountPos.y;
        
        // Crosshair
        ctx.beginPath();
        ctx.moveTo(mx - 30, my);
        ctx.lineTo(mx - 10, my);
        ctx.moveTo(mx + 10, my);
        ctx.lineTo(mx + 30, my);
        ctx.moveTo(mx, my - 30);
        ctx.lineTo(mx, my - 10);
        ctx.moveTo(mx, my + 10);
        ctx.lineTo(mx, my + 30);
        ctx.stroke();

        // Circle
        ctx.beginPath();
        ctx.arc(mx, my, 15, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = '#00f0ff';
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fill();

    }, [objects, canvasSize, hoveredObj, mountRa, mountDec, getMountPosition]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Find clicked object
        const mountPos = getMountPosition();
        objects.forEach((obj) => {
            const raNorm = ((obj.ra_deg - parseRaToDecimal(mountRa || '0') + 180 + 360) % 360) / 360;
            const decNorm = (obj.dec_deg + 90) / 180;
            let ox = raNorm * canvasSize.w;
            let oy = (1 - decNorm) * canvasSize.h;
            
            const dist = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2);
            if (dist < 20) {
                onSelect(obj);
            }
        });
    };

    if (!mounted) return <Center h="full"><Spinner color="var(--astro-teal)" /></Center>;

    return (
        <Box position="relative" w="full" h="full" id="fallback-canvas-container">
            <canvas 
                ref={canvasRef} 
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    cursor: 'crosshair'
                }}
                onClick={handleCanvasClick}
                onMouseMove={(e) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const x = (e.clientX - rect.left) * scaleX;
                    const y = (e.clientY - rect.top) * scaleY;
                    
                    const mountPos = getMountPosition();
                    let found: CelestialObject | null = null;
                    
                    objects.forEach((obj) => {
                        const raNorm = ((obj.ra_deg - parseRaToDecimal(mountRa || '0') + 180 + 360) % 360) / 360;
                        const decNorm = (obj.dec_deg + 90) / 180;
                        let ox = raNorm * canvasSize.w;
                        let oy = (1 - decNorm) * canvasSize.h;
                        const dist = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2);
                        if (dist < 20) found = obj;
                    });
                    setHoveredObj(found);
                }}
            />
            {/* Hover info */}
            {hoveredObj && (
                <Box 
                    position="absolute" top={2} left={2} 
                    bg="rgba(10, 20, 40, 0.9)" p={3} borderRadius="md"
                    border="1px solid var(--astro-teal)"
                >
                    <Text color="var(--astro-gold)" fontWeight="bold">{hoveredObj.id} - {hoveredObj.name}</Text>
                    <Text color="white" fontSize="xs">{hoveredObj.constellation} | {hoveredObj.type}</Text>
                    <Text color="gray.400" fontSize="xs">Mag: {hoveredObj.magnitude}</Text>
                </Box>
            )}
            {/* Info banner */}
            <HStack 
                position="absolute" bottom={2} left={2} 
                bg="rgba(0,0,0,0.7)" px={3} py={2} borderRadius="md"
                gap={4}
            >
                <VStack gap={0} align="start">
                    <Text color="cyan.300" fontSize="xs" fontWeight="bold">FALLBACK MODE</Text>
                    <Text color="gray.400" fontSize="xs">Aladin CDN unavailable</Text>
                </VStack>
                <Box w="1px" h="30px" bg="gray.600" />
                <VStack gap={0} align="start">
                    <Text color="gray.400" fontSize="xs">Click objects to select</Text>
                    <Text color="gray.400" fontSize="xs">Cyan cross = Mount position</Text>
                </VStack>
            </HStack>
        </Box>
    );
};

// Aladin Lite wrapper with full interactivity
const AladinSkyMap = ({ 
    objects, 
    onSelect, 
    mountRa, 
    mountDec,
    showGrid,
    showLabels,
    showCardinals,
    trackMount,
    onTrackChange,
    fov = 15,
    onViewChange,
    aladinSettings,
    gotoTarget
}: { 
    objects: CelestialObject[], 
    onSelect: (obj: CelestialObject) => void,
    onViewChange?: (ra: number, dec: number) => void,
    mountRa?: string,
    mountDec?: string,
    showGrid: boolean,
    showLabels: boolean,
    showCardinals: boolean,
    trackMount: boolean,
    onTrackChange: (v: boolean) => void,
    fov?: number,
    aladinSettings?: {
        survey: string;
        fov: number;
        sourceSize: number;
        objectColor: string;
        mountColor: string;
        gridColor: string;
        showReticle: boolean;
        showZoom: boolean;
        showFullscreen: boolean;
        projection: string;
    },
    gotoTarget?: { ra: number, dec: number } | null
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const aladinRef = useRef<any>(null);
    const [aladinReady, setAladinReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hoveredObject, setHoveredObject] = useState<CelestialObject | null>(null);
    const mountCatalogRef = useRef<any>(null);
    const mountSourceRef = useRef<any>(null);
    const dsoCatalogRef = useRef<any>(null);
    const onViewChangeRef = useRef(onViewChange);
    onViewChangeRef.current = onViewChange;

    // Suppress non-critical Aladin console errors
    useEffect(() => {
        const originalError = console.error;
        console.error = (...args) => {
            const msg = args[0]?.toString() || '';
            // Suppress known non-critical errors
            if (msg.includes('CORS') || 
                msg.includes('Access-Control-Allow-Origin') ||
                msg.includes('properties') ||
                msg.includes('irsa.ipac') ||
                msg.includes('hips/CDS')) {
                return;
            }
            originalError.apply(console, args);
        };
        return () => {
            console.error = originalError;
        };
    }, []);

    // Load Aladin Lite with retry logic
    useEffect(() => {
        let retryCount = 0;
        const maxRetries = 10;

        const initAladin = async () => {
            // Wait for container to be available
            if (!containerRef.current) {
                await new Promise(resolve => setTimeout(resolve, 500));
                if (!containerRef.current) {
                    return;
                }
            }

            // Check if Aladin already loaded and initialized
            if (typeof window.A !== 'undefined' && window.A.init) {
                try {
                    await window.A.init;
                    await setupAladin();
                    return;
                } catch (e) {
                    console.error('Aladin init error:', e);
                }
            }

            if (retryCount >= maxRetries) {
                setLoadError('Aladin failed to load after multiple attempts');
                return;
            }

            retryCount++;

            // Load CSS from local file
            if (!document.getElementById('aladin-css')) {
                const link = document.createElement('link');
                link.id = 'aladin-css';
                link.rel = 'stylesheet';
                link.href = '/aladin.css';
                document.head.appendChild(link);
            }

            // Load JS from local file
            if (!document.getElementById('aladin-script')) {
                const script = document.createElement('script');
                script.id = 'aladin-script';
                script.src = '/aladin.js';
                script.async = true;
                script.onload = () => initAladin();
                script.onerror = () => {
                    console.error('Aladin script load failed - using fallback');
                    setLoadError('Aladin failed to load, using fallback mode');
                };
                document.head.appendChild(script);
            } else if (typeof window.A !== 'undefined' && window.A.init) {
                setTimeout(() => initAladin(), 500);
            }
        };

        const setupAladin = async () => {
            if (!containerRef.current || typeof window.A === 'undefined') {
                    hasContainer: !!containerRef.current, 
                    hasA: typeof window.A !== 'undefined' 
                });
                return;
            }

                containerRef.current.clientWidth, 'x', containerRef.current.clientHeight);

            // Clear container
            containerRef.current.innerHTML = '';

            // Get coordinates
            const raVal = parseRaToDecimal(mountRa || '0');
            const decVal = parseDecToDecimal(mountDec || '0');

            // Create Aladin instance with user settings
            const settings = aladinSettings || {
                survey: 'P/DSS2/color',
                fov: 15,
                sourceSize: 14,
                objectColor: '#ffd700',
                mountColor: '#00f0ff',
                gridColor: '#444466',
                showReticle: false,
                showZoom: true,
                showFullscreen: false,
                projection: 'SIN'
            };
            aladinRef.current = window.A.aladin(containerRef.current, {
                survey: settings.survey || 'P/DSS2/color',
                fov: fov,
                target: [raVal, decVal],
                showReticle: settings.showReticle || false,
                showLayersControl: false,
                showGotoControl: false,
                showFullscreenControl: settings.showFullscreen || false,
                showFrame: false,
                showZoomControl: settings.showZoom !== false,
                cooFrame: 'J2000',
                backgroundColor: 'rgb(5,5,15)',
                projection: settings.projection || 'SIN'
            });

            // Wait for Aladin to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Add grid
            if (showGrid) {
                try {
                    aladinRef.current.setCooGrid(true);
                    // Set grid color if supported
                    if (settings.gridColor) {
                        aladinRef.current.setCooGridColor(settings.gridColor);
                    }
                } catch (e) {
                    // Ignore grid errors
                }
            }

            // Add our catalog with user settings
            if (objects.length > 0) {
                const sources = objects.slice(0, 50).map(obj => 
                    window.A.source(obj.ra_deg, obj.dec_deg, {
                        name: `${obj.id} - ${obj.name}`,
                        id: obj.id,
                        label: showLabels ? obj.id : '',
                        type: obj.type,
                        mag: obj.magnitude,
                        constellation: obj.constellation
                    })
                );
                
                const cat = window.A.catalog({
                    name: 'Deep Sky Objects',
                    color: settings.objectColor || '#ffd700',
                    sourceSize: settings.sourceSize || 14,
                    shape: 'circle',
                    displayLabel: showLabels,
                    labelColumn: 'id',
                    onClick: 'showPopup'
                });
                
                cat.addSources(sources);
                aladinRef.current.addCatalog(cat);
                dsoCatalogRef.current = cat;
            }

            // Add mount marker
            const mountCat = window.A.catalog({
                name: 'Telescope',
                color: settings.mountColor || '#00f0ff',
                sourceSize: 18,
                shape: 'cross'
            });
            const mountSource = window.A.source(raVal, decVal, { name: 'Mount' });
            mountCat.addSources([mountSource]);
            aladinRef.current.addCatalog(mountCat);
            mountCatalogRef.current = mountCat;
            mountSourceRef.current = mountSource;

            // Track view changes for GOTO
            aladinRef.current.on('positionChanged', (ra: number, dec: number) => {
                onViewChangeRef.current?.(ra, dec);
            });

            // Click handler - select objects
            aladinRef.current.on('objectClicked', (source: any) => {
                if (!source) return;
                const data = source.data || {};
                const selected = objects.find(o => o.id === data.id);
                if (selected) {
                    onSelect(selected);
                }
            });

            // Hover handler
            aladinRef.current.on('objectHovered', (source: any) => {
                if (!source) {
                    setHoveredObject(null);
                    return;
                }
                const data = source.data || {};
                const hovered = objects.find(o => o.id === data.id);
                setHoveredObject(hovered || null);
            });

            setAladinReady(true);
        };

        initAladin();

        return () => {
            // Cleanup not needed - Aladin handles itself
        };
        // Intentionally empty: Aladin loads once on mount. All values used inside
        // (mountRa, mountDec, aladinSettings, objects, onSelect, etc.) are captured
        // as initial snapshots; they don't need re-triggering the load.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Center view on mount when trackMount toggles to true
    useEffect(() => {
        if (!aladinReady || !aladinRef.current || !trackMount || !mountRa || !mountDec) return;
        const raVal = parseRaToDecimal(mountRa);
        const decVal = parseDecToDecimal(mountDec);
        try {
            aladinRef.current.gotoRaDec(raVal, decVal);
        } catch (e) {
            console.warn('gotoRaDec error:', e);
        }
        // Only re-run when trackMount changes to true (not on every mount position tick)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trackMount, aladinReady]);

    // Update mount crosshair position in real-time (without recentering view)
    useEffect(() => {
        if (!aladinReady || !mountCatalogRef.current || !mountSourceRef.current) return;
        if (!mountRa || !mountDec) return;
        const raVal = parseRaToDecimal(mountRa);
        const decVal = parseDecToDecimal(mountDec);
        try {
            mountSourceRef.current.ra = raVal;
            mountSourceRef.current.dec = decVal;
            mountCatalogRef.current.updateSources();
        } catch (e) {
            console.warn('Mount marker update error:', e);
        }
    }, [mountRa, mountDec, aladinReady]);

    // Toggle grid
    useEffect(() => {
        if (!aladinRef.current) return;
        try {
            if (showGrid) {
                aladinRef.current.setCooGrid(true);
            } else {
                aladinRef.current.setCooGrid(false);
            }
        } catch (e) {
            console.warn('Grid toggle error:', e);
        }
    }, [showGrid]);

    // Update Aladin when settings change — non-destructive for minor changes
    useEffect(() => {
        if (!aladinReady || !aladinRef.current || !aladinSettings) return;
        
        const prevMajorRef = (window as any).__aladinMajorSettings;
        const majorKey = `${aladinSettings.survey}|${aladinSettings.projection}|${aladinSettings.showReticle}|${aladinSettings.showFullscreen}|${aladinSettings.showZoom}|${aladinSettings.fov}`;
        const needsReinit = majorKey !== prevMajorRef;
        (window as any).__aladinMajorSettings = majorKey;

        try {
            if (needsReinit) {
                const container = containerRef.current;
                if (!container) return;
                
                aladinRef.current = null;
                container.innerHTML = '';
                
                const raVal = parseRaToDecimal(mountRa || '0');
                const decVal = parseDecToDecimal(mountDec || '0');
                
                aladinRef.current = window.A.aladin(container, {
                    survey: aladinSettings.survey,
                    fov: aladinSettings.fov,
                    target: [raVal, decVal],
                    showReticle: aladinSettings.showReticle,
                    showLayersControl: false,
                    showGotoControl: false,
                    showFullscreenControl: aladinSettings.showFullscreen,
                    showFrame: false,
                    showZoomControl: aladinSettings.showZoom,
                    cooFrame: 'J2000',
                    backgroundColor: 'rgb(5,5,15)',
                    projection: aladinSettings.projection
                });
                
                setTimeout(() => {
                    if (showGrid) {
                        try { aladinRef.current.setCooGrid(true); } catch(e) {}
                    }
                    
                    if (objects.length > 0) {
                        const sources = objects.slice(0, 50).map(obj => 
                            window.A.source(obj.ra_deg, obj.dec_deg, {
                                name: `${obj.id} - ${obj.name}`,
                                id: obj.id,
                                label: showLabels ? obj.id : ''
                            })
                        );
                        
                        const cat = window.A.catalog({
                            name: 'Deep Sky Objects',
                            color: aladinSettings.objectColor,
                            sourceSize: aladinSettings.sourceSize,
                            shape: 'circle',
                            displayLabel: showLabels
                        });
                        cat.addSources(sources);
                        aladinRef.current.addCatalog(cat);
                        dsoCatalogRef.current = cat;
                    }
                    
                    const mountCat = window.A.catalog({
                        name: 'Telescope',
                        color: aladinSettings.mountColor,
                        sourceSize: 18,
                        shape: 'cross'
                    });
                    const mountSource = window.A.source(raVal, decVal, { name: 'Mount' });
                    mountCat.addSources([mountSource]);
                    aladinRef.current.addCatalog(mountCat);
                    mountCatalogRef.current = mountCat;
                    mountSourceRef.current = mountSource;
                    
                    aladinRef.current.on('objectClicked', (source: any) => {
                        if (!source) return;
                        const data = source.data || {};
                        const selected = objects.find(o => o.id === data.id);
                        if (selected) onSelect(selected);
                    });
                    
                    aladinRef.current.on('positionChanged', (ra: number, dec: number) => {
                        onViewChangeRef.current?.(ra, dec);
                    });
                    
                }, 1000);
            } else {
                // Non-destructive: update colors and sizes in-place
                if (dsoCatalogRef.current) {
                    try {
                        dsoCatalogRef.current.setColor(aladinSettings.objectColor);
                        dsoCatalogRef.current.setSourceSize(aladinSettings.sourceSize);
                    } catch(e) { console.warn('DSO catalog update error:', e); }
                }
                if (mountCatalogRef.current) {
                    try {
                        mountCatalogRef.current.setColor(aladinSettings.mountColor);
                    } catch(e) { console.warn('Mount catalog color error:', e); }
                }
                // FOV
                try {
                    aladinRef.current.setFoV(aladinSettings.fov);
                } catch(e) { console.warn('FOV update error:', e); }
                // Grid color
                try {
                    aladinRef.current.setCooGridColor(aladinSettings.gridColor);
                } catch(e) { console.warn('Grid color update error:', e); }
            }
        } catch (e) {
            console.error('Settings update error:', e);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aladinSettings, aladinReady]);

    // Handle gotoTarget - center on selected object
    useEffect(() => {
        if (!aladinReady || !aladinRef.current || !gotoTarget) return;
        
        try {
            aladinRef.current.gotoRaDec(gotoTarget.ra, gotoTarget.dec);
        } catch (e) {
            console.warn('Goto error:', e);
        }
    }, [gotoTarget, aladinReady]);

    // Remove periodic sync - user should be able to pan freely
    // Only sync when trackMount is explicitly enabled

    if (loadError) {
        return (
            <SkyFallback 
                objects={objects} 
                onSelect={onSelect}
                mountRa={mountRa}
                mountDec={mountDec}
            />
        );
    }

    return (
        <Box 
            position="relative" 
            w="full" 
            h="full"
            bg="#000510"
        >
            <div 
                ref={containerRef} 
                id="aladin-container"
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} 
            />
            {/* Hover info overlay */}
            {hoveredObject && (
                <Box 
                    position="absolute" top={3} left={3}
                    bg="rgba(10, 20, 40, 0.9)"
                    border="1px solid var(--astro-gold)"
                    borderRadius="md"
                    p={3}
                    maxW="250px"
                    zIndex={100}
                >
                    <Text color="var(--astro-gold)" fontWeight="bold">{hoveredObject.id}</Text>
                    <Text color="white" fontSize="sm">{hoveredObject.name}</Text>
                    <Text color="gray.400" fontSize="xs">{hoveredObject.type}</Text>
                    <Text color="cyan.300" fontSize="xs">Mag: {hoveredObject.magnitude}</Text>
                </Box>
            )}

            {!aladinReady && !loadError && (
                <Center position="absolute" inset={0} bg="transparent" zIndex={10}>
                    <VStack>
                        <Spinner color="var(--astro-teal)" size="xl" />
                        <Text color="var(--astro-teal)" fontSize="sm">Loading sky map...</Text>
                    </VStack>
                </Center>
            )}
        </Box>
    );
};

export const SkyMap = () => {
    const { ra, dec, alt, az, zoom, language, detectedMount, config, selectedObjectId, setSelectedObjectId } = useStargazerStore();
    const { execute } = useAstroAction();
    const [loading, setLoading] = useState(false); // Start with loading false since we use local canvas
    const [selectedObject, setSelectedObject] = useState<CelestialObject | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<CelestialObject[]>([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [gridVisible, setGridVisible] = useState(true);
    const [trackMount, setTrackMount] = useState(true);
    const [showCatalog, setShowCatalog] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [showCardinals, setShowCardinals] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showTelrad, setShowTelrad] = useState(false);
    
    // Aladin settings
    const mapContainerRef = useRef<HTMLDivElement>(null);

    const [aladinSettings, setAladinSettings] = useState({
        survey: 'P/DSS2/color',
        fov: 15,
        sourceSize: 14,
        objectColor: '#ffd700',
        mountColor: '#00f0ff',
        gridColor: '#444466',
        showReticle: false,
        showZoom: true,
        showFullscreen: false,
        projection: 'SIN',
        autoRefresh: false,
        autoRefreshInterval: 5
    });

    // No Aladin needed - using local canvas
    // Sync position handled by SkyChartCanvas via trackMount prop

    const handleSearchInput = (value: string) => {
        setSearchQuery(value);
        
        // Search in local catalog
        if (value.trim().length >= 1) {
            const query = value.toLowerCase();
            const results = CELESTIAL_CATALOG.filter(obj => 
                obj.name.toLowerCase().includes(query) ||
                obj.id.toLowerCase().includes(query) ||
                obj.constellation.toLowerCase().includes(query) ||
                obj.catalog.toLowerCase().includes(query)
            ).slice(0, 8);
            setSearchResults(results);
            setShowSearchResults(results.length > 0);
        } else {
            setSearchResults([]);
            setShowSearchResults(false);
        }
    };

    // Track current view center for GOTO function
    const [viewCenter, setViewCenter] = useState({ ra: 0, dec: 0 });
    const [obsMode, setObsMode] = useState<'visual' | 'photo'>('visual');
    const [gotoTarget, setGotoTarget] = useState<{ra: number, dec: number} | null>(null);
    
    const limitingMagnitude = obsMode === 'visual' ? 12.5 : 17;
    
    const filteredObjects = CELESTIAL_CATALOG.filter(obj => obj.magnitude <= limitingMagnitude);

    // Sync shared selection from store (ObjectFinder clicks) to map
    useEffect(() => {
        if (!selectedObjectId) return;
        // Check if currently selected object matches store - if not, it was selected from ObjectFinder
        if (selectedObject?.id !== selectedObjectId) {
            const obj = CELESTIAL_CATALOG.find(o => o.id === selectedObjectId);
            if (obj) {
                setSelectedObject(obj);
                setGotoTarget({ ra: obj.ra_deg, dec: obj.dec_deg });
            }
        }
        // Only re-run when store's selectedObjectId changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedObjectId]);

    const handleSelectResult = (obj: CelestialObject) => {
        setSearchQuery(obj.name);
        setShowSearchResults(false);
        setSelectedObject(obj);
        setSelectedObjectId(obj.id);
        setTrackMount(false);
        setGotoTarget({ ra: obj.ra_deg, dec: obj.dec_deg });
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        
        // Search in local catalog only
        const localMatch = CELESTIAL_CATALOG.find(obj => 
            obj.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            obj.id.toLowerCase() === searchQuery.toLowerCase() ||
            obj.constellation.toLowerCase().includes(searchQuery.toLowerCase())
        );
        
        if (localMatch) {
            handleSelectResult(localMatch);
        }
    };

    const handleSlewToMap = async () => {
        // Use the current view center for GOTO
        const raDeg = viewCenter.ra;
        const decDeg = viewCenter.dec;
        
        await execute('/api/indi/mount', `GOTO MAP TARGET`, {
            body: {
                action: 'goto',
                ra: raDeg,
                dec: decDeg,
                device: detectedMount,
                ip: config.astroberryUrl
            }
        });
        setTrackMount(true);
    };

    const centerOnMount = () => {
        setTrackMount(true);
    };

    const toggleGrid = () => {
        setGridVisible(prev => !prev);
    };

    // Format RA/DEC for display
    const formatRA = (raStr: string) => {
        try {
            const clean = raStr.replace(/[hms]/g, ' ').replace(/\s+/g, ' ').trim();
            return clean || 'N/A';
        } catch { return 'N/A'; }
    };
    
    const formatDEC = (decStr: string) => {
        try {
            const clean = decStr.replace(/[°'"]/g, ' ').replace(/\s+/g, ' ').trim();
            return clean || 'N/A';
        } catch { return 'N/A'; }
    };

    return (
        <Box ref={mapContainerRef} w="full" h="full" bg="black" position="relative" overflow="hidden">
            {/* Search Bar with Dropdown Results */}
            <Box 
                position="absolute" top="150px" left="50%" transform="translateX(-50%)" 
                zIndex={20} w="420px" pointerEvents="auto"
            >
                <form onSubmit={handleSearch}>
                    <Flex 
                        align="center" 
                        bg="rgba(10, 20, 40, 0.95)" 
                        borderRadius="full" 
                        border="1px solid var(--astro-teal)"
                        px={4} py={2}
                        boxShadow="0 0 20px rgba(0, 240, 255, 0.2)"
                        position="relative"
                    >
                        <Search size={20} color="var(--astro-teal)" />
                        <Input
                            placeholder={language === 'fr' ? "Rechercher (ex: M31, Orion)..." : "Search (e.g., M31, Orion)..."}
                            variant="flushed" border="none" outline="none" _focus={{ border: "none", outline: "none", boxShadow: "none" }}
                            bg="transparent" color="white" fontSize="md" ml={3}
                            value={searchQuery} onChange={(e) => handleSearchInput(e.target.value)}
                        />
                        <Button 
                            type="submit"
                            size="sm" variant="ghost" color="var(--astro-teal)" 
                            borderRadius="full" px={3} mr={2}
                        >
                            FIND
                        </Button>
                        <Button 
                            size="sm" variant="solid" bg="var(--astro-gold)" color="black"
                            _hover={{ bg: "yellow.400" }}
                            onClick={handleSlewToMap}
                            borderRadius="full" px={4} fontWeight="bold"
                        >
                            GOTO
                        </Button>
                    </Flex>
                    
                    {/* Search Results Dropdown */}
                    {showSearchResults && searchResults.length > 0 && (
                        <Box 
                            position="absolute" top="100%" left="0" right="0" 
                            bg="rgba(10, 20, 40, 0.98)" 
                            borderRadius="md" 
                            border="1px solid var(--astro-teal)"
                            mt={2}
                            maxH="300px"
                            overflowY="auto"
                            zIndex={30}
                        >
                            <VStack gap={0} align="stretch">
                                {searchResults.map((obj) => (
                                    <Box 
                                        key={obj.id}
                                        px={4} py={2}
                                        cursor="pointer"
                                        _hover={{ bg: "rgba(0, 240, 255, 0.2)" }}
                                        onClick={() => handleSelectResult(obj)}
                                        display="flex" alignItems="center" justifyContent="space-between"
                                    >
                                        <Box>
                                            <Text color="white" fontWeight="bold" fontSize="sm">
                                                {obj.id} - {obj.name}
                                            </Text>
                                            <Text color="gray.400" fontSize="xs">
                                                {obj.constellation} | {obj.type}
                                            </Text>
                                        </Box>
                                        <Badge colorScheme={obj.catalog === 'Messier' ? 'yellow' : 'blue'} fontSize="xs">
                                            {obj.catalog}
                                        </Badge>
                                    </Box>
                                ))}
                            </VStack>
                        </Box>
                    )}
                </form>
            </Box>

            {/* Floating Controls - Right side */}
            <VStack 
                position="absolute" top="150px" right="20px" zIndex={20} 
                gap={2} pointerEvents="auto"
                align="flex-end"
            >
                <Button 
                    size="xs" borderRadius="full" bg={trackMount ? "var(--astro-teal)" : "rgba(10, 20, 40, 0.8)"} 
                    color={trackMount ? "black" : "var(--astro-teal)"} border="1px solid rgba(255,255,255,0.1)"
                    onClick={centerOnMount}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    <Icon as={Navigation} boxSize={3} mr={1} />
                    {trackMount ? "TRACKING" : "CENTER"}
                </Button>
                <Button 
                    size="xs" borderRadius="full" bg={gridVisible ? "var(--astro-teal)" : "rgba(10, 20, 40, 0.8)"} 
                    color={gridVisible ? "black" : "var(--astro-teal)"} border="1px solid rgba(255,255,255,0.1)"
                    onClick={toggleGrid}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    GRID
                </Button>
                <Button 
                    size="xs" borderRadius="full" bg={showCatalog ? "var(--astro-teal)" : "rgba(10, 20, 40, 0.8)"} 
                    color={showCatalog ? "black" : "var(--astro-teal)"} border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => setShowCatalog(!showCatalog)}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    <Icon as={Star} boxSize={3} mr={1} />
                    CAT
                </Button>
                <Button 
                    size="xs" borderRadius="full" bg={showLabels ? "var(--astro-teal)" : "rgba(10, 20, 40, 0.8)"} 
                    color={showLabels ? "black" : "var(--astro-teal)"} border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => setShowLabels(!showLabels)}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    LABELS
                </Button>
                <Button 
                    size="xs" borderRadius="full" bg={showCardinals ? "var(--astro-teal)" : "rgba(10, 20, 40, 0.8)"} 
                    color={showCardinals ? "black" : "var(--astro-teal)"} border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => setShowCardinals(!showCardinals)}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    N/S/E/W
                </Button>
                <Button 
                    size="xs" borderRadius="full" bg={showTelrad ? "var(--astro-teal)" : "rgba(10, 20, 40, 0.8)"} 
                    color={showTelrad ? "black" : "var(--astro-teal)"} border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => setShowTelrad(!showTelrad)}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    <Icon as={Target} boxSize={3} mr={1} />
                    TELRAD
                </Button>
                <Button 
                    size="xs" borderRadius="full" 
                    bg={obsMode === 'visual' ? "var(--astro-gold)" : "rgba(10, 20, 40, 0.8)"} 
                    color={obsMode === 'visual' ? "black" : "var(--astro-gold)"} 
                    border="1px solid rgba(255,255,255,0.1)"
                    onClick={() => setObsMode(obsMode === 'visual' ? 'photo' : 'visual')}
                    boxShadow="0 4px 10px rgba(0,0,0,0.5)"
                >
                    {obsMode === 'visual' ? '👁️ Visual' : '📷 Photo'}
                </Button>
                <Text color="gray.400" fontSize="xs" textAlign="center">
                    Mag ≤ {limitingMagnitude}
                </Text>
                </VStack>

            {/* Aladin Settings Button */}
            <Box 
                position="absolute" 
                bottom="80px" 
                left="50%" 
                transform="translateX(-50%)"
                zIndex={50}
            >
                <Button 
                    size="lg" 
                    borderRadius="full" 
                    bg="rgba(10, 20, 40, 0.95)" 
                    color="var(--astro-teal)"
                    border="2px solid var(--astro-teal)"
                    px={8}
                    onClick={() => setShowSettings(!showSettings)}
                    boxShadow="0 0 20px rgba(0, 240, 255, 0.4)"
                    _hover={{ bg: "rgba(0, 240, 255, 0.2)", boxShadow: "0 0 30px rgba(0, 240, 255, 0.6)" }}
                    zIndex={200}
                >
                    <Icon as={Layers} boxSize={5} mr={2} />
                    {language === 'fr' ? 'PARAMÈTRES' : 'SETTINGS'}
                </Button>
            </Box>

            {/* Aladin Settings Panel */}
            {showSettings && (
                <Box 
                    position="fixed"
                    top="10%"
                    left="50%"
                    transform="translateX(-50%)"
                    w="90%"
                    maxW="500px"
                    maxH="80vh"
                    bg="rgba(10, 20, 40, 0.98)" 
                    borderRadius="xl" 
                    border="2px solid var(--astro-teal)"
                    p={6}
                    zIndex={1000}
                    boxShadow="0 0 50px rgba(0, 240, 255, 0.5)"
                    overflowY="auto"
                >
                    <HStack justify="space-between" mb={4}>
                        <Text color="var(--astro-teal)" fontWeight="bold" fontSize="xl">
                            {language === 'fr' ? 'Paramètres Aladin' : 'Aladin Settings'}
                        </Text>
                        <Button size="md" bg="red.500" color="white" onClick={() => setShowSettings(false)}>
                            ✕
                        </Button>
                    </HStack>
                    
                    <VStack gap={4} align="stretch">
                        {/* Survey */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Survey</Text>
                            <select 
                                value={aladinSettings.survey}
                                onChange={(e) => setAladinSettings({...aladinSettings, survey: e.target.value})}
                                style={{
                                    width: '100%',
                                    background: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    border: '1px solid #00f0ff',
                                    borderRadius: '4px',
                                    padding: '6px'
                                }}
                            >
                                <option value="P/DSS2/color">DSS Color</option>
                                <option value="P/DSS2/red">DSS Red</option>
                                <option value="P/2MASS/color">2MASS Color</option>
                                <option value="P/SDSS9/g">SDSS g</option>
                                <option value="P/SDSS9/r">SDSS r</option>
                                <option value="P/SDSS9/i">SDSS i</option>
                                <option value="P/GLADE">GLADE</option>
                            </select>
                        </Box>

                        {/* FOV */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Field of View (°): {aladinSettings.fov}</Text>
                            <input 
                                type="range" min="1" max="180" step="1"
                                value={aladinSettings.fov}
                                onChange={(e) => setAladinSettings({...aladinSettings, fov: parseFloat(e.target.value)})}
                                style={{ width: '100%' }}
                            />
                        </Box>

                        {/* Object Size */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Object Size: {aladinSettings.sourceSize}px</Text>
                            <input 
                                type="range" min="6" max="30" step="1"
                                value={aladinSettings.sourceSize}
                                onChange={(e) => setAladinSettings({...aladinSettings, sourceSize: parseInt(e.target.value)})}
                                style={{ width: '100%' }}
                            />
                        </Box>

                        {/* Object Color */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Object Color</Text>
                            <input 
                                type="color"
                                value={aladinSettings.objectColor}
                                onChange={(e) => setAladinSettings({...aladinSettings, objectColor: e.target.value})}
                                style={{ width: '100%', height: '30px', border: 'none' }}
                            />
                        </Box>

                        {/* Mount Color */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Mount Marker Color</Text>
                            <input 
                                type="color"
                                value={aladinSettings.mountColor}
                                onChange={(e) => setAladinSettings({...aladinSettings, mountColor: e.target.value})}
                                style={{ width: '100%', height: '30px', border: 'none' }}
                            />
                        </Box>

                        {/* Grid Color */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Grid Color</Text>
                            <input 
                                type="color"
                                value={aladinSettings.gridColor}
                                onChange={(e) => setAladinSettings({...aladinSettings, gridColor: e.target.value})}
                                style={{ width: '100%', height: '30px', border: 'none' }}
                            />
                        </Box>

                        {/* Projection */}
                        <Box>
                            <Text color="gray.400" fontSize="xs" mb={1}>Projection</Text>
                            <select 
                                value={aladinSettings.projection}
                                onChange={(e) => setAladinSettings({...aladinSettings, projection: e.target.value})}
                                style={{
                                    width: '100%',
                                    background: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    border: '1px solid #00f0ff',
                                    borderRadius: '4px',
                                    padding: '6px'
                                }}
                            >
                                <option value="SIN">Orthographic (SIN)</option>
                                <option value="MOL">Mollweide</option>
                                <option value="AIT">Hammer-Aitoff</option>
                                <option value="ZEA">Zenithal Equal Area</option>
                                <option value="MER">Mercator</option>
                            </select>
                        </Box>

                        {/* Toggles */}
                        <HStack justify="space-between">
                            <Text color="gray.300" fontSize="sm">Show Reticle</Text>
                            <input 
                                type="checkbox" 
                                checked={aladinSettings.showReticle}
                                onChange={(e) => setAladinSettings({...aladinSettings, showReticle: e.target.checked})}
                            />
                        </HStack>
                        <HStack justify="space-between">
                            <Text color="gray.300" fontSize="sm">Show Zoom Control</Text>
                            <input 
                                type="checkbox" 
                                checked={aladinSettings.showZoom}
                                onChange={(e) => setAladinSettings({...aladinSettings, showZoom: e.target.checked})}
                            />
                        </HStack>
                        <HStack justify="space-between">
                            <Text color="gray.300" fontSize="sm">Auto Refresh</Text>
                            <input 
                                type="checkbox" 
                                checked={aladinSettings.autoRefresh}
                                onChange={(e) => setAladinSettings({...aladinSettings, autoRefresh: e.target.checked})}
                            />
                        </HStack>

                        {/* Close button */}
                        <Button 
                            size="md" w="full" bg="var(--astro-teal)" color="black"
                            onClick={() => setShowSettings(false)}
                        >
                            {language === 'fr' ? 'Fermer' : 'Close'}
                        </Button>
                    </VStack>
                </Box>
            )}

            {/* Mount Status Panel - Bottom Left */}
            <Box 
                position="absolute" bottom="20px" left="20px" zIndex={20}
                bg="rgba(10, 20, 40, 0.9)" 
                borderRadius="md" 
                border="1px solid var(--astro-teal)"
                p={4}
                minW="280px"
                boxShadow="0 4px 20px rgba(0,0,0,0.5)"
            >
                <VStack align="start" gap={2}>
                    <HStack>
                        <Icon as={Target} color="var(--astro-gold)" />
                        <Text color="white" fontWeight="bold" fontSize="sm">
                            {language === 'fr' ? 'POSITION MONTURE' : 'MOUNT POSITION'}
                        </Text>
                        {trackMount && (
                            <Badge colorScheme="green" fontSize="xs">TRACKING</Badge>
                        )}
                    </HStack>
                    
                    <HStack gap={8}>
                        <Box>
                            <Text color="gray.400" fontSize="xs">RA</Text>
                            <Text color="var(--astro-teal)" fontSize="md" fontFamily="mono">
                                {formatRA(ra)}
                            </Text>
                        </Box>
                        <Box>
                            <Text color="gray.400" fontSize="xs">DEC</Text>
                            <Text color="var(--astro-teal)" fontSize="md" fontFamily="mono">
                                {formatDEC(dec)}
                            </Text>
                        </Box>
                    </HStack>
                    
                    <HStack gap={8}>
                        <Box>
                            <Text color="gray.400" fontSize="xs">Alt</Text>
                            <Text color="white" fontSize="sm" fontFamily="mono">
                                {typeof alt === 'number' ? `${alt.toFixed(1)}°` : 'N/A'}
                            </Text>
                        </Box>
                        <Box>
                            <Text color="gray.400" fontSize="xs">Az</Text>
                            <Text color="white" fontSize="sm" fontFamily="mono">
                                {typeof az === 'number' ? `${az.toFixed(1)}°` : 'N/A'}
                            </Text>
                        </Box>
                        <Box>
                            <Text color="gray.400" fontSize="xs">Mount</Text>
                            <Text color="gray.300" fontSize="xs">
                                {detectedMount || 'N/A'}
                            </Text>
                        </Box>
                    </HStack>
                </VStack>
            </Box>

            {/* Object Info - Bottom Right */}
            {selectedObject ? (
                <Box 
                    position="absolute" bottom="20px" right="20px" zIndex={20}
                    bg="rgba(10, 20, 40, 0.95)" 
                    borderRadius="lg" 
                    border="2px solid var(--astro-gold)"
                    p={4}
                    w="320px"
                    boxShadow="0 8px 40px rgba(0,0,0,0.8)"
                    backdropFilter="blur(10px)"
                >
                    <HStack justify="space-between" mb={2}>
                        <VStack align="start" gap={0}>
                            <Text color="var(--astro-gold)" fontSize="lg" fontWeight="bold">
                                {selectedObject.id}
                            </Text>
                            <Text color="white" fontSize="sm" fontWeight="bold">
                                {selectedObject.name}
                            </Text>
                        </VStack>
                        <Badge colorScheme={selectedObject.catalog === 'Messier' ? 'yellow' : 'blue'}>
                            {selectedObject.catalog}
                        </Badge>
                    </HStack>
                    
                    <VStack align="start" gap={1} fontSize="xs" color="gray.300">
                        <HStack><Text color="gray.500">Type:</Text><Text>{selectedObject.type}</Text></HStack>
                        <HStack><Text color="gray.500">Constellation:</Text><Text>{selectedObject.constellation}</Text></HStack>
                        <HStack><Text color="gray.500">Magnitude:</Text><Text color={selectedObject.magnitude < 6 ? 'cyan.300' : 'white'}>
                            {selectedObject.magnitude}
                        </Text></HStack>
                        <HStack><Text color="gray.500">Taille:</Text><Text>{selectedObject.size_arcmin || 'N/A'}</Text></HStack>
                        <HStack><Text color="gray.500">Difficulté:</Text>
                            <Badge colorScheme={selectedObject.difficulty === 'Easy' ? 'green' : selectedObject.difficulty === 'Medium' ? 'yellow' : 'red'} size="sm">
                                {selectedObject.difficulty}
                            </Badge>
                        </HStack>
                    </VStack>
                    
                    <Box borderTop="1px solid rgba(255,255,255,0.1)" mt={2} pt={2}>
                        <Text color="gray.400" fontSize="xs" mb={1}>Coordonnées (J2000)</Text>
                        <HStack gap={4} fontSize="xs" fontFamily="mono">
                            <VStack align="start" gap={0}>
                                <Text color="gray.500">RA</Text>
                                <Text color="var(--astro-teal)">{selectedObject.ra}</Text>
                            </VStack>
                            <VStack align="start" gap={0}>
                                <Text color="gray.500">DEC</Text>
                                <Text color="var(--astro-gold)">{selectedObject.dec}</Text>
                            </VStack>
                        </HStack>
                    </Box>
                    
                    {selectedObject.description && (
                        <Box borderTop="1px solid rgba(255,255,255,0.1)" mt={2} pt={2}>
                            <Text color="gray.400" fontSize="xs">{selectedObject.description}</Text>
                        </Box>
                    )}
                    
                    <HStack borderTop="1px solid rgba(255,255,255,0.1)" mt={3} pt={3}>
                        <Button 
                            size="sm" flex={1} bg="var(--astro-gold)" color="black" 
                            _hover={{ bg: "yellow.400" }}
                            onClick={() => {
                                // Center is automatic - the canvas tracks selected objects
                                setTrackMount(false);
                            }}
                        >
                            <Icon as={Navigation} boxSize={3} mr={1} />
                            {language === 'fr' ? 'CENTRER' : 'CENTER'}
                        </Button>
                        <Button 
                            size="sm" flex={1} bg="green.500" color="white" 
                            _hover={{ bg: "green.600" }}
                            onClick={async () => {
                                await execute('/api/indi/mount', `GOTO ${selectedObject.id}`, {
                                    body: {
                                        action: 'goto',
                                        ra: selectedObject.ra_deg,
                                        dec: selectedObject.dec_deg,
                                        device: detectedMount,
                                        ip: config.astroberryUrl
                                    }
                                });
                            }}
                        >
                            <Icon as={Target} boxSize={3} mr={1} />
                            GOTO
                        </Button>
                        <Button 
                            size="sm" variant="ghost" color="white" 
                            onClick={() => {
                                setSelectedObject(null);
                                setSelectedObjectId(null);
                            }}
                        >
                            ✕
                        </Button>
                    </HStack>
                </Box>
            ) : (
                <Box 
                    position="absolute" bottom="20px" right="20px" zIndex={20}
                    bg="rgba(10, 20, 40, 0.9)" 
                    borderRadius="md" 
                    border="1px solid var(--astro-gold)"
                    p={3}
                    maxW="250px"
                    boxShadow="0 4px 20px rgba(0,0,0,0.5)"
                >
                    <Text color="var(--astro-gold)" fontSize="xs" mb={1}>
                        {language === 'fr' ? 'OBJET SELECTIONNÉ' : 'SELECTED OBJECT'}
                    </Text>
                    <Text color="white" fontSize="sm">
                        {language === 'fr' ? 'Cliquez sur un objet' : 'Click on an object'}
                    </Text>
                </Box>
            )}

            {/* Hover is handled by SkyChartCanvas - no separate panel needed */}

            {/* Cardinal Directions */}
            {showCardinals && (
                <>
                    <Text position="absolute" top="20px" left="50%" transform="translateX(-50%)" 
                        color="rgba(255,255,255,0.5)" fontSize="md" fontWeight="bold" pointerEvents="none">
                        N
                    </Text>
                    <Text position="absolute" bottom="20px" left="50%" transform="translateX(-50%)" 
                        color="rgba(255,255,255,0.5)" fontSize="md" fontWeight="bold" pointerEvents="none">
                        S
                    </Text>
                    <Text position="absolute" left="20px" top="50%" transform="translateY(-50%)" 
                        color="rgba(255,255,255,0.5)" fontSize="md" fontWeight="bold" pointerEvents="none">
                        W
                    </Text>
                    <Text position="absolute" right="20px" top="50%" transform="translateY(-50%)" 
                        color="rgba(255,255,255,0.5)" fontSize="md" fontWeight="bold" pointerEvents="none">
                        E
                    </Text>
                </>
            )}

            {loading && (
                <Center position="absolute" inset="0" zIndex={5} bg="black">
                    <VStack gap={4}>
                        <Spinner color="var(--astro-teal)" size="xl" borderWidth="4px" />
                        <Text color="var(--astro-teal)" fontSize="12px" className="hud-font">INITIALIZING SKY ENGINE...</Text>
                    </VStack>
                </Center>
            )}

            {/* Aladin Sky Map */}
            <AladinSkyMap 
                objects={showCatalog ? filteredObjects : []}
                onSelect={handleSelectResult}
                onViewChange={(r, d) => setViewCenter({ ra: r, dec: d })}
                mountRa={ra}
                mountDec={dec}
                showGrid={gridVisible}
                showLabels={showLabels}
                showCardinals={showCardinals}
                trackMount={trackMount}
                onTrackChange={setTrackMount}
                fov={aladinSettings.fov / Math.max(1, zoom)}
                aladinSettings={aladinSettings}
                gotoTarget={gotoTarget}
            />
            
            {/* Telrad finder circles */}
            {showTelrad && (
                <Box 
                    position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" 
                    pointerEvents="none" zIndex={6}
                    w="100%" h="100%"
                >
                    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
                        {(() => {
                            const fov = aladinSettings.fov || 15;
                            // Approximate pixel scale: assume ~1000px effective viewport width
                            const scale = 1000 / Math.max(fov, 0.5);
                            const radii = [0.5, 1, 2]; // degrees for Telrad rings
                            return radii.map((deg, i) => {
                                const r = deg * scale;
                                return (
                                    <circle
                                        key={i}
                                        cx="50%" cy="50%"
                                        r={r}
                                        fill="none"
                                        stroke={i === 0 ? "rgba(0, 240, 255, 0.6)" : i === 1 ? "rgba(0, 240, 255, 0.4)" : "rgba(0, 240, 255, 0.25)"}
                                        strokeWidth={i === 0 ? 1.5 : 1}
                                        strokeDasharray={i === 0 ? "none" : i === 1 ? "4,4" : "2,4"}
                                    />
                                );
                            });
                        })()}
                    </svg>
                    {/* Label */}
                    <Box position="absolute" bottom="calc(50% - 2deg * 1000 / 15 - 20px)" left="50%" transform="translateX(-50%)">
                        <Text color="var(--astro-teal)" fontSize="10px" opacity={0.6} whiteSpace="nowrap">
                            {aladinSettings.fov}° FOV
                        </Text>
                    </Box>
                </Box>
            )}

            {/* Subtle crosshair overlay */}
            <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" pointerEvents="none" zIndex={6}>
                <VStack gap={2}>
                    <Icon as={Crosshair} boxSize="80px" color="var(--astro-gold)" opacity={0.15} />
                </VStack>
            </Box>
        </Box>
    );
};

