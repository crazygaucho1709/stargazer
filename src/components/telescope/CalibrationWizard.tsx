"use client";

import { useState, useEffect } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Badge, Flex } from "@chakra-ui/react";
import { CheckCircle, AlertTriangle, Telescope, Camera, Compass, ArrowRight, RotateCcw, MapPin, Video, Check, X, AlertCircle, Target, Star, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { mockApi } from "@/services/mockApi";

type CalibrationStep = 
  | 'idle' 
  | 'connection' 
  | 'park' 
  | 'limits-alt-max'
  | 'limits-alt-min'  
  | 'limits-az-max'
  | 'limits-az-min'
  | 'camera-test'
  | 'alignment'
  | 'complete';

interface StepStatus {
  step: CalibrationStep;
  isWaitingUser: boolean;
  message: string;
  instruction: string;
}

const BRIGHT_STARS = [
  { name: "Sirius", ra: "06h 45m 08s", dec: "-16° 42' 58\"" },
  { name: "Canopus", ra: "06h 23m 57s", dec: "-52° 41' 44\"" },
  { name: "Arcturus", ra: "14h 15m 39s", dec: "+19° 10' 56\"" },
  { name: "Rigel Kentaurus", ra: "14h 39m 36s", dec: "-60° 50' 02\"" },
  { name: "Vega", ra: "18h 36m 56s", dec: "+38° 47' 01\"" },
  { name: "Capella", ra: "05h 16m 41s", dec: "+45° 59' 52\"" },
  { name: "Rigel", ra: "05h 14m 32s", dec: "-08° 12' 06\"" },
  { name: "Procyon", ra: "07h 39m 18s", dec: "+05° 13' 29\"" },
  { name: "Achernar", ra: "01h 37m 42s", dec: "-57° 14' 12\"" },
  { name: "Betelgeuse", ra: "05h 55m 10s", dec: "+07° 24' 25\"" },
];

export const CalibrationWizard = () => {
  const { language, alt, az, config, setMountLimits, mountLimits, setSlewing } = useStargazerStore();
  const bridgeIp = config.astroberryUrl.replace('http://', '').replace(':8624', '');
  const [step, setStep] = useState<StepStatus>({
    step: 'idle',
    isWaitingUser: false,
    message: '',
    instruction: ''
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [videoActive, setVideoActive] = useState(false);
  const [selectedStar, setSelectedStar] = useState(BRIGHT_STARS[0]);
  const [starAltAz, setStarAltAz] = useState<{alt: number, az: number} | null>(null);

  useEffect(() => {
    if (step.step !== 'alignment') return;
    const updatePos = async () => {
      const res = await mockApi.getStarPosition(selectedStar.ra, selectedStar.dec);
      if (res.success && res.alt !== undefined && res.az !== undefined) {
        setStarAltAz({ alt: res.alt, az: res.az });
      }
    };
    updatePos();
    const interval = setInterval(updatePos, 10000);
    return () => clearInterval(interval);
  }, [selectedStar, step.step]);

  useEffect(() => {
    if (step.step !== 'idle' && step.step !== 'complete') {
      setVideoActive(true);
      // Start camera stream
      fetch('/api/indi/liveview', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', ip: bridgeIp })
      }).catch(console.error);
    } else {
      setVideoActive(false);
    }
  }, [step.step, bridgeIp]);

  const startCalibration = async () => {
    setErrors([]);
    setStep({
      step: 'connection',
      isWaitingUser: false,
      message: language === 'fr' ? 'Vérification connexion...' : 'Checking connection...',
      instruction: ''
    });

    const ping = await mockApi.ping(config.astroberryUrl, config.driverInstance);
    if (!ping.success) {
      setStep({ step: 'idle', isWaitingUser: false, message: '', instruction: '' });
      setErrors([language === 'fr' ? 'Connexion échouée.' : 'Connection failed.']);
      return;
    }

    const isSouthernHemisphere = parseFloat(config.latitude) < 0;
    setStep({
      step: 'park',
      isWaitingUser: true,
      message: language === 'fr' ? 'Mise en station' : 'Parking',
      instruction: language === 'fr' 
        ? `Garez la monture: tube horizontal, pointé vers le ${isSouthernHemisphere ? 'Sud' : 'Nord'}.`
        : `Park the mount: tube horizontal, pointing ${isSouthernHemisphere ? 'South' : 'North'}.`
    });
  };

  const syncParkPosition = async () => {
    const isSouthernHemisphere = parseFloat(config.latitude) < 0;
    const res = await mockApi.syncMaster({
      lat: parseFloat(config.latitude),
      lon: parseFloat(config.longitude),
      alt: 0,
      az: isSouthernHemisphere ? 180 : 0
    });
    
    if (res.success) {
      setStep({
        step: 'limits-alt-max',
        isWaitingUser: true,
        message: language === 'fr' ? 'Altitude Max' : 'Max Altitude',
        instruction: language === 'fr' ? 'Montez au maximum sécurisé.' : 'Raise to max safe position.'
      });
    } else {
      setErrors([res.error || "Sync Error"]);
    }
  };

  const saveMaxAlt = () => {
    setMountLimits({ ...mountLimits, maxAlt: alt });
    setStep({
      step: 'limits-alt-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Altitude Min' : 'Min Altitude',
      instruction: language === 'fr' ? 'Descendez au minimum.' : 'Lower to minimum.'
    });
  };

  const saveMinAlt = () => {
    setMountLimits({ ...mountLimits, minAlt: alt });
    setStep({
      step: 'limits-az-max',
      isWaitingUser: true,
      message: language === 'fr' ? 'Azimut Max' : 'Max Azimuth',
      instruction: language === 'fr' ? 'Tournez vers l\'Est.' : 'Rotate East.'
    });
  };

  const saveMaxAz = () => {
    setMountLimits({ ...mountLimits, maxAz: az });
    setStep({
      step: 'limits-az-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Azimut Min' : 'Min Azimuth',
      instruction: language === 'fr' ? 'Tournez vers l\'Ouest.' : 'Rotate West.'
    });
  };

  const saveMinAz = () => {
    setMountLimits({ ...mountLimits, minAz: az });
    mockApi.saveConfig({ mountLimits: { ...mountLimits, minAz: az } });
    setStep({
      step: 'camera-test',
      isWaitingUser: true,
      message: language === 'fr' ? 'Test caméra' : 'Camera test',
      instruction: 'Testez la capture.'
    });
  };

  const testCamera = async () => {
    setStep({
      step: 'alignment',
      isWaitingUser: true,
      message: language === 'fr' ? 'Alignement' : 'Alignment',
      instruction: 'Choisissez une étoile et centrez-la.'
    });
  };

  const startStarGoto = async () => {
    setSlewing(true);
    const res = await mockApi.slew(selectedStar.ra, selectedStar.dec, config.driverInstance);
    if (!res.success) setErrors([res.error || "GOTO error"]);
    setSlewing(false);
  };

  const syncStar = async () => {
    const res = await mockApi.sync(selectedStar.ra, selectedStar.dec, config.driverInstance);
    if (res.success) {
      setStep({
        step: 'complete',
        isWaitingUser: false,
        message: 'Terminé',
        instruction: 'Alignement réussi.'
      });
    } else {
      setErrors([res.error || "Sync error"]);
    }
  };

  const reset = () => {
    setStep({ step: 'idle', isWaitingUser: false, message: '', instruction: '' });
    setErrors([]);
  };

  if (step.step === 'idle') {
    return (
      <Button w="full" bg="var(--astro-teal)" color="black" onClick={startCalibration}>
        {language === 'fr' ? 'DÉMARRER CALIBRATION' : 'START CALIBRATION'}
      </Button>
    );
  }

  return (
    <VStack align="stretch" gap={4}>
      <Box bg="rgba(0,240,255,0.1)" p={3} borderRadius="md" borderLeft="3px solid var(--astro-teal)">
        <Text fontSize="12px" fontWeight="bold" color="white">{step.message}</Text>
        <Text fontSize="10px" color="whiteAlpha.700">{step.instruction}</Text>
      </Box>

      {videoActive && (
        <Box bg="black" borderRadius="md" border="1px solid var(--astro-teal)" h="150px" position="relative">
          <img src={`/api/indi/latest-image?ip=${bridgeIp}&t=${Date.now()}`} style={{ width:'100%', height:'100%', objectFit:'contain' }} alt="Live" />
          <Box position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" w="20px" h="20px" border="1px solid rgba(0,240,255,0.5)" borderRadius="full" />
        </Box>
      )}

      {step.isWaitingUser && step.step !== 'complete' && (
        <VStack bg="whiteAlpha.100" p={2} borderRadius="md" gap={2}>
          <Button size="xs" onMouseDown={() => mockApi.startMotion('up')} onMouseUp={() => mockApi.stopMotion('up')}><ChevronUp size={14}/></Button>
          <HStack>
            <Button size="xs" onMouseDown={() => mockApi.startMotion('left')} onMouseUp={() => mockApi.stopMotion('left')}><ChevronLeft size={14}/></Button>
            <Box w="10px" />
            <Button size="xs" onMouseDown={() => mockApi.startMotion('right')} onMouseUp={() => mockApi.stopMotion('right')}><ChevronRight size={14}/></Button>
          </HStack>
          <Button size="xs" onMouseDown={() => mockApi.startMotion('down')} onMouseUp={() => mockApi.stopMotion('down')}><ChevronDown size={14}/></Button>
        </VStack>
      )}

      <VStack gap={2}>
        {step.step === 'park' && <Button w="full" size="sm" bg="orange.500" onClick={syncParkPosition}>SYNC PARKING (0°)</Button>}
        {step.step === 'limits-alt-max' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMaxAlt}>VALIDER MAX ALT</Button>}
        {step.step === 'limits-alt-min' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMinAlt}>VALIDER MIN ALT</Button>}
        {step.step === 'limits-az-max' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMaxAz}>VALIDER MAX AZ (E)</Button>}
        {step.step === 'limits-az-min' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMinAz}>VALIDER MIN AZ (W)</Button>}
        {step.step === 'camera-test' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={testCamera}>ALLER À L'ALIGNEMENT</Button>}
        {step.step === 'alignment' && (
          <VStack w="full" gap={2}>
            <Box as="select" w="full" bg="black" color="white" fontSize="xs" p={1} onChange={(e:any) => setSelectedStar(BRIGHT_STARS.find(s=>s.name===e.target.value)||BRIGHT_STARS[0])}>
              {BRIGHT_STARS.map(s => <option key={s.name}>{s.name}</option>)}
            </Box>
            {starAltAz && <Text fontSize="9px" color="orange.300">CIBLE: {starAltAz.alt.toFixed(1)}° / {starAltAz.az.toFixed(0)}°</Text>}
            <Button w="full" size="sm" bg="var(--astro-gold)" onClick={startStarGoto}>GOTO</Button>
            <Button w="full" size="sm" bg="green.500" onClick={syncStar}>SYNCHRONISER</Button>
          </VStack>
        )}
        {step.step === 'complete' && <Button w="full" size="sm" bg="green.600" onClick={reset}>TERMINER</Button>}
        <Button size="xs" variant="ghost" onClick={reset}>ANNULER</Button>
      </VStack>
    </VStack>
  );
};
