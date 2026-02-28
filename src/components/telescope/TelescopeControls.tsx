// src/components/telescope/TelescopeControls.tsx
"use client";

import { Box, Grid, Button, VStack, HStack, Circle, Icon, Flex } from "@chakra-ui/react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, RotateCcw } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

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
    const { isSlewing, setSlewing, ra, dec, setPosition } = useStargazerStore();

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

    const handleMove = (direction: 'up' | 'down' | 'left' | 'right') => {
        setSlewing(true);
        setTimeout(() => setSlewing(false), 500);

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
        
        setPosition(newRa, newDec, newAlt, newAz);
    };

    if (variant === "pad") {
        return (
            <Grid templateColumns="repeat(3, 40px)" templateRows="repeat(3, 40px)" gap={3}>
                <Box gridColumn="2"><PadButton icon={ChevronUp} onClick={() => handleMove('up')} /></Box>
                <Box gridRow="2" gridColumn="1"><PadButton icon={ChevronLeft} onClick={() => handleMove('left')} /></Box>
                <Box gridRow="2" gridColumn="2" display="flex" alignItems="center" justifyContent="center">
                    <Circle size="34px" border="2px solid" borderColor={isSlewing ? "var(--astro-gold)" : "var(--astro-teal)"} className={isSlewing ? "pulse-glow" : ""}>
                        <Icon as={Target} boxSize={4} color={isSlewing ? "var(--astro-gold)" : "var(--astro-teal)"} />
                    </Circle>
                </Box>
                <Box gridRow="2" gridColumn="3"><PadButton icon={ChevronRight} onClick={() => handleMove('right')} /></Box>
                <Box gridRow="3" gridColumn="2"><PadButton icon={ChevronDown} onClick={() => handleMove('down')} /></Box>
            </Grid>
        );
    }

    return null;
};
