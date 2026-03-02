"use client";

import { useState } from "react";
import {
    Box, IconButton, VStack, HStack, Text, Input, Button, Heading, Icon, Flex, Grid, Portal, Spinner
} from "@chakra-ui/react";
import {
    Settings, Cpu, Radio, Zap, ShieldCheck, X, Camera, Telescope, Gamepad2, Compass, Layers, Wand2, Power, Globe, LocateFixed
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { mockApi } from "@/services/mockApi";

export const ConfigurationMenu = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("hardware");
    
    const onOpen = () => setIsOpen(true);
    const onClose = () => setIsOpen(false);
    
    const { config, updateConfig, language, setLanguage } = useStargazerStore();

    const tabs = [
        { id: "wizard", label: t("TAB_WIZARD", language), icon: Wand2 },
        { id: "hardware", label: t("TAB_HARDWARE", language), icon: Cpu },
        { id: "mount", label: t("TAB_MOUNT", language), icon: Telescope },
        { id: "camera", label: t("TAB_CAMERA", language), icon: Camera },
        { id: "gamepad", label: t("TAB_GAMEPAD", language), icon: Gamepad2 },
        { id: "capture", label: t("TAB_CAPTURE", language), icon: Layers },
        { id: "system", label: t("TAB_SYSTEM", language), icon: Globe },
    ];

    return (
        <>
            <IconButton
                aria-label="Configuration"
                variant="ghost"
                color="var(--astro-teal)"
                _hover={{ bg: "rgba(0, 240, 255, 0.1)", transform: "rotate(90deg)" }}
                transition="all 0.4s"
                onClick={onOpen}
            >
                <Settings size={22} />
            </IconButton>

            {/* Render Backdrop and Panel inside a Portal to escape local stacking context */}
            <Portal>
                {/* Backdrop */}
                {isOpen && (
                    <Box 
                        position="fixed" inset={0} bg="rgba(0,0,0,0.8)" 
                        backdropFilter="blur(20px)" zIndex={9998} onClick={onClose}
                    />
                )}

                {/* Sliding Full/Large Panel */}
                <Box
                    position="fixed" top="5%" right={isOpen ? "5%" : "-100%"}
                    h="90vh" w="90vw" maxW="1200px"
                    bg="rgba(5, 5, 10, 0.95)" color="white"
                    border="1px solid rgba(0, 240, 255, 0.2)"
                    borderRadius="16px"
                    transition="right 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
                    zIndex={9999}
                    boxShadow="-5px 0 50px rgba(0,240,255,0.1)"
                    overflow="hidden"
                    display="flex"
                    flexDirection="column"
                >
                {/* Header */}
                <Box p={6} borderBottomWidth="1px" borderColor="whiteAlpha.100" position="relative" bg="rgba(255,255,255,0.02)">
                    <HStack gap={4}>
                        <Icon as={Wand2} color="#00F0FF" boxSize={6} />
                        <VStack align="start" gap={0}>
                            <Heading size="md" className="hud-font" letterSpacing="0.1em">{t("CONFIG_TITLE", language)}</Heading>
                            <Text fontSize="10px" color="whiteAlpha.500" letterSpacing="0.2em">{t("CONFIG_SUBTITLE", language)}</Text>
                        </VStack>
                    </HStack>
                    <IconButton
                        aria-label="Close" position="absolute" top={6} right={6} variant="ghost" color="whiteAlpha.600"
                        _hover={{ bg: "rgba(255,51,51,0.2)", color: "var(--astro-gold)" }} onClick={onClose}
                    >
                        <X size={24} />
                    </IconButton>
                </Box>

                {/* Body (Sidebar + Content) */}
                <Flex flex={1} overflow="hidden">
                    {/* Sidebar Tabs */}
                    <VStack w="280px" borderRight="1px solid rgba(255,255,255,0.05)" p={4} align="stretch" gap={2} bg="rgba(0,0,0,0.2)">
                        {tabs.map(tab => (
                            <Button
                                key={tab.id}
                                variant="ghost"
                                justifyContent="flex-start"
                                w="full"
                                py={6}
                                bg={activeTab === tab.id ? "rgba(0, 240, 255, 0.1)" : "transparent"}
                                color={activeTab === tab.id ? "#00F0FF" : "whiteAlpha.700"}
                                borderLeft={activeTab === tab.id ? "3px solid #00F0FF" : "3px solid transparent"}
                                _hover={{ bg: "rgba(255,255,255,0.05)" }}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <HStack gap={3}>
                                    <Icon as={tab.icon} boxSize={5} />
                                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.05em">{tab.label.toUpperCase()}</Text>
                                </HStack>
                            </Button>
                        ))}
                    </VStack>

                    {/* Content Area */}
                    <Box flex={1} p={8} overflowY="auto" className="custom-scrollbar">
                        {activeTab === "wizard" && <WizardTab language={language} />}
                        {activeTab === "hardware" && <HardwareTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "mount" && <MountTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "camera" && <CameraTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "gamepad" && <GamepadTab language={language} />}
                        {activeTab === "capture" && <CaptureTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "system" && <SystemTab config={config} updateConfig={updateConfig} language={language} setLanguage={setLanguage} />}
                    </Box>
                </Flex>
            </Box>
            </Portal>
        </>
    );
};

