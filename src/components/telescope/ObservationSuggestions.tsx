// src/components/telescope/ObservationSuggestions.tsx
"use client";

import { Box, VStack, HStack, Text, Icon, Flex, Button } from "@chakra-ui/react";
import { Target, ChevronRight, Sparkles } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

export const ObservationSuggestions = () => {
    const { targets, setPosition, setSlewing } = useStargazerStore();

    const handleSlew = (ra: string, dec: string) => {
        setSlewing(true);
        setTimeout(() => {
            setPosition(ra, dec);
            setSlewing(false);
        }, 2000);
    };

    return (
        <VStack align="stretch" gap={3} w="full" px={2}>
            <HStack px={2} mb={1}>
                <Icon as={Sparkles} boxSize={3} color="#00F0FF" />
                <Text fontSize="9px" color="whiteAlpha.600" letterSpacing="0.1em" fontWeight="bold">AI_SUGGESTIONS</Text>
            </HStack>

            <VStack align="stretch" gap={2} maxH="120px" overflowY="auto" className="custom-scrollbar" pr={2}>
                {targets.map((target) => (
                    <Flex
                        key={target.id}
                        p={2}
                        bg="whiteAlpha.50"
                        borderRadius="md"
                        border="1px solid whiteAlpha.100"
                        justify="space-between"
                        align="center"
                        transition="all 0.2s"
                        _hover={{ bg: "whiteAlpha.100", borderColor: "rgba(0, 240, 255, 0.3)" }}
                        cursor="pointer"
                        onClick={() => handleSlew(target.ra, target.dec)}
                    >
                        <HStack gap={3}>
                            <Icon as={Target} boxSize={3} color="whiteAlpha.400" />
                            <VStack align="start" gap={0}>
                                <Text fontSize="10px" fontWeight="bold" noOfLines={1}>{target.name}</Text>
                                <Text fontSize="8px" color="whiteAlpha.400">{target.type}</Text>
                            </VStack>
                        </HStack>
                        <Icon as={ChevronRight} boxSize={3} color="whiteAlpha.300" />
                    </Flex>
                ))}
            </VStack>
        </VStack>
    );
};
