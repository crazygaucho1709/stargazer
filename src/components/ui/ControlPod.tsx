// src/components/ui/ControlPod.tsx
"use client";

import { Box, Flex, Text, Circle } from "@chakra-ui/react";

interface ControlPodProps {
    title?: string;
    children: React.ReactNode;
    size?: string;
    glowColor?: string;
    accentColor?: string;
}

export const ControlPod = ({ title, children, size = "180px", glowColor = "rgba(208, 0, 0, 0.3)", accentColor = "#D00000" }: ControlPodProps) => {
    return (
        <VStack gap={3}>
            {title && (
                <Text fontSize="9px" fontWeight="900" letterSpacing="0.2em" color="whiteAlpha.400">
                    {title.toUpperCase()}
                </Text>
            )}
            <Box
                w={size}
                h={size}
                borderRadius="full"
                position="relative"
                bg="rgba(10, 10, 10, 0.6)"
                backdropFilter="blur(15px)"
                border="2px solid"
                borderColor="whiteAlpha.100"
                boxShadow={`0 10px 40px rgba(0,0,0,0.8), inset 0 0 30px rgba(0,0,0,0.5), 0 0 20px ${glowColor}`}
                transition="all 0.3s ease"
                display="flex"
                alignItems="center"
                justifyContent="center"
            >
                {/* Inner concentric ring for depth */}
                <Box
                    position="absolute"
                    inset="10px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="whiteAlpha.50"
                    pointerEvents="none"
                />

                {children}
            </Box>
        </VStack>
    );
};

import { VStack } from "@chakra-ui/react";
