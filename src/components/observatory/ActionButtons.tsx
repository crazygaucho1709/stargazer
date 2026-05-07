"use client";

import { useState } from "react";
import { 
    VStack, HStack, Button, Icon, Text, Box
} from "@chakra-ui/react";
import { 
    Power, RefreshCw, Anchor, Compass, ShieldAlert, Rocket, Terminal
} from "lucide-react";
import React from "react";

export const ActionButtons = () => {
    const [loadingAction, setLoadingAction] = useState<string | null>(null);

    const handleAction = async (endpoint: string, method: string = 'POST', body: any = {}) => {
        setLoadingAction(endpoint);
        try {
            const res = await fetch(endpoint, { 
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify(body) : undefined
            });
            
            const text = await res.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = { success: res.ok, message: text || (res.ok ? "Success" : "Invalid response from server") };
            }
            
            if (data.success || res.ok) {
                alert(data.message || data.response?.message || "Action successful");
            } else {
                throw new Error(data.message || data.error || "Action failed");
            }
        } catch (e: any) {
            alert("Error: " + e.message);
        } finally {
            setLoadingAction(null);
        }
    };

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
                        onClick={() => handleAction('/api/mount/park')}
                        isLoading={loadingAction === '/api/mount/park'}
                    />
                    <ActionBtn 
                        label="UNPARK" 
                        icon={Compass} 
                        colorScheme="green" 
                        onClick={() => handleAction('/api/mount/unpark')}
                        isLoading={loadingAction === '/api/mount/unpark'}
                    />
                    <ActionBtn 
                        label="ABORT ALL" 
                        icon={ShieldAlert} 
                        colorScheme="red" 
                        variant="solid"
                        onClick={() => handleAction('/api/mount/abort')}
                        isLoading={loadingAction === '/api/mount/abort'}
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
                            onClick={() => handleAction('/api/indi/reconnect', 'POST', { action: 'reconnect' })}
                            isLoading={loadingAction === '/api/indi/reconnect'}
                        />
                        <ActionBtn 
                            label="LAUNCH EKOS ONLY" 
                            icon={Rocket} 
                            onClick={() => handleAction('/api/indi/launch_ekos', 'POST')}
                            isLoading={loadingAction === '/api/indi/launch_ekos'}
                        />
                    </HStack>
                    <HStack w="full" gap={3}>
                        <ActionBtn 
                            label="RESTART RPI INDI" 
                            icon={Terminal} 
                            onClick={() => handleAction('/api/astroberry', 'POST', { action: 'restart-indi' })}
                            isLoading={loadingAction === '/api/astroberry'}
                        />
                        <ActionBtn 
                            label="REBOOT ASTROBERRY" 
                            icon={Power} 
                            colorScheme="red"
                            onClick={() => {
                                if (confirm("Reboot Astroberry? The observatory will be offline for ~60s.")) {
                                    handleAction('/api/astroberry', 'POST', { action: 'reboot', confirm: 'confirm' });
                                }
                            }}
                        />
                    </HStack>
                </VStack>
            </Box>
        </VStack>
    );
};
