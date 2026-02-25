// src/components/ui/ConfigurationMenu.tsx
"use client";

import {
    Box,
    IconButton,
    Drawer,
    DrawerBody,
    DrawerHeader,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
    useDisclosure,
    VStack,
    FormControl,
    FormLabel,
    Input,
    Button,
    Heading,
    Text,
    Divider,
    HStack,
    Icon,
} from "@chakra-ui/react";
import { Settings, Cpu, Radio, Zap, ShieldCheck } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

export const ConfigurationMenu = () => {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { config, updateConfig } = useStargazerStore();

    return (
        <>
            <IconButton
                aria-label="Configuration"
                icon={<Settings size={20} />}
                position="absolute"
                bottom="40px"
                right="40px"
                borderRadius="full"
                className="glass-panel"
                bg="rgba(0,0,0,0.6)"
                color="#00F0FF"
                border="1px solid rgba(0,240,255,0.3)"
                boxShadow="0 0 15px rgba(0,240,255,0.2)"
                _hover={{ transform: "rotate(90deg) scale(1.1)", bg: "rgba(0,0,0,0.8)" }}
                transition="all 0.4s"
                zIndex={100}
                onClick={onOpen}
            />

            <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="sm">
                <DrawerOverlay backdropFilter="blur(10px)" />
                <DrawerContent bg="rgba(5, 5, 10, 0.95)" color="white" borderLeft="1px solid rgba(0, 240, 255, 0.2)">
                    <DrawerCloseButton color="whiteAlpha.600" />
                    <DrawerHeader borderBottomWidth="1px" borderColor="whiteAlpha.100">
                        <HStack gap={3}>
                            <Icon as={Cpu} color="#00F0FF" />
                            <Heading size="md" className="hud-font">SYSTEM_CONFIG</Heading>
                        </HStack>
                    </DrawerHeader>

                    <DrawerBody py={8}>
                        <VStack gap={8} align="stretch">
                            <Box>
                                <HStack mb={4} gap={2}>
                                    <Icon as={ShieldCheck} boxSize={3} color="#FFB300" />
                                    <Text fontSize="10px" color="whiteAlpha.500" letterSpacing="0.2em" fontWeight="bold">AI_INTEGRATION</Text>
                                </HStack>
                                <FormControl>
                                    <FormLabel fontSize="xs" color="whiteAlpha.700">GEMINI_API_KEY</FormLabel>
                                    <Input
                                        type="password"
                                        placeholder="••••••••••••••••"
                                        bg="whiteAlpha.50"
                                        borderColor="whiteAlpha.200"
                                        fontSize="sm"
                                        value={config.aiKey}
                                        onChange={(e) => updateConfig({ aiKey: e.target.value })}
                                    />
                                    <Text fontSize="9px" color="whiteAlpha.400" mt={2}>Used for autonomous target identification and log analysis.</Text>
                                </FormControl>
                            </Box>

                            <Divider borderColor="whiteAlpha.100" />

                            <Box>
                                <HStack mb={4} gap={2}>
                                    <Icon as={Radio} boxSize={3} color="#00F0FF" />
                                    <Text fontSize="10px" color="whiteAlpha.500" letterSpacing="0.2em" fontWeight="bold">HARDWARE_LINK</Text>
                                </HStack>
                                <VStack gap={4}>
                                    <FormControl>
                                        <FormLabel fontSize="xs" color="whiteAlpha.700">ASTROBERRY_URL</FormLabel>
                                        <Input
                                            placeholder="http://astroberry.local"
                                            bg="whiteAlpha.50"
                                            borderColor="whiteAlpha.200"
                                            fontSize="sm"
                                            value={config.astroberryUrl}
                                            onChange={(e) => updateConfig({ astroberryUrl: e.target.value })}
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel fontSize="xs" color="whiteAlpha.700">INDI_DRIVER_INSTANCE</FormLabel>
                                        <Input
                                            placeholder="EQMOD_INDI"
                                            bg="whiteAlpha.50"
                                            borderColor="whiteAlpha.200"
                                            fontSize="sm"
                                            value={config.driverInstance}
                                            onChange={(e) => updateConfig({ driverInstance: e.target.value })}
                                        />
                                    </FormControl>
                                </VStack>
                            </Box>

                            <Divider borderColor="whiteAlpha.100" />

                            <Box>
                                <HStack mb={4} gap={2}>
                                    <Icon as={Zap} boxSize={3} color="#E60000" />
                                    <Text fontSize="10px" color="whiteAlpha.500" letterSpacing="0.2em" fontWeight="bold">NETWORK_CONTROL</Text>
                                </HStack>
                                <FormControl>
                                    <FormLabel fontSize="xs" color="whiteAlpha.700">WIFI_SSID</FormLabel>
                                    <Input
                                        placeholder="Stargazer_Net_5G"
                                        bg="whiteAlpha.50"
                                        borderColor="whiteAlpha.200"
                                        fontSize="sm"
                                        value={config.wifiSsid}
                                        onChange={(e) => updateConfig({ wifiSsid: e.target.value })}
                                    />
                                </FormControl>
                            </Box>

                            <Button
                                w="full"
                                colorScheme="cyan"
                                variant="outline"
                                mt={4}
                                className="hud-font"
                                fontSize="xs"
                                onClick={onClose}
                                borderColor="#00F0FF"
                                _hover={{ bg: "rgba(0, 240, 255, 0.1)" }}
                            >
                                SAVE_AND_RECONNECT
                            </Button>
                        </VStack>
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </>
    );
};
