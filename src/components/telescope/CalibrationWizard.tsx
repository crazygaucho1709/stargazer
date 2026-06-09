"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Badge, Flex, Grid, Spinner, Select } from "@chakra-ui/react";
import { 
  Telescope, Target,
  Settings2, Activity, MapPin, CheckCircle2, AlertTriangle, RefreshCw, X
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAstroAction } from "@/hooks/useAstroAction";
import { Tooltip } from "@/components/ui/tooltip";
import { notification } from "@/lib/notificationService";
import { useJog } from "@/hooks/useJog";
import { JogPad } from "./JogPad";
import { useLiveView } from "@/hooks/useLiveView";

interface PhoneSensorData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  connected: boolean;
}

function betaToAlt(beta: number | null): number | null {
  if (beta == null) return null;
  return Math.max(0, Math.min(90, 90 - Math.abs(beta)));
}

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
  const bridgeIp = config.astroberryUrl.includes('http')
    ? new URL(config.astroberryUrl).hostname
    : config.astroberryUrl.split(':')[0];

  const [step, setStep] = useState<StepStatus>({
    step: 'idle',
    isWaitingUser: false,
    message: '',
    instruction: ''
  });

  const [videoActive, setVideoActive] = useState(false);
  const [selectedStar, setSelectedStar] = useState(BRIGHT_STARS[0]);
  const [imageTime, setImageTime] = useState(Date.now());
  const [starAltAz, setStarAltAz] = useState<{alt: number, az: number} | null>(null);

  const { execute: performAction, isPending, error: actionError } = useAstroAction();
  const jog = useJog();
  const liveView = useLiveView();
  
  const [phoneSensor, setPhoneSensor] = useState<PhoneSensorData>({
    alpha: null, beta: null, gamma: null,
    lat: null, lon: null, accuracy_m: null,
    connected: false
  });

  // WebSocket for phone sensor data HUD
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timerId: NodeJS.Timeout | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      const host = window.location.hostname;
      const isHttps = window.location.protocol === "https:";
      const wsUrl = isHttps
        ? `wss://${host}:${window.location.port}/ws/phone-sensor`
        : `ws://${host}:5005/ws/phone-sensor`;

      ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const d = JSON.parse(evt.data);
          setPhoneSensor({
            alpha: d.alpha ?? null,
            beta: d.beta ?? null,
            gamma: d.gamma ?? null,
            lat: d.lat ?? null,
            lon: d.lon ?? null,
            accuracy_m: d.accuracy_m ?? null,
            connected: !!d.connected,
          });
        } catch (_) {}
      };

      ws.onopen = () => {
        setPhoneSensor(prev => ({ ...prev, connected: true }));
      };

      ws.onclose = () => {
        setPhoneSensor(prev => ({ ...prev, connected: false }));
        if (active) {
          timerId = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
      if (ws) ws.close();
    };
  }, []);


  // Step Progress Calculation
  const getStepProgress = () => {
    const steps: CalibrationStep[] = [
      'connection', 'init-mount', 'park', 'limits-alt-max', 
      'limits-alt-min', 'limits-az-max', 'limits-az-min', 
      'camera-test', 'alignment', 'complete'
    ];
    const idx = steps.indexOf(step.step);
    return idx === -1 ? 0 : ((idx + 1) / steps.length) * 100;
  };

  useEffect(() => {
    if (step.step !== 'alignment') return;
    const updatePos = async () => {
      try {
        const res = await fetch(`/api/indi?endpoint=coords&ra=${selectedStar.ra}&dec=${selectedStar.dec}`);
        const data = await res.json();
        if (data.success && data.alt !== undefined && data.az !== undefined) {
          setStarAltAz({ alt: data.alt, az: data.az });
        }
      } catch (e) {}
    };
    updatePos();
    const interval = setInterval(updatePos, 10000);
    return () => clearInterval(interval);
  }, [selectedStar, step.step]);

  useEffect(() => {
    if (step.step !== 'idle' && step.step !== 'complete') {
      setVideoActive(true);
      liveView.start();
    } else {
      setVideoActive(false);
      liveView.stop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.step]);

  useEffect(() => {
    if (!videoActive) return;
    const interval = setInterval(() => {
      setImageTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [videoActive]);

  const startCalibration = async () => {
    await performAction(async () => {
        setStep({
            step: 'connection',
            isWaitingUser: false,
            message: language === 'fr' ? 'Vérification connexion...' : 'Checking connection...',
            instruction: ''
        });

        const res = await fetch('/api/indi/health-full');
        const ping = await res.json();
        if (!ping) {
            throw new Error(language === 'fr' ? 'Connexion échouée.' : 'Connection failed.');
        }

        setStep({
            step: 'init-mount',
            isWaitingUser: false,
            message: language === 'fr' ? 'Initialisation NexStar...' : 'Initializing NexStar...',
            instruction: language === 'fr' ? 'Écrasement raquette : Envoi Heure (UTC), GPS et Limites...' : 'Overriding Hand Controller: Pushing Time, GPS & Limits...'
        });

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

        await new Promise(r => setTimeout(r, 1500));

        const isSouthernHemisphere = parseFloat(config.latitude) < 0;
        setStep({
            step: 'park',
            isWaitingUser: true,
            message: language === 'fr' ? 'Mise en station' : 'Parking',
            instruction: language === 'fr' 
                ? `Garez la monture: tube horizontal, pointé vers le ${isSouthernHemisphere ? 'Sud' : 'Nord'}.`
                : `Park the mount: tube horizontal, pointing ${isSouthernHemisphere ? 'South' : 'North'}.`
        });
    }, "CALIBRATION WIZARD START");
  };

  const syncParkPosition = async () => {
    await performAction(async () => {
        const isSouthernHemisphere = parseFloat(config.latitude) < 0;
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
    }, "SYNC PARK POSITION");
  };

  // Fetch live altitude from mount, fall back to store value
  const getCurrentAlt = async (): Promise<number> => {
    try {
      const res = await fetch('/api/mount/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.alt === 'number') return data.alt;
      }
    } catch {}
    return useStargazerStore.getState().alt;
  };

  // Fetch live azimuth from mount, fall back to store value
  const getCurrentAz = async (): Promise<number> => {
    try {
      const res = await fetch('/api/mount/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.az === 'number') return data.az;
      }
    } catch {}
    return useStargazerStore.getState().az;
  };

  const saveMaxAlt = async () => {
    const currentAlt = await getCurrentAlt();
    setMountLimits({ ...mountLimits, maxAlt: currentAlt });
    setStep({
      step: 'limits-alt-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Altitude Min' : 'Min Altitude',
      instruction: language === 'fr' ? 'Descendez au minimum.' : 'Lower to minimum.'
    });
  };

  const saveMinAlt = async () => {
    const currentAlt = await getCurrentAlt();
    setMountLimits({ ...mountLimits, minAlt: currentAlt });
    setStep({
      step: 'limits-az-max',
      isWaitingUser: true,
      message: language === 'fr' ? 'Azimut Max' : 'Max Azimuth',
      instruction: language === 'fr' ? 'Tournez vers l\'Est.' : 'Rotate East.'
    });
  };

  const saveMaxAz = async () => {
    const currentAz = await getCurrentAz();
    setMountLimits({ ...mountLimits, maxAz: currentAz });
    setStep({
      step: 'limits-az-min',
      isWaitingUser: true,
      message: language === 'fr' ? 'Azimut Min' : 'Min Azimuth',
      instruction: language === 'fr' ? 'Tournez vers l\'Ouest.' : 'Rotate West.'
    });
  };

  const saveMinAz = async () => {
    const currentAz = await getCurrentAz();
    const finalLimits = { ...mountLimits, minAz: currentAz };
    setMountLimits(finalLimits);
    
    // Persist limits to backend config.json
    fetch('/api/indi/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mountLimits: finalLimits })
    }).catch(console.error);

    setStep({
      step: 'camera-test',
      isWaitingUser: true,
      message: language === 'fr' ? 'Test caméra' : 'Camera test',
      instruction: 'Testez la capture.'
    });
  };

  const startStarGoto = async () => {
    await performAction(async () => {
        setSlewing(true);
        await fetch('/api/indi/mount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'slew', device: config.driverInstance, ra: selectedStar.ra, dec: selectedStar.dec, ip: bridgeIp })
        });
        setSlewing(false);
    }, "STAR GOTO");
  };

  const syncStar = async () => {
    await performAction(async () => {
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
    }, "SYNC STAR");
  };

  const reset = () => {
    setStep({ step: 'idle', isWaitingUser: false, message: '', instruction: '' });
  };
  

  if (step.step === 'idle') {
    return (
      <VStack gap={4} w="full">
        <Box 
            p={6} 
            w="full" 
            className="astro-panel" 
            border="1px solid rgba(0, 255, 209, 0.2)"
            textAlign="center"
        >
            <Icon as={Settings2} boxSize={8} color="var(--astro-teal)" mb={4} className="ping-slow" />
            <Text fontSize="14px" fontWeight="bold" letterSpacing="0.2em" color="white" mb={2}>
                {language === 'fr' ? 'CALIBRATION SYSTÈME' : 'SYSTEM CALIBRATION'}
            </Text>
            <Text fontSize="11px" color="whiteAlpha.600" mb={6}>
                {language === 'fr' 
                  ? 'Initialisez votre observatoire: connexion, limites et alignement céleste.'
                  : 'Initialize your observatory: connection, limits, and celestial alignment.'}
            </Text>
            <Button 
                w="full" 
                bg="var(--astro-teal)" 
                color="black" 
                _hover={{ bg: "white", transform: "scale(1.02)" }}
                transition="all 0.3s"
                onClick={startCalibration}
            >
                {language === 'fr' ? 'LANCER LE WIZARD' : 'LAUNCH WIZARD'}
            </Button>
        </Box>
      </VStack>
    );
  }

  return (
    <VStack align="stretch" gap={4} w="full" className="astro-panel" p={4} border="1px solid rgba(0, 255, 209, 0.1)">
      {/* Header & Progress */}
      <VStack align="stretch" gap={2}>
        <HStack justify="space-between">
            <HStack gap={2}>
                <Icon as={Activity} boxSize={4} color="var(--astro-teal)" className="scanning" />
                <Text fontSize="10px" fontWeight="bold" letterSpacing="0.1em" color="var(--astro-teal)">
                    {step.step.toUpperCase().replace('-', ' ')}
                </Text>
            </HStack>
            <Text fontSize="10px" color="whiteAlpha.500">
                {Math.round(getStepProgress())}%
            </Text>
        </HStack>
        <Box w="full" h="2px" bg="rgba(255,255,255,0.05)" borderRadius="full" overflow="hidden">
            <Box 
                h="full" 
                bg="var(--astro-teal)" 
                transition="width 0.5s ease-out"
                style={{ width: `${getStepProgress()}%` }}
                boxShadow="0 0 10px var(--astro-teal)"
            />
        </Box>
      </VStack>

      {/* Message Area */}
      <Box 
        bg="rgba(0,240,255,0.05)" 
        p={3} 
        borderRadius="4px" 
        borderLeft="2px solid var(--astro-teal)"
        position="relative"
        overflow="hidden"
      >
        <Box 
            position="absolute" 
            top="0" 
            left="0" 
            w="full" 
            h="full" 
            className="scanline" 
            opacity={0.1}
            pointerEvents="none"
        />
        <Text fontSize="12px" fontWeight="bold" color="white" mb={1}>{step.message}</Text>
        <Text fontSize="10px" color="whiteAlpha.700" lineHeight="1.4">{step.instruction}</Text>
      </Box>

      {/* Live View HUD */}
      {videoActive && (
        <Box 
            bg="black" 
            borderRadius="4px" 
            border="1px solid rgba(0, 255, 209, 0.3)" 
            h="180px" 
            position="relative"
            overflow="hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={`/api/indi/latest-image?ip=${bridgeIp}&t=${imageTime}`} 
            style={{ width:'100%', height:'100%', objectFit:'contain' }} 
            alt="Live" 
          />
          
          {/* HUD Overlays */}
          <Box position="absolute" top="0" left="0" w="full" h="full" pointerEvents="none">
              {/* Reticle */}
              <Box position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" w="40px" h="40px">
                  <Box position="absolute" top="0" left="50%" transform="translateX(-50%)" w="1px" h="10px" bg="var(--astro-teal)" />
                  <Box position="absolute" bottom="0" left="50%" transform="translateX(-50%)" w="1px" h="10px" bg="var(--astro-teal)" />
                  <Box position="absolute" left="0" top="50%" transform="translateY(-50%)" w="10px" h="1px" bg="var(--astro-teal)" />
                  <Box position="absolute" right="0" top="50%" transform="translateY(-50%)" w="10px" h="1px" bg="var(--astro-teal)" />
                  <Box position="absolute" top="50%" left="50%" transform="translate(-50%,-50%)" w="20px" h="20px" border="1px solid rgba(0, 255, 209, 0.3)" borderRadius="full" />
              </Box>
              
              {/* Corner Accents */}
              <Box position="absolute" top="10px" left="10px" w="10px" h="10px" borderTop="1px solid var(--astro-teal)" borderLeft="1px solid var(--astro-teal)" />
              <Box position="absolute" top="10px" right="10px" w="10px" h="10px" borderTop="1px solid var(--astro-teal)" borderRight="1px solid var(--astro-teal)" />
              <Box position="absolute" bottom="10px" left="10px" w="10px" h="10px" borderBottom="1px solid var(--astro-teal)" borderLeft="1px solid var(--astro-teal)" />
              <Box position="absolute" bottom="10px" right="10px" w="10px" h="10px" borderBottom="1px solid var(--astro-teal)" borderRight="1px solid var(--astro-teal)" />
          </Box>
          
          <Badge position="absolute" bottom={2} right={2} variant="solid" bg="rgba(0,0,0,0.6)" color="var(--astro-teal)" fontSize="8px">
              LIVE_FEED_STABLE
          </Badge>
        </Box>
      )}

      {/* Phone Sensor HUD */}
      {videoActive && (
        <Box 
          p={3.5} 
          bg="rgba(10, 25, 50, 0.4)" 
          border="1px solid rgba(0, 180, 255, 0.25)" 
          borderRadius="8px"
        >
          <HStack justify="space-between" mb={2}>
            <HStack gap={1.5}>
              <Icon as={Telescope} boxSize={3.5} color="#00b4ff" />
              <Text fontSize="9px" fontWeight="bold" color="whiteAlpha.800" letterSpacing="0.08em">
                {language === 'fr' ? "CAPTEURS IPHONE EMBARQUÉ" : "EMBEDDED IPHONE SENSORS"}
              </Text>
            </HStack>
            <Badge variant="solid" bg={phoneSensor.connected ? "green.700" : "red.700"} color="white" fontSize="8px">
              {phoneSensor.connected ? "LIVE" : "DÉCONNECTÉ"}
            </Badge>
          </HStack>

          <Grid templateColumns="repeat(3, 1fr)" gap={2}>
            <VStack bg="rgba(0,0,0,0.3)" p={2} borderRadius="4px" align="center" gap={0.5}>
              <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.05em">
                {language === 'fr' ? "AZIMUT (CAP)" : "AZIMUTH"}
              </Text>
              <Text fontSize="13px" fontWeight="bold" color="#00ffb4" fontFamily="monospace">
                {phoneSensor.alpha != null ? `${phoneSensor.alpha.toFixed(1)}°` : "—"}
              </Text>
            </VStack>
            
            <VStack bg="rgba(0,0,0,0.3)" p={2} borderRadius="4px" align="center" gap={0.5}>
              <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.05em">
                {language === 'fr' ? "ALTITUDE (TANGAGE)" : "ALTITUDE"}
              </Text>
              <Text fontSize="13px" fontWeight="bold" color="#ffd700" fontFamily="monospace">
                {phoneSensor.beta != null ? `${betaToAlt(phoneSensor.beta)?.toFixed(1)}°` : "—"}
              </Text>
            </VStack>

            <VStack bg="rgba(0,0,0,0.3)" p={2} borderRadius="4px" align="center" gap={0.5}>
              <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.05em">
                {language === 'fr' ? "ROULIS" : "ROLL"}
              </Text>
              <Text fontSize="13px" fontWeight="bold" color="#aaaaff" fontFamily="monospace">
                {phoneSensor.gamma != null ? `${phoneSensor.gamma.toFixed(1)}°` : "—"}
              </Text>
            </VStack>
          </Grid>

          {(phoneSensor.lat != null && phoneSensor.lon != null) && (
            <HStack justify="space-between" mt={2} px={1} fontSize="8px" color="whiteAlpha.500">
              <Text>GPS: {phoneSensor.lat.toFixed(5)}, {phoneSensor.lon.toFixed(5)}</Text>
              <Text>ACCURACY: ±{phoneSensor.accuracy_m?.toFixed(0)}m</Text>
            </HStack>
          )}
        </Box>
      )}

      {/* Manual Controls - HUD Style */}
      {step.isWaitingUser && step.step !== 'complete' && (
        <VStack bg="rgba(255,255,255,0.02)" p={4} borderRadius="4px" border="1px solid rgba(255,255,255,0.05)" gap={3}>
          <Text fontSize="10px" fontWeight="bold" letterSpacing="0.1em" color="whiteAlpha.400">MANUAL JOG CONTROL</Text>
          <JogPad jog={jog} size="md" />
        </VStack>
      )}

      {/* Action Buttons */}
      <VStack gap={3}>
        {step.step === 'park' && (
            <Button w="full" size="md" bg="var(--astro-gold)" color="black" onClick={syncParkPosition} disabled={isPending}>
                {isPending ? <Spinner size="sm" mr={2} /> : null}
                CONFIRMER POSITION REPOS (0°, 0°)
            </Button>
        )}
        
        {['limits-alt-max', 'limits-alt-min', 'limits-az-max', 'limits-az-min'].includes(step.step) && (
            <Button w="full" size="md" bg="var(--astro-teal)" color="black" onClick={() => {
                if (step.step === 'limits-alt-max') saveMaxAlt();
                else if (step.step === 'limits-alt-min') saveMinAlt();
                else if (step.step === 'limits-az-max') saveMaxAz();
                else if (step.step === 'limits-az-min') saveMinAz();
            }}>
                VALIDER POSITION ACTUELLE
            </Button>
        )}

        {step.step === 'camera-test' && (
            <Button w="full" size="md" bg="var(--astro-teal)" color="black" onClick={() => setStep({
                step: 'alignment',
                isWaitingUser: true,
                message: language === 'fr' ? 'Alignement Stellaire' : 'Stellar Alignment',
                instruction: language === 'fr' ? 'Choisissez une étoile brillante et centrez-la.' : 'Pick a bright star and center it.'
            })}>
                PASSER À L&apos;ALIGNEMENT
            </Button>
        )}

        {step.step === 'alignment' && (
          <VStack w="full" gap={3} p={3} bg="rgba(0,0,0,0.2)" borderRadius="4px">
            <Box as="select" w="full" bg="black" color="var(--astro-teal)" fontSize="xs" p={2} border="1px solid rgba(0, 255, 209, 0.2)" borderRadius="4px" onChange={(e:any) => setSelectedStar(BRIGHT_STARS.find(s=>s.name===e.target.value)||BRIGHT_STARS[0])}>
              {BRIGHT_STARS.map(s => <option key={s.name} value={s.name}>{s.name.toUpperCase()}</option>)}
            </Box>
            
            {starAltAz ? (
                <HStack w="full" justify="space-between" px={1}>
                    <Text fontSize="10px" color="whiteAlpha.600">TARGET POSITION:</Text>
                    <Text fontSize="10px" fontWeight="bold" color="var(--astro-gold)">
                        ALT {starAltAz.alt.toFixed(1)}° / AZ {starAltAz.az.toFixed(0)}°
                    </Text>
                </HStack>
            ) : selectedStar && (
                <Text fontSize="10px" color="orange.300">
                    ⚠ {language === 'fr' ? 'Alt/Az non calculable — backend hors ligne ou étoile sous l\'horizon' : 'Cannot compute Alt/Az — backend offline or star below horizon'}
                </Text>
            )}
            
            <HStack w="full" gap={2}>
                <Button flex={1} size="sm" variant="outline" borderColor="var(--astro-gold)" color="var(--astro-gold)" onClick={startStarGoto} disabled={isPending}>
                    {isPending ? <Spinner size="sm" mr={2} /> : null}
                    GOTO
                </Button>
                <Button flex={1} size="sm" bg="green.600" color="white" onClick={syncStar} disabled={isPending}>
                    {isPending ? <Spinner size="sm" mr={2} /> : null}
                    SYNC
                </Button>
            </HStack>
          </VStack>
        )}

        {step.step === 'complete' && (
            <VStack w="full" gap={4}>
                <Icon as={CheckCircle2} boxSize={10} color="green.400" />
                <Text fontSize="14px" fontWeight="bold" color="white">CALIBRATION RÉUSSIE</Text>
                <Button w="full" size="md" bg="green.600" color="white" onClick={reset}>
                    FERMER LE WIZARD
                </Button>
            </VStack>
        )}

        {actionError && (
            <HStack bg="red.500/10" p={2} borderRadius="4px" border="1px solid red.500/30" w="full">
                <Icon as={AlertTriangle} boxSize={3} color="red.400" />
                <Text fontSize="9px" color="red.400">{actionError}</Text>
            </HStack>
        )}

        <Button size="xs" variant="ghost" color="whiteAlpha.400" _hover={{ color: "red.400" }} onClick={reset}>
            <X size={12} style={{ marginRight: '4px' }} />
            {language === 'fr' ? 'ANNULER' : 'CANCEL'}
        </Button>
      </VStack>
    </VStack>
  );
};