/* --- TAB COMPONENTS --- */

const WizardTab = ({ language }: any) => {
    const { config } = useStargazerStore();
    const [wizardState, setWizardState] = useState({ step: 1, isRunning: false, error: "" });

    const runWizard = async () => {
        setWizardState({ step: 1, isRunning: true, error: "" });
        
        // Verify connection before starting wizard
        const pingRes = await mockApi.ping(config.astroberryUrl);
        if (!pingRes.success) {
            setWizardState({ step: 1, isRunning: false, error: `Connection failed: ${pingRes.error}. Please configure hardware first.` });
            return;
        }

        setTimeout(() => setWizardState(prev => ({ ...prev, step: 2 })), 1500);
        setTimeout(() => setWizardState(prev => ({ ...prev, step: 3 })), 4000);
        setTimeout(() => setWizardState(prev => ({ ...prev, step: 4 })), 6500);
        setTimeout(() => setWizardState({ step: 5, isRunning: false, error: "" }), 9000);
    };

    return (
        <VStack align="stretch" gap={8}>
            <Box bg="rgba(0, 240, 255, 0.05)" p={6} borderRadius="8px" border="1px solid rgba(0, 240, 255, 0.2)">
                <HStack mb={4} gap={3}>
                    <Icon as={Wand2} color="#00F0FF" boxSize={6} />
                    <Heading size="sm" color="white">{t("TAB_WIZARD", language)}</Heading>
                </HStack>
                <Text fontSize="sm" color="whiteAlpha.800" mb={6} lineHeight={1.6}>
                    {t("WIZ_DESC", language)}
                </Text>
                {wizardState.error && (
                    <Text fontSize="12px" color="red.400" mb={4} p={3} bg="rgba(255,0,0,0.1)" borderRadius="md">
                        {wizardState.error}
                    </Text>
                )}
                <Flex gap={4}>
                    <Button colorScheme="cyan" bg="#00F0FF" color="black" _hover={{ bg: "#00c4cc" }} onClick={runWizard} disabled={wizardState.isRunning}>
                        {wizardState.isRunning ? <Spinner size="sm" mr={2} /> : <Power size={16} style={{ marginRight: '8px' }} />}
                        {t("WIZ_BTN_START", language)}
                    </Button>
                    <Button variant="outline" borderColor="whiteAlpha.300" color="whiteAlpha.800" _hover={{ bg: "whiteAlpha.100" }} disabled={wizardState.isRunning}>
                        {t("WIZ_BTN_SKIP", language)}
                    </Button>
                </Flex>
            </Box>

            <Grid templateColumns="repeat(2, 1fr)" gap={6}>
                <WizardStep step={1} title={t("WIZ_STEP1_TITLE", language)} status={wizardState.step > 1 ? "DONE" : wizardState.step === 1 && wizardState.isRunning ? "ACTIVE" : "PENDING"} desc={t("WIZ_STEP1_DESC", language)} language={language} />
                <WizardStep step={2} title={t("WIZ_STEP2_TITLE", language)} status={wizardState.step > 2 ? "DONE" : wizardState.step === 2 ? "ACTIVE" : "PENDING"} desc={t("WIZ_STEP2_DESC", language)} language={language} />
                <WizardStep step={3} title={t("WIZ_STEP3_TITLE", language)} status={wizardState.step > 3 ? "DONE" : wizardState.step === 3 ? "ACTIVE" : "PENDING"} desc={t("WIZ_STEP3_DESC", language)} language={language} />
                <WizardStep step={4} title={t("WIZ_STEP4_TITLE", language)} status={wizardState.step > 4 ? "DONE" : wizardState.step === 4 ? "ACTIVE" : "PENDING"} desc={t("WIZ_STEP4_DESC", language)} language={language} />
            </Grid>
        </VStack>
    );
};

