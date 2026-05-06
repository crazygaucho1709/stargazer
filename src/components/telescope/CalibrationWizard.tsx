"use client";

import { useState, useEffect } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Badge, Flex } from "@chakra-ui/react";
import { CheckCircle, AlertTriangle, Telescope, Camera, Compass, ArrowRight, RotateCcw, MapPin, Video, Check, X, AlertCircle, Target, Star, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { mockApi } from "@/services/mockApi";

type CalibrationStep = 
  | 'idle' 
  | 'connection' 
  | 'init-mount'
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
  const { language, config, setMountLimits, mountLimits, setSlewing } = useStargazerStore();
  const bridgeIp = config.astroberryUrl.includes('http') ? new URL(config.astroberryUrl).hostname : config.astroberryUrl.split(':')[0];
  const [step, setStep] = useState<StepStatus>({
    step: 'idle',
    isWaitingUser: false,
    message: '',
    instruction: ''
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [videoActive, setVideoActive] = useState(false);
  const [selectedStar, setSelectedStar] = useState(BRIGHT_STARS[0]);
  const [imageTime, setImageTime] = useState(Date.now());
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

  useEffect(() => {
    if (!videoActive) return;
    const interval = setInterval(() => {
      setImageTime(Date.now());
    }, 1000); // Contrôle le rafraîchissement à 1 image/sec
    return () => clearInterval(interval);
  }, [videoActive]);

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

    setStep({
      step: 'init-mount',
      isWaitingUser: false,
      message: language === 'fr' ? 'Initialisation NexStar...' : 'Initializing NexStar...',
      instruction: language === 'fr' ? 'Écrasement raquette : Envoi Heure (UTC), GPS et Limites...' : 'Overriding Hand Controller: Pushing Time, GPS & Limits...'
    });

    try {
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_master',
          lat: parseFloat(config.latitude),
          lon: parseFloat(config.longitude),
          utcTime: new Date().toISOString(),
          limits: mountLimits,
          ip: bridgeIp
        })
      });
    } catch (e) {
      console.error("Mount sync failed", e);
    }

    await new Promise(r => setTimeout(r, 1500)); // Petit délai pour laisser l'UI s'afficher et INDI digérer

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
    try {
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_master',
          lat: parseFloat(config.latitude),
          lon: parseFloat(config.longitude),
          alt: 0,
          az: isSouthernHemisphere ? 180 : 0,
          ip: bridgeIp
        })
      });

      setStep({
        step: 'limits-alt-max',
        isWaitingUser: true,
        message: language === 'fr' ? 'Altitude Max' : 'Max Altitude',
        instruction: language === 'fr' ? 'Montez au maximum sécurisé.' : 'Raise to max safe position.'
      });
    } catch (e: any) {
      setErrors([e.message || "Sync Error"]);
    }
  };

  const saveMaxAlt = () => {
    const { alt } = useStargazerStore.getState();
    setMountLimits({ ...mountLimits, maxAlt: alt });
    setStep({
      step: 'limits-alt-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Altitude Min' : 'Min Altitude',
      instruction: language === 'fr' ? 'Descendez au minimum.' : 'Lower to minimum.'
    });
  };

  const saveMinAlt = () => {
    const { alt } = useStargazerStore.getState();
    setMountLimits({ ...mountLimits, minAlt: alt });
    setStep({
      step: 'limits-az-max',
      isWaitingUser: true,
      message: language === 'fr' ? 'Azimut Max' : 'Max Azimuth',
      instruction: language === 'fr' ? 'Tournez vers l\'Est.' : 'Rotate East.'
    });
  };

  const saveMaxAz = () => {
    const { az } = useStargazerStore.getState();
    setMountLimits({ ...mountLimits, maxAz: az });
    setStep({
      step: 'limits-az-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Azimut Min' : 'Min Azimuth',
      instruction: language === 'fr' ? 'Tournez vers l\'Ouest.' : 'Rotate West.'
    });
  };

  const saveMinAz = () => {
    const { az } = useStargazerStore.getState();
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
    try {
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'slew', device: config.driverInstance, ra: selectedStar.ra, dec: selectedStar.dec, ip: bridgeIp })
      });
    } catch (e: any) {
      setErrors([e.message || "GOTO error"]);
    }
    setSlewing(false);
  };

  const syncStar = async () => {
    try {
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', ra: selectedStar.ra, dec: selectedStar.dec, ip: bridgeIp })
      });
      setStep({
        step: 'complete',
        isWaitingUser: false,
        message: 'Terminé',
        instruction: 'Alignement réussi.'
      });
    } catch (e: any) {
      setErrors([e.message || "Sync error"]);
    }
  };

  const reset = () => {
    setStep({ step: 'idle', isWaitingUser: false, message: '', instruction: '' });
    setErrors([]);
  };
  
  const jogMount = (direction: 'up' | 'down' | 'left' | 'right') => {
    fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'jog', direction, state: 'start', ip: bridgeIp })
    }).catch(console.error);
  };

  const stopMount = (direction: 'up' | 'down' | 'left' | 'right') => {
    fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'jog', direction, state: 'stop', ip: bridgeIp })
    }).catch(console.error);
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/indi/latest-image?ip=${bridgeIp}&t=${imageTime}`} style={{ width:'100%', height:'100%', objectFit:'contain' }} alt="Live" />
          <Box position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" w="20px" h="20px" border="1px solid rgba(0,240,255,0.5)" borderRadius="full" />
        </Box>
      )}

      {step.isWaitingUser && step.step !== 'complete' && (
        <VStack bg="whiteAlpha.100" p={2} borderRadius="md" gap={2}>
          <Button size="xs" onMouseDown={() => jogMount('up')} onMouseUp={() => stopMount('up')} onMouseLeave={() => stopMount('up')} onTouchStart={() => jogMount('up')} onTouchEnd={() => stopMount('up')}><ChevronUp size={14}/></Button>
          <HStack>
            <Button size="xs" onMouseDown={() => jogMount('left')} onMouseUp={() => stopMount('left')} onMouseLeave={() => stopMount('left')} onTouchStart={() => jogMount('left')} onTouchEnd={() => stopMount('left')}><ChevronLeft size={14}/></Button>
            <Box w="10px" />
            <Button size="xs" onMouseDown={() => jogMount('right')} onMouseUp={() => stopMount('right')} onMouseLeave={() => stopMount('right')} onTouchStart={() => jogMount('right')} onTouchEnd={() => stopMount('right')}><ChevronRight size={14}/></Button>
          </HStack>
          <Button size="xs" onMouseDown={() => jogMount('down')} onMouseUp={() => stopMount('down')} onMouseLeave={() => stopMount('down')} onTouchStart={() => jogMount('down')} onTouchEnd={() => stopMount('down')}><ChevronDown size={14}/></Button>
        </VStack>
      )}

      <VStack gap={2}>
        {step.step === 'park' && <Button w="full" size="sm" bg="orange.500" onClick={syncParkPosition}>SYNC PARKING (0°)</Button>}
        {step.step === 'limits-alt-max' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMaxAlt}>VALIDER MAX ALT</Button>}
        {step.step === 'limits-alt-min' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMinAlt}>VALIDER MIN ALT</Button>}
        {step.step === 'limits-az-max' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMaxAz}>VALIDER MAX AZ (E)</Button>}
        {step.step === 'limits-az-min' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={saveMinAz}>VALIDER MIN AZ (W)</Button>}
        {step.step === 'camera-test' && <Button w="full" size="sm" bg="var(--astro-teal)" onClick={testCamera}>ALLER À L&apos;ALIGNEMENT</Button>}
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
