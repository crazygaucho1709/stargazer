// src/components/telescope/TelescopeControls.tsx
"use client";

import { Box, Grid, Button, VStack, HStack, Circle, Icon, Flex, Text } from "@chakra-ui/react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, RotateCcw, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight } from "lucide-react";
import React from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";

interface TelescopeControlsProps {
    variant: "pad" | "jog" | "guiding";
}

interface PadButtonProps {
    icon: any;
    glowColor?: string;
    onClick?: () => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    onPointerUp?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
}

const PadButton = ({ icon: DirIcon, glowColor = "var(--astro-teal)", onClick, onPointerDown, onPointerUp, onPointerLeave }: PadButtonProps) => (
    <Button
        variant="plain"
        w="40px"
        h="40px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        color="var(--astro-starlight)"
        bg="rgba(255, 255, 255, 0.05)"
        _hover={{ bg: "rgba(255,255,255,0.1)", transform: "scale(1.1)", boxShadow: `0 0 15px ${glowColor}` }}
        _active={{ bg: glowColor, color: "#000" }}
        transition="all 0.2s"
        p={0}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
    >
        <DirIcon size={20} />
    </Button>
);

export const TelescopeControls = ({ variant }: TelescopeControlsProps) => {
    const { isSlewing, setSlewing, setPosition, config, detectedMount } = useStargazerStore();
    const { execute } = useAstroAction();
    const activeDirectionRef = React.useRef<'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | null>(null);
    const requestChainRef = React.useRef<Promise<any>>(Promise.resolve());
    const [slewRate, setSlewRate] = React.useState(5);

    const handleRateChange = async (value: number) => {
        const wasMoving = activeDirectionRef.current !== null;
        const prevDir = activeDirectionRef.current;
        
        // Stop motion if currently moving
        if (wasMoving) {
            await handleMoveStop();
        }
        
        // Change slew rate
        setSlewRate(value);
        
        // Send rate to backend using hook
        await execute('/api/indi/mount', `SET RATE ${value}x`, {
            body: { action: 'rate', rate: value, device: detectedMount, ip: config.astroberryUrl },
            showGlobalLoader: false // No need for full screen loader for rate change
        });
        
        // Restart motion if it was moving
        if (wasMoving && prevDir) {
            await handleMoveStart(prevDir);
        }
    };

    const handleMoveStart = (direction: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right') => {
        activeDirectionRef.current = direction;
        setSlewing(true);
        
        const promise = requestChainRef.current.then(async () => {
            // Check if we are still supposed to start in this direction (prevent race condition if stopped before we start)
            if (activeDirectionRef.current !== direction) return;
            
            const result = await execute('/api/indi/mount', `SLEW ${direction.toUpperCase()}`, {
                body: {
                    action: 'jog',
                    direction: direction,
                    state: 'start',
                    duration: 0.5,
                    device: detectedMount,
                    ip: config.astroberryUrl
                },
                showGlobalLoader: false,
                silent: true // No toast for movements
            });
            if (!result.success) setSlewing(false);
        }).catch((err) => {
            console.error("Move start failed:", err);
            setSlewing(false);
        });
        
        requestChainRef.current = promise;
        return promise;
    };

    const handleMoveStop = () => {
        const dir = activeDirectionRef.current;
        if (!dir) return Promise.resolve();

        activeDirectionRef.current = null;

        const promise = requestChainRef.current.then(async () => {
            await execute('/api/indi/mount', "HALT", {
                body: { action: 'jog', direction: dir, state: 'stop', device: detectedMount, ip: config.astroberryUrl },
                showGlobalLoader: false,
                silent: true // No toast for stops
            });
            setSlewing(false);
        }).catch((err) => {
            console.error("Move stop failed:", err);
            setSlewing(false);
        });

        requestChainRef.current = promise;
        return promise;
    };

    const handleAbort = async () => {
        activeDirectionRef.current = null;
        await execute('/api/indi/mount', "EMERGENCY ABORT", {
            body: { action: 'abort_all', device: detectedMount },
            showGlobalLoader: false,
            successMessage: "ALL MOTION STOPPED"
        });
        setSlewing(false);
    };

    const handleSync = async () => {
        await execute('/api/mount/sync_current', "SYNCING MOUNT", {
            method: 'POST',
            showGlobalLoader: true
        });
    };

    if (variant === "pad") {
        return (
            <Box position="relative" w="180px" h="180px" display="flex" alignItems="center" justifyContent="center">
                {/* Compass background rings */}
                <Box position="absolute" inset="0" borderRadius="full" border="1px solid rgba(255,255,255,0.05)" />
                <Box position="absolute" inset="20px" borderRadius="full" border="1px dashed rgba(255, 51, 51, 0.2)" style={{ animation: 'spin 40s linear infinite' }} />
                
                {/* Cardinal markers */}
                <Text position="absolute" top="2px" fontSize="8px" color="whiteAlpha.400" fontWeight="bold">N</Text>
                <Text position="absolute" bottom="2px" fontSize="8px" color="whiteAlpha.400" fontWeight="bold">S</Text>
                <Text position="absolute" left="4px" fontSize="8px" color="whiteAlpha.400" fontWeight="bold">W</Text>
                <Text position="absolute" right="4px" fontSize="8px" color="whiteAlpha.400" fontWeight="bold">E</Text>

                {/* Directional Pads positioned in a circle */}
                <Box position="absolute" top="15px">
                    <PadButton 
                        icon={ChevronUp} 
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('up'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" bottom="15px">
                    <PadButton 
                        icon={ChevronDown}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('down'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" left="15px">
                    <PadButton 
                        icon={ChevronLeft}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('left'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" right="15px">
                    <PadButton 
                        icon={ChevronRight}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('right'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                
                {/* Diagonal Directional Pads */}
                <Box position="absolute" top="25px" left="25px">
                    <PadButton 
                        icon={ArrowUpLeft}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('up-left'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" top="25px" right="25px">
                    <PadButton 
                        icon={ArrowUpRight}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('up-right'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" bottom="25px" left="25px">
                    <PadButton 
                        icon={ArrowDownLeft}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('down-left'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" bottom="25px" right="25px">
                    <PadButton 
                        icon={ArrowDownRight}
                        onPointerDown={(e) => { e.preventDefault(); handleMoveStart('down-right'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerLeave={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>

                {/* Sync Button */}
                <Box position="absolute" bottom="20px" left="20px">
                    <PadButton 
                        icon={RotateCcw} 
                        glowColor="var(--astro-gold)"
                        onClick={handleSync}
                    />
                </Box>

                {/* Central Target / Slewing Indicator */}
                <Circle size="46px" border="2px solid" bg="rgba(10, 20, 40, 0.8)" borderColor={isSlewing ? "var(--astro-gold)" : "var(--astro-teal)"} className={isSlewing ? "pulse-glow" : ""} zIndex={2}>
                    <Box color={isSlewing ? "var(--astro-gold)" : "var(--astro-teal)"}>
                        <Target size={20} />
                    </Box>
                </Circle>

                {/* Slew Rate Slider */}
                <Box position="absolute" bottom="-50px" w="160px">
                    <Flex justify="space-between" mb={1}>
                        <Text fontSize="10px" color="whiteAlpha.600">1x</Text>
                        <Text fontSize="11px" color="var(--astro-teal)" fontWeight="bold">{slewRate}x</Text>
                        <Text fontSize="10px" color="whiteAlpha.600">9x</Text>
                    </Flex>
                    <input
                        type="range"
                        min={1}
                        max={9}
                        step={1}
                        value={slewRate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleRateChange(parseInt(e.target.value))}
                        className="slew-rate-slider"
                        style={{
                            width: '100%',
                            height: '8px',
                            cursor: 'pointer',
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            background: `linear-gradient(to right, var(--astro-teal) 0%, var(--astro-teal) ${((slewRate - 1) / 8) * 100}%, rgba(255,255,255,0.2) ${((slewRate - 1) / 8) * 100}%, rgba(255,255,255,0.2) 100%)`,
                            borderRadius: '4px',
                            outline: 'none'
                        }}
                    />
                </Box>
            </Box>
        );
    }

    return null;
};