const WizardStep = ({ step, title, status, desc, action, language }: any) => {
    const isDone = status === "DONE";
    const isActive = status === "ACTIVE";
    return (
        <Box p={5} borderRadius="8px" border="1px solid" borderColor={isActive ? "#00F0FF" : "whiteAlpha.100"} bg={isActive ? "rgba(0, 240, 255, 0.05)" : "rgba(0,0,0,0.3)"}>
            <HStack justify="space-between" mb={3}>
                <HStack gap={3}>
                    <Box w="24px" h="24px" borderRadius="full" bg={isDone ? "green.500" : isActive ? "#00F0FF" : "whiteAlpha.200"} color={isDone || isActive ? "black" : "white"} display="flex" alignItems="center" justifyContent="center" fontSize="12px" fontWeight="bold">
                        {step}
                    </Box>
                    <Text fontSize="12px" fontWeight="bold" color={isActive ? "#00F0FF" : "white"}>{title}</Text>
                </HStack>
                {isDone && <Icon as={ShieldCheck} color="green.500" />}
            </HStack>
            <Text fontSize="11px" color="whiteAlpha.600" mb={isActive ? 4 : 0}>{desc}</Text>
            {isActive && action && (
                <Button size="sm" w="full" variant="outline" borderColor="#00F0FF" color="#00F0FF" fontSize="10px">
                    {action}
                </Button>
            )}
        </Box>
    );
};

const HardwareTab = ({ config, updateConfig, language }: any) => {
    const [testStatus, setTestStatus] = useState<{ status: 'idle' | 'testing' | 'success' | 'error', message: string }>({ status: 'idle', message: '' });

    const handleTest = async () => {
        setTestStatus({ status: 'testing', message: '' });
        const res = await mockApi.testConnection(config.astroberryUrl, config.driverInstance);
        setTestStatus({ status: res.success ? 'success' : 'error', message: res.message });
    };

    return (
        <VStack align="stretch" gap={8}>
            <Text fontSize="sm" color="whiteAlpha.600">{t("HW_DESC", language)}</Text>
            
            <Box>
                <HStack mb={4} gap={2}><Icon as={Radio} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("HW_ASTROBERRY", language)}</Text></HStack>
                <VStack gap={4}>
                    <Box w="full">
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_SERVER_URL", language)}</Text>
                        <Input bg="rgba(0,0,0,0.3)" borderColor="whiteAlpha.200" value={config.astroberryUrl} onChange={(e) => updateConfig({ astroberryUrl: e.target.value })} />
                    </Box>
                    <HStack w="full" gap={4}>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_DRIVER", language)}</Text>
                            <Input bg="rgba(0,0,0,0.3)" borderColor="whiteAlpha.200" value={config.driverInstance} onChange={(e) => updateConfig({ driverInstance: e.target.value })} />
                        </Box>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_BAUD", language)}</Text>
                            <select value={config.baudRate} onChange={(e) => updateConfig({ baudRate: e.target.value })} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                                <option value="9600">9600</option>
                                <option value="115200">115200</option>
                            </select>
                        </Box>
                    </HStack>
                    <Button w="full" colorScheme="cyan" variant="outline" size="sm" onClick={handleTest} disabled={testStatus.status === 'testing'}>
                        {testStatus.status === 'testing' ? <Spinner size="sm" mr={2} /> : null}
                        {t("HW_BTN_TEST", language)}
                    </Button>
                    {testStatus.message && (
                        <Text fontSize="12px" color={testStatus.status === 'success' ? "green.400" : "red.400"} mt={2}>
                            {testStatus.message}
                        </Text>
                    )}
                </VStack>
            </Box>

            <Box borderBottomWidth="1px" borderColor="whiteAlpha.100" />

            <Box>
                <HStack mb={4} gap={2}><Icon as={Wand2} boxSize={4} color="var(--astro-gold)" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="var(--astro-gold)">{t("HW_AI_TITLE", language)}</Text></HStack>
                <Box w="full">
                    <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_AI_KEY", language)}</Text>
                    <Input type="password" bg="rgba(0,0,0,0.3)" borderColor="whiteAlpha.200" placeholder="AI Key..." value={config.aiKey} onChange={(e) => updateConfig({ aiKey: e.target.value })} />
                </Box>
            </Box>
        </VStack>
    );
};

