// src/components/viewport/SkyMap.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Search, Crosshair, Layers, Target, Navigation, Camera, Globe } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { useGoTo } from "@/hooks/useGoTo";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import { notification } from "@/lib/notificationService";

declare global {
    interface Window {
        A: any;
    }
}

const SURVEY_URLS: Record<string, string> = {
    'P/DSS2/color': '/api/proxy/aladin/alasky/DSS/DSSColor',
    'P/DSS2/red': '/api/proxy/aladin/alaskybis/DSS/DSS2Merged',
    'P/2MASS/color': '/api/proxy/aladin/alaskybis/2MASS/Color',
    'P/SDSS9/g': '/api/proxy/aladin/alasky/SDSS/DR9/band-g',
    'P/SDSS9/r': '/api/proxy/aladin/alasky/SDSS/DR9/band-r',
    'P/SDSS9/i': '/api/proxy/aladin/alasky/SDSS/DR9/band-i',
    'P/GLADE': '/api/proxy/aladin/alasky/GLADE'
};

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
const SkyFallback = ({ objects, onSelect, mountRa, mountDec, resetViewSignal, showGrid, showLabels, onViewChange }: {
    objects: CelestialObject[],
    onSelect: (obj: CelestialObject) => void,
    mountRa?: string,
    mountDec?: string,
    resetViewSignal?: number,
    showGrid?: boolean,
    showLabels?: boolean,
    onViewChange?: (ra: number, dec: number) => void,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mounted, setMounted] = useState(false);
    const [hoveredObj, setHoveredObj] = useState<CelestialObject | null>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

    // Pan/zoom state
    const mountRaDeg = parseRaToDecimal(mountRa || '0');
    const mountDecDeg = parseDecToDecimal(mountDec || '0');
    const [viewCenter, setViewCenter] = useState({ raDeg: mountRaDeg, decDeg: mountDecDeg });
    const [fovDeg, setFovDeg] = useState(60);
    const dragRef = useRef<{ x: number; y: number } | null>(null);

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

    // Reset view to mount position when signal fires
    useEffect(() => {
        if (resetViewSignal === undefined) return;
        setViewCenter({ raDeg: parseRaToDecimal(mountRa || '0'), decDeg: parseDecToDecimal(mountDec || '0') });
        setFovDeg(60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetViewSignal]);

    // Propagate pan position so GOTO MAP TARGET works with fallback canvas
    useEffect(() => {
        onViewChange?.(viewCenter.raDeg, viewCenter.decDeg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewCenter]);

    // Project a RA/Dec to canvas coordinates using viewCenter and fovDeg
    const project = useCallback((raDeg: number, decDeg: number) => {
        const raNorm = (((raDeg - viewCenter.raDeg + 180 + 360) % 360) - 180) / fovDeg + 0.5;
        const decNorm = (decDeg - viewCenter.decDeg) / fovDeg + 0.5;
        return {
            x: raNorm * canvasSize.w,
            y: (1 - decNorm) * canvasSize.h
        };
    }, [viewCenter, fovDeg, canvasSize]);

    // Convert mount position to canvas coords using projection
    const getMountPosition = useCallback(() => {
        if (!mountRa || !mountDec) return { x: canvasSize.w / 2, y: canvasSize.h / 2 };
        const raVal = parseRaToDecimal(mountRa);
        const decVal = parseDecToDecimal(mountDec);
        return project(raVal, decVal);
    }, [mountRa, mountDec, canvasSize, project]);

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
        if (showGrid !== false) {
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
        }

        const mountPos = getMountPosition();

        // Draw objects from catalog
        objects.forEach((obj) => {
            // Project using equirectangular centered on viewCenter
            const { x, y } = project(obj.ra_deg, obj.dec_deg);

            // Skip if out of view
            if (x < -50 || x > canvasSize.w + 50 || y < -50 || y > canvasSize.h + 50) return;

            const isHovered = hoveredObj?.id === obj.id;
            const mag = obj.magnitude;
            const fovScale = Math.max(0.3, Math.min(2, 60 / fovDeg));
            const size = Math.max(2, Math.min(12, (10 - mag * 0.8) * fovScale));
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
            if (showLabels !== false && (mag < 6 || isHovered)) {
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

    }, [objects, canvasSize, hoveredObj, mountRa, mountDec, getMountPosition, project, fovDeg, showGrid, showLabels]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Find clicked object
        objects.forEach((obj) => {
            const { x: ox, y: oy } = project(obj.ra_deg, obj.dec_deg);
            const dist = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2);
            if (dist < 20) {
                onSelect(obj);
            }
        });
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        dragRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMovePan = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Pan logic
        if (dragRef.current) {
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            dragRef.current = { x: e.clientX, y: e.clientY };
            // dx pixels → delta RA, dy pixels → delta Dec
            const deltaRa = -(dx / canvasSize.w) * fovDeg;
            const deltaDec = (dy / canvasSize.h) * fovDeg;
            setViewCenter(prev => ({
                raDeg: (prev.raDeg + deltaRa + 360) % 360,
                decDeg: Math.max(-90, Math.min(90, prev.decDeg + deltaDec))
            }));
        }

        // Hover logic
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        let found: CelestialObject | null = null;
        objects.forEach((obj) => {
            const { x: ox, y: oy } = project(obj.ra_deg, obj.dec_deg);
            const dist = Math.sqrt((x - ox) ** 2 + (y - oy) ** 2);
            if (dist < 20) found = obj;
        });
        setHoveredObj(found);
    };

    const handleMouseUp = () => { dragRef.current = null; };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        setFovDeg(prev => Math.max(2, Math.min(180, prev * factor)));
    };

    if (!mounted) return (
        <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--astro-teal)', borderTopColor: 'transparent' }} />
        </div>
    );

    return (
        <div className="relative w-full h-full" id="fallback-canvas-container">
            <canvas
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    cursor: dragRef.current ? 'grabbing' : 'grab'
                }}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onMouseMove={handleMouseMovePan}
            />
            {/* Hover info */}
            {hoveredObj && (
                <div
                    className="absolute top-2 left-2 p-3 rounded-md"
                    style={{ background: 'rgba(10, 20, 40, 0.9)', border: '1px solid var(--astro-teal)' }}
                >
                    <p className="font-bold text-sm" style={{ color: 'var(--astro-gold)' }}>{hoveredObj.id} - {hoveredObj.name}</p>
                    <p className="text-white text-xs">{hoveredObj.constellation} | {hoveredObj.type}</p>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>Mag: {hoveredObj.magnitude}</p>
                </div>
            )}
        </div>
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
    gotoTarget,
    resetViewSignal
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
    gotoTarget?: { ra: number, dec: number } | null,
    resetViewSignal?: number
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const aladinRef = useRef<any>(null);
    const [aladinReady, setAladinReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hoveredObject, setHoveredObject] = useState<CelestialObject | null>(null);
    const [isOnline, setIsOnline] = useState<boolean | null>(null);
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

    // Check if Strasbourg is reachable through our proxy to run in offline mode if needed
    useEffect(() => {
        const checkOnline = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1200);
                const res = await fetch('/api/proxy/aladin/alasky/DSS/DSSColor/properties', {
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                setIsOnline(res.ok);
            } catch (e: unknown) {
                console.warn('Strasbourg server is unreachable, configuring Aladin in offline mode (survey: null).');
                setIsOnline(false);
            }
        };
        checkOnline();
    }, []);

    // Load Aladin Lite with retry logic
    useEffect(() => {
        if (isOnline === null) return; // Wait for connectivity check

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
            if (typeof window.A !== 'undefined') {
                try {
                    if (window.A.init) {
                        await window.A.init;
                    }
                    await setupAladin();
                    return;
                } catch (e: unknown) {
                    // Surface the error so we fall back to canvas immediately
                    setLoadError(`Aladin init failed: ${e}`);
                    return;
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
                    setLoadError('Aladin failed to load, using fallback mode');
                };
                document.head.appendChild(script);
            } else {
                setTimeout(() => initAladin(), 500);
            }
        };

        const setupAladin = async () => {
            if (!containerRef.current || typeof window.A === 'undefined') {
                return;
            }

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
            const selectedSurvey = settings.survey || 'P/DSS2/color';
            const surveyUrl = isOnline ? (SURVEY_URLS[selectedSurvey] || selectedSurvey) : null;

            aladinRef.current = window.A.aladin(containerRef.current, {
                survey: surveyUrl,
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
                } catch (e: unknown) {
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
        } catch (e: unknown) {
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
            if (typeof mountCatalogRef.current.updateSources === 'function') {
                mountSourceRef.current.ra = raVal;
                mountSourceRef.current.dec = decVal;
                mountCatalogRef.current.updateSources();
            } else {
                // Fallback for Aladin v3 which doesn't use updateSources
                if (typeof mountCatalogRef.current.removeAllSources === 'function') {
                    mountCatalogRef.current.removeAllSources();
                } else if (mountSourceRef.current && typeof mountCatalogRef.current.remove === 'function') {
                    try {
                        mountCatalogRef.current.remove(mountSourceRef.current);
                    } catch (err: unknown) {
                        console.warn('Error calling catalog.remove:', err);
                    }
                }
                mountSourceRef.current = window.A.source(raVal, decVal, { name: 'Mount' });
                mountCatalogRef.current.addSources([mountSourceRef.current]);
            }
        } catch (e: unknown) {
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
        } catch (e: unknown) {
            console.warn('Grid toggle error:', e);
        }
    }, [showGrid]);

    // Update Aladin when settings change — non-destructive for minor changes
    useEffect(() => {
        if (!aladinReady || !aladinRef.current || !aladinSettings || isOnline === null) return;

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

                const selectedSurvey = aladinSettings.survey;
                const surveyUrl = isOnline ? (SURVEY_URLS[selectedSurvey] || selectedSurvey) : null;

                aladinRef.current = window.A.aladin(container, {
                    survey: surveyUrl,
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
                        try { aladinRef.current.setCooGrid(true); } catch(e: unknown) {}
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
                    } catch(e: unknown) { console.warn('DSO catalog update error:', e); }
                }
                if (mountCatalogRef.current) {
                    try {
                        mountCatalogRef.current.setColor(aladinSettings.mountColor);
                    } catch(e: unknown) { console.warn('Mount catalog color error:', e); }
                }
                // FOV
                try {
                    aladinRef.current.setFoV(aladinSettings.fov);
                } catch(e: unknown) { console.warn('FOV update error:', e); }
                // Grid color
                try {
                    aladinRef.current.setCooGridColor(aladinSettings.gridColor);
                } catch(e: unknown) { console.warn('Grid color update error:', e); }
            }
        } catch (e: unknown) {
            notification.error(`AladinSkyMap: Settings update error: ${e instanceof Error ? e.message : String(e)}`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aladinSettings, aladinReady]);

    // Handle gotoTarget - center on selected object
    useEffect(() => {
        if (!aladinReady || !aladinRef.current || !gotoTarget) return;

        try {
            aladinRef.current.gotoRaDec(gotoTarget.ra, gotoTarget.dec);
        } catch (e: unknown) {
            console.warn('Goto error:', e);
        }
    }, [gotoTarget, aladinReady]);

    // Remove periodic sync - user should be able to pan freely
    // Only sync when trackMount is explicitly enabled

    // Always show the canvas fallback while Aladin loads or if it fails.
    // Aladin mounts invisibly on top; once ready it becomes visible.
    return (
        <div className="relative w-full h-full" style={{ background: '#000510' }}>
            {/* Canvas fallback — always visible until Aladin is ready */}
            {!aladinReady && (
                <div className="absolute inset-0" style={{ zIndex: 1 }}>
                    <SkyFallback
                        objects={objects}
                        onSelect={onSelect}
                        mountRa={mountRa}
                        mountDec={mountDec}
                        resetViewSignal={resetViewSignal}
                        showGrid={showGrid}
                        showLabels={showLabels}
                        onViewChange={onViewChangeRef.current}
                    />
                </div>
            )}

            {/* Aladin container — hidden until ready, then shown above canvas */}
            {!loadError && (
                <div
                    ref={containerRef}
                    id="aladin-container"
                    style={{
                        width: '100%', height: '100%',
                        position: 'absolute', top: 0, left: 0,
                        opacity: aladinReady ? 1 : 0,
                        pointerEvents: aladinReady ? 'auto' : 'none',
                        zIndex: 2,
                    }}
                />
            )}

            {/* Hover info overlay (Aladin) */}
            {hoveredObject && aladinReady && (
                <div
                    className="absolute rounded-md p-3"
                    style={{
                        top: 12, left: 12,
                        background: 'rgba(10, 20, 40, 0.9)',
                        border: '1px solid var(--astro-gold)',
                        maxWidth: 250,
                        zIndex: 100,
                    }}
                >
                    <p className="font-bold text-sm" style={{ color: 'var(--astro-gold)' }}>{hoveredObject.id}</p>
                    <p className="text-white text-sm">{hoveredObject.name}</p>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>{hoveredObject.type}</p>
                    <p className="text-xs" style={{ color: '#67e8f9' }}>Mag: {hoveredObject.magnitude}</p>
                </div>
            )}
        </div>
    );
};

