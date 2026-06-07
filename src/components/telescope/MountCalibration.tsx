"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { MoveUpRight, Settings, AlertTriangle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { useState, useRef } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { t } from "@/i18n/translations";
import { notification } from "@/lib/notificationService";

export const MountCalibration = () => {
    const { mountLimits, setMountLimits, alt, az, language, setSlewing, config } = useStargazerStore();
    const [step, setStep] = useState<"idle" | "maxAlt" | "minAlt" | "maxAz" | "minAz">("idle");
    const [isMoving, setIsMoving] = useState(false);
    const activeDirectionRef = useRef<'up' | 'down' | 'left' | 'right' | null>(null);
    const pendingStartPromiseRef = useRef<Promise<any> | null>(null);

    const handleSaveLimit = () => {
        if (step === "maxAlt") {
            setMountLimits({ ...mountLimits, maxAlt: alt });
            setStep("minAlt");
        } else if (step === "minAlt") {
            setMountLimits({ ...mountLimits, minAlt: alt });
            setStep("maxAz");
        } else if (step === "maxAz") {
            setMountLimits({ ...mountLimits, maxAz: az });
            setStep("minAz");
        } else if (step === "minAz") {
            const finalLimits = { ...mountLimits, minAz: az };
            setMountLimits(finalLimits);
            setStep("idle");
            
            // Persiste les limites dans la configuration backend (config.json)
            fetch('/api/indi/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mountLimits: finalLimits
                })
            }).then(() => {
                notification.success("Limites sauvegardées", {
                    description: "Les nouvelles limites ont été enregistrées.",
                    source: "Configuration"
                });
            }).catch((err) => {
                notification.error("Échec de la sauvegarde", {
                  description: err?.message || "Impossible de sauvegarder la configuration",
                  source: "Système",
                });
            });
        }
    };

    const startJog = async (direction: 'up' | 'down' | 'left' | 'right') => {
        if (activeDirectionRef.current === direction) return;
        activeDirectionRef.current = direction;
        setIsMoving(true);
        setSlewing(true);
        const bridgeIp = config.astroberryUrl.replace('http://', '').replace(':8624', '');
        
        const promise = fetch('/api/indi/mount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'jog', direction, state: 'start', ip: bridgeIp })
        }).then(async (res) => {
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${res.status}`);
            }
        }).catch((err) => {
            notification.error("Échec du déplacement", {
              description: err?.message || "Impossible de déplacer la monture",
              source: "Monture",
            });
        });
        
        pendingStartPromiseRef.current = promise;
    };

    const stopJog = async (direction: 'up' | 'down' | 'left' | 'right') => {
        const dir = activeDirectionRef.current;
        if (!dir) return;
        activeDirectionRef.current = null;

        if (pendingStartPromiseRef.current) {
            await pendingStartPromiseRef.current;
            pendingStartPromiseRef.current = null;
        }

        const bridgeIp = config.astroberryUrl.replace('http://', '').replace(':8624', '');
        fetch('/api/indi/mount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'jog', direction: dir, state: 'stop', ip: bridgeIp })
        }).then(() => {
            setSlewing(false);
            setIsMoving(false);
        }).catch((err) => {
            notification.warning("Échec de l'arrêt", {
              description: err?.message || "Impossible d'arrêter le déplacement",
              source: "Monture",
            });
            setSlewing(false);
            setIsMoving(false);
        });
    };

    const getStepHint = () => {
        switch (step) {
            case "maxAlt": return language === 'fr' ? "Montez au maximum" : "Move to max altitude";
            case "minAlt": return language === 'fr' ? "Descendez au minimum" : "Move to min altitude";
            case "maxAz": return language === 'fr' ? "Tournez à droite" : "Rotate right";
            case "minAz": return language === 'fr' ? "Tournez à gauche" : "Rotate left";
            default: return "";
        }
    };

    const getStepInstruction = () => {
        switch (step) {
            case "maxAlt": return t("CALIB_STEP_MAX_ALT", language);
            case "minAlt": return t("CALIB_STEP_MIN_ALT", language);
            case "maxAz": return t("CALIB_STEP_MAX_AZ", language);
            case "minAz": return t("CALIB_STEP_MIN_AZ", language);
            default: return "";
        }
    };

    const isCalibrating = step !== "idle";

    return (
        <VStack align="stretch" gap={4} color="var(--astro-starlight)" w="full">
            <HStack justify="space-between">
                <HStack gap={2}>
                    <Box color="var(--astro-teal)" className={isCalibrating ? "pulse-glow" : ""}>
                        <Settings size={16} />
                    </Box>
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em">{t("CALIB_LIMITS_TITLE", language)}</Text>
                </HStack>
                {isCalibrating && <Text fontSize="10px" color="var(--astro-gold)" className="pulse-glow">{t("CALIB_IN_PROGRESS", language)}</Text>}
            </HStack>

            <Box borderTop="1px dashed rgba(255, 255, 255, 0.1)" my={1} />

            {!isCalibrating ? (
                <VStack align="stretch" gap={3}>
                    <HStack justify="space-between" fontSize="10px" color="var(--astro-starlight)" opacity={0.8}>
                        <VStack align="start" gap={0}>
                            <Text color="var(--astro-teal)">{t("CALIB_ALTITUDE", language)}</Text>
                            <Text>{mountLimits.minAlt.toFixed(1)}° ➔ {mountLimits.maxAlt.toFixed(1)}°</Text>
                        </VStack>
                        <VStack align="end" gap={0}>
                            <Text color="var(--astro-teal)">{t("CALIB_AZIMUTH", language)}</Text>
                            <Text>{mountLimits.minAz.toFixed(1)}° ➔ {mountLimits.maxAz.toFixed(1)}°</Text>
                        </VStack>
                    </HStack>
                    
                    <Button 
                        size="sm" w="full" bg="rgba(255, 51, 51, 0.1)" 
                        border="1px solid var(--astro-teal)" color="var(--astro-teal)"
                        _hover={{ bg: "var(--astro-teal)", color: "black", boxShadow: "0 0 15px rgba(255, 51, 51, 0.4)" }}
                        fontSize="10px"
                        onClick={() => setStep("maxAlt")}
                    >
                        <MoveUpRight size={12} style={{ marginRight: '6px' }} />
                        {t("CALIB_WIZARD_BTN", language)}
                    </Button>
                </VStack>
            ) : (
                <VStack align="stretch" gap={3} bg="rgba(0, 0, 0, 0.3)" p={3} borderRadius="8px" borderLeft="2px solid var(--astro-gold)">
                    <HStack gap={2}>
                        <Box color="var(--astro-gold)">
                            <AlertTriangle size={16} />
                        </Box>
                        <Text fontSize="10px" fontWeight="bold" color="var(--astro-gold)">{step.toUpperCase()}</Text>
                    </HStack>
                    <Text fontSize="10px" lineHeight={1.4}>{getStepInstruction()}</Text>
                    <Text fontSize="9px" color="var(--astro-teal)" fontStyle="italic">{getStepHint()}</Text>
                    
                    <HStack justify="center" gap={2} py={2}>
                        {step.includes("Alt") ? (
                            <VStack gap={1}>
                                <Button size="sm" variant="outline" borderColor="var(--astro-teal)" color="var(--astro-teal)" w="50px" h="40px" 
                                    onPointerDown={(e) => { e.preventDefault(); startJog('up'); }}
                                    onPointerUp={(e) => { e.preventDefault(); stopJog('up'); }}
                                    onPointerLeave={(e) => { e.preventDefault(); stopJog('up'); }}><ArrowUp size={16} /></Button>
                                <Text fontSize="8px" opacity={0.6}>UP</Text>
                                <Button size="sm" variant="outline" borderColor="var(--astro-teal)" color="var(--astro-teal)" w="50px" h="40px" 
                                    onPointerDown={(e) => { e.preventDefault(); startJog('down'); }}
                                    onPointerUp={(e) => { e.preventDefault(); stopJog('down'); }}
                                    onPointerLeave={(e) => { e.preventDefault(); stopJog('down'); }}><ArrowDown size={16} /></Button>
                            </VStack>
                        ) : (
                            <HStack gap={1}>
                                <Button size="sm" variant="outline" borderColor="var(--astro-teal)" color="var(--astro-teal)" w="50px" h="40px" 
                                    onPointerDown={(e) => { e.preventDefault(); startJog('left'); }}
                                    onPointerUp={(e) => { e.preventDefault(); stopJog('left'); }}
                                    onPointerLeave={(e) => { e.preventDefault(); stopJog('left'); }}><ArrowLeft size={16} /></Button>
                                <Text fontSize="8px" opacity={0.6}>AZ</Text>
                                <Button size="sm" variant="outline" borderColor="var(--astro-teal)" color="var(--astro-teal)" w="50px" h="40px" 
                                    onPointerDown={(e) => { e.preventDefault(); startJog('right'); }}
                                    onPointerUp={(e) => { e.preventDefault(); stopJog('right'); }}
                                    onPointerLeave={(e) => { e.preventDefault(); stopJog('right'); }}><ArrowRight size={16} /></Button>
                            </HStack>
                        )}
                    </HStack>
                    
                    <HStack justify="space-between" bg="#030509" p={2} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
                        <VStack align="start" gap={0}>
                            <Text fontSize="8px" opacity={0.6}>{t("CALIB_CURRENT_POS", language)}</Text>
                            <Text fontSize="12px" color="var(--astro-teal)" className="hud-font">
                                {step.includes("Alt") ? `ALT: ${alt.toFixed(1)}°` : `AZ: ${az.toFixed(1)}°`}
                            </Text>
                        </VStack>
                        <Button 
                            size="sm" bg="var(--astro-teal)" color="black"
                            _hover={{ bg: "white" }}
                            onClick={handleSaveLimit}
                            disabled={isMoving}
                        >
                            {t("CALIB_VALIDATE", language)}
                        </Button>
                    </HStack>

                    <Button 
                        size="xs" variant="ghost" color="whiteAlpha.600" mt={1}
                        onClick={() => setStep("idle")}
                        disabled={isMoving}
                    >
                        {t("CALIB_CANCEL", language)}
                    </Button>
                </VStack>
            )}
        </VStack>
    );
};
