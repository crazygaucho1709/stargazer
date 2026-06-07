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
    onPointerCancel?: (e: React.PointerEvent) => void;
}

const PadButton = ({ icon: DirIcon, glowColor = "var(--astro-teal)", onClick, onPointerDown, onPointerUp, onPointerCancel }: PadButtonProps) => (
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
        onPointerCancel={onPointerCancel}
    >
        <DirIcon size={20} />
    </Button>
);

export const TelescopeControls = ({ variant }: TelescopeControlsProps) => {
    const { isSlewing, setSlewing, setPosition, config, detectedMount } = useStargazerStore();
    const { execute } = useAstroAction();
    type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
    const activeDirectionRef = React.useRef<Direction | null>(null);
    // Lets us cancel an in-flight START so a STOP is never queued behind it.
    const startAbortRef = React.useRef<AbortController | null>(null);
    const [slewRate, setSlewRate] = React.useState(5);

    // Real-time motion commands must be fast and never retry: a stale jog keeps the
    // mount moving. Short timeout + no retries + no global loader.
    const JOG_TIMEOUT = 3000;

    const handleRateChange = async (value: number) => {
        const wasMoving = activeDirectionRef.current !== null;
        const prevDir = activeDirectionRef.current;

        // Stop motion if currently moving
        if (wasMoving) {
            handleMoveStop();
        }

        // Change slew rate
        setSlewRate(value);

        // Send rate to backend using hook
        await execute('/api/indi/mount', `SET RATE ${value}x`, {
            body: { action: 'rate', rate: value, device: detectedMount, ip: config.astroberryUrl },
            showGlobalLoader: false, // No need for full screen loader for rate change
            timeout: JOG_TIMEOUT,
            retries: 0,
        });

        // Restart motion if it was moving
        if (wasMoving && prevDir) {
            handleMoveStart(prevDir);
        }
    };

    const handleMoveStart = (direction: Direction) => {
        // Cancel any START still in flight so commands can't stack up.
        startAbortRef.current?.abort();
        const controller = new AbortController();
        startAbortRef.current = controller;

        activeDirectionRef.current = direction;
        setSlewing(true);

        // Fire immediately — NOT chained behind previous requests.
        return execute('/api/indi/mount', `SLEW ${direction.toUpperCase()}`, {
            body: {
                action: 'jog',
                direction: direction,
                state: 'start',
                duration: 0.5,
                device: detectedMount,
                ip: config.astroberryUrl,
            },
            showGlobalLoader: false,
            silent: true, // No toast for movements
            timeout: JOG_TIMEOUT,
            retries: 0,
            signal: controller.signal,
        }).then((result) => {
            // Only clear the slewing indicator if this start failed AND we're still
            // meant to be going this direction (i.e. it wasn't superseded/aborted).
            if (!result.success && activeDirectionRef.current === direction) {
                setSlewing(false);
            }
        });
    };

    const handleMoveStop = () => {
        const dir = activeDirectionRef.current;
        activeDirectionRef.current = null;
        setSlewing(false);

        // Abort any pending START so the STOP is sent right now, never queued behind it.
        startAbortRef.current?.abort();
        startAbortRef.current = null;

        // Always send an explicit (idempotent) stop for both axes so the mount halts
        // the instant the button is released.
        return execute('/api/indi/mount', "HALT", {
            body: { action: 'jog', direction: dir ?? 'up', state: 'stop', device: detectedMount, ip: config.astroberryUrl },
            showGlobalLoader: false,
            silent: true, // No toast for stops
            timeout: JOG_TIMEOUT,
            retries: 0,
        });
    };

    const handleAbort = async () => {
        activeDirectionRef.current = null;
        startAbortRef.current?.abort();
        startAbortRef.current = null;
        await execute('/api/indi/mount', "EMERGENCY ABORT", {
            body: { action: 'abort_all', device: detectedMount },
            showGlobalLoader: false,
            successMessage: "ALL MOTION STOPPED",
            timeout: JOG_TIMEOUT,
            retries: 0,
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
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('up'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" bottom="15px">
                    <PadButton
                        icon={ChevronDown}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('down'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" left="15px">
                    <PadButton
                        icon={ChevronLeft}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('left'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" right="15px">
                    <PadButton
                        icon={ChevronRight}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('right'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>

                {/* Diagonal Directional Pads */}
                <Box position="absolute" top="25px" left="25px">
                    <PadButton
                        icon={ArrowUpLeft}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('up-left'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" top="25px" right="25px">
                    <PadButton
                        icon={ArrowUpRight}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('up-right'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" bottom="25px" left="25px">
                    <PadButton
                        icon={ArrowDownLeft}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('down-left'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
                    />
                </Box>
                <Box position="absolute" bottom="25px" right="25px">
                    <PadButton
                        icon={ArrowDownRight}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); handleMoveStart('down-right'); }}
                        onPointerUp={(e) => { e.preventDefault(); handleMoveStop(); }}
                        onPointerCancel={(e) => { e.preventDefault(); handleMoveStop(); }}
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
