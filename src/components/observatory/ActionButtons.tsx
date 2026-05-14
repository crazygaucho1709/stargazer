"use client";

import React from "react";
import { 
    VStack, HStack, Button, Icon, Text, Box
} from "@chakra-ui/react";
import { 
    Power, RefreshCw, Anchor, Compass, ShieldAlert, Rocket, Terminal
} from "lucide-react";
import { useAstroAction } from "@/hooks/useAstroAction";

export const ActionButtons = () => {
    const { execute, isPending } = useAstroAction();

    const ActionBtn = ({ label, icon: IconComp, onClick, colorScheme = "gray", isLoading = false, variant = "outline" }: any) => (
        <Button 
            size="sm" 
            variant={variant}
            color={variant === 'solid' ? 'white' : 'whiteAlpha.800'}
            bg={variant === 'solid' ? (colorScheme === 'red' ? 'red.600' : 'blue.600') : "rgba(255,255,255,0.02)"}
            onClick={onClick}
            loading={isLoading}
            flex={1}
            fontSize="11px"
            h="40px"
            border="1px solid"
            borderColor={variant === 'solid' ? 'transparent' : 'whiteAlpha.200'}
            _hover={{ bg: variant === 'solid' ? (colorScheme === 'red' ? 'red.700' : 'blue.700') : "rgba(255,255,255,0.08)" }}
        >
            <HStack gap={2}>
                <IconComp size={14} />
                <Text>{label}</Text>
            </HStack>
        </Button>
    );

    return (
        <VStack align="stretch" gap={6} w="full">
            <Box>
                <Text fontSize="12px" fontWeight="bold" color="whiteAlpha.600" mb={3} letterSpacing="0.1em">MOUNT CONTROL</Text>
                <HStack gap={3}>
                    <ActionBtn 
                        label="PARK MOUNT" 
                        icon={Anchor} 
                        colorScheme="yellow" 
                        onClick={() => execute('/api/mount/park', 'PARK MOUNT')}
                        isLoading={isPending}
                    />
                    <ActionBtn 
                        label="UNPARK" 
                        icon={Compass} 
                        colorScheme="green" 
                        onClick={() => execute('/api/mount/unpark', 'UNPARK MOUNT')}
                        isLoading={isPending}
                    />
                    <ActionBtn 
                        label="ABORT ALL" 
                        icon={ShieldAlert} 
                        colorScheme="red" 
                        variant="solid"
                        onClick={() => execute('/api/indi', 'ABORTING ALL', { body: { action: 'abort_all' } })}
                        isLoading={isPending}
                    />
                </HStack>
            </Box>

            <Box h="1px" bg="whiteAlpha.100" w="full" />

            <Box>
                <Text fontSize="12px" fontWeight="bold" color="whiteAlpha.600" mb={3} letterSpacing="0.1em">INFRASTRUCTURE RESTART</Text>
                <VStack gap={3}>
                    <HStack w="full" gap={3}>
                        <ActionBtn 
                            label="RESTART KSTARS+EKOS" 
                            icon={RefreshCw} 
                            onClick={() => execute('/api/indi/reconnect', 'RESTART KSTARS', { body: { action: 'restart_kstars' } })}
                            isLoading={isPending}
                        />
                        <ActionBtn 
                            label="LAUNCH EKOS ONLY" 
                            icon={Rocket} 
                            onClick={() => execute('/api/indi/launch_ekos', 'LAUNCH EKOS')}
                            isLoading={isPending}
                        />
                    </HStack>
                    <HStack w="full" gap={3}>
                        <ActionBtn 
                            label="RESTART RPI INDI" 
                            icon={Terminal} 
                            onClick={() => execute('/api/astroberry', 'RESTART INDI', { body: { action: 'restart-indi' } })}
                            isLoading={isPending}
                        />
                        <ActionBtn 
                            label="REBOOT ASTROBERRY" 
                            icon={Power} 
                            colorScheme="red"
                            onClick={() => {
                                if (confirm("Reboot Astroberry? The observatory will be offline for ~60s.")) {
                                    execute('/api/astroberry', 'REBOOT', { body: { action: 'reboot', confirm: 'confirm' } });
                                }
                            }}
                            isLoading={isPending}
                        />
                    </HStack>
                    
                    <HStack w="full" gap={3}>
                        <ActionBtn 
                            label="CONNECT HARDWARE" 
                            icon={Power} 
                            colorScheme="green"
                            variant="solid"
                            onClick={() => execute('/api/hardware/connect', 'CONNECTING DEVICES', { method: 'POST' })}
                            isLoading={isPending}
                        />
                    </HStack>
                </VStack>
            </Box>
        </VStack>
    );
};
