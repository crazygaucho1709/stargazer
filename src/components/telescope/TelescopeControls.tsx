// src/components/telescope/TelescopeControls.tsx
"use client";

import { Box, Grid, Button, VStack, HStack, Circle, Icon, Flex } from "@chakra-ui/react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target, MoveUpRight, MoveDownLeft, RotateCcw } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface TelescopeControlsProps {
    variant: "pad" | "jog" | "guiding";
}

const PadButton = ({ icon: DirIcon, glowColor = "#D00000" }: { icon: any, glowColor?: string }) => (
    <Button
        variant="plain"
        w="40px"
        h="40px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        color="white"
        bg="rgba(255, 255, 255, 0.05)"
        _hover={{ bg: glowColor, transform: "scale(1.1)", boxShadow: `0 0 15px ${glowColor}` }}
        transition="all 0.2s"
        p={0}
    >
        <DirIcon size={20} />
    </Button>
);

export const TelescopeControls = ({ variant }: TelescopeControlsProps) => {
    const { isSlewing } = useStargazerStore();

    if (variant === "pad") {
        return (
            <Grid templateColumns="repeat(3, 40px)" templateRows="repeat(3, 40px)" gap={2}>
                <Box gridColumn="2"><PadButton icon={ChevronUp} /></Box>
                <Box gridRow="2" gridColumn="1"><PadButton icon={ChevronLeft} /></Box>
                <Box gridRow="2" gridColumn="2" display="flex" alignItems="center" justifyContent="center">
                    <Circle size="34px" border="2px solid" borderColor="#D00000" className="pulse">
                        <Icon as={Target} boxSize={4} color="#D00000" />
                    </Circle>
                </Box>
                <Box gridRow="2" gridColumn="3"><PadButton icon={ChevronRight} /></Box>
                <Box gridRow="3" gridColumn="2"><PadButton icon={ChevronDown} /></Box>
            </Grid>
        );
    }

    if (variant === "jog") {
        return (
            <Box position="relative" w="120px" h="120px">
                {/* Large Central Jog Wheel Decoration */}
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    border="4px solid"
                    borderColor="whiteAlpha.100"
                    bg="rgba(0,0,0,0.4)"
                    boxShadow="inset 0 0 15px rgba(0,0,0,0.8)"
                />
                <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    w="60px"
                    h="60px"
                    borderRadius="full"
                    bg="rgba(208,0,0,0.1)"
                    border="1px solid"
                    borderColor="#D00000"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    className="glow-red"
                >
                    <Box w="6px" h="6px" borderRadius="full" bg="#D00000" />
                </Box>

                {/* Small Directional Markers */}
                <Box position="absolute" top="-5px" left="50%" transform="translateX(-50%)"><PadButton icon={ChevronUp} /></Box>
                <Box position="absolute" bottom="-5px" left="50%" transform="translateX(-50%)"><PadButton icon={ChevronDown} /></Box>
                <Box position="absolute" left="-5px" top="50%" transform="translateY(-50%)"><PadButton icon={ChevronLeft} /></Box>
                <Box position="absolute" right="-5px" top="50%" transform="translateY(-50%)"><PadButton icon={ChevronRight} /></Box>
            </Box>
        );
    }

    if (variant === "guiding") {
        return (
            <Box position="relative" w="120px" h="120px">
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    border="4px solid"
                    borderColor="whiteAlpha.100"
                    bg="rgba(0,0,0,0.4)"
                    boxShadow="inset 0 0 15px rgba(0,0,0,0.8)"
                />
                {/* Guiding specific symbols */}
                <Flex direction="column" h="full" justify="space-between" align="center" py={2}>
                    <PadButton icon={ChevronUp} glowColor="#FF7D00" />
                    <HStack gap={10}>
                        <PadButton icon={ChevronLeft} glowColor="#FF7D00" />
                        <PadButton icon={ChevronRight} glowColor="#FF7D00" />
                    </HStack>
                    <PadButton icon={ChevronDown} glowColor="#FF7D00" />
                </Flex>
                {/* Decorative inner crosshair for guiding */}
                <Box position="absolute" top="50%" left="50%" transform="translate(-50%, -50%)" opacity={0.3} pointerEvents="none">
                    <Icon as={RotateCcw} boxSize={5} color="#FF7D00" />
                </Box>
            </Box>
        );
    }

    return null;
};
