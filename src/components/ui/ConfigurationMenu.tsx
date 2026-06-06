"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Box, IconButton, VStack, HStack, Text, Input, Button, Heading, Icon, Flex, Grid, Portal, Spinner
} from "@chakra-ui/react";
import {
    Settings, Cpu, Radio, Zap, ShieldCheck, X, Camera, Telescope, Gamepad2, Compass, Layers, Wand2, Power, Globe, LocateFixed, Activity, RefreshCw
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { useEnvironmentData } from "@/hooks/useEnvironmentData";
import { useAstroAction } from "@/hooks/useAstroAction";
import { CalibrationWizard } from "@/components/telescope/CalibrationWizard";
import { AutoAlignWizard } from "@/components/telescope/AutoAlignWizard";
import { ObjectFinder } from "@/components/telescope/ObjectFinder";
import { CaptureAndStack } from "@/components/camera/CaptureAndStack";
import { clientApiUrl } from "@/lib/clientApi";
import { AutofocusWizard } from "@/components/telescope/AutofocusWizard";
import ObservatoryPanel from "@/components/observatory/ObservatoryPanel";
import { notification } from "@/lib/notificationService";
import { validateUrl, validateRequired, validateLatitude, validateLongitude, validatePositiveInt, validateMinAlt, validateMaxAlt } from "@/lib/validation";


export const ConfigurationMenu = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("hardware");
    
    const onOpen = () => setIsOpen(true);
    const onClose = () => setIsOpen(false);
    
    const { config, updateConfig, language, setLanguage } = useStargazerStore();

    const tabs = [
        { id: "autoalign", label: language === 'fr' ? "AUTO-ALIGN IA" : "AUTO-ALIGN AI", icon: LocateFixed },
        { id: "wizard", label: t("TAB_WIZARD", language), icon: Wand2 },
        { id: "hardware", label: t("TAB_HARDWARE", language), icon: Cpu },
        { id: "mount", label: t("TAB_MOUNT", language), icon: Telescope },
        { id: "camera", label: t("TAB_CAMERA", language), icon: Camera },
        { id: "objects", label: language === 'fr' ? "CATALOGUE" : "CATALOG", icon: Compass },
        { id: "capture", label: t("TAB_CAPTURE", language), icon: Layers },
        { id: "gamepad", label: t("TAB_GAMEPAD", language), icon: Gamepad2 },
        { id: "system", label: t("TAB_SYSTEM", language), icon: Globe },
        { id: "bridge", label: language === 'fr' ? "RÉSEAU & LOGS" : "NETWORK & LOGS", icon: Activity },
        { id: "observatory", label: language === 'fr' ? "OBSERVATOIRE" : "OBSERVATORY", icon: Radio },
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
                        {activeTab === "autoalign" && <AutoAlignWizardWrapper language={language} />}
                        {activeTab === "wizard" && <CalibrationWizardWrapper language={language} setActiveTab={setActiveTab} onClose={onClose} />}
                        {activeTab === "hardware" && <HardwareTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "mount" && <MountTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "camera" && <CameraTab config={config} updateConfig={updateConfig} language={language} />}
                        {activeTab === "objects" && <ObjectsTab language={language} />}
                        {activeTab === "capture" && <CaptureAndStack />}
                        {activeTab === "gamepad" && <GamepadTab language={language} />}
                        {activeTab === "system" && <SystemTab config={config} updateConfig={updateConfig} language={language} setLanguage={setLanguage} />}
                        {activeTab === "bridge" && <BridgeTab config={config} language={language} />}
                        {activeTab === "observatory" && <ObservatoryPanel />}
                    </Box>
                </Flex>
            </Box>
            </Portal>
        </>
    );
};

/* --- TAB COMPONENTS --- */

const AutoAlignWizardWrapper = ({ language }: { language: string }) => (
    <VStack align="stretch" gap={8}>
        <Box bg="rgba(0,255,209,0.04)" p={6} borderRadius="8px" border="1px solid rgba(0,255,209,0.18)">
            <HStack mb={4} gap={3}>
                <Icon as={LocateFixed} color="var(--astro-teal)" boxSize={6} />
                <VStack align="start" gap={0}>
                    <Heading size="sm" color="white">
                        {language === 'fr' ? 'Auto-Alignement IA' : 'Auto-Align AI'}
                    </Heading>
                    <Text fontSize="10px" color="whiteAlpha.500" letterSpacing="0.08em">
                        {language === 'fr'
                            ? 'Localisation autonome par plate solving — 3 captures — triangulation'
                            : 'Autonomous localization via plate solving — 3 captures — triangulation'}
                    </Text>
                </VStack>
            </HStack>
            <AutoAlignWizard />
        </Box>
    </VStack>
);

