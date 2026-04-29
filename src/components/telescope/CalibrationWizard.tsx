"use client";

import { useState, useEffect } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Badge, Flex } from "@chakra-ui/react";
import { CheckCircle, AlertTriangle, Telescope, Camera, Compass, ArrowRight, RotateCcw, MapPin, Video, Check, X, AlertCircle } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { mockApi } from "@/services/mockApi";

type CalibrationStep = 
  | 'idle' 
  | 'connection' 
  | 'park' 
  | 'park-verify'
  | 'limits-alt-max'
  | 'limits-alt-min'  
  | 'limits-az-max'
  | 'limits-az-min'
  | 'camera-test'
  | 'complete';

interface StepStatus {
  step: CalibrationStep;
  isWaitingUser: boolean;
  message: string;
  instruction: string;
}

export const CalibrationWizard = () => {
  const { language, alt, az, config } = useStargazerStore();
  const bridgeIp = config.astroberryUrl.replace('http://', '').replace(':8624', '');
  const [step, setStep] = useState<StepStatus>({
    step: 'idle',
    isWaitingUser: false,
    message: '',
    instruction: ''
  });
  const [limits, setLimits] = useState({
    maxAlt: 0,
    minAlt: 0, 
    maxAz: 0,
    minAz: 0
  });
  const [videoActive, setVideoActive] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const startCalibration = async () => {
    setErrors([]);
    setStep({
      step: 'connection',
      isWaitingUser: false,
      message: language === 'fr' ? 'Vérification connexion...' : 'Checking connection...',
      instruction: ''
    });

    // Step 1: Check connection
    const ping = await mockApi.ping(config.astroberryUrl, config.driverInstance);
    if (!ping.success) {
      setStep({
        step: 'idle',
        isWaitingUser: false,
        message: '',
        instruction: ''
      });
      setErrors([language === 'fr' ? 'Connexion échouée. Vérifiez Astroberry.' : 'Connection failed. Check Astroberry.']);
      return;
    }

    // Step 2: Park position
    setStep({
      step: 'park',
      isWaitingUser: true,
      message: language === 'fr' ? 'Mise en station requise' : 'Parking required',
      instruction: language === 'fr' 
        ? 'Garez la monture: tube horizontal, pointé vers le Nord (ou Sud). Altitude ≈ 0°, Azimut = 0° ou 180° selon votre hémisphère.'
        : 'Park the mount: tube horizontal, pointing North (or South). Altitude ≈ 0°, Azimuth = 0° or 180° depending on hemisphere.'
    });
  };

  const syncParkPosition = () => {
    // Sync current physical position to park coordinates in Stargazer
    // Call API to sync mount position
    fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', ra: 0, dec: 0, ip: bridgeIp }) // Park position
    }).then(() => {
      setErrors([]);
      // Update store with synced position
      setStep({
        step: 'limits-alt-max',
        isWaitingUser: true,
        message: language === 'fr' ? 'Calibration limites: Altitude Max' : 'Limits calibration: Max Altitude',
        instruction: language === 'fr'
          ? 'Position synchronisée! Utilisez les flèches HAUT/BAS pour monter au maximum. Puis VALIDER.'
          : 'Position synced! Use UP/DOWN arrows to raise to maximum. Then VALIDATE.'
      });
      setVideoActive(true);
    }).catch(err => {
      setErrors([language === 'fr' ? 'Erreur synchronisation' : 'Sync error']);
    });
  };

  const verifyParkPosition = () => {
    // Check if mount is roughly horizontal (altitude near 0) and pointing north/south
    const isHorizontal = Math.abs(alt) < 10; // Within 10 degrees of horizontal
    const isNorthSouth = Math.abs(az) < 15 || Math.abs(az - 180) < 15 || Math.abs(az - 360) < 15;
    
    if (!isHorizontal || !isNorthSouth) {
      // Show error with sync option
      setErrors([language === 'fr' 
        ? `Monture non synchronisée: Alt=${alt.toFixed(1)}°, Az=${az.toFixed(1)}°. Positionnez à l'horizontal puis cliquez SYNCHRONISER.`
        : `Mount not synced: Alt=${alt.toFixed(1)}°, Az=${az.toFixed(1)}°. Position horizontally then click SYNC.`
      ]);
      return;
    }

    setErrors([]);
    setStep({
      step: 'limits-alt-max',
      isWaitingUser: true,
      message: language === 'fr' ? 'Calibration limites: Altitude Max' : 'Limits calibration: Max Altitude',
      instruction: language === 'fr'
        ? 'Utilisez les flèches HAUT/BAS pour monter la monture au maximum sécurisé. Puis cliquez VALIDER.'
        : 'Use UP/DOWN arrows to raise mount to maximum safe position. Then click VALIDATE.'
    });
    setVideoActive(true);
  };

  const saveMaxAlt = () => {
    setLimits(prev => ({ ...prev, maxAlt: alt }));
    setStep({
      step: 'limits-alt-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Calibration: Altitude Min' : 'Calibration: Min Altitude',
      instruction: language === 'fr'
        ? 'Descendez la monture au minimum (attention aux câbles!). Puis VALIDER.'
        : 'Lower mount to minimum (watch cables!). Then VALIDATE.'
    });
  };

  const saveMinAlt = () => {
    setLimits(prev => ({ ...prev, minAlt: alt }));
    setStep({
      step: 'limits-az-max',
      isWaitingUser: true,
      message: language === 'fr' ? 'Calibration: Azimut Max' : 'Calibration: Max Azimuth',
      instruction: language === 'fr'
        ? 'Tournez à droite (flèche DROITE) jusqu\'au butée Est sécurisée. Puis VALIDER.'
        : 'Rotate right (RIGHT arrow) to safe East limit. Then VALIDATE.'
    });
  };

  const saveMaxAz = () => {
    setLimits(prev => ({ ...prev, maxAz: az }));
    setStep({
      step: 'limits-az-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Calibration: Azimut Min' : 'Calibration: Min Azimuth',
      instruction: language === 'fr'
        ? 'Tournez à gauche jusqu\'au butée Ouest sécurisée. Puis VALIDER.'
        : 'Rotate left to safe West limit. Then VALIDATE.'
    });
  };

  const saveMinAz = () => {
    setLimits(prev => ({ ...prev, minAz: az }));
    setStep({
      step: 'camera-test',
      isWaitingUser: true,
      message: language === 'fr' ? 'Test caméra' : 'Camera test',
      instruction: language === 'fr'
        ? 'Testez la caméra: une capture de 5s va être effectuée. Vérifiez le retour vidéo.'
        : 'Test camera: a 5s capture will be taken. Check video feed.'
    });
  };

  const testCamera = async () => {
    try {
      await fetch(`/api/indi/ccd?device=Canon%20DSLR%20EOS%20600D&exposure=5&ip=${bridgeIp}`);
      setStep({
        step: 'complete',
        isWaitingUser: false,
        message: language === 'fr' ? 'Calibration terminée!' : 'Calibration complete!',
        instruction: language === 'fr'
          ? `Limites enregistrées: Alt ${limits.minAlt.toFixed(0)}°-${limits.maxAlt.toFixed(0)}°, Az ${limits.minAz.toFixed(0)}°-${limits.maxAz.toFixed(0)}°`
          : `Limits saved: Alt ${limits.minAlt.toFixed(0)}°-${limits.maxAlt.toFixed(0)}°, Az ${limits.minAz.toFixed(0)}°-${limits.maxAz.toFixed(0)}°`
      });
    } catch (e) {
      setErrors([language === 'fr' ? 'Erreur caméra' : 'Camera error']);
    }
  };

  const reset = () => {
    setStep({ step: 'idle', isWaitingUser: false, message: '', instruction: '' });
    setErrors([]);
    setVideoActive(false);
  };

  // Render based on current step
  if (step.step === 'idle') {
    return (
      <VStack align="stretch" gap={4}>
        <Text fontSize="sm" color="whiteAlpha.800">
          {language === 'fr' 
            ? 'Cet assistant vous guidera pour la mise en station complète de la monture, la définition des limites et le test caméra.'
            : 'This wizard will guide you through complete mount parking, limits setup and camera test.'}
        </Text>
        
        {errors.length > 0 && (
          <Box bg="rgba(255,0,0,0.1)" border="1px solid rgba(255,0,0,0.3)" p={3} borderRadius="md">
            <HStack gap={2}>
              <Icon as={AlertCircle} boxSize={4} color="red.400" />
              <Text fontSize="12px" color="red.300">{errors[0]}</Text>
            </HStack>
          </Box>
        )}

        <Button bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={startCalibration}>
          <Icon as={Compass} boxSize={4} mr={2} />
          {language === 'fr' ? 'DÉMARRER CALIBRATION' : 'START CALIBRATION'}
        </Button>
      </VStack>
    );
  }

  return (
    <VStack align="stretch" gap={4}>
      {/* Status Header */}
      <Box bg="rgba(0,240,255,0.1)" p={3} borderRadius="8px" borderLeft="3px solid var(--astro-teal)">
        <HStack gap={2} mb={2}>
          <Icon as={step.isWaitingUser ? AlertTriangle : CheckCircle} 
                boxSize={5} 
                color={step.isWaitingUser ? "orange.400" : "green.400"} />
          <Text fontSize="12px" fontWeight="bold" color="white">
            {step.message}
          </Text>
        </HStack>
        <Text fontSize="11px" color="whiteAlpha.700" lineHeight={1.5}>
          {step.instruction}
        </Text>
      </Box>

      {/* Live Position Display */}
      <Flex justify="space-between" bg="rgba(0,0,0,0.3)" p={3} borderRadius="6px">
        <VStack align="start" gap={0}>
          <Text fontSize="10px" color="whiteAlpha.500">Altitude</Text>
          <Text fontSize="18px" fontWeight="bold" color="var(--astro-teal)" className="hud-font">
            {alt.toFixed(1)}°
          </Text>
        </VStack>
        <VStack align="end" gap={0}>
          <Text fontSize="10px" color="whiteAlpha.500">Azimut</Text>
          <Text fontSize="18px" fontWeight="bold" color="var(--astro-teal)" className="hud-font">
            {az.toFixed(1)}°
          </Text>
        </VStack>
      </Flex>

      {/* Canon Live View Feed */}
      {videoActive && (
        <Box bg="rgba(0,0,0,0.7)" p={2} borderRadius="8px" border="1px solid rgba(0,240,255,0.3)">
          <HStack gap={2} mb={2} justify="space-between">
            <HStack gap={2}>
              <Icon as={Video} boxSize={4} color="var(--astro-teal)" />
              <Text fontSize="11px" color="var(--astro-teal)">
                {language === 'fr' ? 'Canon EOS 600D - LIVE' : 'Canon EOS 600D - LIVE'}
              </Text>
              <Box w="8px" h="8px" bg="red.500" borderRadius="full" className="pulse" />
            </HStack>
            <Text fontSize="9px" color="whiteAlpha.500">
              API Proxy
            </Text>
          </HStack>
          
          {/* Live View Image */}
          <Box 
            w="full" 
            h="150px" 
            bg="black" 
            borderRadius="4px" 
            overflow="hidden"
            position="relative"
          >
            <img 
              src={`/api/indi/latest-image?ip=${bridgeIp}&t=${Date.now()}`}
              alt="Canon Live"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                // Fallback to placeholder on error
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            {/* Crosshair overlay */}
            <Box 
              position="absolute" 
              top="50%" left="50%"
              transform="translate(-50%, -50%)"
              pointerEvents="none"
            >
              <Box w="30px" h="2px" bg="rgba(0,240,255,0.6)" position="absolute" left="-15px" top="-1px" />
              <Box h="30px" w="2px" bg="rgba(0,240,255,0.6)" position="absolute" top="-15px" left="-1px" />
              <Box w="40px" h="40px" border="1px solid rgba(255,179,71,0.4)" borderRadius="full" position="absolute" left="-20px" top="-20px" />
            </Box>
          </Box>
          
          <Text fontSize="9px" color="whiteAlpha.500" mt={1} textAlign="center">
            {language === 'fr' ? 'Positionnez la monture en utilisant le viseur' : 'Position mount using the eyepiece view'}
          </Text>
        </Box>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Box bg="rgba(255,0,0,0.1)" border="1px solid rgba(255,0,0,0.3)" p={3} borderRadius="md">
          <HStack gap={2}>
            <Icon as={X} boxSize={4} color="red.400" />
            <Text fontSize="12px" color="red.300">{errors[0]}</Text>
          </HStack>
        </Box>
      )}

      {/* Action Buttons */}
      {step.isWaitingUser && (
        <VStack gap={2}>
          {step.step === 'park' && (
            <VStack w="full" gap={2}>
              <Button w="full" bg="orange.500" color="white" _hover={{ bg: "orange.600" }} onClick={syncParkPosition}>
                <Icon as={RotateCcw} boxSize={4} mr={2} />
                {language === 'fr' ? 'SYNCHRONISER POSITION (0°, 180°)' : 'SYNC POSITION (0°, 180°)'}
              </Button>
              <Text fontSize="10px" color="whiteAlpha.500" textAlign="center">
                {language === 'fr' ? 'Utilisez ce bouton si les coordonnées ne correspondent pas à la position réelle' : 'Use this if coordinates don\'t match actual position'}
              </Text>
              <Button w="full" bg="green.500" color="white" _hover={{ bg: "green.600" }} onClick={verifyParkPosition}>
                <Icon as={Check} boxSize={4} mr={2} />
                {language === 'fr' ? 'POSITION GARÉE - CONTINUER' : 'PARKED - CONTINUE'}
              </Button>
            </VStack>
          )}
          
          {step.step === 'limits-alt-max' && (
            <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={saveMaxAlt}>
              <Icon as={Check} boxSize={4} mr={2} />
              {language === 'fr' ? 'VALIDER ALTITUDE MAX' : 'VALIDATE MAX ALT'}
            </Button>
          )}
          
          {step.step === 'limits-alt-min' && (
            <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={saveMinAlt}>
              <Icon as={Check} boxSize={4} mr={2} />
              {language === 'fr' ? 'VALIDER ALTITUDE MIN' : 'VALIDATE MIN ALT'}
            </Button>
          )}
          
          {step.step === 'limits-az-max' && (
            <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={saveMaxAz}>
              <Icon as={Check} boxSize={4} mr={2} />
              {language === 'fr' ? 'VALIDER AZIMUT MAX (Est)' : 'VALIDATE MAX AZ (East)'}
            </Button>
          )}
          
          {step.step === 'limits-az-min' && (
            <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={saveMinAz}>
              <Icon as={Check} boxSize={4} mr={2} />
              {language === 'fr' ? 'VALIDER AZIMUT MIN (Ouest)' : 'VALIDATE MIN AZ (West)'}
            </Button>
          )}
          
          {step.step === 'camera-test' && (
            <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={testCamera}>
              <Icon as={Camera} boxSize={4} mr={2} />
              {language === 'fr' ? 'TEST CAPTURE 5s' : 'TEST CAPTURE 5s'}
            </Button>
          )}

          <Button w="full" variant="ghost" color="whiteAlpha.600" onClick={reset}>
            <Icon as={X} boxSize={4} mr={2} />
            {language === 'fr' ? 'ANNULER' : 'CANCEL'}
          </Button>
        </VStack>
      )}

      {/* Complete */}
      {step.step === 'complete' && (
        <VStack gap={3}>
          <Box bg="rgba(0,255,100,0.1)" p={4} borderRadius="8px" textAlign="center">
            <Icon as={CheckCircle} boxSize={8} color="green.400" mb={2} />
            <Text fontSize="14px" fontWeight="bold" color="green.300">
              {language === 'fr' ? 'Calibration réussie!' : 'Calibration successful!'}
            </Text>
            <Text fontSize="11px" color="whiteAlpha.600" mt={2}>
              {step.instruction}
            </Text>
          </Box>
          
          <Button w="full" bg="var(--astro-teal)" color="black" _hover={{ bg: "white" }} onClick={reset}>
            <Icon as={RotateCcw} boxSize={4} mr={2} />
            {language === 'fr' ? 'RECALIBRER' : 'RECALIBRATE'}
          </Button>
        </VStack>
      )}

      {/* Progress Indicators */}
      <HStack gap={1} justify="center" mt={2}>
        {['connection', 'park', 'limits-alt-max', 'limits-alt-min', 'limits-az-max', 'limits-az-min', 'camera-test', 'complete'].map((s, i) => {
          const stepIndex = ['connection', 'park', 'limits-alt-max', 'limits-alt-min', 'limits-az-max', 'limits-az-min', 'camera-test', 'complete'].indexOf(step.step);
          const isActive = s === step.step;
          const isDone = i < stepIndex;
          
          return (
            <Box 
              key={s}
              w="20px" 
              h="4px" 
              borderRadius="2px"
              bg={isActive ? "var(--astro-teal)" : isDone ? "green.400" : "whiteAlpha.200"}
            />
          );
        })}
      </HStack>
    </VStack>
  );
};