const MountTab = ({ config, updateConfig, language }: any) => {
    const { mountLimits, setMountLimits } = useStargazerStore();
    return (
        <VStack align="stretch" gap={8}>
            <Text fontSize="sm" color="whiteAlpha.600">{t("MNT_DESC", language)}</Text>
            
            <Box>
                <HStack mb={4} gap={2}><Icon as={Compass} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("MNT_TRACKING", language)}</Text></HStack>
                <VStack gap={5} align="stretch" bg="rgba(0,0,0,0.3)" p={5} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                    <HStack justify="space-between">
                        <VStack align="start" gap={0}>
                            <Text fontSize="12px" color="white">{t("MNT_AUTO_TRACK", language)}</Text>
                            <Text fontSize="10px" color="whiteAlpha.500">{t("MNT_AUTO_TRACK_DESC", language)}</Text>
                        </VStack>
                        <input type="checkbox" checked={config.autoTracking} onChange={(e) => updateConfig({ autoTracking: e.target.checked })} style={{ accentColor: "#00F0FF", width: "18px", height: "18px" }} />
                    </HStack>
                    <Box borderBottomWidth="1px" borderColor="whiteAlpha.100" />
                    <Box w="full">
                        <Text fontSize="10px" color="whiteAlpha.700" mb={4}>{t("MNT_SLEW", language)}</Text>
                        <input type="range" min="0" max="9" step="1" value={config.slewSpeed} onChange={(e) => updateConfig({ slewSpeed: parseInt(e.target.value) })} style={{ width: '100%', accentColor: '#00F0FF' }} />
                        <HStack justify="space-between" mt={2}>
                            <Text fontSize="9px" color="whiteAlpha.400">{t("MNT_FINE", language)}</Text>
                            <Text fontSize="9px" color="whiteAlpha.400">{t("MNT_MAX", language)}</Text>
                        </HStack>
                    </Box>
                </VStack>
            </Box>

            <Box>
                <HStack mb={4} gap={2}><Icon as={ShieldCheck} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("MNT_LIMITS", language)}</Text></HStack>
                <HStack gap={4}>
                    <Box flex={1} bg="rgba(0,0,0,0.3)" p={4} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                        <Text fontSize="10px" color="whiteAlpha.500" mb={2}>{t("MNT_MIN_ALT", language)}</Text>
                        <Input type="number" bg="rgba(0,0,0,0.5)" borderColor="whiteAlpha.200" value={mountLimits.minAlt} onChange={(e) => setMountLimits({ minAlt: parseInt(e.target.value) })} />
                    </Box>
                    <Box flex={1} bg="rgba(0,0,0,0.3)" p={4} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                        <Text fontSize="10px" color="whiteAlpha.500" mb={2}>{t("MNT_MAX_ALT", language)}</Text>
                        <Input type="number" bg="rgba(0,0,0,0.5)" borderColor="whiteAlpha.200" value={mountLimits.maxAlt} onChange={(e) => setMountLimits({ maxAlt: parseInt(e.target.value) })} />
                    </Box>
                </HStack>
            </Box>
        </VStack>
    );
};

