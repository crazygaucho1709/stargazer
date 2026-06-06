"use client";

import React, { useState, useEffect, useRef } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Portal, Progress } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Zap, CheckCircle2, AlertCircle, X, ChevronRight, Activity } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

const MotionBox = motion.create(Box);

export const AutofocusWizard = ({ onClose, autoStart, onComplete }: { onClose: () => void, autoStart?: boolean, onComplete?: () => void }) => {
    const { language, config } = useStargazerStore();
    const [phase, setPhase] = useState<"idle" | "scanning" | "analyzing" | "moving_to_best" | "done" | "error">("idle");
    const [logs, setLogs] = useState<{ msg: string, type: "info" | "success" | "error" }[]>([]);
    const [scanData, setScanData] = useState<{ step: number, hfr: number }[]>([]);
    const [currentHfr, setCurrentHfr] = useState<number>(0);
    const [bestHfr, setBestHfr] = useState<number>(999);
    const abortRef = useRef(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const L = (fr: string, en: string) => language === "fr" ? fr : en;
    const log = (msg: string, type: "info" | "success" | "error" = "info") => setLogs(p => [...p, { msg, type }]);

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { abortRef.current = true; };
    }, []);

    useEffect(() => {
        if (autoStart) {
            runAutofocus();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart]);

    const sendFocusCommand = async (direction: "IN" | "OUT", steps: number) => {
        try {
            await fetch('/api/indi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: 'ccd/focus', device: config.driverInstance, direction, steps })
            });
        } catch (e) {
            console.error("Focus command failed", e);
        }
    };

    const runAutofocus = async () => {
        abortRef.current = false;
        setLogs([]);
        setScanData([]);
        setPhase("scanning");
        log(L("🚀 Lancement de l'Autofocus IA (V-Curve)", "🚀 Starting AI Autofocus (V-Curve)"));
        
        // 1. Move OUT to start position
        log(L("Déplacement du focuser vers la limite extérieure...", "Moving focuser to outer limit..."));
        await sendFocusCommand("OUT", 100);
        await new Promise(r => setTimeout(r, 2000));
        
        // 2. Scan points
        let minHfr = 999;
        let bestStep = 0;
        const totalSteps = 6;
        const stepSize = 30;

        for (let i = 0; i < totalSteps; i++) {
            if (abortRef.current) return;
            setPhase("scanning");
            
            // Move IN
            await sendFocusCommand("IN", stepSize);
            log(L(`Mesure au point ${i + 1}/${totalSteps}...`, `Measuring at point ${i + 1}/${totalSteps}...`));
            
            // Wait for movement and settle
            await new Promise(r => setTimeout(r, 1500));
            
            // Capture a short image for focus calculation
            await fetch('/api/indi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: 'ccd/capture', device: config.driverInstance, exposure: 1.0 })
            });
            
            // Read focus metric (Laplace variance)
            const metricRes = await fetch('/api/indi?endpoint=ccd/focus-metric');
            const metricData = await metricRes.json();
            const measuredHfr = metricData.success ? metricData.metric : 999;
            
            setCurrentHfr(measuredHfr);
            setScanData(prev => [...prev, { step: i, hfr: measuredHfr }]);

            if (measuredHfr < minHfr) {
                minHfr = measuredHfr;
                bestStep = i;
            }
        }

        if (abortRef.current) return;
        
        setPhase("analyzing");
        setBestHfr(minHfr);
        log(L(`Analyse V-Curve terminée. Meilleur HFR: ${minHfr.toFixed(2)}`, `V-Curve analysis complete. Best HFR: ${minHfr.toFixed(2)}`), "success");
        await new Promise(r => setTimeout(r, 1000));

        // 3. Move back to best step
        setPhase("moving_to_best");
        log(L("Application du focus optimal...", "Applying optimal focus..."));
        
        const stepsBack = totalSteps - 1 - bestStep;
        if (stepsBack > 0) {
            await sendFocusCommand("OUT", stepsBack * stepSize);
            await new Promise(r => setTimeout(r, 2000));
        }

        if (abortRef.current) return;
        setPhase("done");
        log(L("✅ Focus Numérique IA Parfait atteint !", "✅ Perfect AI Numerical Focus achieved!"), "success");
        if (onComplete) onComplete();
    };

    return (
        <Portal>
            <Box position="fixed" inset={0} bg="rgba(0,0,0,0.8)" backdropFilter="blur(8px)" zIndex={10000} display="flex" alignItems="center" justifyItems="center" onClick={onClose}>
                <MotionBox
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    bg="rgba(10, 15, 30, 0.95)"
                    w="450px"
                    borderRadius="xl"
                    border="1px solid var(--astro-teal)"
                    boxShadow="0 25px 50px -12px rgba(0,240,255,0.25)"
                    overflow="hidden"
                    mx="auto" // fallback for horizontal center
                    mt="10vh" // push down to center
                >
                    {/* Header */}
                    <HStack justify="space-between" p={4} borderBottom="1px solid rgba(255,255,255,0.1)" bg="rgba(0,240,255,0.05)">
                        <HStack>
                            <Icon as={Activity} color="var(--astro-teal)" boxSize={5} />
                            <Text color="white" fontWeight="bold" letterSpacing="0.05em">
                                {L("AUTOFOCUS NUMÉRIQUE IA", "AI NUMERICAL AUTOFOCUS")}
                            </Text>
                        </HStack>
                        <Button size="xs" variant="ghost" color="gray.400" _hover={{ color: "white" }} onClick={onClose}>
                            <Icon as={X} boxSize={4} />
                        </Button>
                    </HStack>

                    <Box p={5}>
                        {/* V-Curve Chart Visualization */}
                        <Box h="120px" w="full" bg="blackAlpha.500" borderRadius="md" border="1px solid rgba(255,255,255,0.05)" position="relative" mb={5} overflow="hidden">
                            <Text position="absolute" top={2} left={2} fontSize="10px" color="gray.500">HFR V-CURVE</Text>
                            
                            <HStack position="absolute" bottom={0} left={0} right={0} h="full" align="flex-end" justify="space-between" px={4} pb={2}>
                                {scanData.map((d, idx) => {
                                    // Normalize display height relative to minHfr to make variations visible
                                    const h = Math.min(100, Math.max(10, (1000 / (d.hfr + 1)) * 100));
                                    const isBest = phase === "done" && d.hfr === bestHfr;
                                    
                                    return (
                                        <VStack key={idx} justify="flex-end" h="full" gap={1}>
                                            <Text fontSize="8px" color={isBest ? "var(--astro-teal)" : "gray.500"}>{d.hfr.toFixed(0)}</Text>
                                            <Box w="20px" h={`${h}%`} bg={isBest ? "var(--astro-teal)" : "var(--astro-gold)"} opacity={isBest ? 1 : 0.5} borderRadius="sm" transition="all 0.3s" />
                                        </VStack>
                                    );
                                })}
                            </HStack>
                            
                            {phase === "scanning" && (
                                <Box position="absolute" top={0} left={0} w="full" h="full" background="linear-gradient(90deg, transparent, rgba(0,240,255,0.1), transparent)" className="scan-animation" />
                            )}
                        </Box>

                        {/* Status indicators */}
                        <HStack justify="space-between" mb={4}>
                            <VStack align="start" gap={0}>
                                <Text fontSize="10px" color="gray.400">STATUS</Text>
                                <Text fontSize="12px" color="white" fontWeight="bold">
                                    {phase === "idle" && L("Prêt", "Ready")}
                                    {phase === "scanning" && L("Acquisition points...", "Acquiring points...")}
                                    {phase === "analyzing" && L("Calcul du minimum...", "Calculating minimum...")}
                                    {phase === "moving_to_best" && L("Ajustement final...", "Final adjustment...")}
                                    {phase === "done" && L("Focus Optimal", "Optimal Focus")}
                                </Text>
                            </VStack>
                            <VStack align="end" gap={0}>
                                <Text fontSize="10px" color="gray.400">CURRENT HFR</Text>
                                <Text fontSize="16px" color="var(--astro-teal)" fontWeight="bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {currentHfr > 0 ? currentHfr.toFixed(0) : "--"}
                                </Text>
                            </VStack>
                        </HStack>

                        {/* Logs */}
                        <Box bg="rgba(0,0,0,0.4)" borderRadius="md" p={3} h="100px" overflowY="auto" className="custom-scrollbar" mb={5} border="1px solid rgba(255,255,255,0.05)">
                            {logs.map((l, i) => (
                                <Text key={i} fontSize="11px" color={l.type === "error" ? "red.400" : l.type === "success" ? "green.400" : "gray.300"} fontFamily="monospace" mb={1}>
                                    {l.msg}
                                </Text>
                            ))}
                            <div ref={logsEndRef} />
                        </Box>

                        {/* Actions */}
                        {phase === "idle" || phase === "done" ? (
                            <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "cyan.300" }} onClick={runAutofocus}>
                                <Icon as={Zap} boxSize={4} mr={2} />
                                {phase === "done" ? L("Relancer Autofocus", "Rerun Autofocus") : L("Démarrer Autofocus", "Start Autofocus")}
                            </Button>
                        ) : (
                            <Button w="full" colorScheme="red" variant="outline" onClick={() => { abortRef.current = true; setPhase("idle"); }}>
                                {L("Annuler", "Cancel")}
                            </Button>
                        )}
                    </Box>
                    <style jsx global>{`
                        .scan-animation {
                            animation: scan 2s linear infinite;
                        }
                        @keyframes scan {
                            from { transform: translateX(-100%); }
                            to { transform: translateX(100%); }
                        }
                    `}</style>
                </MotionBox>
            </Box>
        </Portal>
    );
};