const CalibrationWizardWrapper = ({ language, setActiveTab, onClose }: any) => {
    return (
        <VStack align="stretch" gap={8}>
            <Box bg="rgba(0, 240, 255, 0.05)" p={6} borderRadius="8px" border="1px solid rgba(0, 240, 255, 0.2)">
                <HStack mb={4} gap={3}>
                    <Icon as={Wand2} color="#00F0FF" boxSize={6} />
                    <Heading size="sm" color="white">
                        {language === 'fr' ? 'Assistant de Calibration' : 'Calibration Assistant'}
                    </Heading>
                </HStack>
                <CalibrationWizard />
            </Box>
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
    const { execute, isPending } = useAstroAction();
    const [errors, setErrors] = useState<Record<string, string | null>>({});

    const setError = (field: string, msg: string | null) => {
        setErrors((prev) => ({ ...prev, [field]: msg }));
    };

    const handleTest = async () => {
        const urlErr = validateUrl(config.astroberryUrl);
        const drvErr = validateRequired(config.driverInstance);
        setError("astroberryUrl", urlErr);
        setError("driverInstance", drvErr);
        if (urlErr || drvErr) {
            notification.warning("Corrigez les erreurs avant de tester", { source: "Configuration" });
            return;
        }
        await execute(
            async () => {
                const res = await fetch('/api/indi/health-full');
                return res.json();
            },
            language === 'fr' ? "TEST DE CONNEXION" : "CONNECTION TEST",
            { loadingMessage: language === 'fr' ? "VÉRIFICATION DE LA LIAISON..." : "VERIFYING LINK..." }
        );
    };

    return (
        <VStack align="stretch" gap={8}>
            <Text fontSize="sm" color="whiteAlpha.600">{t("HW_DESC", language)}</Text>
            
            <Box>
                <HStack mb={4} gap={2}><Icon as={Radio} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("HW_ASTROBERRY", language)}</Text></HStack>
                <VStack gap={4}>
                    <Box w="full">
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_SERVER_URL", language)}</Text>
                        <Input
                            bg="rgba(0,0,0,0.3)"
                            borderColor={errors.astroberryUrl ? "red.400" : "whiteAlpha.200"}
                            value={config.astroberryUrl}
                            onChange={(e) => { updateConfig({ astroberryUrl: e.target.value }); setError("astroberryUrl", null); }}
                            onBlur={() => setError("astroberryUrl", validateUrl(config.astroberryUrl))}
                        />
                        {errors.astroberryUrl && <Text fontSize="10px" color="red.400" mt={1}>{errors.astroberryUrl}</Text>}
                    </Box>
                    <HStack w="full" gap={4}>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_DRIVER", language)}</Text>
                            <Input
                                bg="rgba(0,0,0,0.3)"
                                borderColor={errors.driverInstance ? "red.400" : "whiteAlpha.200"}
                                value={config.driverInstance}
                                onChange={(e) => { updateConfig({ driverInstance: e.target.value }); setError("driverInstance", null); }}
                                onBlur={() => setError("driverInstance", validateRequired(config.driverInstance))}
                            />
                            {errors.driverInstance && <Text fontSize="10px" color="red.400" mt={1}>{errors.driverInstance}</Text>}
                        </Box>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("HW_BAUD", language)}</Text>
                            <select value={config.baudRate} onChange={(e) => updateConfig({ baudRate: e.target.value })} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "8px", borderRadius: "4px" }}>
                                <option value="9600">9600</option>
                                <option value="115200">115200</option>
                            </select>
                        </Box>
                    </HStack>
                    <Button w="full" colorScheme="cyan" variant="outline" size="sm" onClick={handleTest} disabled={isPending}>
                        {isPending ? <Spinner size="sm" mr={2} /> : null}
                        {t("HW_BTN_TEST", language)}
                    </Button>
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
    const [errors, setErrors] = useState<Record<string, string | null>>({});

    const setError = (field: string, msg: string | null) => {
        setErrors((prev) => ({ ...prev, [field]: msg }));
    };

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
                        <Input
                            type="number"
                            bg="rgba(0,0,0,0.5)"
                            borderColor={errors.minAlt ? "red.400" : "whiteAlpha.200"}
                            value={mountLimits.minAlt}
                            onChange={(e) => { setMountLimits({ minAlt: parseFloat(e.target.value) }); setError("minAlt", null); }}
                            onBlur={() => setError("minAlt", validateMinAlt(mountLimits.minAlt))}
                        />
                        {errors.minAlt && <Text fontSize="10px" color="red.400" mt={1}>{errors.minAlt}</Text>}
                    </Box>
                    <Box flex={1} bg="rgba(0,0,0,0.3)" p={4} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                        <Text fontSize="10px" color="whiteAlpha.500" mb={2}>{t("MNT_MAX_ALT", language)}</Text>
                        <Input
                            type="number"
                            bg="rgba(0,0,0,0.5)"
                            borderColor={errors.maxAlt ? "red.400" : "whiteAlpha.200"}
                            value={mountLimits.maxAlt}
                            onChange={(e) => { setMountLimits({ maxAlt: parseFloat(e.target.value) }); setError("maxAlt", null); }}
                            onBlur={() => setError("maxAlt", validateMaxAlt(mountLimits.maxAlt))}
                        />
                        {errors.maxAlt && <Text fontSize="10px" color="red.400" mt={1}>{errors.maxAlt}</Text>}
                    </Box>
                </HStack>
                {errors.minAlt || errors.maxAlt ? null : (
                    mountLimits.minAlt >= mountLimits.maxAlt && (
                        <Text fontSize="10px" color="var(--astro-gold)" mt={2}>
                            {language === 'fr' ? "L'altitude minimum doit être inférieure à l'altitude maximum" : "Min altitude must be less than max altitude"}
                        </Text>
                    )
                )}
            </Box>
        </VStack>
    );
};

