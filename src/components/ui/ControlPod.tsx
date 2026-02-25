// src/components/ui/ControlPod.tsx
"use client";

import { Box, VStack, Text } from "@chakra-ui/react";

interface ControlPodProps {
    title?: string;
    children: React.ReactNode;
    size?: string;
    glowColor?: string;
    accentColor?: string;
}

export const ControlPod = ({ title, children, size = "180px", glowColor = "rgba(0, 240, 255, 0.3)", accentColor = "#00F0FF" }: ControlPodProps) => {
    return (
        <VStack gap={4} position="relative">
            {title && (
                <Box position="relative">
                    <Text
                        className="hud-font"
                        fontSize="10px"
                        fontWeight="900"
                        letterSpacing="0.3em"
                        color="whiteAlpha.600"
                        bg="rgba(255,255,255,0.05)"
                        px={3}
                        py={1}
                        borderRadius="4px"
                        borderLeft="2px solid"
                        borderColor={accentColor}
                    >
                        {title.toUpperCase()}
                    </Text>
                </Box>
            )}
            <Box
                w={size}
                h={size}
                borderRadius="full"
                position="relative"
                className="glass-panel"
                display="flex"
                alignItems="center"
                justifyContent="center"
                transition="all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                _hover={{
                    transform: "scale(1.05)",
                    boxShadow: `0 0 30px ${glowColor}, inset 0 0 20px rgba(0,0,0,0.5)`,
                    borderColor: accentColor
                }}
            >
                {/* HUD Corners for that tech feel */}
                <Box className="hud-corner top-left" borderColor={accentColor} boxSize="12px" />
                <Box className="hud-corner top-right" borderColor={accentColor} boxSize="12px" />
                <Box className="hud-corner bottom-left" borderColor={accentColor} boxSize="12px" />
                <Box className="hud-corner bottom-right" borderColor={accentColor} boxSize="12px" />

                {/* Rotating accent ring */}
                <Box
                    position="absolute"
                    inset="-4px"
                    borderRadius="full"
                    border="1px dashed"
                    borderColor={accentColor}
                    opacity={0.3}
                    style={{ animation: "spin 20s linear infinite" }}
                />

                {/* Inner Glow */}
                <Box
                    position="absolute"
                    inset="10px"
                    borderRadius="full"
                    bg={`radial-gradient(circle, ${glowColor} 0%, transparent 70%)`}
                    opacity={0.15}
                    pointerEvents="none"
                />

                <Box zIndex={1}>
                    {children}
                </Box>
            </Box>

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </VStack>
    );
};
