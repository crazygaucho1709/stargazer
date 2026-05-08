"use client";

import { Box, VStack, Text } from "@chakra-ui/react";
import { ReactNode } from "react";
import { motion } from "framer-motion";

interface AstroPodProps {
    title?: string;
    children: ReactNode;
    width?: string;
    height?: string;
    glowColor?: "teal" | "gold" | "cobalt" | "starlight";
}

export const AstroPod = ({ title, children, width = "auto", height = "auto", glowColor = "teal" }: AstroPodProps) => {
    const colorMap = {
        teal: "var(--astro-teal)",
        gold: "var(--astro-gold)",
        cobalt: "var(--astro-cobalt)",
        starlight: "var(--astro-starlight)"
    };

    const activeColor = colorMap[glowColor];

    return (
        <VStack gap={2} align="stretch" w={width} h={height}>
            {title && (
                <Box alignSelf="flex-start" position="relative">
                    <Text
                        className="hud-font"
                        fontSize="11px"
                        fontWeight="600"
                        color={activeColor}
                        bg="rgba(10, 20, 40, 0.7)"
                        px={4} py={1.5}
                        borderRadius="4px 16px 4px 4px"
                        borderLeft={`2px solid ${activeColor}`}
                        borderBottom={`1px solid rgba(255,255,255,0.1)`}
                        boxShadow={`0 4px 12px rgba(0,0,0,0.3)`}
                        letterSpacing="0.15em"
                    >
                        {title}
                    </Text>
                </Box>
            )}
            
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ width: '100%', height: '100%' }}
            >
                <Box
                    className="astro-panel"
                    w="100%" h="100%" p={4}
                >
                    {children}
                </Box>
            </motion.div>
        </VStack>
    );
};
