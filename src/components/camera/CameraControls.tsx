import { Box, VStack, HStack, Text, Button, Icon, Grid, Spinner } from "@chakra-ui/react";
import { Tooltip } from "@/components/ui/tooltip";
import { Camera, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Aperture, Settings2, Brain, Eye, Crosshair, HelpCircle } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { Switch } from "@/components/ui/switch";
import { AutofocusWizard } from "@/components/telescope/AutofocusWizard";
import { useState } from "react";

interface CameraControlsProps {
    variant?: "standard" | "circular";
}

const ControlButton = ({ icon: DirIcon, onClick, glowColor = "var(--astro-teal)", isLoading = false, tooltip }: { icon: any, onClick?: () => void, glowColor?: string, isLoading?: boolean, tooltip?: string }) => (
    <Tooltip content={tooltip} showArrow portalled>
        <Button
            variant="plain"
            w="36px"
            h="36px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            color="var(--astro-starlight)"
            bg="rgba(255, 255, 255, 0.05)"
            onClick={onClick}
            loading={isLoading}
            _hover={{ bg: "rgba(255, 255, 255, 0.1)", transform: "scale(1.1)", boxShadow: `0 0 15px ${glowColor}` }}
            _active={{ bg: glowColor, color: "black" }}
            transition="all 0.2s"
            p={0}
        >
            <DirIcon size={18} />
        </Button>
    </Tooltip>
);