const CameraTab = ({ config, updateConfig, language }: any) => {
    const { execute, isPending } = useAstroAction();
    const [lastHfr, setLastHfr] = useState<number | null>(null);
    const [showAutofocus, setShowAutofocus] = useState(false);

    const handleFocus = async () => {
        setShowAutofocus(true);
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
                    <HStack justify="space-between">
                        <VStack align="start" gap={0}>
                            <Text fontSize="12px" color="white">{t("CAM_AI_FOCUS_EN", language)}</Text>
                            <Text fontSize="10px" color="whiteAlpha.500">{t("CAM_AI_FOCUS_EN_DESC", language)}</Text>
                        </VStack>
                        <input type="checkbox" checked={config.aiFocus} onChange={(e) => updateConfig({ aiFocus: e.target.checked })} style={{ accentColor: "var(--astro-gold)", width: "18px", height: "18px" }} />
                    </HStack>
                    <Button w="full" bg="var(--astro-gold)" color="black" _hover={{ bg: "#e69c3a" }} onClick={handleFocus} disabled={isPending}>
                        {isPending ? <Spinner size="sm" mr={2} /> : null}
                        {lastHfr !== null ? `HFR CALIBRATED: ${lastHfr.toFixed(2)}` : t("CAM_AI_FOCUS_BTN", language)}
                    </Button>
                </VStack>
            </Box>
            
            {showAutofocus && <AutofocusWizard onClose={() => setShowAutofocus(false)} />}
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

const ObjectsTab = ({ language }: any) => (
    <VStack align="stretch" gap={6} h="full">
        <Box bg="rgba(0,0,0,0.3)" p={4} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
            <ObjectFinder />
        </Box>
    </VStack>
);

const CaptureTab = ({ config, updateConfig, language }: any) => {
    const [errors, setErrors] = useState<Record<string, string | null>>({});
    const setError = (field: string, msg: string | null) => {
        setErrors((prev) => ({ ...prev, [field]: msg }));
    };
    return (
    <VStack align="stretch" gap={8}>
        <Text fontSize="sm" color="whiteAlpha.600">{t("CAP_DESC", language)}</Text>

        <Box>
            <HStack mb={4} gap={2}><Icon as={Layers} boxSize={4} color="#00F0FF" /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("CAP_SEQ", language)}</Text></HStack>
            <VStack gap={4} bg="rgba(0,0,0,0.3)" p={5} borderRadius="8px" border="1px solid rgba(255,255,255,0.05)">
                <HStack w="full" gap={4}>
                    <Box flex={1}>
                        <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("CAP_EXP", language)}</Text>
                        <Input type="number" bg="rgba(0,0,0,0.5)" borderColor={errors.exposureTime ? "red.400" : "whiteAlpha.200"} value={config.exposureTime} onChange={(e) => { updateConfig({ exposureTime: parseInt(e.target.value) }); setError("exposureTime", null); }} onBlur={() => setError("exposureTime", validatePositiveInt(config.exposureTime))} />
                        {errors.exposureTime && <Text fontSize="10px" color="red.400" mt={1}>{errors.exposureTime}</Text>}
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
                        <Input type="number" bg="rgba(0,0,0,0.5)" borderColor={errors.frameCount ? "red.400" : "whiteAlpha.200"} value={config.frameCount} onChange={(e) => { updateConfig({ frameCount: parseInt(e.target.value) }); setError("frameCount", null); }} onBlur={() => setError("frameCount", validatePositiveInt(config.frameCount))} />
                        {errors.frameCount && <Text fontSize="10px" color="red.400" mt={1}>{errors.frameCount}</Text>}
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
);};

