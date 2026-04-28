// src/components/layout/ControlPanel.tsx
"use client";

import { Box, VStack, HStack, Heading, Text, Flex, Icon } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { ObjectFinder } from "@/components/telescope/ObjectFinder";
import { CaptureAndStack } from "@/components/camera/CaptureAndStack";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Boxes, Telescope, Camera, List } from "lucide-react";

export const ControlPanel = () => {
    const isConnected = useStargazerStore((state) => state.isConnected);

    return (
        <Box
            w="340px"
            h="calc(100vh - 40px)"
            className="glass-panel"
            borderRadius="2xl"
            position="fixed"
            right="20px"
            top="20px"
            p="25px"
            overflowY="auto"
            zIndex={30}
        >
            <VStack gap={10} align="stretch">
                <Box>
                    <HStack gap={3} mb={2}>
                        <Icon as={Boxes} color="#D00000" boxSize={5} className="text-glow-red" />
                        <Heading size="sm" color="white" letterSpacing="0.1em" fontWeight="900">INSTRUMENT HUB</Heading>
                    </HStack>
                    <Flex align="center" gap={3}>
                        <Box
                            w="8px"
                            h="8px"
                            borderRadius="full"
                            bg={isConnected ? "#10b981" : "whiteAlpha.400"}
                            className={isConnected ? "pulse" : ""}
                            boxShadow={isConnected ? "0 0 10px #10b981" : "none"}
                        />
                        <Text fontSize="10px" fontWeight="900" color={isConnected ? "#10b981" : "whiteAlpha.400"} letterSpacing="0.2em">
                            {isConnected ? "SENTRY LINK ACTIVE" : "LINK OFFLINE"}
                        </Text>
                    </Flex>
                </Box>

                {/* Individual Control Sections with Inset Relief */}
                <Box
                    bg="rgba(0,0,0,0.3)"
                    p="20px"
                    borderRadius="20px"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    boxShadow="inset 0 2px 10px rgba(0,0,0,0.5)"
                >
                    <TelescopeControls variant="pad" />
                </Box>

                <Box
                    bg="rgba(0,0,0,0.3)"
                    p="20px"
                    borderRadius="20px"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    boxShadow="inset 0 2px 10px rgba(0,0,0,0.5)"
                >
                    <CameraControls />
                </Box>

                {/* Object Finder - GOTO */}
                <Box
                    bg="rgba(0,0,0,0.3)"
                    p="20px"
                    borderRadius="20px"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    boxShadow="inset 0 2px 10px rgba(0,0,0,0.5)"
                >
                    <HStack gap={3} mb={4}>
                        <Icon as={Telescope} color="#FFB300" boxSize={4} />
                        <Heading size="xs" color="#FFB300" letterSpacing="0.2em" fontWeight="900">CHERCHEUR D'OBJETS</Heading>
                    </HStack>
                    <ObjectFinder />
                </Box>

                {/* Capture & Stacking */}
                <Box
                    bg="rgba(0,0,0,0.3)"
                    p="20px"
                    borderRadius="20px"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    boxShadow="inset 0 2px 10px rgba(0,0,0,0.5)"
                >
                    <HStack gap={3} mb={4}>
                        <Icon as={Camera} color="#00F0FF" boxSize={4} />
                        <Heading size="xs" color="#00F0FF" letterSpacing="0.2em" fontWeight="900">CAPTURE & STACKING</Heading>
                    </HStack>
                    <CaptureAndStack />
                </Box>
            </VStack>
        </Box>
    );
};
