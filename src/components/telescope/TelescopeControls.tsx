// src/components/telescope/TelescopeControls.tsx
"use client";

import { Box, Grid, Button, VStack, HStack, Circle, Icon, Flex, Text, Badge } from "@chakra-ui/react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, RotateCcw, ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, Moon, Sun, Star, Globe } from "lucide-react";
import React from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { useJog } from "@/hooks/useJog";

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
        style={{ touchAction: 'none' }}
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
    const jog = useJog();
    const [slewRate, setSlewRate] = React.useState(5);

    const JOG_TIMEOUT = 3000;

    const handleRateChange = async (value: number) => {
        // Capture active direction BEFORE stopping (stopJog resets it)
        const prevDir = jog.activeDir;
        if (prevDir) jog.stopJog();

        setSlewRate(value);
        await execute('/api/indi/mount', `SET RATE ${value}x`, {
            body: { action: 'rate', rate: value, device: detectedMount, ip: config.astroberryUrl },
            showGlobalLoader: false,
            timeout: JOG_TIMEOUT,
            retries: 0,
        });

        if (prevDir) jog.startJog(prevDir);
    };

    const handleAbort = async () => {
        jog.stopJog();
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

    if (variant === "jog" || variant === "guiding") {
        return null;
    }

    if (variant === "pad") {
        return (
            /* Outer VStack keeps the slider in natural flow — no absolute overflow,
               no z-index fight with the SkyMap or adjacent panels. */
            <Box display="flex" flexDirection="column" alignItems="center" gap={0} w="180px">
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
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('up'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>
                <Box position="absolute" bottom="15px">
                    <PadButton
                        icon={ChevronDown}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('down'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>
                <Box position="absolute" left="15px">
                    <PadButton
                        icon={ChevronLeft}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('left'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>
                <Box position="absolute" right="15px">
                    <PadButton
                        icon={ChevronRight}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('right'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>

                {/* Diagonal Directional Pads */}
                <Box position="absolute" top="25px" left="25px">
                    <PadButton
                        icon={ArrowUpLeft}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('up-left'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>
                <Box position="absolute" top="25px" right="25px">
                    <PadButton
                        icon={ArrowUpRight}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('up-right'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>
                <Box position="absolute" bottom="25px" left="25px">
                    <PadButton
                        icon={ArrowDownLeft}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('down-left'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
                    />
                </Box>
                <Box position="absolute" bottom="25px" right="25px">
                    <PadButton
                        icon={ArrowDownRight}
                        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); jog.startJog('down-right'); }}
                        onPointerUp={(e) => { e.preventDefault(); jog.stopJog(); }}
                        onPointerCancel={(e) => { e.preventDefault(); jog.stopJog(); }}
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

            </Box>

            {/* Slew Rate Slider — in natural flow, no absolute overflow */}
            <Box w="160px" pt={2}>
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

// ─── TrackingModeSelector ─────────────────────────────────────────────────────

type TrackRate = "SIDEREAL" | "LUNAR" | "SOLAR";

const RATE_OPTIONS: { rate: TrackRate; label: string; icon: any; desc: string }[] = [
    { rate: "SIDEREAL", label: "Sidéral",  icon: Star,  desc: "Étoiles" },
    { rate: "LUNAR",    label: "Lunaire",  icon: Moon,  desc: "Lune"    },
    { rate: "SOLAR",    label: "Solaire",  icon: Sun,   desc: "Soleil"  },
];

export const TrackingModeSelector = () => {
    const { trackingRate, setTrackingRate, config, detectedMount } = useStargazerStore();
    const [loading, setLoading] = React.useState<TrackRate | null>(null);

    const handleSelect = async (rate: TrackRate) => {
        if (rate === trackingRate) return;
        setLoading(rate);
        try {
            const baseUrl = config.astroberryUrl?.replace(/\/+$/, "") || "http://localhost:5005";
            const res = await fetch(`${baseUrl}/mount/tracking-rate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rate, device: detectedMount }),
            });
            const data = await res.json();
            if (data.success) {
                setTrackingRate(rate);
            }
        } catch (e) {
            console.error("tracking-rate error", e);
        } finally {
            setLoading(null);
        }
    };

    return (
        <VStack gap={1} align="stretch">
            <Text fontSize="9px" color="whiteAlpha.500" textTransform="uppercase" letterSpacing="wider" textAlign="center">
                Mode suivi
            </Text>
            <HStack gap={1} justify="center">
                {RATE_OPTIONS.map(({ rate, label, icon: Ico, desc }) => {
                    const active = trackingRate === rate;
                    const isLoading = loading === rate;
                    return (
                        <Button
                            key={rate}
                            size="xs"
                            variant={active ? "solid" : "ghost"}
                            bg={active ? "teal.600" : "rgba(255,255,255,0.04)"}
                            color={active ? "white" : "whiteAlpha.600"}
                            borderRadius="md"
                            border="1px solid"
                            borderColor={active ? "teal.400" : "whiteAlpha.100"}
                            _hover={{ bg: active ? "teal.500" : "rgba(255,255,255,0.08)", color: "white" }}
                            onClick={() => handleSelect(rate)}
                            loading={isLoading}
                            px={2}
                            h="28px"
                            title={desc}
                        >
                            <HStack gap={1}>
                                <Icon as={Ico} boxSize={2.5} />
                                <Text fontSize="10px">{label}</Text>
                            </HStack>
                        </Button>
                    );
                })}
            </HStack>
        </VStack>
    );
};