export const CameraControls = ({ variant = "standard" }: CameraControlsProps) => {
    const { 
        isExposing, 
        setExposing, 
        config, 
        updateConfig, 
        setCaptureProgress, 
        setStackingProgress, 
        setHfr, 
        language,
        detectedCcd
    } = useStargazerStore();
    
    const { execute, isPending } = useAstroAction();
    const [lastHfr, setLastHfr] = useState<number | null>(null);
    const [showAutofocus, setShowAutofocus] = useState(false);

    const handleFocusAction = async (direction: string) => {
        await execute('/api/indi', `FOCUS ${direction}`, {
            body: { 
                action: 'focus',
                direction,
                steps: 50,
                device: detectedCcd
            },
            showGlobalLoader: false 
        });
    };

    const handleCalibrateFocus = async () => {
        setShowAutofocus(true);
    };

    const handleShoot = async () => {
        setExposing(true);
        setCaptureProgress(0);
        setStackingProgress(0);

        let currentCap = 0;
        const interval = setInterval(() => {
            currentCap = Math.min(currentCap + 5, 100);
            setCaptureProgress(currentCap);
        }, 100);

        const result = await execute(`/api/indi`, "IMAGE CAPTURE", {
            body: { 
                action: 'capture',
                exposure: config.exposureTime || 2.0, 
                device: detectedCcd 
            },
            showGlobalLoader: false
        });

        clearInterval(interval);
        setCaptureProgress(100);

        setExposing(false);
        setTimeout(() => {
            setCaptureProgress(0);
        }, 3000);
    };

    if (variant === "circular") {
        return (
            <VStack w="full" gap={3}>
                <Box position="relative" w="140px" h="140px">
                    {/* Outer HUD Ring */}
                    <Box
                        position="absolute"
                        inset="-10px"
                        borderRadius="full"
                        border="1px dashed"
                        borderColor="whiteAlpha.100"
                        animation="spin 20s linear infinite"
                    />
                    
                    <Box
                        position="absolute"
                        inset="0"
                        borderRadius="full"
                        border="4px solid"
                        borderColor="rgba(255, 255, 255, 0.05)"
                        bg="rgba(10, 20, 40, 0.3)"
                        boxShadow="inset 0 0 30px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0,0,0,0.5)"
                    />

                    {/* Central Camera Icon / Shutter Button */}
                    <Tooltip content={isExposing ? "EXPOSURE IN PROGRESS" : "START EXPOSURE"} showArrow>
                        <Box
                            position="absolute"
                            top="50%"
                            left="50%"
                            transform="translate(-50%, -50%)"
                            w="56px"
                            h="56px"
                            borderRadius="full"
                            bg={isExposing ? "var(--astro-teal)" : "rgba(255, 255, 255, 0.03)"}
                            border="2px solid"
                            borderColor={isExposing ? "white" : "var(--astro-teal)"}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            cursor={isExposing ? "not-allowed" : "pointer"}
                            onClick={!isExposing ? handleShoot : undefined}
                            _hover={{ transform: "translate(-50%, -50%) scale(1.05)", bg: isExposing ? "var(--astro-teal)" : "rgba(0, 255, 180, 0.1)" }}
                            transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                            className={isExposing ? "pulse-glow" : ""}
                            zIndex={2}
                        >
                            {isExposing ? (
                                <VStack gap={0}>
                                    <Spinner size="xs" color="black" borderWidth="2px" />
                                    <Text fontSize="8px" color="black" fontWeight="bold" mt={1}>BUSY</Text>
                                </VStack>
                            ) : (
                                <Icon as={Camera} boxSize="6" color="var(--astro-teal)" />
                            )}
                        </Box>
                    </Tooltip>

                    {/* Focus Control Ring */}
                    <Box position="absolute" top="6px" left="50%" transform="translateX(-50%)">
                        <ControlButton icon={ChevronUp} onClick={() => handleFocusAction('IN')} isLoading={isPending} tooltip="FOCUS IN (FINE)" />
                    </Box>
                    <Box position="absolute" bottom="6px" left="50%" transform="translateX(-50%)">
                        <ControlButton icon={ChevronDown} onClick={() => handleFocusAction('OUT')} isLoading={isPending} tooltip="FOCUS OUT (FINE)" />
                    </Box>
                    <Box position="absolute" left="6px" top="50%" transform="translateY(-50%)">
                        <ControlButton icon={ChevronLeft} onClick={() => handleFocusAction('IN')} isLoading={isPending} tooltip="FOCUS IN" />
                    </Box>
                    <Box position="absolute" right="6px" top="50%" transform="translateY(-50%)">
                        <ControlButton icon={ChevronRight} onClick={() => handleFocusAction('OUT')} isLoading={isPending} tooltip="FOCUS OUT" />
                    </Box>

                    {/* Decorative HUD Elements */}
                    <Box position="absolute" top="20%" left="20%" opacity={0.2} color="var(--astro-starlight)"><Crosshair size={10} /></Box>
                    <Box position="absolute" bottom="20%" right="20%" opacity={0.2} color="var(--astro-starlight)"><Aperture size={10} /></Box>
                </Box>

                {/* Advanced AI & HUD Controls */}
                <VStack w="full" gap={2} pt={3} borderTop="1px solid" borderColor="whiteAlpha.100">
                    <HStack w="full" justify="space-between" bg="rgba(0, 255, 180, 0.03)" p={2} borderRadius="lg" border="1px solid rgba(0, 255, 180, 0.1)">
                        <VStack align="start" gap={1}>
                            <HStack gap={2}>
                                <Brain size={14} color="var(--astro-teal)" />
                                <Text fontSize="10px" color="whiteAlpha.900" fontWeight="bold" letterSpacing="0.05em">AI FOCUS CORRECTIONS</Text>
                                <Tooltip content="Automatically adjusts focus during long sessions based on temperature and star analysis (HFR). Helps maintain sharpness as the telescope cools." showArrow>
                                    <Icon as={HelpCircle} boxSize={3} color="whiteAlpha.400" cursor="help" />
                                </Tooltip>
                            </HStack>
                            <Button 
                                size="xs" 
                                variant="ghost" 
                                color="var(--astro-gold)" 
                                fontSize="9px" 
                                h="20px" 
                                px={2} 
                                onClick={handleCalibrateFocus}
                                disabled={isPending}
                                _hover={{ bg: "whiteAlpha.100" }}
                            >
                                {lastHfr ? `HFR: ${lastHfr.toFixed(2)} - RE-CALIBRATE` : "INITIAL CALIBRATION"}
                            </Button>
                        </VStack>
                        <Switch 
                            size="sm" 
                            colorPalette="teal"
                            checked={config.showAiFocusCorrections}
                            onCheckedChange={(e) => updateConfig({ showAiFocusCorrections: e.checked })}
                        />
                    </HStack>

                    <HStack w="full" justify="space-between" bg="rgba(255, 215, 0, 0.03)" p={2} borderRadius="lg" border="1px solid rgba(255, 215, 0, 0.1)">
                        <HStack gap={2}>
                            <Eye size={14} color="var(--astro-gold)" />
                            <VStack align="start" gap={0}>
                                <HStack gap={1}>
                                    <Text fontSize="10px" color="whiteAlpha.900" fontWeight="bold" letterSpacing="0.05em">HFR OVERLAY</Text>
                                    <Tooltip content="Superimposes Half Flux Radius (HFR) metrics on the direct view to help you visualize focus quality across the field." showArrow>
                                        <Icon as={HelpCircle} boxSize={3} color="whiteAlpha.400" cursor="help" />
                                    </Tooltip>
                                </HStack>
                                <Text fontSize="8px" color="whiteAlpha.500">Real-time star metrics</Text>
                            </VStack>
                        </HStack>
                        <Switch 
                            size="sm" 
                            colorPalette="yellow"
                            checked={config.showHfrOverlay}
                            onCheckedChange={(e) => {
                                updateConfig({ showHfrOverlay: e.checked });
                                if (e.checked) {
                                    // Make real API call later when integrated
                                    setHfr(3.24);
                                }
                                else setHfr(null);
                            }}
                        />
                    </HStack>
                </VStack>

                <style jsx global>{`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .pulse-glow {
                        animation: pulse-glow 2s infinite ease-in-out;
                    }
                    @keyframes pulse-glow {
                        0% { box-shadow: 0 0 5px var(--astro-teal); }
                        50% { box-shadow: 0 0 20px var(--astro-teal); }
                        100% { box-shadow: 0 0 5px var(--astro-teal); }
                    }
                `}</style>
            </VStack>
        );
    }

    return (
        <VStack gap={4} align="stretch" w="full">
            <Text fontSize="9px" color="whiteAlpha.400" letterSpacing="0.2em">CAMERA SYSTEM ACTIVE</Text>
        </VStack>
    );
};
