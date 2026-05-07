// src/components/camera/CameraControls.tsx
"use client";

import { Box, VStack, HStack, Text, Button, Icon, Grid } from "@chakra-ui/react";
import { Camera, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Aperture, Settings2 } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface CameraControlsProps {
    variant?: "standard" | "circular";
}

const ControlButton = ({ icon: DirIcon, glowColor = "var(--astro-teal)" }: { icon: any, glowColor?: string }) => (
    <Button
        variant="plain"
        w="36px"
        h="36px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        color="var(--astro-starlight)"
        bg="rgba(255, 255, 255, 0.05)"
        _hover={{ bg: "rgba(255, 255, 255, 0.1)", transform: "scale(1.1)", boxShadow: `0 0 15px ${glowColor}` }}
        _active={{ bg: glowColor, color: "black" }}
        transition="all 0.2s"
        p={0}
    >
        <DirIcon size={18} />
    </Button>
);

export const CameraControls = ({ variant = "standard" }: CameraControlsProps) => {
    const { isExposing, setExposing, config } = useStargazerStore();

    const handleShoot = async () => {
        setExposing(true);
        const bridgeIp = config.astroberryUrl.includes('http') ? new URL(config.astroberryUrl).hostname : config.astroberryUrl.split(':')[0];
        try {
            await fetch(`/api/indi?endpoint=ccd/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exposure: 2.0, device: "Canon DSLR EOS 600D" })
            });
        } catch (e: any) {
            alert(`CAPTURE FAILED\n\n${e.message}`);
        }
        setExposing(false);
    };

    if (variant === "circular") {
        return (
            <Box position="relative" w="140px" h="140px">
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    border="4px solid"
                    borderColor="rgba(255, 255, 255, 0.05)"
                    bg="rgba(10, 20, 40, 0.3)"
                    boxShadow="inset 0 0 20px rgba(0, 0, 0, 0.8)"
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
                    bg={isExposing ? "var(--astro-teal)" : "rgba(255, 51, 51, 0.1)"}
                    border="1px solid"
                    borderColor="var(--astro-teal)"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    onClick={handleShoot}
                    _hover={{ transform: "scale(1.1)", bg: isExposing ? "var(--astro-teal)" : "rgba(255, 51, 51, 0.2)" }}
                    transition="all 0.2s"
                    className={isExposing ? "pulse-glow" : ""}
                >
                    <Icon as={Camera} boxSize={5} color={isExposing ? "black" : "var(--astro-teal)"} />
                </Box>

                {/* Focus Control Ring */}
                <Box position="absolute" top="2px" left="50%" transform="translateX(-50%)"><ControlButton icon={ChevronUp} /></Box>
                <Box position="absolute" bottom="2px" left="50%" transform="translateX(-50%)"><ControlButton icon={ChevronDown} /></Box>
                <Box position="absolute" left="2px" top="50%" transform="translateY(-50%)"><ControlButton icon={ChevronLeft} /></Box>
                <Box position="absolute" right="2px" top="50%" transform="translateY(-50%)"><ControlButton icon={ChevronRight} /></Box>

                {/* Diagonal Decorative markers */}
                <Box position="absolute" top="15%" left="15%" opacity={0.3} color="var(--astro-starlight)"><Aperture size={12} /></Box>
                <Box position="absolute" bottom="15%" right="15%" opacity={0.3} color="var(--astro-starlight)"><Settings2 size={12} /></Box>
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