const CameraTab = ({ config, updateConfig, language }: any) => {
    const [focusStatus, setFocusStatus] = useState<{ status: 'idle' | 'running' | 'success' | 'error', hfr?: number, error?: string }>({ status: 'idle' });

    const handleFocus = async () => {
        setFocusStatus({ status: 'running' });
        const res = await mockApi.runAiFocus();
        if (res.success) {
            setFocusStatus({ status: 'success', hfr: res.hfr });
        } else {
            setFocusStatus({ status: 'error', error: res.error });
        }
    };

    return (
        <VStack align="stretch" gap={8}>
            <Text fontSize="sm" color="whiteAlpha.600">{t("CAM_DESC", language)}</Text>

            <Box>
                <HStack mb={4} gap={2}><Icon as={Camera} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("CAM_TITLE", language)}</Text></HStack>
                <VStack gap={4} bg="rgba(0,0,0,0.3)" p={5} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                    <HStack w="full" gap={4}>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("CAM_FORMAT", language)}</Text>
                            <select value={config.captureFormat} onChange={(e) => updateConfig({ captureFormat: e.target.value })} style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                                <option value="RAW">RAW (CR2)</option>
                                <option value="JPEG">JPEG (Fine)</option>
                                <option value="RAW+JPEG">RAW + JPEG</option>
                            </select>
                        </Box>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("CAM_COOLING", language)}</Text>
                            <select value={config.sensorCooling ? 'ON' : 'OFF'} onChange={(e) => updateConfig({ sensorCooling: e.target.value === 'ON' })} style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                                <option value="ON">ON (-15°C Target)</option>
                                <option value="OFF">OFF</option>
                            </select>
                        </Box>
                    </HStack>
                </VStack>
            </Box>

            <Box>
                <HStack mb={4} gap={2}><Icon as={LocateFixed} boxSize={4} color="var(--astro-gold)" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="var(--astro-gold)">{t("CAM_AI_FOCUS_TITLE", language)}</Text></HStack>
                <VStack gap={5} align="stretch" bg="rgba(255, 179, 71, 0.05)" p={5} borderRadius="8px" border="1px solid rgba(255, 179, 71, 0.2)">
                    <Text fontSize="11px" color="whiteAlpha.800">{t("CAM_AI_FOCUS_DESC", language)}</Text>
                    {focusStatus.status === 'error' && (
                        <Text fontSize="12px" color="red.400" bg="rgba(255,0,0,0.1)" p={3} borderRadius="md">{focusStatus.error}</Text>
                    )}
                    <HStack justify="space-between">
                        <VStack align="start" gap={0}>
                            <Text fontSize="12px" color="white">{t("CAM_AI_FOCUS_EN", language)}</Text>
                            <Text fontSize="10px" color="whiteAlpha.500">{t("CAM_AI_FOCUS_EN_DESC", language)}</Text>
                        </VStack>
                        <input type="checkbox" checked={config.aiFocus} onChange={(e) => updateConfig({ aiFocus: e.target.checked })} style={{ accentColor: "var(--astro-gold)", width: "18px", height: "18px" }} />
                    </HStack>
                    <Button size="sm" w="full" bg="var(--astro-gold)" color="black" _hover={{ bg: "#e69c3a" }} onClick={handleFocus} disabled={focusStatus.status === 'running'}>
                        {focusStatus.status === 'running' ? <Spinner size="sm" mr={2} /> : null}
                        {focusStatus.status === 'success' ? `HFR CALIBRATED: ${focusStatus.hfr?.toFixed(2)}` : t("CAM_AI_FOCUS_BTN", language)}
                    </Button>
                </VStack>
            </Box>
        </VStack>
    );
};

