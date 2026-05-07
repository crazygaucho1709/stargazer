"use client";

import { 
    VStack, Text, Heading, Box, HStack, Icon, Grid
} from "@chakra-ui/react";

import { Radio, Activity, Terminal } from "lucide-react";
import { InfrastructureStatus } from "./InfrastructureStatus";
import { ActionButtons } from "./ActionButtons";
import { LogStream } from "./LogStream";
import { GlobalLoader } from "../ui/GlobalLoader";
import { CaptureProgress } from "./CaptureProgress";
import { HfrOverlay } from "./HfrOverlay";

export default function ObservatoryPanel() {
    return (
        <VStack align="stretch" gap={8} h="full" w="full" maxW="1200px" mx="auto" pb={10}>
            {/* Header */}
            <VStack align="start" gap={1}>
                <HStack>
                    <Icon as={Radio} color="cyan.400" boxSize={6} />
                    <Heading size="md" color="white" letterSpacing="0.1em">REMOTE OBSERVATORY CENTER</Heading>
                </HStack>
                <Text fontSize="13px" color="whiteAlpha.600">
                    Full control of Stargazer infrastructure: Mac Mini M4, Astroberry Pi, and NexStar 4SE.
                </Text>
            </VStack>

            <Box h="1px" bg="whiteAlpha.100" w="full" />


            {/* Health Section */}
            <Box>
                <HStack mb={4} gap={2}>
                    <Icon as={Activity} color="green.400" boxSize={4} />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="whiteAlpha.800">INFRASTRUCTURE HEALTH</Text>
                </HStack>
                <InfrastructureStatus />
            </Box>

            {/* Main Content: Actions & Logs */}
            <Grid templateColumns={{ base: "1fr", xl: "350px 1fr" }} gap={8} alignItems="start">
                <Box bg="rgba(255,255,255,0.02)" p={6} borderRadius="2xl" border="1px solid rgba(255,255,255,0.05)">
                    <ActionButtons />
                </Box>
                
                <Box h="full">
                    <LogStream />
                </Box>
            </Grid>

            {/* Safety Footer */}
            <HStack bg="red.900" p={3} borderRadius="lg" border="1px solid" borderColor="red.700" gap={3}>
                <Icon as={Terminal} color="red.200" />
                <Text fontSize="11px" color="red.100" fontWeight="bold">
                    SAFETY NOTE: Always ensure the telescope is balanced and cables are free before remote slewing. In case of emergency, use &quot;ABORT ALL&quot;.
                </Text>

            </HStack>
        </VStack>
    );
}