const SystemTab = ({ config, updateConfig, language, setLanguage }: any) => {
    const { execute, isPending } = useAstroAction();
    const envData = useEnvironmentData();
    const [errors, setErrors] = useState<Record<string, string | null>>({});

    const setError = (field: string, msg: string | null) => {
        setErrors((prev) => ({ ...prev, [field]: msg }));
    };

    const handleSyncLoc = async () => {
        const latErr = validateLatitude(config.latitude);
        const lngErr = validateLongitude(config.longitude);
        setError("latitude", latErr);
        setError("longitude", lngErr);

        let latStr = config.latitude?.toString().replace(',', '.').trim() || "";
        let lonStr = config.longitude?.toString().replace(',', '.').trim() || "";
        
        let lat = parseFloat(latStr);
        let lon = parseFloat(lonStr);

        if (latErr || lngErr) {
            if (envData.latitude !== null && envData.longitude !== null) {
                lat = envData.latitude;
                lon = envData.longitude;
            } else {
                notification.warning("Coordonnées invalides et pas de signal GPS", { source: "Configuration" });
                return;
            }
        }

        await execute(
            async () => {
                const res = await fetch('/api/indi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        endpoint: 'mount/location', 
                        lat, 
                        lon,
                        device: config.driverInstance || "Celestron GPS"
                    })
                });
                return res.json();
            },
            language === 'fr' ? "SYNCHRONISATION" : "SYNCING",
            {
                loadingMessage: language === 'fr' ? "SYNCHRONISATION DE LA POSITION..." : "SYNCING LOCATION...",
                successMessage: `Location synced: ${lat.toFixed(4)}, ${lon.toFixed(4)}`
            }
        );
    };

    return (
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
                            <Input
                                bg="rgba(0,0,0,0.5)"
                                borderColor={errors.latitude ? "red.400" : "whiteAlpha.200"}
                                placeholder="48.8566"
                                value={config.latitude}
                                onChange={(e) => { updateConfig({ latitude: e.target.value }); setError("latitude", null); }}
                                onBlur={() => setError("latitude", validateLatitude(config.latitude))}
                            />
                            {errors.latitude && <Text fontSize="10px" color="red.400" mt={1}>{errors.latitude}</Text>}
                        </Box>
                        <Box flex={1}>
                            <Text fontSize="10px" color="whiteAlpha.700" mb={2}>{t("SYS_LON", language)}</Text>
                            <Input
                                bg="rgba(0,0,0,0.5)"
                                borderColor={errors.longitude ? "red.400" : "whiteAlpha.200"}
                                placeholder="2.3522"
                                value={config.longitude}
                                onChange={(e) => { updateConfig({ longitude: e.target.value }); setError("longitude", null); }}
                                onBlur={() => setError("longitude", validateLongitude(config.longitude))}
                            />
                            {errors.longitude && <Text fontSize="10px" color="red.400" mt={1}>{errors.longitude}</Text>}
                        </Box>
                    </HStack>
                    <Button size="sm" w="full" variant="outline" colorScheme="cyan" onClick={handleSyncLoc} disabled={isPending}>
                        {isPending ? <Spinner size="sm" mr={2} /> : null}
                        {t("SYS_APPLY_LOC", language)}
                    </Button>
                </VStack>
            </Box>
        </VStack>
    );
};

