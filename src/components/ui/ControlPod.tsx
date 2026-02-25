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
                        fontSize="9px"
                        fontWeight="900"
                        letterSpacing="0.4em"
                        color="whiteAlpha.700"
                        bg="rgba(0,0,0,0.6)"
                        px={4}
                        py={1}
                        borderRadius="full"
                        border="1px solid"
                        borderColor="whiteAlpha.200"
                        backdropFilter="blur(10px)"
                        boxShadow={`0 0 10px ${glowColor}`}
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
                transition="all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                border="1px solid"
                borderColor="whiteAlpha.200"
                _hover={{
                    transform: "scale(1.08)",
                    boxShadow: `0 0 40px ${glowColor}, inset 0 0 25px rgba(0,0,0,0.6)`,
                    borderColor: accentColor
                }}
            >
                {/* HUD Decorative Arcs */}
                <Box className="hud-arc hud-arc-top" inset="-8px" borderColor={accentColor} borderWidth="2px" opacity={0.4} style={{ animation: "spin 12s linear infinite" }} />
                <Box className="hud-arc hud-arc-bottom" inset="-15px" borderColor={accentColor} borderWidth="1px" opacity={0.2} style={{ animation: "spin 25s linear infinite reverse" }} />

                {/* Static HUD guides */}
                <Box position="absolute" inset="0" borderRadius="full" border="1px solid" borderColor="whiteAlpha.100" pointerEvents="none" />
                <Box position="absolute" inset="15%" borderRadius="full" border="1px dashed" borderColor="whiteAlpha.50" pointerEvents="none" />

                {/* Rotating accent ring */}
                <Box
                    position="absolute"
                    inset="-4px"
                    borderRadius="full"
                    border="2px solid transparent"
                    borderTopColor={accentColor}
                    borderRightColor={accentColor}
                    opacity={0.3}
                    style={{ animation: "spin 15s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
                />

                {/* Inner Ambient Glow */}
                <Box
                    position="absolute"
                    inset="0"
                    borderRadius="full"
                    bg={`radial-gradient(circle, ${glowColor} 0%, transparent 75%)`}
                    opacity={0.2}
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
