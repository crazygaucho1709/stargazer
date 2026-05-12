// src/components/telescope/TelescopeControls.tsx
"use client";

import { Box, Grid, Button, VStack, HStack, Circle, Icon, Flex, Text } from "@chakra-ui/react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, RotateCcw } from "lucide-react";
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
    onMouseDown?: () => void;
    onMouseUp?: () => void;
    onMouseLeave?: () => void;
    onTouchStart?: () => void;
    onTouchEnd?: () => void;
}

const PadButton = ({ icon: DirIcon, glowColor = "var(--astro-teal)", onClick, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd }: PadButtonProps) => (
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
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
    >
        <DirIcon size={20} />
    </Button>
);

export const TelescopeControls = ({ variant }: TelescopeControlsProps) => {
    const { isSlewing, setSlewing, setPosition, config } = useStargazerStore();
    const { execute } = useAstroAction();
    const activeDirectionRef = React.useRef<'up' | 'down' | 'left' | 'right' | null>(null);
    const [slewRate, setSlewRate] = React.useState(5);

    const handleRateChange = async (value: number) => {
        const wasMoving = activeDirectionRef.current !== null;
        
        // Stop motion if currently moving
        if (wasMoving) {
            await handleMoveStop();
        }
        
        // Change slew rate
        setSlewRate(value);
        
        // Send rate to backend using hook
        await execute('/api/indi/mount', `SET RATE ${value}x`, {
            body: { action: 'rate', rate: value, device: config.driverInstance, ip: config.astroberryUrl },
            showGlobalLoader: false // No need for full screen loader for rate change
        });
        
        // Restart motion if it was moving
        if (wasMoving && activeDirectionRef.current) {
            await handleMoveStart(activeDirectionRef.current);
        }
    };

    const handleMoveStart = async (direction: 'up' | 'down' | 'left' | 'right') => {
        activeDirectionRef.current = direction;
        setSlewing(true);
        
        // Execute movement via hook
        const result = await execute('/api/indi/mount', `SLEW ${direction.toUpperCase()}`, {
            body: {
                action: 'jog',
                direction: direction,
                state: 'start',
                duration: 0.5,
                device: config.driverInstance,
                ip: config.astroberryUrl
            },
            showGlobalLoader: false
        });
        if (!result.success) setSlewing(false);
    };

    const handleMoveStop = async () => {
        const dir = activeDirectionRef.current;
        if (!dir) return;

        activeDirectionRef.current = null;

        await execute('/api/indi/mount', "HALT", {
            body: { action: 'jog', direction: dir, state: 'stop', device: config.driverInstance, ip: config.astroberryUrl },
            showGlobalLoader: false
        });

        setSlewing(false);
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
                        onMouseDown={() => handleMoveStart('up')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('up')}
                        onTouchEnd={handleMoveStop}
                    />
                </Box>
                <Box position="absolute" bottom="15px">
                    <PadButton 
                        icon={ChevronDown}
                        onMouseDown={() => handleMoveStart('down')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('down')}
                        onTouchEnd={handleMoveStop}
                    />
                </Box>
                <Box position="absolute" left="15px">
                    <PadButton 
                        icon={ChevronLeft}
                        onMouseDown={() => handleMoveStart('left')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('left')}
                        onTouchEnd={handleMoveStop}
                    />
                </Box>
                <Box position="absolute" right="15px">
                    <PadButton 
                        icon={ChevronRight}
                        onMouseDown={() => handleMoveStart('right')}
                        onMouseUp={handleMoveStop}
                        onMouseLeave={handleMoveStop}
                        onTouchStart={() => handleMoveStart('right')}
                        onTouchEnd={handleMoveStop}
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