const GamepadTab = ({ language }: any) => (
    <VStack align="stretch" gap={8}>
        <Text fontSize="sm" color="whiteAlpha.600">{t("GP_DESC", language)}</Text>
        
        <Box bg="rgba(0,0,0,0.3)" p={6} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)" textAlign="center">
            <Icon as={Gamepad2} boxSize={12} color="whiteAlpha.400" mb={4} />
            <Heading size="sm" color="white" mb={2}>{t("GP_NO_PAD", language)}</Heading>
            <Text fontSize="11px" color="whiteAlpha.500" mb={6}>{t("GP_NO_PAD_DESC", language)}</Text>
            <Button size="sm" variant="outline" colorScheme="cyan">{t("GP_SCAN", language)}</Button>
        </Box>

        <Box opacity={0.5} pointerEvents="none">
            <HStack mb={4} gap={2}><Icon as={Settings} boxSize={4} /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("GP_MAP", language)}</Text></HStack>
            <VStack gap={3} align="stretch">
                <HStack justify="space-between" bg="rgba(0,0,0,0.5)" p={3} borderRadius="md"><Text fontSize="11px">Left Stick (X/Y)</Text><Text fontSize="11px" color="#00F0FF">Mount Azimuth / Altitude</Text></HStack>
                <HStack justify="space-between" bg="rgba(0,0,0,0.5)" p={3} borderRadius="md"><Text fontSize="11px">Right Stick (Y)</Text><Text fontSize="11px" color="#00F0FF">Focuser In / Out</Text></HStack>
                <HStack justify="space-between" bg="rgba(0,0,0,0.5)" p={3} borderRadius="md"><Text fontSize="11px">D-Pad</Text><Text fontSize="11px" color="#00F0FF">Micro-Step Jogging</Text></HStack>
                <HStack justify="space-between" bg="rgba(0,0,0,0.5)" p={3} borderRadius="md"><Text fontSize="11px">R1 / R2</Text><Text fontSize="11px" color="#00F0FF">Increase / Decrease Slew Speed</Text></HStack>
                <HStack justify="space-between" bg="rgba(0,0,0,0.5)" p={3} borderRadius="md"><Text fontSize="11px">Cross / A</Text><Text fontSize="11px" color="#00F0FF">Start Exposure</Text></HStack>
            </VStack>
        </Box>
    </VStack>
);

