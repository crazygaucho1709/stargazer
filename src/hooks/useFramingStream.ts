// src/hooks/useFramingStream.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { clientApiUrl } from "@/lib/clientApi";

interface FramingStats {
    active: boolean;
    connections: number;
    frame_count: number;
    dropped_frames: number;
    is_slewing: boolean;
    last_frame: string | null;
}

interface FramingMessage {
    action: string;
    data?: string;
    timestamp?: string;
    message?: string;
    stats?: FramingStats;
    framing?: boolean;
    exposure?: number;
    iso?: number;
    slewing?: boolean;
    state?: boolean;
}

interface UseFramingStreamOptions {
    autoConnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
}

interface UseFramingStreamReturn {
    isConnected: boolean;
    isActive: boolean;
    isSlewing: boolean;
    currentFrame: string | null;
    stats: FramingStats | null;
    error: string | null;
    connect: () => void;
    disconnect: () => void;
    startFraming: () => void;
    stopFraming: () => void;
}

export function useFramingStream(options: UseFramingStreamOptions = {}): UseFramingStreamReturn {
    const {
        autoConnect = false,
        reconnectDelay = 3000,
        maxReconnectAttempts = 5
    } = options;
    
    const { config } = useStargazerStore();
    
    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [isSlewing, setIsSlewing] = useState(false);
    const [currentFrame, setCurrentFrame] = useState<string | null>(null);
    const [stats, setStats] = useState<FramingStats | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    // Refs for cleanup
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCountRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastFrameTimeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    
    // Canvas ref for rendering
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    
    // Connect to WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }
        
        const wsUrl = clientApiUrl('/ws/framing').replace('http', 'ws');
        
        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;
            
            ws.onopen = () => {
                setIsConnected(true);
                setError(null);
                reconnectCountRef.current = 0;
            };
            
            ws.onmessage = (event) => {
                try {
                    const message: FramingMessage = JSON.parse(event.data);
                    
                    switch (message.action) {
                        case 'welcome':
                            break;
                            
                        case 'frame':
                            if (message.data) {
                                setCurrentFrame(message.data);
                                lastFrameTimeRef.current = Date.now();
                            }
                            break;
                            
                        case 'stats':
                            if (message.stats) {
                                setStats(message.stats);
                                setIsActive(message.stats.active);
                                setIsSlewing(message.stats.is_slewing);
                            }
                            break;
                            
                        case 'slewing':
                            setIsSlewing(message.state || false);
                            break;
                            
                        case 'status':
                            setIsActive(message.framing || false);
                            break;
                            
                        case 'error':
                            setError(message.message || 'Unknown error');
                            break;
                            
                        default:
                            break;
                    }
                } catch {
                    /* parse error silencieux — message malformé ignoré */
                }
            };
            
            ws.onerror = () => {
                setError('Connection error');
            };
            
            ws.onclose = () => {
                setIsConnected(false);
                setIsActive(false);

                if (reconnectCountRef.current < maxReconnectAttempts) {
                    reconnectCountRef.current++;
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, reconnectDelay);
                } else {
                    setError('Max reconnection attempts reached');
                }
            };
            
        } catch {
            setError('Failed to connect');
        }
    }, [reconnectDelay, maxReconnectAttempts]);
    
    // Disconnect
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        
        setIsConnected(false);
        setIsActive(false);
        setCurrentFrame(null);
    }, []);
    
    // Start framing mode
    const startFraming = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'start' }));
        }
    }, []);
    
    // Stop framing mode
    const stopFraming = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'stop' }));
        }
    }, []);
    
    // Auto-connect on mount
    useEffect(() => {
        if (autoConnect) {
            connect();
        }
        
        return () => {
            disconnect();
        };
    }, [autoConnect, connect, disconnect]);
    
    // Auto-start when connected
    useEffect(() => {
        if (isConnected && autoConnect) {
            startFraming();
        }
    }, [isConnected, autoConnect, startFraming]);
    
    // Cleanup animation frame on unmount
    useEffect(() => {
        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const frameId = animationFrameRef.current;
            if (frameId) {
                cancelAnimationFrame(frameId);
            }
        };
    }, []);
    
    return {
        isConnected,
        isActive,
        isSlewing,
        currentFrame,
        stats,
        error,
        connect,
        disconnect,
        startFraming,
        stopFraming
    };
}

// Utility hook to render frame to canvas
export function useFramingCanvas(
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    frameData: string | null,
    isSlewing: boolean
) {
    useEffect(() => {
        if (!canvasRef.current || !frameData) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Check if frame data looks valid (base64 image)
        let src = frameData;
        if (!src.startsWith('data:image')) {
            src = `data:image/jpeg;base64,${src}`;
        }
        
        // Create image and render
        const img = new Image();
        img.onload = () => {
            // Fit to canvas while maintaining aspect ratio
            const canvasRatio = canvas.width / canvas.height;
            const imgRatio = img.width / img.height;
            
            let renderWidth: number;
            let renderHeight: number;
            let offsetX = 0;
            let offsetY = 0;
            
            if (imgRatio > canvasRatio) {
                renderWidth = canvas.width;
                renderHeight = canvas.width / imgRatio;
                offsetY = (canvas.height - renderHeight) / 2;
            } else {
                renderHeight = canvas.height;
                renderWidth = canvas.height * imgRatio;
                offsetX = (canvas.width - renderWidth) / 2;
            }
            
            // Clear and draw
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
            
            // Add slewing indicator overlay
            if (isSlewing) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('⚠️ SLEWING', canvas.width / 2, canvas.height / 2);
                
                ctx.font = '14px sans-serif';
                ctx.fillText('Live view paused', canvas.width / 2, canvas.height / 2 + 30);
            }
            
            // Add timestamp
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(10, canvas.height - 30, 200, 25);
            ctx.fillStyle = '#00f0ff';
            ctx.font = '12px monospace';
            ctx.fillText(new Date().toLocaleTimeString(), 15, canvas.height - 12);
        };
        
        img.src = src;
        
    }, [canvasRef, frameData, isSlewing]);
}


interface UseAutoExposeOptions {
    onApplySettings: (exposure: number, stackCount: number) => void;
}

export function useAutoExpose({ onApplySettings }: UseAutoExposeOptions) {
    const { config } = useStargazerStore();
    
    const calculateAutoSettings = useCallback((targetMagnitude: number) => {
        // Import the calculation functions
        const {
            calculateRecommendedExposure,
            calculateRecommendedStackCount
        } = require('@/lib/magnitudeUtils');
        
        // Calculate recommended settings
        const recommendedExp = calculateRecommendedExposure(targetMagnitude, 1);
        const recommendedStack = calculateRecommendedStackCount(targetMagnitude, recommendedExp);
        
        return {
            exposure: Math.round(recommendedExp),
            stackCount: recommendedStack
        };
    }, []);
    
    const applyToConfig = useCallback((targetMagnitude: number) => {
        const settings = calculateAutoSettings(targetMagnitude);
        onApplySettings(settings.exposure, settings.stackCount);
        
        // Also update the store
        useStargazerStore.getState().updateConfig({
            exposureTime: settings.exposure,
            frameCount: settings.stackCount
        });
        
        return settings;
    }, [calculateAutoSettings, onApplySettings]);
    
    return {
        calculateAutoSettings,
        applyToConfig
    };
}