const BridgeTab = ({ config, language }: any) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', msg: string }>({ type: 'idle', msg: '' });

    const fetchLogs = useCallback(async () => {
        try {
            const logParams = new URLSearchParams({ ip: config.astroberryUrl || "" });
            const res = await fetch(clientApiUrl(`/api/indi/logs?${logParams.toString()}`));
            const data = await res.json();
            if (data.logs) {
                setLogs(data.logs);
            }
        } catch (e) {
            notification.warning("Impossible de charger les logs", {
              description: e instanceof Error ? e.message : "Erreur inconnue",
              source: "Bridge",
            });
        }
    }, [config.astroberryUrl]);

    // Poll logs every 2s
    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [fetchLogs]);

    const handleAction = async (action: 'reconnect' | 'restart_kstars' | 'autofix') => {
        setStatus({ type: 'loading', msg: '' });
        try {
            const endpoint = action === 'autofix' ? '/api/indi/autofix' : '/api/indi/reconnect';
            const res = await fetch(clientApiUrl(endpoint), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ip: config.astroberryUrl })
            });
            const data = await res.json();
            if (action === 'autofix') {
                setStatus({ type: data.success ? 'success' : 'error', msg: data.actions ? data.actions.join(' -> ') : (data.error || 'Erreur inconnue') });
            } else {
                setStatus({ type: data.success ? 'success' : 'error', msg: data.message || data.error });
            }
        } catch (e: any) {
            setStatus({ type: 'error', msg: e.message });
        }
    };

    return (
        <VStack align="stretch" gap={8} h="full">
            <Text fontSize="sm" color="whiteAlpha.600">
                {language === 'fr' ? "Gérez la connexion au bridge INDI et consultez les logs en temps réel." : "Manage the INDI bridge connection and view real-time logs."}
            </Text>

            <HStack gap={4}>
                <Button flex={1} bg="var(--astro-gold)" color="black" _hover={{ bg: "#e69c3a" }} onClick={() => handleAction('autofix')} disabled={status.type === 'loading'}>
                    <Icon as={RefreshCw} mr={2} />
                    {language === 'fr' ? "Auto-Diagnostic & Fix" : "Auto-Diagnostic & Fix"}
                </Button>
                <Button flex={1} variant="outline" colorScheme="red" onClick={() => handleAction('restart_kstars')} disabled={status.type === 'loading'}>
                    <Icon as={Power} mr={2} />
                    {language === 'fr' ? "Redémarrer KStars (Mac)" : "Restart KStars (Mac)"}
                </Button>
            </HStack>

            {status.msg && (
                <Text fontSize="12px" p={2} borderRadius="md" bg={status.type === 'success' ? 'rgba(0,255,0,0.1)' : 'rgba(255,0,0,0.1)'} color={status.type === 'success' ? 'green.400' : 'red.400'} border="1px solid" borderColor={status.type === 'success' ? 'green.800' : 'red.800'}>
                    {status.msg}
                </Text>
            )}

            <Box flex={1} minH="400px" bg="black" borderRadius="8px" border="1px solid rgba(255,255,255,0.1)" p={4} display="flex" flexDirection="column">
                <HStack mb={2} justify="space-between">
                    <HStack><Icon as={Activity} color="#00F0FF" boxSize={4} /><Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="#00F0FF">BRIDGE LOGS</Text></HStack>
                    <IconButton aria-label="Refresh logs" size="xs" variant="ghost" color="whiteAlpha.600" onClick={fetchLogs}>
                        <RefreshCw size={14} />
                    </IconButton>
                </HStack>
                <Box flex={1} overflowY="auto" className="custom-scrollbar" display="flex" flexDirection="column-reverse">
                    <VStack align="stretch" gap={1}>
                        {logs.slice().reverse().map((log, i) => {
                            const isError = log.includes("ERROR") || log.includes("failed");
                            const isWarning = log.includes("WARNING");
                            const isSuccess = log.includes("✅") || log.includes("Connected");
                            
                            let color = "whiteAlpha.800";
                            if (isError) color = "red.400";
                            if (isWarning) color = "yellow.400";
                            if (isSuccess) color = "green.400";

                            return (
                                <Text key={i} fontSize="10px" fontFamily="monospace" color={color} wordBreak="break-all" borderBottom="1px solid rgba(255,255,255,0.05)" pb={1}>
                                    {log}
                                </Text>
                            );
                        })}
                    </VStack>
                </Box>
            </Box>
        </VStack>
    );
};