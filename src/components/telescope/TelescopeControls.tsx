// src/components/telescope/TelescopeControls.tsx
"use client";

import { Box, Grid, Button, VStack, HStack, Circle, Icon, Flex, Text } from "@chakra-ui/react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, RotateCcw } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { mockApi } from "@/services/mockApi";

interface TelescopeControlsProps {
    variant: "pad" | "jog" | "guiding";
}

const PadButton = ({ icon: DirIcon, glowColor = "var(--astro-teal)", onClick }: { icon: any, glowColor?: string, onClick?: () => void }) => (
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
    >
        <DirIcon size={20} />
    </Button>
);

export const TelescopeControls = ({ variant }: TelescopeControlsProps) => {
    const { isSlewing, setSlewing, ra, dec, alt, az, setPosition } = useStargazerStore();

    const parseCoordinate = (coord: string) => {
        const parts = coord.match(/[-+]?\d+/g);
        if (parts && parts.length >= 3) {
            return {
                h: parseInt(parts[0]),
                m: parseInt(parts[1]),
                s: parseInt(parts[2])
            };
        }
        return { h: 0, m: 0, s: 0 };
    };

    const handleMove = async (direction: 'up' | 'down' | 'left' | 'right') => {
        setSlewing(true);
        
        let raParsed = parseCoordinate(ra);
        let decParsed = parseCoordinate(dec);
        
        let newAlt = alt;
        let newAz = az;

        if (direction === 'up') { decParsed.m += 1; newAlt = Math.min(90, newAlt + 0.5); }
        if (direction === 'down') { decParsed.m -= 1; newAlt = Math.max(0, newAlt - 0.5); }
        if (direction === 'right') { raParsed.m += 1; newAz = (newAz + 1) % 360; }
        if (direction === 'left') { raParsed.m -= 1; newAz = (newAz - 1 + 360) % 360; }

        const pad = (num: number) => String(num).padStart(2, '0');
        const sign = decParsed.h >= 0 ? '+' : '-';
        
        const newRa = `${pad(raParsed.h)}h ${pad(raParsed.m)}m ${pad(raParsed.s)}s`;
        const newDec = `${sign}${pad(Math.abs(decParsed.h))}° ${pad(Math.abs(decParsed.m))}' ${pad(Math.abs(decParsed.s))}"`;
        
        const res = await mockApi.slew(newRa, newDec);
        setSlewing(false);

        if (res.success) {
            setPosition(newRa, newDec, newAlt, newAz);
        } else {
            alert(`SLEW ERROR\n\n${res.error}`);
        }
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
                    <PadButton icon={ChevronUp} onClick={() => handleMove('up')} />
                </Box>
                <Box position="absolute" bottom="15px">
                    <PadButton icon={ChevronDown} onClick={() => handleMove('down')} />
                </Box>
                <Box position="absolute" left="15px">
                    <PadButton icon={ChevronLeft} onClick={() => handleMove('left')} />
                </Box>
                <Box position="absolute" right="15px">
                    <PadButton icon={ChevronRight} onClick={() => handleMove('right')} />
                </Box>

                {/* Central Target / Slewing Indicator */}
                <Circle size="46px" border="2px solid" bg="rgba(10, 20, 40, 0.8)" borderColor={isSlewing ? "var(--astro-gold)" : "var(--astro-teal)"} className={isSlewing ? "pulse-glow" : ""} zIndex={2}>
                    <Icon as={Target} boxSize={5} color={isSlewing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                </Circle>
            </Box>
        );
    }

    return null;
};
