"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Box, VStack, HStack, Text, Button, Icon, Badge, Flex, 
  Grid, NumberInput, Switch, Spinner, IconButton 
} from "@chakra-ui/react";
import { 
  Camera, Play, Square, Layers, Target, Zap, Clock, 
  BrainCircuit, Aperture, Info, Thermometer, ShieldCheck
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { clientApiUrl } from "@/lib/clientApi";
import { useAstroAction } from "@/hooks/useAstroAction";
import { notification } from "@/lib/notificationService";
import { Tooltip } from "@/components/ui/tooltip";

interface CaptureFrame {
  id: string;
  timestamp: number;
  exposure: number;
  gain: number;
  hfr: number;
  starsDetected: number;
  filename: string;
}

interface StackingResult {
  id: string;
  framesUsed: number;
  totalExposure: number;
  snr: number;
  fwhm: number;
  progress: number;
  status: 'idle' | 'aligning' | 'stacking' | 'complete';
}

export const CaptureAndStack = () => {
  const { language, config } = useStargazerStore();
  
  const { execute: performAction, isPending, error: actionError } = useAstroAction();
  
  // Capture Settings
  const [exposure, setExposure] = useState(30);
  const [gain, setGain] = useState(800);
  const [numFrames, setNumFrames] = useState(20);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [frames, setFrames] = useState<CaptureFrame[]>([]);
  const [isAutoFocus, setIsAutoFocus] = useState(true);
  const [isGuiding, setIsGuiding] = useState(true);
  
  // Stacking
  const [stackingResult, setStackingResult] = useState<StackingResult | null>(null);
  const [isStacking, setIsStacking] = useState(false);
  
  // Focusing
  const [focusPosition, setFocusPosition] = useState(0);
  const [focusHFR, setFocusHFR] = useState<number | null>(null);
  const [isFocusing, setIsFocusing] = useState(false);
  
  // Live stats
  const [liveStats, setLiveStats] = useState({
    temperature: -5,
    downloadTime: 2.5,
    remainingTime: 0,
    adu: 4500,
    peakADU: 12000
  });

  const performAutoFocus = useCallback(async () => {
    return await performAction(async () => {
        setIsFocusing(true);
        const positions = [-500, -250, -100, 0, 100, 250, 500];
        const hfrs: number[] = [];
        
        for (const pos of positions) {
          setFocusPosition(pos);
          await new Promise(r => setTimeout(r, 1000)); // Simulate movement
          const simulatedHFR = 2 + Math.pow(pos / 300, 2) + Math.random() * 0.2;
          hfrs.push(simulatedHFR);
          setFocusHFR(simulatedHFR);
        }
        
        const minIdx = hfrs.indexOf(Math.min(...hfrs));
        setFocusPosition(positions[minIdx]);
        setFocusHFR(hfrs[minIdx]);
        setIsFocusing(false);
        return hfrs[minIdx];
    }, "AUTO FOCUS CALIBRATION");
  }, [performAction]);

  const startCapture = useCallback(async () => {
    setIsCapturing(true);
    setCurrentFrame(0);
    setFrames([]);
    
    if (isAutoFocus) {
      await performAutoFocus();
    }
    
    for (let i = 1; i <= numFrames; i++) {
      if (!isCapturing && i > 1) break; // Check for stop
      setCurrentFrame(i);
      
      try {
        const capParams = new URLSearchParams({
          exposure: String(exposure),
          device: "Canon DSLR EOS 600D",
        });
        await fetch(clientApiUrl(`/api/indi/ccd?${capParams.toString()}`), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });
      } catch (e: any) {
        notification.error("Échec de la capture", {
          description: e?.message || "Erreur lors de la prise de vue",
          source: "Caméra",
        });
      }
      
      await new Promise(r => setTimeout(r, (exposure + 3) * 1000));
      
      const frame: CaptureFrame = {
        id: `frame_${Date.now()}`,
        timestamp: Date.now(),
        exposure,
        gain,
        hfr: focusHFR || 2.5 + Math.random() * 0.5,
        starsDetected: 150 + Math.floor(Math.random() * 50),
        filename: `light_${String(i).padStart(3, '0')}.cr3`
      };
      
      setFrames(prev => [...prev, frame]);
      setLiveStats(s => ({ ...s, remainingTime: (numFrames - i) * (exposure + 3) }));
    }
    
    setIsCapturing(false);
  }, [exposure, gain, numFrames, isAutoFocus, performAutoFocus, focusHFR, isCapturing]);

  const startStacking = useCallback(async () => {
    setIsStacking(true);
    const validFrames = frames.filter(f => f.hfr < 4);
    
    setStackingResult({
      id: `stack_${Date.now()}`,
      framesUsed: 0,
      totalExposure: 0,
      snr: 0,
      fwhm: 0,
      progress: 0,
      status: 'aligning'
    });
    
    for (let i = 0; i < validFrames.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      setStackingResult(prev => prev ? {
        ...prev,
        framesUsed: i + 1,
        progress: ((i + 1) / validFrames.length) * 50,
        status: 'aligning'
      } : null);
    }
    
    setStackingResult(prev => prev ? { ...prev, status: 'stacking' } : null);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 200));
      setStackingResult(prev => prev ? {
        ...prev,
        progress: 50 + (i / 2),
        snr: Math.sqrt(validFrames.length * exposure) * (1 + i / 500),
        fwhm: 2.8 - (i / 500)
      } : null);
    }
    
    setStackingResult(prev => prev ? {
      ...prev,
      totalExposure: validFrames.reduce((sum, f) => sum + f.exposure, 0),
      progress: 100,
      status: 'complete'
    } : null);
    
    setIsStacking(false);
  }, [frames, exposure]);

  return (
    <VStack align="stretch" gap={4} w="full" className="astro-panel" p={4} border="1px solid rgba(0, 255, 209, 0.1)">
      {/* Header */}
      <HStack justify="space-between" mb={2}>
        <HStack gap={2}>
          <Icon as={Camera} boxSize={4} color="var(--astro-teal)" className={isCapturing ? "ping-slow" : ""} />
          <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="white">
            DATA ACQUISITION
          </Text>
        </HStack>
        <HStack gap={2}>
          <Badge bg={isCapturing ? "red.500/20" : "whiteAlpha.100"} color={isCapturing ? "red.400" : "whiteAlpha.600"} variant="outline" fontSize="9px" px={2}>
            {isCapturing ? 'ACQUIRING' : 'READY'}
          </Badge>
          <Badge bg="var(--astro-teal)/10" color="var(--astro-teal)" variant="outline" fontSize="9px" px={2}>
            {frames.length}/{numFrames} SUBFRAMES
          </Badge>
        </HStack>
      </HStack>

      {/* Settings Grid */}
      <Grid templateColumns="repeat(3, 1fr)" gap={3}>
        <VStack align="start" gap={1} bg="rgba(0,0,0,0.2)" p={2} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
          <HStack gap={1}>
            <Icon as={Clock} boxSize={3} color="whiteAlpha.400" />
            <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.05em">EXP (S)</Text>
          </HStack>
          <NumberInput.Root size="sm" value={exposure.toString()} onValueChange={(e) => setExposure(Number(e.value))} min={1} max={600} variant="subtle">
            <NumberInput.Input />
          </NumberInput.Root>
        </VStack>

        <VStack align="start" gap={1} bg="rgba(0,0,0,0.2)" p={2} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
          <HStack gap={1}>
            <Icon as={Zap} boxSize={3} color="whiteAlpha.400" />
            <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.05em">GAIN/ISO</Text>
          </HStack>
          <NumberInput.Root size="sm" value={gain.toString()} onValueChange={(e) => setGain(Number(e.value))} min={100} max={12800} step={100} variant="subtle">
            <NumberInput.Input />
          </NumberInput.Root>
        </VStack>

        <VStack align="start" gap={1} bg="rgba(0,0,0,0.2)" p={2} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
          <HStack gap={1}>
            <Icon as={Layers} boxSize={3} color="whiteAlpha.400" />
            <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.05em">COUNT</Text>
          </HStack>
          <NumberInput.Root size="sm" value={numFrames.toString()} onValueChange={(e) => setNumFrames(Number(e.value))} min={1} max={1000} variant="subtle">
            <NumberInput.Input />
          </NumberInput.Root>
        </VStack>
      </Grid>

      {/* Capture Progress HUD */}
      {isCapturing && (
        <Box bg="rgba(0,255,209,0.05)" p={3} borderRadius="4px" border="1px solid rgba(0,255,209,0.2)" position="relative">
          <HStack justify="space-between" mb={2}>
            <Text fontSize="10px" fontWeight="bold" color="var(--astro-teal)">ACQUISITION IN PROGRESS</Text>
            <HStack gap={2}>
                <Icon as={Thermometer} boxSize={3} color="whiteAlpha.400" />
                <Text fontSize="10px" color="whiteAlpha.700">{liveStats.temperature}°C</Text>
            </HStack>
          </HStack>
          
          <Box w="full" h="4px" bg="rgba(255,255,255,0.05)" borderRadius="full" overflow="hidden" mb={2}>
            <Box 
              h="full" 
              bg="var(--astro-teal)" 
              transition="width 0.5s ease-out"
              style={{ width: `${(currentFrame / numFrames) * 100}%` }}
              boxShadow="0 0 10px var(--astro-teal)"
            />
          </Box>
          
          <HStack justify="space-between" fontSize="9px" color="whiteAlpha.500">
            <Text>FRAME {currentFrame} OF {numFrames}</Text>
            <Text>EST. REMAINING: {Math.floor(liveStats.remainingTime / 60)}M {liveStats.remainingTime % 60}S</Text>
          </HStack>
        </Box>
      )}

      {/* Focus & Metrics HUD */}
      <Grid templateColumns="1fr 1fr" gap={3}>
        <Box bg="rgba(0,0,0,0.2)" p={3} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
            <HStack justify="space-between" mb={2}>
                <HStack gap={1}>
                    <Icon as={Target} boxSize={3} color="var(--astro-gold)" />
                    <Text fontSize="9px" fontWeight="bold" color="whiteAlpha.600">AI FOCUS</Text>
                </HStack>
                <Tooltip content="Half Flux Radius: Measure of star sharpness. Lower is better.">
                    <IconButton aria-label="Info" size="2xs" variant="ghost" color="whiteAlpha.400">
                        <Info size={10} />
                    </IconButton>
                </Tooltip>
            </HStack>
            <VStack align="start" gap={1}>
                <HStack justify="space-between" w="full">
                    <Text fontSize="10px" color="whiteAlpha.500">HFR QUALITY:</Text>
                    <Text fontSize="10px" fontWeight="bold" color={focusHFR && focusHFR < 3 ? "green.400" : "var(--astro-gold)"}>
                        {focusHFR ? focusHFR.toFixed(2) : '---'}
                    </Text>
                </HStack>
                <Box w="full" h="2px" bg="rgba(255,255,255,0.05)" borderRadius="full">
                    <Box h="full" bg="var(--astro-gold)" style={{ width: focusHFR ? `${Math.max(0, 100 - (focusHFR * 20))}%` : '0%' }} />
                </Box>
            </VStack>
        </Box>

        <Box bg="rgba(0,0,0,0.2)" p={3} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)">
            <HStack justify="space-between" mb={2}>
                <HStack gap={1}>
                    <Icon as={BrainCircuit} boxSize={3} color="var(--astro-teal)" />
                    <Text fontSize="9px" fontWeight="bold" color="whiteAlpha.600">STACKING</Text>
                </HStack>
                <Tooltip content="Signal-to-Noise Ratio: Overall image quality index.">
                    <IconButton aria-label="Info" size="2xs" variant="ghost" color="whiteAlpha.400">
                        <Info size={10} />
                    </IconButton>
                </Tooltip>
            </HStack>
            <VStack align="start" gap={1}>
                <HStack justify="space-between" w="full">
                    <Text fontSize="10px" color="whiteAlpha.500">SNR INDEX:</Text>
                    <Text fontSize="10px" fontWeight="bold" color="var(--astro-teal)">
                        {stackingResult ? stackingResult.snr.toFixed(1) : '---'}
                    </Text>
                </HStack>
                <Box w="full" h="2px" bg="rgba(255,255,255,0.05)" borderRadius="full">
                    <Box h="full" bg="var(--astro-teal)" style={{ width: stackingResult ? `${Math.min(100, stackingResult.snr * 2)}%` : '0%' }} />
                </Box>
            </VStack>
        </Box>
      </Grid>

      {/* Stacking Progress Area */}
      {isStacking && stackingResult && (
        <Box bg="rgba(0,240,255,0.05)" p={3} borderRadius="4px" borderLeft="2px solid var(--astro-teal)">
            <HStack justify="space-between" mb={2}>
                <Text fontSize="10px" color="var(--astro-teal)" fontWeight="bold">
                    {stackingResult.status === 'aligning' ? 'ALIGNING ASTRO-FRAMES' : 'NEURAL STACKING PROCESS'}
                </Text>
                <Badge size="xs" variant="solid" bg="var(--astro-teal)" color="black">
                    {stackingResult.framesUsed} SUBS
                </Badge>
            </HStack>
            <Box w="full" h="3px" bg="rgba(255,255,255,0.05)" borderRadius="full" overflow="hidden">
                <Box 
                    h="full" 
                    bg="var(--astro-teal)" 
                    transition="width 0.3s"
                    style={{ width: `${stackingResult.progress}%` }}
                />
            </Box>
        </Box>
      )}

      {/* Completion Summary */}
      {stackingResult?.status === 'complete' && (
        <Box bg="green.500/10" p={4} borderRadius="4px" border="1px solid green.500/20">
            <HStack gap={2} mb={3}>
                <Icon as={ShieldCheck} boxSize={4} color="green.400" />
                <Text fontSize="12px" fontWeight="bold" color="white">PROCESSING COMPLETE</Text>
            </HStack>
            <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <VStack align="start" gap={0}>
                    <Text fontSize="9px" color="whiteAlpha.500">INTEGRATION TIME</Text>
                    <Text fontSize="12px" fontWeight="bold" color="var(--astro-teal)">{stackingResult.totalExposure}S</Text>
                </VStack>
                <VStack align="start" gap={0}>
                    <Text fontSize="9px" color="whiteAlpha.500">AVG STAR FWHM</Text>
                    <Text fontSize="12px" fontWeight="bold" color="var(--astro-gold)">{stackingResult.fwhm.toFixed(2)}&quot;</Text>
                </VStack>
            </Grid>
        </Box>
      )}

      {/* Controls */}
      <VStack gap={3}>
        <HStack w="full" gap={2}>
            {!isCapturing ? (
                <Button
                    flex={2}
                    bg="var(--astro-teal)"
                    color="black"
                    _hover={{ bg: "white", transform: "translateY(-1px)" }}
                    onClick={startCapture}
                    disabled={isFocusing || isStacking}
                    h="40px"
                    fontSize="11px"
                    fontWeight="bold"
                    letterSpacing="0.1em"
                >
                    <Icon as={Play} boxSize={3} mr={2} />
                    EXECUTE SEQUENCE
                </Button>
            ) : (
                <Button
                    flex={2}
                    bg="red.500"
                    color="white"
                    _hover={{ bg: "red.600" }}
                    onClick={() => setIsCapturing(false)}
                    h="40px"
                    fontSize="11px"
                    fontWeight="bold"
                    letterSpacing="0.1em"
                >
                    <Icon as={Square} boxSize={3} mr={2} />
                    ABORT SESSION
                </Button>
            )}

            <Button
                flex={1}
                variant="outline"
                borderColor="rgba(0, 255, 209, 0.3)"
                color="var(--astro-teal)"
                _hover={{ bg: "rgba(0, 255, 209, 0.1)" }}
                onClick={performAutoFocus}
                disabled={isFocusing || isCapturing}
                h="40px"
                fontSize="11px"
            >
                <Icon as={Aperture} boxSize={3} mr={2} className={isFocusing ? "spin" : ""} />
                FOCUS
            </Button>
        </HStack>
        
        {frames.length > 0 && !isCapturing && !isStacking && (
            <Button 
                w="full" 
                variant="ghost" 
                color="var(--astro-gold)" 
                fontSize="10px" 
                onClick={startStacking}
                h="30px"
                _hover={{ bg: "whiteAlpha.50" }}
            >
                <Icon as={Layers} boxSize={3} mr={2} />
                MANUAL STACK ({frames.length} FRAMES)
            </Button>
        )}
      </VStack>

      {actionError && (
        <Text fontSize="10px" color="red.400" mt={2} textAlign="center">
            {actionError}
        </Text>
      )}
    </VStack>
  );
};
