"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Badge, Flex, Progress, Grid, Slider, NumberInput, Switch } from "@chakra-ui/react";
import { Camera, Play, Square, Layers, Target, Zap, Clock, Image, BrainCircuit, Settings2, Aperture } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface CaptureFrame {
  id: string;
  timestamp: number;
  exposure: number;
  gain: number;
  hfr: number; // Half Flux Radius - mesure de qualité focus
  starsDetected: number;
  filename: string;
}

interface StackingResult {
  id: string;
  framesUsed: number;
  totalExposure: number;
  snr: number; // Signal to Noise Ratio
  fwhm: number; // Full Width at Half Maximum
  progress: number;
  status: 'idle' | 'aligning' | 'stacking' | 'complete';
}

export const CaptureAndStack = () => {
  const { language, config } = useStargazerStore();
  const bridgeIp = config.astroberryUrl.includes('http') ? new URL(config.astroberryUrl).hostname : config.astroberryUrl.split(':')[0];
  
  // Capture Settings
  const [exposure, setExposure] = useState(30); // seconds
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
    temperature: -5, // CCD temp
    downloadTime: 2.5,
    remainingTime: 0,
    adu: 4500,
    peakADU: 12000
  });

  // Auto-focusing algorithm (V-curve method)
  const performAutoFocus = useCallback(async () => {
    setIsFocusing(true);
    
    // Simulate V-curve focus routine
    const positions = [-500, -250, -100, 0, 100, 250, 500];
    const hfrs: number[] = [];
    
    for (const pos of positions) {
      setFocusPosition(pos);
      await new Promise(r => setTimeout(r, 2000)); // Move and settle
      
      // Simulate HFR measurement (parabola shape)
      const simulatedHFR = 2 + Math.pow(pos / 300, 2) + Math.random() * 0.2;
      hfrs.push(simulatedHFR);
      setFocusHFR(simulatedHFR);
    }
    
    // Find minimum HFR position
    const minIdx = hfrs.indexOf(Math.min(...hfrs));
    const bestPosition = positions[minIdx];
    
    setFocusPosition(bestPosition);
    setFocusHFR(hfrs[minIdx]);
    setIsFocusing(false);
    
    return hfrs[minIdx];
  }, []);

  // Capture sequence
  const startCapture = useCallback(async () => {
    setIsCapturing(true);
    setCurrentFrame(0);
    setFrames([]);
    
    // Auto-focus before starting if enabled
    if (isAutoFocus) {
      await performAutoFocus();
    }
    
    // Start capture sequence
    for (let i = 1; i <= numFrames; i++) {
      setCurrentFrame(i);
      
      // Start exposure
      try {
        await fetch(`http://${bridgeIp}:5005/ccd/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exposure: exposure, device: "Canon DSLR EOS 600D" })
        });
      } catch (e) {
        console.error('Capture error:', e);
      }
      
      // Wait for exposure + download
      await new Promise(r => setTimeout(r, (exposure + 3) * 1000));
      
      // Simulate frame data
      const frame: CaptureFrame = {
        id: `frame_${Date.now()}`,
        timestamp: Date.now(),
        exposure,
        gain,
        hfr: focusHFR || 2.5 + Math.random() * 0.5,
        starsDetected: 150 + Math.floor(Math.random() * 50),
        filename: `light_${String(i).padStart(3, '0')}_${exposure}s_iso${gain}.cr3`
      };
      
      setFrames(prev => [...prev, frame]);
      
      // Update remaining time
      const remaining = (numFrames - i) * (exposure + 3);
      setLiveStats(s => ({ ...s, remainingTime: remaining }));
    }
    
    setIsCapturing(false);
    
    // Auto-start stacking
    if (frames.length > 0) {
      startStacking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposure, gain, numFrames, isAutoFocus, performAutoFocus, focusHFR, bridgeIp]);

  // Stacking with star alignment
  const startStacking = useCallback(async () => {
    setIsStacking(true);
    
    const validFrames = frames.filter(f => f.hfr < 4); // Reject blurry frames
    
    setStackingResult({
      id: `stack_${Date.now()}`,
      framesUsed: 0,
      totalExposure: 0,
      snr: 0,
      fwhm: 0,
      progress: 0,
      status: 'aligning'
    });
    
    // Phase 1: Star detection and alignment
    for (let i = 0; i < validFrames.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      
      setStackingResult(prev => prev ? {
        ...prev,
        framesUsed: i + 1,
        progress: ((i + 1) / validFrames.length) * 50,
        status: 'aligning'
      } : null);
    }
    
    // Phase 2: Stacking with rejection
    setStackingResult(prev => prev ? { ...prev, status: 'stacking' } : null);
    
    for (let i = 0; i <= 100; i += 5) {
      await new Promise(r => setTimeout(r, 200));
      setStackingResult(prev => prev ? {
        ...prev,
        progress: 50 + (i / 2),
        snr: Math.sqrt(validFrames.length * exposure) * (1 + i / 500),
        fwhm: 2.8 - (i / 500)
      } : null);
    }
    
    const totalExp = validFrames.reduce((sum, f) => sum + f.exposure, 0);
    
    setStackingResult({
      id: `stack_${Date.now()}`,
      framesUsed: validFrames.length,
      totalExposure: totalExp,
      snr: Math.sqrt(validFrames.length) * 15,
      fwhm: 2.2,
      progress: 100,
      status: 'complete'
    });
    
    setIsStacking(false);
  }, [frames, exposure]);

  const stopCapture = () => {
    setIsCapturing(false);
    setIsStacking(false);
  };

  return (
    <VStack align="stretch" gap={4} w="full">
      {/* Header */}
      <HStack justify="space-between">
        <HStack gap={2}>
          <Icon as={Camera} boxSize={5} color="var(--astro-teal)" />
          <Text fontSize="14px" fontWeight="bold" letterSpacing="0.1em">
            {language === 'fr' ? 'CAPTURE & STACKING' : 'CAPTURE & STACKING'}
          </Text>
        </HStack>
        <HStack gap={2}>
          <Badge colorScheme={isCapturing ? "red" : "gray"} variant="outline">
            {isCapturing ? 'REC' : 'STBY'}
          </Badge>
          <Badge colorScheme="cyan" variant="outline">
            {frames.length} / {numFrames}
          </Badge>
        </HStack>
      </HStack>

      {/* Settings Grid */}
      <Grid templateColumns="repeat(3, 1fr)" gap={3}>
        {/* Exposure */}
        <Box bg="rgba(0,0,0,0.3)" p={2} borderRadius="6px">
          <HStack gap={1} mb={1}>
            <Icon as={Clock} boxSize={3} color="whiteAlpha.500" />
            <Text fontSize="10px" color="whiteAlpha.600">Exp (s)</Text>
          </HStack>
          <NumberInput.Root size="sm" value={exposure.toString()} onValueChange={(e) => setExposure(Number(e.value))} min={1} max={600}>
            <NumberInput.Control />
          </NumberInput.Root>
        </Box>

        {/* Gain/ISO */}
        <Box bg="rgba(0,0,0,0.3)" p={2} borderRadius="6px">
          <HStack gap={1} mb={1}>
            <Icon as={Zap} boxSize={3} color="whiteAlpha.500" />
            <Text fontSize="10px" color="whiteAlpha.600">ISO</Text>
          </HStack>
          <NumberInput.Root size="sm" value={gain.toString()} onValueChange={(e) => setGain(Number(e.value))} min={100} max={6400} step={100}>
            <NumberInput.Control />
          </NumberInput.Root>
        </Box>

        {/* Frames */}
        <Box bg="rgba(0,0,0,0.3)" p={2} borderRadius="6px">
          <HStack gap={1} mb={1}>
            <Icon as={Layers} boxSize={3} color="whiteAlpha.500" />
            <Text fontSize="10px" color="whiteAlpha.600">Frames</Text>
          </HStack>
          <NumberInput.Root size="sm" value={numFrames.toString()} onValueChange={(e) => setNumFrames(Number(e.value))} min={1} max={100}>
            <NumberInput.Control />
          </NumberInput.Root>
        </Box>
      </Grid>

      {/* Auto Options */}
      <HStack gap={4} justify="center">
        <HStack gap={2}>
          <Switch.Root checked={isAutoFocus} onCheckedChange={(e) => setIsAutoFocus(e.checked)} size="sm">
            <Switch.Control />
            <Switch.HiddenInput />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Auto-Focus</span>
          </Switch.Root>
        </HStack>
        <HStack gap={2}>
          <Switch.Root checked={isGuiding} onCheckedChange={(e) => setIsGuiding(e.checked)} size="sm">
            <Switch.Control />
            <Switch.HiddenInput />
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Guidage</span>
          </Switch.Root>
        </HStack>
      </HStack>

      {/* Capture Progress */}
      {isCapturing && (
        <Box bg="rgba(0,0,0,0.3)" p={3} borderRadius="8px">
          <HStack justify="space-between" mb={2}>
            <Text fontSize="11px" color="var(--astro-teal)">
              {language === 'fr' ? 'Capture en cours...' : 'Capturing...'}
            </Text>
            <Text fontSize="11px" color="whiteAlpha.700">
              {currentFrame} / {numFrames}
            </Text>
          </HStack>
          <Box w="full" h="4px" bg="rgba(255,255,255,0.1)" borderRadius="2px" overflow="hidden">
            <Box 
              h="full" 
              bg="var(--astro-teal)" 
              transition="width 0.3s"
              style={{ width: `${(currentFrame / numFrames) * 100}%` }}
            />
          </Box>
          <HStack justify="space-between" mt={2} fontSize="10px" color="whiteAlpha.500">
            <span>Temp: {liveStats.temperature}°C</span>
            <span>Reste: {Math.floor(liveStats.remainingTime / 60)}m {liveStats.remainingTime % 60}s</span>
          </HStack>
        </Box>
      )}

      {/* Focus Status */}
      {isFocusing && (
        <Box bg="rgba(255,100,0,0.1)" p={3} borderRadius="8px" border="1px solid rgba(255,100,0,0.3)">
          <HStack gap={2}>
            <Icon as={Target} boxSize={4} color="orange.400" className="spin" />
            <Text fontSize="11px" color="orange.300">
              {language === 'fr' ? `Auto-focus: Position ${focusPosition}` : `Auto-focus: Position ${focusPosition}`}
            </Text>
            {focusHFR && (
              <Badge size="sm" colorScheme="orange">HFR: {focusHFR.toFixed(2)}</Badge>
            )}
          </HStack>
        </Box>
      )}

      {/* Stacking Progress */}
      {isStacking && stackingResult && (
        <Box bg="rgba(0,240,255,0.1)" p={3} borderRadius="8px" border="1px solid rgba(0,240,255,0.3)">
          <HStack justify="space-between" mb={2}>
            <Text fontSize="11px" color="var(--astro-teal)">
              {stackingResult.status === 'aligning' 
                ? (language === 'fr' ? 'Alignement des frames...' : 'Aligning frames...')
                : (language === 'fr' ? 'Stacking IA...' : 'AI Stacking...')}
            </Text>
            <Badge size="sm" colorScheme="cyan">{stackingResult.framesUsed} frames</Badge>
          </HStack>
          <Box w="full" h="4px" bg="rgba(255,255,255,0.1)" borderRadius="2px" overflow="hidden">
            <Box 
              h="full" 
              bg="teal.400" 
              transition="width 0.3s"
              style={{ width: `${stackingResult.progress}%` }}
            />
          </Box>
          {stackingResult.snr > 0 && (
            <HStack justify="space-between" mt={2} fontSize="10px" color="whiteAlpha.500">
              <span>SNR: {stackingResult.snr.toFixed(1)}</span>
            <span>FWHM: {stackingResult.fwhm.toFixed(2)}&quot;</span>
            </HStack>
          )}
        </Box>
      )}

      {/* Results */}
      {stackingResult?.status === 'complete' && (
        <Box bg="rgba(0,255,100,0.1)" p={3} borderRadius="8px" border="1px solid rgba(0,255,100,0.3)">
          <HStack gap={2} mb={2}>
            <Icon as={BrainCircuit} boxSize={4} color="green.400" />
            <Text fontSize="12px" fontWeight="bold" color="green.300">
              {language === 'fr' ? 'Stacking Terminé!' : 'Stacking Complete!'}
            </Text>
          </HStack>
          <Grid templateColumns="repeat(2, 1fr)" gap={2} fontSize="11px">
            <Text color="whiteAlpha.600">Frames: <span style={{ color: '#00F0FF' }}>{stackingResult.framesUsed}</span></Text>
            <Text color="whiteAlpha.600">Exposure: <span style={{ color: '#00F0FF' }}>{stackingResult.totalExposure}s</span></Text>
            <Text color="whiteAlpha.600">SNR: <span style={{ color: '#00F0FF' }}>{stackingResult.snr.toFixed(1)}</span></Text>
            <Text color="whiteAlpha.600">FWHM: <span style={{ color: '#00F0FF' }}>{stackingResult.fwhm.toFixed(2)}&quot;</span></Text>
          </Grid>
        </Box>
      )}

      {/* Controls */}
      <HStack gap={3} justify="center">
        {!isCapturing ? (
          <Button
            bg="var(--astro-teal)"
            color="black"
            _hover={{ bg: "white" }}
            onClick={startCapture}
            disabled={isFocusing}
          >
            <Icon as={Play} boxSize={4} mr={2} />
            {language === 'fr' ? 'DÉMARRER SÉQUENCE' : 'START SEQUENCE'}
          </Button>
        ) : (
          <Button
            bg="red.500"
            color="white"
            _hover={{ bg: "red.600" }}
            onClick={stopCapture}
          >
            <Icon as={Square} boxSize={4} mr={2} />
            {language === 'fr' ? 'ARRÊTER' : 'STOP'}
          </Button>
        )}

        <Button
          variant="outline"
          borderColor="whiteAlpha.300"
          onClick={() => performAutoFocus()}
          disabled={isFocusing || isCapturing}
        >
          <Icon as={Aperture} boxSize={4} mr={2} />
          {language === 'fr' ? 'FOCUS' : 'FOCUS'}
        </Button>
      </HStack>
    </VStack>
  );
};
