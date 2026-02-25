// src/components/camera/CameraControls.tsx
"use client";

import { Box, VStack, HStack, Text, Button, Icon, Grid } from "@chakra-ui/react";
import { Camera, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Aperture, Settings2 } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface CameraControlsProps {
    variant?: "standard" | "circular";
}

const ControlButton = ({ icon: DirIcon, glowColor = "#FF7D00" }: { icon: any, glowColor?: string }) => (
    <Button
        variant="plain"
        w="36px"
        h="36px"
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
        <DirIcon size={18} />
    </Button>
);

export const CameraControls = ({ variant = "standard" }: CameraControlsProps) => {
    const { iso, setIso, exposure, setExposure, isExposing, setExposing } = useStargazerStore();

    const handleShoot = () => {
        setExposing(true);
        setTimeout(() => {
            setExposing(false);
        }, 2000);
    };

    if (variant === "circular") {
        return (
            <Box position="relative" w="140px" h="140px">
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    border="4px solid"
                    borderColor="whiteAlpha.100"
                    bg="rgba(0,0,0,0.4)"
                    boxShadow="inset 0 0 15px rgba(0,0,0,0.8)"
                />

                {/* Central Camera Icon */}
                <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    w="46px"
                    h="46px"
                    borderRadius="full"
                    bg="rgba(255,125,0,0.1)"
                    border="1px solid"
                    borderColor="#FF7D00"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    onClick={handleShoot}
                    _hover={{ transform: "scale(1.1)", bg: "rgba(255,125,0,0.2)" }}
                    transition="all 0.2s"
                    className={isExposing ? "pulse" : "glow-orange"}
                >
                    <Icon as={Camera} boxSize={5} color="#FF7D00" />
                </Box>

                {/* Focus Control Ring */}
                <Box position="absolute" top="2px" left="50%" transform="translateX(-50%)"><ControlButton icon={ChevronUp} /></Box>
                <Box position="absolute" bottom="2px" left="50%" transform="translateX(-50%)"><ControlButton icon={ChevronDown} /></Box>
                <Box position="absolute" left="2px" top="50%" transform="translateY(-50%)"><ControlButton icon={ChevronLeft} /></Box>
                <Box position="absolute" right="2px" top="50%" transform="translateY(-50%)"><ControlButton icon={ChevronRight} /></Box>

                {/* Diagonal Decorative markers */}
                <Box position="absolute" top="15%" left="15%" opacity={0.3}><Aperture size={12} /></Box>
                <Box position="absolute" bottom="15%" right="15%" opacity={0.3}><Settings2 size={12} /></Box>
            </Box>
        );
    }

    // Standard vertical variant for the HUD sidebar
    return (
        <VStack gap={4} align="stretch" w="full">
            {/* (Exposure sliders logic remains if needed elsewhere, but for now we focus on the Pod variant) */}
            <Text fontSize="9px" color="whiteAlpha.400">CAMERA CAPTURE</Text>
        </VStack>
    );
};