const CaptureTab = ({ config, updateConfig, language }: any) => (
    <VStack align="stretch" gap={8}>
        <Text fontSize="sm" color="whiteAlpha.600">{t("CAP_DESC", language)}</Text>

        <Box>
            <HStack mb={4} gap={2}><Icon as={Layers} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("CAP_SEQ", language)}</Text></HStack>
            <VStack gap={4} bg="rgba(0,0,0,0.3)" p={5} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                <HStack w="full" gap={4}>
                    <Box flex={1}>
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("CAP_EXP", language)}</Text>
                        <Input type="number" bg="rgba(0,0,0,0.5)" borderColor="whiteAlpha.200" value={config.exposureTime} onChange={(e) => updateConfig({ exposureTime: parseInt(e.target.value) })} />
                    </Box>
                    <Box flex={1}>
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("CAP_ISO", language)}</Text>
                        <select value={config.isoGain} onChange={(e) => updateConfig({ isoGain: e.target.value })} style={{ width: "100%", background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                            <option value="400">ISO 400</option>
                            <option value="800">ISO 800</option>
                            <option value="1600">ISO 1600</option>
                            <option value="3200">ISO 3200</option>
                        </select>
                    </Box>
                    <Box flex={1}>
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("CAP_FRAMES", language)}</Text>
                        <Input type="number" bg="rgba(0,0,0,0.5)" borderColor="whiteAlpha.200" value={config.frameCount} onChange={(e) => updateConfig({ frameCount: parseInt(e.target.value) })} />
                    </Box>
                </HStack>
                <HStack w="full" gap={4} mt={2}>
                    <input type="checkbox" checked={config.dithering} onChange={(e) => updateConfig({ dithering: e.target.checked })} style={{ accentColor: "#00F0FF", width: "18px", height: "18px" }} />
                    <Text fontSize="11px" color="white">{t("CAP_DITHER", language)}</Text>
                </HStack>
            </VStack>
        </Box>

        <Box>
            <HStack mb={4} gap={2}><Icon as={Wand2} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("CAP_AI_TITLE", language)}</Text></HStack>
            <VStack gap={4} bg="rgba(0,0,0,0.3)" p={5} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                <HStack justify="space-between" w="full">
                    <Text fontSize="12px" color="white">{t("CAP_AI_STACK", language)}</Text>
                    <input type="checkbox" checked={config.liveStacking} onChange={(e) => updateConfig({ liveStacking: e.target.checked })} style={{ accentColor: "#00F0FF", width: "18px", height: "18px" }} />
                </HStack>
                <Box borderBottomWidth="1px" borderColor="whiteAlpha.100" w="full" />
                <HStack justify="space-between" w="full">
                    <VStack align="start" gap={0}>
                        <Text fontSize="12px" color="white">{t("CAP_AI_COLOR", language)}</Text>
                        <Text fontSize="10px" color="whiteAlpha.500">{t("CAP_AI_COLOR_DESC", language)}</Text>
                    </VStack>
                    <input type="checkbox" checked={config.aiColorization} onChange={(e) => updateConfig({ aiColorization: e.target.checked })} style={{ accentColor: "#9F7AEA", width: "18px", height: "18px" }} />
                </HStack>
                <Box borderBottomWidth="1px" borderColor="whiteAlpha.100" w="full" />
                <HStack justify="space-between" w="full">
                    <Text fontSize="12px" color="white">{t("CAP_SAVE", language)}</Text>
                    <input type="checkbox" checked={config.autoSave} onChange={(e) => updateConfig({ autoSave: e.target.checked })} style={{ accentColor: "#00F0FF", width: "18px", height: "18px" }} />
                </HStack>
            </VStack>
        </Box>
    </VStack>
);

const SystemTab = ({ config, updateConfig, language, setLanguage }: any) => (
    <VStack align="stretch" gap={8}>
        <Text fontSize="sm" color="whiteAlpha.600">{t("SYS_DESC", language)}</Text>

        <HStack gap={6} align="start">
            <Box flex={1}>
                <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("SYS_UNIT", language)}</Text>
                <select value={config.unitSystem} onChange={(e) => updateConfig({ unitSystem: e.target.value })} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                    <option value="METRIC">Metric (Celsius, km/h)</option>
                    <option value="IMPERIAL">Imperial (Fahrenheit, mph)</option>
                </select>
            </Box>
            <Box flex={1}>
                <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("SYS_LANG", language)}</Text>
                <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'fr')} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                </select>
            </Box>
        </HStack>

        <Box>
            <HStack mb={4} gap={2}><Icon as={Globe} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("SYS_LOC_TITLE", language)}</Text></HStack>
            <VStack gap={4} bg="rgba(0,0,0,0.3)" p={5} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                <Text fontSize="11px" color="whiteAlpha.500">{t("SYS_LOC_DESC", language)}</Text>
                <HStack w="full" gap={4}>
                    <Box flex={1}>
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("SYS_LAT", language)}</Text>
                        <Input bg="rgba(0,0,0,0.5)" borderColor="whiteAlpha.200" placeholder="48.8566" value={config.latitude} onChange={(e) => updateConfig({ latitude: e.target.value })} />
                    </Box>
                    <Box flex={1}>
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("SYS_LON", language)}</Text>
                        <Input bg="rgba(0,0,0,0.5)" borderColor="whiteAlpha.200" placeholder="2.3522" value={config.longitude} onChange={(e) => updateConfig({ longitude: e.target.value })} />
                    </Box>
                </HStack>
                <Button size="sm" w="full" variant="outline" colorScheme="cyan">{t("SYS_APPLY_LOC", language)}</Button>
            </VStack>
        </Box>
    </VStack>
);