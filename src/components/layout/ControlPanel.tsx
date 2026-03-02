// src/components/layout/ControlPanel.tsx
"use client";

import { Box, VStack, HStack, Heading, Text, Button, Flex, Icon } from "@chakra-ui/react";
import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Boxes, List, Target } from "lucide-react";

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

                <Box>
                    <HStack gap={3} mb={5}>
                        <Icon as={List} color="#FFB300" boxSize={4} />
                        <Heading size="xs" color="#FFB300" letterSpacing="0.2em" fontWeight="900">PLANNER</Heading>
                    </HStack>
                    <VStack gap={3} align="stretch">
                        {["M42 - Orion Nebula", "M31 - Andromeda", "NGC 7000 - North America"].map((target, idx) => (
                            <Flex
                                key={target}
                                align="center"
                                justify="space-between"
                                p="12px"
                                bg={idx === 0 ? "rgba(208,0,0,0.1)" : "whiteAlpha.50"}
                                borderRadius="12px"
                                border="1px solid"
                                borderColor={idx === 0 ? "#D00000" : "transparent"}
                                cursor="pointer"
                                transition="all 0.2s"
                                _hover={{ bg: "whiteAlpha.100", transform: "translateX(5px)" }}
                            >
                                <HStack gap={3}>
                                    <Icon as={Target} boxSize={3} color={idx === 0 ? "#D00000" : "whiteAlpha.400"} />
                                    <Text fontSize="xs" fontWeight={idx === 0 ? "bold" : "normal"} color={idx === 0 ? "white" : "whiteAlpha.600"}>
                                        {target}
                                    </Text>
                                </HStack>
                                {idx === 0 && <Box w="6px" h="6px" borderRadius="full" bg="#D00000" className="pulse" />}
                            </Flex>
                        ))}
                    </VStack>
                </Box>
            </VStack>
        </Box>
    );
};