export const SkyMap = () => {
    const { ra, dec, alt, az, zoom, language, detectedMount, config, selectedObjectId, setSelectedObjectId, liveViewMode, setLiveViewMode } = useStargazerStore();
    const { execute } = useAstroAction();
    const goTo = useGoTo();
    const [loading, setLoading] = useState(false);
    // Debounce GoTo: évite le flood sur les clics rapides sur la carte céleste
    const lastGotoRef = useRef<number>(0);
    const executeGoto = useCallback(async (ra_deg: number, dec_deg: number, _label: string) => {
        const now = Date.now();
        if (now - lastGotoRef.current < 600) return; // 600ms gate
        lastGotoRef.current = now;
        const ok = await goTo.goto(ra_deg, dec_deg);
        if (ok) goTo.waitForSlew();
    }, [goTo]);
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
    const [resetViewSignal, setResetViewSignal] = useState(0);

    // Gemini sequence modal state
    const [showSequenceModal, setShowSequenceModal] = useState(false);
    const [sequenceLoading, setSequenceLoading] = useState(false);
    const [sequenceParams, setSequenceParams] = useState<{
        lights: { count: number; exposure: number; iso: number };
        darks: { count: number; exposure: number };
        flats: { count: number; exposure: number };
        bias: { count: number };
        stacking_method: string;
        notes: string;
    } | null>(null);
    const [gotoTarget, setGotoTarget] = useState<{ra: number, dec: number} | null>(null);

    // Moon phase (0=new, 0.5=full) — simple synodic approximation
    const moonPhase = (() => {
        const d = new Date();
        const known = new Date(2000, 0, 6); // known new moon Jan 6 2000
        const elapsed = (d.getTime() - known.getTime()) / 86400000;
        return ((elapsed % 29.53) / 29.53 + 1) % 1; // 0..1
    })();
    // Limiting magnitude: full moon reduces sky transparency by ~3 mag visually
    const moonPenalty = obsMode === 'visual' ? moonPhase * 3 : moonPhase * 2;
    const limitingMagnitude = (obsMode === 'visual' ? 12.5 : 17) - moonPenalty;

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
        await executeGoto(viewCenter.ra, viewCenter.dec, 'GOTO MAP TARGET');
        setTrackMount(true);
    };

    const centerOnMount = () => {
        setTrackMount(true);
    };

    const launchSequenceAI = async () => {
        if (!selectedObject) return;
        setShowSequenceModal(true);
        setSequenceLoading(true);
        setSequenceParams(null);

        const cloudCover = 30; // fallback
        const prompt = `Équipement: NexStar 4SE (100mm f/13) + Canon EOS 600D APS-C
Objet: ${selectedObject.id} - ${selectedObject.name} (${selectedObject.type}, constellation ${selectedObject.constellation}, magnitude ${selectedObject.magnitude}, taille ${selectedObject.size_arcmin || 'N/A'}')
Conditions météo actuelles: couverture nuageuse ${cloudCover}%
Position actuelle monture: Alt ${alt.toFixed(1)}°, Az ${az.toFixed(1)}°

Génère une séquence de capture optimale au format JSON strict:
{
  "lights": { "count": <nombre>, "exposure": <secondes>, "iso": <valeur ISO> },
  "darks": { "count": <nombre>, "exposure": <même que lights> },
  "flats": { "count": <nombre>, "exposure": 0 },
  "bias": { "count": <nombre> },
  "stacking_method": "<Kappa-Sigma|Median|Average>",
  "notes": "<conseil court>"
}`;

        const defaultParams = {
            lights: { count: 30, exposure: 120, iso: 800 },
            darks: { count: 20, exposure: 120 },
            flats: { count: 20, exposure: 0 },
            bias: { count: 50 },
            stacking_method: 'Kappa-Sigma',
            notes: 'Paramètres par défaut — configurez votre clé Gemini pour des recommandations personnalisées.'
        };

        try {
            const res = await fetch('/api/ai/sky', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
                signal: AbortSignal.timeout(35000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const parsed = await res.json();
            setSequenceParams(parsed);
        } catch (e: unknown) {
            notification.error("Recommandations IA indisponibles", {
                source: "SkyMap",
                description: e instanceof Error ? e.message : String(e),
            });
            setSequenceParams(defaultParams);
        } finally {
            setSequenceLoading(false);
        }
    };

    const launchSequence = async () => {
        if (!sequenceParams) return;
        try {
            await fetch('/api/indi/sequence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sequenceParams)
            });
        } catch (e: unknown) {
            notification.error(`SkyMap: Sequence launch error: ${e instanceof Error ? e.message : String(e)}`);
        }
        setShowSequenceModal(false);
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

    // Hover state for toggle buttons
    const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
    const setHover = (key: string, val: boolean) => setHoverStates(prev => ({ ...prev, [key]: val }));

    return (
        /* Flex-column layout: control bar on top (in-flow), map below.
           No position:absolute on controls → zero bleed into side columns. */
        <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: 'black' }}>

            {/* ── TOP BAR: search + toggles (normal flow, no z-index fighting) ── */}
            <div
                className="flex-shrink-0 relative px-3 py-2"
                style={{
                    background: 'rgba(5, 8, 20, 0.97)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                <div className="flex items-center gap-2 flex-nowrap">
                    {/* Live/Sky mode buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: liveViewMode === "NASA" ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: liveViewMode === "NASA" ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setLiveViewMode("NASA")}
                        >
                            <Globe size={12} />SKY
                        </button>
                        <button
                            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: liveViewMode === "CANON" ? 'var(--astro-gold)' : 'rgba(10,20,40,0.8)',
                                color: liveViewMode === "CANON" ? 'black' : 'var(--astro-gold)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setLiveViewMode("CANON")}
                        >
                            <Camera size={12} />LIVE
                        </button>
                    </div>

                    {/* Search form */}
                    <form onSubmit={handleSearch} className="flex-1 min-w-0">
                        <div
                            className="flex items-center px-3 py-1 rounded-full gap-2"
                            style={{
                                background: 'rgba(10, 20, 40, 0.95)',
                                border: '1px solid var(--astro-teal)',
                                boxShadow: '0 0 12px rgba(0, 240, 255, 0.15)',
                            }}
                        >
                            <Search size={16} style={{ color: 'var(--astro-teal)', flexShrink: 0 }} />
                            <input
                                className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none border-none"
                                placeholder={language === 'fr' ? "Rechercher (M31, Orion…)" : "Search (M31, Orion…)"}
                                value={searchQuery}
                                onChange={(e) => handleSearchInput(e.target.value)}
                            />
                            <button
                                type="submit"
                                className="text-xs px-2 rounded-full"
                                style={{ color: 'var(--astro-teal)', background: 'transparent' }}
                            >
                                FIND
                            </button>
                            <button
                                type="button"
                                className="text-xs font-bold px-3 py-1 rounded-full"
                                style={{ background: 'var(--astro-gold)', color: 'black' }}
                                onClick={handleSlewToMap}
                            >
                                GOTO
                            </button>
                        </div>
                    </form>

                    {/* Toggle buttons — all in-flow, no absolute positioning */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: trackMount ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: trackMount ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={centerOnMount}
                        >
                            <Navigation size={12} />
                            {trackMount ? "TRACK" : "CENTER"}
                        </button>
                        <button
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: gridVisible ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: gridVisible ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={toggleGrid}
                        >GRID</button>
                        <button
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: showCatalog ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: showCatalog ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setShowCatalog(!showCatalog)}
                        >CAT</button>
                        <button
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: showLabels ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: showLabels ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setShowLabels(!showLabels)}
                        >LABELS</button>
                        <button
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: showCardinals ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: showCardinals ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setShowCardinals(!showCardinals)}
                        >N/S/E/W</button>
                        <button
                            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: showTelrad ? 'var(--astro-teal)' : 'rgba(10,20,40,0.8)',
                                color: showTelrad ? 'black' : 'var(--astro-teal)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setShowTelrad(!showTelrad)}
                        >
                            <Target size={12} />TELRAD
                        </button>
                        <button
                            className="px-2 py-1 rounded-full text-xs font-medium"
                            style={{
                                background: obsMode === 'visual' ? 'var(--astro-gold)' : 'rgba(10,20,40,0.8)',
                                color: obsMode === 'visual' ? 'black' : 'var(--astro-gold)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                            onClick={() => setObsMode(obsMode === 'visual' ? 'photo' : 'visual')}
                        >
                            {obsMode === 'visual' ? 'Visual' : 'Photo'}
                        </button>
                        <span className="text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>≤{limitingMagnitude.toFixed(1)}</span>
                        <button
                            className="p-1 rounded-full text-xs"
                            style={{
                                background: 'rgba(10,20,40,0.8)',
                                color: 'var(--astro-teal)',
                                border: '1px solid var(--astro-teal)',
                            }}
                            onClick={() => setShowSettings(!showSettings)}
                        >
                            <Layers size={12} />
                        </button>
                        <button
                            className="px-2 py-1 rounded-full text-xs"
                            style={{
                                background: 'rgba(10,20,40,0.8)',
                                color: 'white',
                                border: '1px solid rgba(255,255,255,0.2)',
                            }}
                            onClick={() => setResetViewSignal(s => s + 1)}
                            title="Reset view to mount position"
                        >
                            ⊕ RESET
                        </button>
                    </div>
                </div>

                {/* Search Results Dropdown — positioned relative to the top bar only */}
                {showSearchResults && searchResults.length > 0 && (
                    <div
                        className="absolute rounded-md mt-1 overflow-y-auto"
                        style={{
                            top: '100%', left: 12, width: 420,
                            background: 'rgba(10, 20, 40, 0.98)',
                            border: '1px solid var(--astro-teal)',
                            maxHeight: 280,
                            zIndex: 30,
                        }}
                    >
                        <div className="flex flex-col">
                            {searchResults.map((obj) => (
                                <div
                                    key={obj.id}
                                    className="flex items-center justify-between px-4 py-2 cursor-pointer"
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 240, 255, 0.15)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    onClick={() => handleSelectResult(obj)}
                                >
                                    <div>
                                        <p className="text-white font-bold text-sm">{obj.id} — {obj.name}</p>
                                        <p className="text-xs" style={{ color: '#9ca3af' }}>{obj.constellation} | {obj.type}</p>
                                    </div>
                                    <span
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{
                                            background: obj.catalog === 'Messier' ? 'rgba(234,179,8,0.2)' : 'rgba(59,130,246,0.2)',
                                            color: obj.catalog === 'Messier' ? '#fbbf24' : '#60a5fa',
                                            border: `1px solid ${obj.catalog === 'Messier' ? 'rgba(234,179,8,0.4)' : 'rgba(59,130,246,0.4)'}`,
                                        }}
                                    >
                                        {obj.catalog}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── MAP AREA (flex:1, proper containing block for all overlays) ── */}
            <div ref={mapContainerRef} className="flex-1 relative overflow-hidden" style={{ background: '#000510' }}>

            {/* Object Info - Bottom Center */}
            {selectedObject && (() => {
                const cloudCover = 30;
                const mag = selectedObject.magnitude;
                // Observability badges
                const visualOk = alt > 15 && mag <= 11.5 && cloudCover < 70;
                const visualLimit = alt > 10 && mag <= 12.5 && cloudCover < 80;
                const photoOk = alt > 20 && mag <= 15 && cloudCover < 50;
                const photoLimit = alt > 15 && mag <= 16 && cloudCover < 65;
                const visualBadge = visualOk
                    ? { label: 'OBSERVABLE', bg: 'rgba(34,197,94,0.2)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' }
                    : visualLimit
                    ? { label: 'LIMITE', bg: 'rgba(249,115,22,0.2)', color: '#fb923c', border: 'rgba(249,115,22,0.4)' }
                    : { label: 'NON VISIBLE', bg: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'rgba(239,68,68,0.4)' };
                const photoBadge = photoOk
                    ? { label: 'PHOTO OK', bg: 'rgba(34,197,94,0.2)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' }
                    : photoLimit
                    ? { label: 'PHOTO LIMITE', bg: 'rgba(249,115,22,0.2)', color: '#fb923c', border: 'rgba(249,115,22,0.4)' }
                    : { label: 'PHOTO NON', bg: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'rgba(239,68,68,0.4)' };
                const catalogBadgeStyle = {
                    background: selectedObject.catalog === 'Messier' ? 'rgba(234,179,8,0.2)' : 'rgba(59,130,246,0.2)',
                    color: selectedObject.catalog === 'Messier' ? '#fbbf24' : '#60a5fa',
                    border: `1px solid ${selectedObject.catalog === 'Messier' ? 'rgba(234,179,8,0.4)' : 'rgba(59,130,246,0.4)'}`,
                };
                const difficultyStyle = selectedObject.difficulty === 'Easy'
                    ? { background: 'rgba(34,197,94,0.2)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' }
                    : selectedObject.difficulty === 'Medium'
                    ? { background: 'rgba(234,179,8,0.2)', color: '#fbbf24', border: 'rgba(234,179,8,0.4)' }
                    : { background: 'rgba(239,68,68,0.2)', color: '#f87171', border: 'rgba(239,68,68,0.4)' };
                return (
                <div
                    className="absolute rounded-lg p-4"
                    style={{
                        bottom: 20, left: '50%', transform: 'translateX(-50%)',
                        zIndex: 10,
                        background: 'rgba(10, 20, 40, 0.95)',
                        border: '2px solid var(--astro-gold)',
                        width: 360,
                        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                        backdropFilter: 'blur(10px)',
                    }}
                >
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex flex-col gap-0">
                            <p className="font-bold text-lg" style={{ color: 'var(--astro-gold)' }}>
                                {selectedObject.id}
                            </p>
                            <p className="text-white text-sm font-bold">
                                {selectedObject.name}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-xs px-2 py-0.5 rounded font-medium" style={catalogBadgeStyle}>
                                {selectedObject.catalog}
                            </span>
                            <div className="flex items-center gap-1">
                                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: visualBadge.bg, color: visualBadge.color, border: `1px solid ${visualBadge.border}`, fontSize: 9 }}>{visualBadge.label}</span>
                                <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: photoBadge.bg, color: photoBadge.color, border: `1px solid ${photoBadge.border}`, fontSize: 9 }}>{photoBadge.label}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 text-xs" style={{ color: '#d1d5db' }}>
                        <div className="flex items-center gap-1"><span style={{ color: '#6b7280' }}>Type:</span><span>{selectedObject.type}</span></div>
                        <div className="flex items-center gap-1"><span style={{ color: '#6b7280' }}>Constellation:</span><span>{selectedObject.constellation}</span></div>
                        <div className="flex items-center gap-1">
                            <span style={{ color: '#6b7280' }}>Magnitude:</span>
                            <span style={{ color: selectedObject.magnitude < 6 ? '#67e8f9' : 'white' }}>{selectedObject.magnitude}</span>
                        </div>
                        <div className="flex items-center gap-1"><span style={{ color: '#6b7280' }}>Taille:</span><span>{selectedObject.size_arcmin || 'N/A'}</span></div>
                        <div className="flex items-center gap-1">
                            <span style={{ color: '#6b7280' }}>Difficulté:</span>
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: difficultyStyle.background, color: difficultyStyle.color, border: `1px solid ${difficultyStyle.border}` }}>
                                {selectedObject.difficulty}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span style={{ color: '#6b7280' }}>Statut:</span>
                            <span style={{ color: alt > 0 ? '#86efac' : '#6b7280' }}>{alt > 0 ? 'En cours (au-dessus horizon)' : 'Indisponible'}</span>
                        </div>
                    </div>

                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Coordonnées (J2000)</p>
                        <div className="flex items-center gap-4 text-xs font-mono">
                            <div className="flex flex-col gap-0">
                                <span style={{ color: '#6b7280' }}>RA</span>
                                <span style={{ color: 'var(--astro-teal)' }}>{selectedObject.ra}</span>
                            </div>
                            <div className="flex flex-col gap-0">
                                <span style={{ color: '#6b7280' }}>DEC</span>
                                <span style={{ color: 'var(--astro-gold)' }}>{selectedObject.dec}</span>
                            </div>
                        </div>
                    </div>

                    {selectedObject.description && (
                        <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <p className="text-xs" style={{ color: '#9ca3af' }}>{selectedObject.description}</p>
                        </div>
                    )}

                    {/* AI Sequence button */}
                    <button
                        className="w-full mt-3 py-2 rounded text-white font-bold text-sm"
                        style={{ background: 'linear-gradient(135deg, #1a5c2a, #b8860b)' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        onClick={launchSequenceAI}
                    >
                        🎬 LANCER LA SÉQUENCE IA
                    </button>

                    <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <button
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-sm font-medium"
                            style={{ background: 'var(--astro-gold)', color: 'black' }}
                            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                            onClick={() => {
                                setGotoTarget({ ra: selectedObject.ra_deg, dec: selectedObject.dec_deg });
                                setTrackMount(false);
                            }}
                        >
                            <Navigation size={12} />
                            CENTER
                        </button>
                        <button
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-sm font-medium text-white"
                            style={{ background: '#22c55e' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}
                            onClick={() => executeGoto(selectedObject.ra_deg, selectedObject.dec_deg, `GOTO ${selectedObject.id}`)}
                        >
                            <Target size={12} />
                            GOTO
                        </button>
                        <button
                            className="py-1.5 px-3 rounded text-white text-sm"
                            style={{ background: 'transparent' }}
                            onClick={() => {
                                setSelectedObject(null);
                                setSelectedObjectId(null);
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>
                );
            })()}

            {/* Hover is handled by SkyChartCanvas - no separate panel needed */}

            {/* Cardinal Directions — zIndex above Aladin (which sits at zIndex 2) */}
            {showCardinals && (
                <>
                    <span
                        className="absolute font-bold"
                        style={{
                            top: 16, left: '50%', transform: 'translateX(-50%)',
                            color: 'var(--astro-teal)', fontSize: 14, letterSpacing: '0.15em',
                            pointerEvents: 'none', zIndex: 5, opacity: 0.75,
                            textShadow: '0 0 8px rgba(0,240,255,0.6)'
                        }}
                    >N</span>
                    <span
                        className="absolute font-bold"
                        style={{
                            bottom: 16, left: '50%', transform: 'translateX(-50%)',
                            color: 'var(--astro-teal)', fontSize: 14, letterSpacing: '0.15em',
                            pointerEvents: 'none', zIndex: 5, opacity: 0.75,
                            textShadow: '0 0 8px rgba(0,240,255,0.6)'
                        }}
                    >S</span>
                    <span
                        className="absolute font-bold"
                        style={{
                            left: 16, top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--astro-teal)', fontSize: 14, letterSpacing: '0.15em',
                            pointerEvents: 'none', zIndex: 5, opacity: 0.75,
                            textShadow: '0 0 8px rgba(0,240,255,0.6)'
                        }}
                    >W</span>
                    <span
                        className="absolute font-bold"
                        style={{
                            right: 16, top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--astro-teal)', fontSize: 14, letterSpacing: '0.15em',
                            pointerEvents: 'none', zIndex: 5, opacity: 0.75,
                            textShadow: '0 0 8px rgba(0,240,255,0.6)'
                        }}
                    >E</span>
                </>
            )}

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 5, background: 'black' }}>
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--astro-teal)', borderTopColor: 'transparent' }} />
                        <p className="text-xs hud-font" style={{ color: 'var(--astro-teal)' }}>INITIALIZING SKY ENGINE...</p>
                    </div>
                </div>
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
                resetViewSignal={resetViewSignal}
            />

            {/* Telrad finder circles */}
            {showTelrad && (
                <div
                    className="absolute"
                    style={{
                        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none', zIndex: 6,
                        width: '100%', height: '100%',
                    }}
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
                    <div className="absolute" style={{ bottom: 'calc(50% - 2deg * 1000 / 15 - 20px)', left: '50%', transform: 'translateX(-50%)' }}>
                        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--astro-teal)', opacity: 0.6 }}>
                            {aladinSettings.fov}° FOV
                        </span>
                    </div>
                </div>
            )}

            {/* Subtle crosshair overlay */}
            <div
                className="absolute"
                style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 1 }}
            >
                <Crosshair size={80} style={{ color: 'var(--astro-gold)', opacity: 0.15 }} />
            </div>
        </div>{/* end map area */}

        {/* Settings panel — position:fixed to cover the whole screen */}
        {showSettings && (
            <div
                className="fixed rounded-xl overflow-y-auto p-6"
                style={{
                    top: '10%', left: '50%', transform: 'translateX(-50%)',
                    width: '90%', maxWidth: 500, maxHeight: '80vh',
                    background: 'rgba(10, 20, 40, 0.98)',
                    border: '2px solid var(--astro-teal)',
                    zIndex: 1000,
                    boxShadow: '0 0 50px rgba(0, 240, 255, 0.5)',
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <p className="font-bold text-xl" style={{ color: 'var(--astro-teal)' }}>
                        {language === 'fr' ? 'Paramètres carte' : 'Map Settings'}
                    </p>
                    <button
                        className="px-3 py-1 rounded text-white font-medium"
                        style={{ background: '#ef4444' }}
                        onClick={() => setShowSettings(false)}
                    >✕</button>
                </div>
                <div className="flex flex-col gap-4">
                    <div>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Survey</p>
                        <select value={aladinSettings.survey} onChange={(e) => setAladinSettings({...aladinSettings, survey: e.target.value})}
                            style={{ width:'100%', background:'rgba(0,0,0,0.5)', color:'white', border:'1px solid #00f0ff', borderRadius:'4px', padding:'6px' }}>
                            <option value="P/DSS2/color">DSS Color</option>
                            <option value="P/DSS2/red">DSS Red</option>
                            <option value="P/2MASS/color">2MASS Color</option>
                            <option value="P/SDSS9/g">SDSS g</option>
                            <option value="P/SDSS9/r">SDSS r</option>
                            <option value="P/SDSS9/i">SDSS i</option>
                            <option value="P/GLADE">GLADE</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Field of View (°): {aladinSettings.fov}</p>
                        <input type="range" min="1" max="180" step="1" value={aladinSettings.fov}
                            onChange={(e) => setAladinSettings({...aladinSettings, fov: parseFloat(e.target.value)})}
                            style={{ width:'100%' }} />
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Object Size: {aladinSettings.sourceSize}px</p>
                        <input type="range" min="6" max="30" step="1" value={aladinSettings.sourceSize}
                            onChange={(e) => setAladinSettings({...aladinSettings, sourceSize: parseInt(e.target.value)})}
                            style={{ width:'100%' }} />
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Object Color</p>
                        <input type="color" value={aladinSettings.objectColor}
                            onChange={(e) => setAladinSettings({...aladinSettings, objectColor: e.target.value})}
                            style={{ width:'100%', height:'30px', border:'none' }} />
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Mount Marker Color</p>
                        <input type="color" value={aladinSettings.mountColor}
                            onChange={(e) => setAladinSettings({...aladinSettings, mountColor: e.target.value})}
                            style={{ width:'100%', height:'30px', border:'none' }} />
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: '#9ca3af' }}>Projection</p>
                        <select value={aladinSettings.projection} onChange={(e) => setAladinSettings({...aladinSettings, projection: e.target.value})}
                            style={{ width:'100%', background:'rgba(0,0,0,0.5)', color:'white', border:'1px solid #00f0ff', borderRadius:'4px', padding:'6px' }}>
                            <option value="SIN">Orthographic (SIN)</option>
                            <option value="MOL">Mollweide</option>
                            <option value="AIT">Hammer-Aitoff</option>
                            <option value="ZEA">Zenithal Equal Area</option>
                            <option value="MER">Mercator</option>
                        </select>
                    </div>
                    <div className="flex items-center justify-between">
                        <p className="text-sm" style={{ color: '#d1d5db' }}>Show Reticle</p>
                        <input type="checkbox" checked={aladinSettings.showReticle}
                            onChange={(e) => setAladinSettings({...aladinSettings, showReticle: e.target.checked})} />
                    </div>
                    <div className="flex items-center justify-between">
                        <p className="text-sm" style={{ color: '#d1d5db' }}>Show Zoom Control</p>
                        <input type="checkbox" checked={aladinSettings.showZoom}
                            onChange={(e) => setAladinSettings({...aladinSettings, showZoom: e.target.checked})} />
                    </div>
                    <button
                        className="w-full py-2 rounded font-medium"
                        style={{ background: 'var(--astro-teal)', color: 'black' }}
                        onClick={() => setShowSettings(false)}
                    >
                        {language === 'fr' ? 'Fermer' : 'Close'}
                    </button>
                </div>
            </div>
        )}

        {/* Gemini Sequence Modal */}
        {showSequenceModal && (
            <div
                className="fixed inset-0 flex items-center justify-center"
                style={{ zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowSequenceModal(false); }}
            >
                <div
                    className="rounded-xl p-6"
                    style={{
                        background: 'rgba(10, 20, 40, 0.98)',
                        border: '2px solid var(--astro-gold)',
                        width: '90%', maxWidth: 480,
                        boxShadow: '0 0 50px rgba(255,179,71,0.3)',
                    }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <p className="font-bold text-lg" style={{ color: 'var(--astro-gold)' }}>
                            🎬 Séquence IA — {selectedObject?.id}
                        </p>
                        <button className="text-white px-2" style={{ background: 'transparent' }} onClick={() => setShowSequenceModal(false)}>✕</button>
                    </div>

                    {sequenceLoading ? (
                        <div className="flex flex-col items-center gap-4 py-8">
                            <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--astro-gold)', borderTopColor: 'transparent' }} />
                            <p style={{ color: '#d1d5db' }}>Analyse IA en cours...</p>
                        </div>
                    ) : sequenceParams ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-4">
                                <div className="flex flex-col gap-1 flex-1">
                                    <p className="text-xs" style={{ color: '#9ca3af' }}>Lights</p>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            value={sequenceParams.lights.count}
                                            onChange={e => setSequenceParams(p => p ? {...p, lights: {...p.lights, count: +e.target.value}} : p)}
                                            className="text-white text-sm px-2 py-1 rounded"
                                            style={{ width: 70, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
                                        />
                                        <span className="text-xs" style={{ color: '#6b7280' }}>×</span>
                                        <input
                                            type="number"
                                            value={sequenceParams.lights.exposure}
                                            onChange={e => setSequenceParams(p => p ? {...p, lights: {...p.lights, exposure: +e.target.value}} : p)}
                                            className="text-white text-sm px-2 py-1 rounded"
                                            style={{ width: 70, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
                                        />
                                        <span className="text-xs" style={{ color: '#6b7280' }}>s</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <p className="text-xs" style={{ color: '#9ca3af' }}>ISO</p>
                                    <select
                                        value={sequenceParams.lights.iso}
                                        onChange={e => setSequenceParams(p => p ? {...p, lights: {...p.lights, iso: +e.target.value}} : p)}
                                        style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '4px 8px' }}
                                    >
                                        {[100,200,400,800,1600,3200,6400].map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex flex-col gap-1 flex-1">
                                    <p className="text-xs" style={{ color: '#9ca3af' }}>Darks × Exposure</p>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            value={sequenceParams.darks.count}
                                            onChange={e => setSequenceParams(p => p ? {...p, darks: {...p.darks, count: +e.target.value}} : p)}
                                            className="text-white text-sm px-2 py-1 rounded"
                                            style={{ width: 70, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
                                        />
                                        <span className="text-xs" style={{ color: '#6b7280' }}>×</span>
                                        <input
                                            type="number"
                                            value={sequenceParams.darks.exposure}
                                            onChange={e => setSequenceParams(p => p ? {...p, darks: {...p.darks, exposure: +e.target.value}} : p)}
                                            className="text-white text-sm px-2 py-1 rounded"
                                            style={{ width: 70, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
                                        />
                                        <span className="text-xs" style={{ color: '#6b7280' }}>s</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <p className="text-xs" style={{ color: '#9ca3af' }}>Flats</p>
                                    <input
                                        type="number"
                                        value={sequenceParams.flats.count}
                                        onChange={e => setSequenceParams(p => p ? {...p, flats: {...p.flats, count: +e.target.value}} : p)}
                                        className="text-white text-sm px-2 py-1 rounded"
                                        style={{ width: 70, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <p className="text-xs" style={{ color: '#9ca3af' }}>Bias</p>
                                    <input
                                        type="number"
                                        value={sequenceParams.bias.count}
                                        onChange={e => setSequenceParams(p => p ? {...p, bias: {count: +e.target.value}} : p)}
                                        className="text-white text-sm px-2 py-1 rounded"
                                        style={{ width: 70, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)' }}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="text-xs" style={{ color: '#9ca3af' }}>Stacking</p>
                                <select
                                    value={sequenceParams.stacking_method}
                                    onChange={e => setSequenceParams(p => p ? {...p, stacking_method: e.target.value} : p)}
                                    style={{ width: '100%', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', padding: '6px' }}
                                >
                                    <option value="Kappa-Sigma">Kappa-Sigma</option>
                                    <option value="Median">Median</option>
                                    <option value="Average">Average</option>
                                </select>
                            </div>
                            {sequenceParams.notes && (
                                <div className="rounded-md p-3" style={{ background: 'rgba(255,179,71,0.1)', border: '1px solid rgba(255,179,71,0.3)' }}>
                                    <p className="text-xs" style={{ color: 'var(--astro-gold)' }}>{sequenceParams.notes}</p>
                                </div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    className="flex-1 py-2 rounded text-white font-medium"
                                    style={{ background: '#22c55e' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')}
                                    onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}
                                    onClick={launchSequence}
                                >
                                    ✅ LANCER
                                </button>
                                <button
                                    className="flex-1 py-2 rounded text-white font-medium"
                                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}
                                    onClick={() => setShowSequenceModal(false)}
                                >
                                    ✕ Annuler
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        )}
        </div>
    );
};
