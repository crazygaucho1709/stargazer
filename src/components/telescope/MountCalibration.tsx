"use client";

import { Box, VStack, HStack, Text, Button, Icon, Progress } from "@chakra-ui/react";
import { MoveUpRight, Settings, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";

export const MountCalibration = () => {
    const { mountLimits, setMountLimits, alt, az } = useStargazerStore();
    const [step, setStep] = useState<"idle" | "maxAlt" | "minAlt" | "maxAz" | "minAz">("idle");

    const handleSaveLimit = () => {
        if (step === "maxAlt") {
            setMountLimits({ maxAlt: alt });
            setStep("minAlt");
        } else if (step === "minAlt") {
            setMountLimits({ minAlt: alt });
            setStep("maxAz");
        } else if (step === "maxAz") {
            setMountLimits({ maxAz: az });
            setStep("minAz");
        } else if (step === "minAz") {
            setMountLimits({ minAz: az });
            setStep("idle");
        }
    };

    const getStepInstruction = () => {
        switch (step) {
            case "maxAlt": return "Pointez le zénith maximum autorisé et validez.";
            case "minAlt": return "Pointez l'horizon bas avant collision et validez.";
            case "maxAz": return "Pointez l'azimut maximum (butée droite).";
            case "minAz": return "Pointez l'azimut minimum (butée gauche).";
            default: return "";
        }
    };

    const isCalibrating = step !== "idle";

    return (
        <VStack align="stretch" gap={4} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <Icon as={Settings} boxSize={4} color="var(--astro-teal)" className={isCalibrating ? "pulse-glow" : ""} />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">CALIBRATION LIMITES</Text>
                </HStack>
                {isCalibrating && <Text fontSize="10px" color="var(--astro-gold)" className="pulse-glow">EN COURS</Text>}
            </HStack>

            <Box borderTop="1px dashed rgba(255, 255, 255, 0.1)" my={1} />

            {!isCalibrating ? (
                <VStack align="stretch" gap={3}>
                    <HStack justify="space-between" fontSize="10px" color="var(--astro-starlight)" opacity={0.8}>
                        <VStack align="start" gap={0}>
                            <Text color="var(--astro-teal)">ALTITUDE</Text>
                            <Text>{mountLimits.minAlt.toFixed(1)}° ➔ {mountLimits.maxAlt.toFixed(1)}°</Text>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <Text color="var(--astro-teal)">AZIMUT</Text>
                            <Text>{mountLimits.minAz.toFixed(1)}° ➔ {mountLimits.maxAz.toFixed(1)}°</Text>
                        </VStack>
                    </HStack>
                    
                    <Button 
                        size="sm" w="full" bg="rgba(255, 51, 51, 0.1)" 
                        border="1px solid var(--astro-teal)" color="var(--astro-teal)"
                        _hover={{ bg: "var(--astro-teal)", color: "black", boxShadow: "0 0 15px rgba(255, 51, 51, 0.4)" }}
                        fontSize="10px" leftIcon={<MoveUpRight size={12} />}
                        onClick={() => setStep("maxAlt")}
                    >
                        ASSISTANT DE CALIBRATION
                    </Button>
                </VStack>
            ) : (
                <VStack align="stretch" gap={3} bg="rgba(0, 0, 0, 0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-gold)">
                    <HStack gap={2}>
                        <Icon as={AlertTriangle} boxSize={4} color="var(--astro-gold)" />
                        <Text fontSize="10px" fontWeight="bold" color="var(--astro-gold)">{step.toUpperCase()}</Text>
                    </HStack>
                    <Text fontSize="10px" lineHeight={1.4}>{getStepInstruction()}</Text>
                    
                    <HStack justify="space-between" bg="#030509" p={2} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
                        <VStack align="start" gap={0}>
                            <Text fontSize="8px" opacity={0.6}>POS ACTUELLE</Text>
                            <Text fontSize="12px" color="var(--astro-teal)" className="hud-font">
                                {step.includes("Alt") ? `ALT: ${alt.toFixed(1)}°` : `AZ: ${az.toFixed(1)}°`}
                            </Text>
                        </VStack>
                        <Button 
                            size="sm" bg="var(--astro-teal)" color="black"
                            _hover={{ bg: "white" }}
                            onClick={handleSaveLimit}
                        >
                            VALIDER
                        </Button>
                    </HStack>

                    <Button 
                        size="xs" variant="ghost" color="whiteAlpha.600" mt={1}
                        onClick={() => setStep("idle")}
                    >
                        ANNULER
                    </Button>
                </VStack>
            )}
        </VStack>
    );
};
