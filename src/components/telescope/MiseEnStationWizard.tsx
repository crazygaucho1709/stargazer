"use client";

/**
 * MiseEnStationWizard — 3-étape wizard pour initialiser la NexStar 4SE
 *
 * Étape 1 — SETUP PHYSIQUE
 *   Bulle de niveau + azimut depuis le capteur iPhone (ws /ws/phone-sensor)
 *   L'utilisateur ajuste physiquement la monture jusqu'à ce que bulle et cap soient OK.
 *
 * Étape 2 — INIT NEXSTAR
 *   Envoie GPS + heure UTC à INDI, active le suivi sidéral.
 *
 * Étape 3 — ALIGNEMENT STELLAIRE
 *   Capture Canon + plate-solving via plateSolve().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box, VStack, HStack, Text, Button, Badge, Icon, Spinner
} from "@chakra-ui/react";
import {
  CheckCircle2, AlertTriangle, Navigation,
  Wifi, WifiOff, Crosshair, Star,
  ChevronRight, RotateCcw, MapPin, Clock
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { plateSolve } from "@/services/plateSolve";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SensorData {
  beta: number | null;
  gamma: number | null;
  alpha: number | null;
  lat: number | null;
  lon: number | null;
  alt_gps: number | null;
  compassAccuracy: number | null;
}

type Step = 0 | 1 | 2;

const STEP_LABELS = [
  "Mise à niveau & cap",
  "Initialisation NexStar",
  "Alignement stellaire",
];

const NORTH_TOLERANCE = 5;
const LEVEL_TOLERANCE = 3;

// ─── Bubble level ─────────────────────────────────────────────────────────────

function LevelBubble({ beta, gamma }: { beta: number | null; gamma: number | null }) {
  const size = 120;
  const maxOffset = 32;

  let bx = 0, by = 0;
  if (beta !== null && gamma !== null) {
    bx = Math.max(-maxOffset, Math.min(maxOffset, (gamma / 15) * maxOffset));
    by = Math.max(-maxOffset, Math.min(maxOffset, (beta / 15) * maxOffset));
  }

  const isLevel =
    beta !== null && gamma !== null &&
    Math.abs(beta) < LEVEL_TOLERANCE && Math.abs(gamma) < LEVEL_TOLERANCE;

  const color = isLevel ? "#48BB78" : (Math.abs(bx) > 20 || Math.abs(by) > 20 ? "#FC8181" : "#F6AD55");

  return (
    <Box position="relative" w={`${size}px`} h={`${size}px`}>
      <Box
        position="absolute" inset={0} borderRadius="full"
        border="2px solid" borderColor="whiteAlpha.200" bg="rgba(0,0,0,0.4)"
      />
      <Box position="absolute" left="50%" top="50%" transform="translate(-50%,-50%)" w="1px" h={`${size * 0.6}px`} bg="whiteAlpha.200" />
      <Box position="absolute" left="50%" top="50%" transform="translate(-50%,-50%)" w={`${size * 0.6}px`} h="1px" bg="whiteAlpha.200" />
      <Box
        position="absolute"
        w={`${LEVEL_TOLERANCE * 2 * maxOffset / 15}px`}
        h={`${LEVEL_TOLERANCE * 2 * maxOffset / 15}px`}
        borderRadius="full" border="1px solid" borderColor="green.500"
        left="50%" top="50%" transform="translate(-50%,-50%)"
      />
      <Box
        position="absolute" w="24px" h="24px" borderRadius="full"
        bg={color} boxShadow={`0 0 12px ${color}`}
        left={`calc(50% + ${bx}px)`} top={`calc(50% + ${by}px)`}
        transform="translate(-50%,-50%)"
        style={{ transition: "left 0.15s, top 0.15s" }}
      />
    </Box>
  );
}

// ─── Compass ──────────────────────────────────────────────────────────────────

function CompassNeedle({ heading }: { heading: number | null }) {
  const diff = heading !== null ? Math.abs(((heading + 180) % 360) - 180) : 999;
  const isNorth = diff < NORTH_TOLERANCE;
  const color = isNorth ? "#48BB78" : "#F6AD55";

  return (
    <Box position="relative" w="100px" h="100px">
      <Box
        position="absolute" inset={0} borderRadius="full"
        border="2px solid" borderColor="whiteAlpha.200" bg="rgba(0,0,0,0.4)"
      />
      <Text position="absolute" top="4px" left="50%" transform="translateX(-50%)"
        fontSize="xs" color="whiteAlpha.700" fontFamily="mono">N</Text>
      {heading !== null && (
        <Box
          position="absolute" w="full" h="full"
          style={{ transform: `rotate(${heading}deg)`, transition: "transform 0.2s" }}
        >
          <Box
            position="absolute" left="50%" top="50%"
            transform="translateX(-50%)"
            w="3px" h="40px"
            bg={`linear-gradient(to top, ${color}, transparent)`}
            borderRadius="full"
            style={{ marginTop: "-40px" }}
          />
        </Box>
      )}
      <Box
        position="absolute" left="50%" top="50%" transform="translate(-50%,-50%)"
        w="6px" h="6px" borderRadius="full" bg="white"
      />
    </Box>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <HStack gap={2} justify="center">
      {Array.from({ length: total }).map((_, i) => (
        <HStack key={i} gap={2}>
          <Box
            w="28px" h="28px" borderRadius="full"
            display="flex" alignItems="center" justifyContent="center"
            fontSize="xs" fontWeight="bold"
            bg={i < current ? "teal.500" : i === current ? "teal.300" : "whiteAlpha.100"}
            color={i <= current ? "gray.900" : "whiteAlpha.500"}
            border={i === current ? "2px solid" : "none"}
            borderColor="teal.200"
          >
            {i < current ? <CheckCircle2 size={14} /> : i + 1}
          </Box>
          {i < total - 1 && (
            <Box w="24px" h="1px" bg={i < current ? "teal.500" : "whiteAlpha.200"} />
          )}
        </HStack>
      ))}
    </HStack>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MiseEnStationWizardProps {
  onClose?: () => void;
}

export const MiseEnStationWizard = ({ onClose }: MiseEnStationWizardProps) => {
  const { config } = useStargazerStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [sensor, setSensor] = useState<SensorData>({
    beta: null, gamma: null, alpha: null,
    lat: null, lon: null, alt_gps: null, compassAccuracy: null,
  });

  const [step, setStep] = useState<Step>(0);
  const [initResult, setInitResult] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(false);

  const [solveStatus, setSolveStatus] = useState<"idle" | "capturing" | "solving" | "done" | "failed">("idle");
  const [solveMsg, setSolveMsg] = useState("");

  // ─── WebSocket phone sensor ───────────────────────────────────────────────

  const connectWs = useCallback(() => {
    const host = (config.astroberryUrl || "localhost").replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const port = protocol === "wss" ? "8443" : "5005";
    const url = `${protocol}://${host}:${port}/ws/phone-sensor`;

    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWs, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        setSensor({
          beta: d.beta ?? null, gamma: d.gamma ?? null, alpha: d.alpha ?? null,
          lat: d.lat ?? null, lon: d.lon ?? null, alt_gps: d.alt ?? null,
          compassAccuracy: d.compassAccuracy ?? null,
        });
      } catch (_) {}
    };
  }, [config.astroberryUrl]);

  useEffect(() => {
    connectWs();
    return () => { wsRef.current?.close(); };
  }, [connectWs]);

  // ─── Derived state ────────────────────────────────────────────────────────

  const isLevel =
    sensor.beta !== null && sensor.gamma !== null &&
    Math.abs(sensor.beta) < LEVEL_TOLERANCE && Math.abs(sensor.gamma) < LEVEL_TOLERANCE;

  const headingDiff = sensor.alpha !== null ? Math.abs(((sensor.alpha + 180) % 360) - 180) : 999;
  const isNorth = headingDiff < NORTH_TOLERANCE;
  const hasGps = sensor.lat !== null && sensor.lon !== null;
  const step1Ready = isLevel && isNorth && hasGps;

  // ─── Step 2: init NexStar ─────────────────────────────────────────────────

  const handleInitStation = async () => {
    if (!sensor.lat || !sensor.lon) return;
    setInitLoading(true);
    setInitError(null);
    try {
      const res = await fetch("/api/mount/init-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: sensor.lat, lon: sensor.lon, elevation: sensor.alt_gps ?? 0 }),
      });
      const data = await res.json();
      if (data.success) {
        setInitResult(data.message ?? "Initialisé");
        setTimeout(() => setStep(2), 1000);
      } else {
        setInitError(data.error ?? "Erreur inconnue");
      }
    } catch (e: any) {
      setInitError(e.message ?? "Connexion échouée");
    } finally {
      setInitLoading(false);
    }
  };

  // ─── Step 3: plate solve ──────────────────────────────────────────────────

  const handlePlateSolve = async () => {
    if (!sensor.lat || !sensor.lon) return;
    setSolveStatus("capturing");
    setSolveMsg("Capture en cours…");
    try {
      setSolveStatus("solving");
      setSolveMsg("Plate-solving…");
      const solved = await plateSolve({ exposure: 5, lat: sensor.lat, lon: sensor.lon } as any);
      if (solved) {
        setSolveMsg(`Résolu: RA ${(solved as any).ra?.toFixed(3)}h  Dec ${(solved as any).dec?.toFixed(2)}°`);
        setSolveStatus("done");
      } else {
        setSolveMsg("Plate-solve échoué — réessayez");
        setSolveStatus("failed");
      }
    } catch (e: any) {
      setSolveMsg(e.message ?? "Erreur plate-solve");
      setSolveStatus("failed");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Box
      bg="rgba(2, 8, 23, 0.95)" border="1px solid" borderColor="whiteAlpha.200"
      borderRadius="xl" p={5} backdropFilter="blur(12px)" w="full" maxW="440px"
    >
      {/* Header */}
      <HStack justify="space-between" mb={4}>
        <HStack gap={2}>
          <Icon as={Crosshair} color="teal.300" boxSize={4} />
          <Text fontSize="md" fontWeight="bold" color="white">Mise en Station</Text>
        </HStack>
        <HStack gap={2}>
          <Badge colorPalette={wsConnected ? "green" : "red"} size="sm">
            <HStack gap={1}>
              <Icon as={wsConnected ? Wifi : WifiOff} boxSize={2.5} />
              <Text>iPhone</Text>
            </HStack>
          </Badge>
          {onClose && (
            <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={onClose}>✕</Button>
          )}
        </HStack>
      </HStack>

      <StepIndicator current={step} total={3} />
      <Text fontSize="sm" color="teal.200" textAlign="center" mt={2} mb={4} fontWeight="medium">
        {STEP_LABELS[step]}
      </Text>

      <Box h="1px" bg="whiteAlpha.100" mb={4} />

      {/* ── STEP 0 ── */}
      {step === 0 && (
        <VStack gap={4} align="stretch">
          <HStack gap={6} justify="center">
            <VStack gap={1}>
              <Text fontSize="xs" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider">Niveau</Text>
              <LevelBubble beta={sensor.beta} gamma={sensor.gamma} />
              <Badge colorPalette={isLevel ? "green" : "orange"} size="sm">
                {isLevel ? "OK" : sensor.beta !== null ? `β${sensor.beta?.toFixed(1)}° γ${sensor.gamma?.toFixed(1)}°` : "—"}
              </Badge>
            </VStack>
            <VStack gap={1}>
              <Text fontSize="xs" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider">Azimut</Text>
              <CompassNeedle heading={sensor.alpha} />
              <Badge colorPalette={isNorth ? "green" : "orange"} size="sm">
                {isNorth ? "Nord OK" : sensor.alpha !== null ? `${sensor.alpha?.toFixed(1)}°` : "—"}
              </Badge>
            </VStack>
          </HStack>

          <HStack justify="center" gap={2}>
            <Icon as={MapPin} boxSize={3} color={hasGps ? "teal.300" : "whiteAlpha.400"} />
            <Text fontSize="xs" color={hasGps ? "teal.200" : "whiteAlpha.500"}>
              {hasGps ? `GPS: ${sensor.lat?.toFixed(4)}°, ${sensor.lon?.toFixed(4)}°` : "En attente du GPS iPhone…"}
            </Text>
          </HStack>

          {sensor.compassAccuracy !== null && sensor.compassAccuracy > 20 && (
            <HStack bg="orange.900" borderRadius="md" p={2} gap={2} border="1px solid" borderColor="orange.600">
              <Icon as={AlertTriangle} boxSize={3} color="orange.300" />
              <Text fontSize="xs" color="orange.200">
                Précision boussole faible ({sensor.compassAccuracy}°) — éloignez-vous du métal
              </Text>
            </HStack>
          )}

          <Text fontSize="xs" color="whiteAlpha.500" textAlign="center">
            Ajustez la monture jusqu&apos;à ce que la bulle soit centrée et l&apos;aiguille pointe le Nord
          </Text>

          <Button
            colorPalette="teal" disabled={!step1Ready} onClick={() => setStep(1)} size="sm"
          >
            <HStack gap={2}>
              <Text>Physique OK — Suivant</Text>
              <Icon as={ChevronRight} boxSize={3} />
            </HStack>
          </Button>

          {!step1Ready && (
            <Text fontSize="xs" color="whiteAlpha.400" textAlign="center">
              {!hasGps ? "GPS requis" : !isLevel ? "Niveler la monture" : "Orienter vers le Nord"}
            </Text>
          )}
        </VStack>
      )}

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <VStack gap={4} align="stretch">
          <VStack gap={2} align="stretch" bg="whiteAlpha.50" borderRadius="lg" p={3}>
            <HStack gap={2}>
              <Icon as={MapPin} boxSize={3} color="teal.300" />
              <Text fontSize="sm" color="white">
                Lat: <Text as="span" color="teal.200">{sensor.lat?.toFixed(5)}°</Text>
                {" "}Lon: <Text as="span" color="teal.200">{sensor.lon?.toFixed(5)}°</Text>
              </Text>
            </HStack>
            <HStack gap={2}>
              <Icon as={Navigation} boxSize={3} color="teal.300" />
              <Text fontSize="sm" color="white">
                Altitude GPS: <Text as="span" color="teal.200">{sensor.alt_gps?.toFixed(0) ?? "—"} m</Text>
              </Text>
            </HStack>
            <HStack gap={2}>
              <Icon as={Clock} boxSize={3} color="teal.300" />
              <Text fontSize="sm" color="white">
                UTC: <Text as="span" color="teal.200">{new Date().toUTCString().slice(0, 25)}</Text>
              </Text>
            </HStack>
          </VStack>

          <Text fontSize="xs" color="whiteAlpha.500">
            Ces coordonnées et l&apos;heure UTC seront envoyées au contrôleur NexStar via INDI,
            puis le suivi sidéral sera activé.
          </Text>

          {initResult && (
            <HStack bg="green.900" borderRadius="md" p={2} gap={2} border="1px solid" borderColor="green.600">
              <Icon as={CheckCircle2} boxSize={3} color="green.300" />
              <Text fontSize="sm" color="green.200">{initResult}</Text>
            </HStack>
          )}
          {initError && (
            <HStack bg="red.900" borderRadius="md" p={2} gap={2} border="1px solid" borderColor="red.600">
              <Icon as={AlertTriangle} boxSize={3} color="red.300" />
              <Text fontSize="sm" color="red.200">{initError}</Text>
            </HStack>
          )}

          <HStack gap={2}>
            <Button size="sm" variant="ghost" color="whiteAlpha.500" onClick={() => setStep(0)}>← Retour</Button>
            <Button
              flex={1} colorPalette="teal" size="sm"
              loading={initLoading} loadingText="Envoi en cours…"
              onClick={handleInitStation}
            >
              Envoyer GPS + Heure → NexStar
            </Button>
          </HStack>
        </VStack>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <VStack gap={4} align="stretch">
          <VStack gap={2} align="stretch" bg="whiteAlpha.50" borderRadius="lg" p={3}>
            <Text fontSize="xs" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider">
              Alignement stellaire
            </Text>
            <Text fontSize="sm" color="white">
              Le wizard va capturer une image courte (5s) et résoudre sa position par plate-solving
              pour synchroniser précisément les coordonnées du télescope.
            </Text>
          </VStack>

          {solveStatus === "idle" && (
            <Text fontSize="xs" color="whiteAlpha.500">
              Pointez le télescope vers une zone du ciel bien étoilée, loin de la Lune et des nuages.
            </Text>
          )}

          {(solveStatus === "capturing" || solveStatus === "solving") && (
            <HStack gap={2} justify="center">
              <Spinner size="sm" color="teal.300" />
              <Text fontSize="sm" color="teal.200">{solveMsg}</Text>
            </HStack>
          )}

          {solveStatus === "done" && (
            <HStack bg="green.900" borderRadius="md" p={2} gap={2} border="1px solid" borderColor="green.600">
              <Icon as={CheckCircle2} boxSize={3} color="green.300" />
              <Text fontSize="sm" color="green.200" fontFamily="mono">{solveMsg}</Text>
            </HStack>
          )}

          {solveStatus === "failed" && (
            <HStack bg="red.900" borderRadius="md" p={2} gap={2} border="1px solid" borderColor="red.600">
              <Icon as={AlertTriangle} boxSize={3} color="red.300" />
              <Text fontSize="sm" color="red.200">{solveMsg}</Text>
            </HStack>
          )}

          <HStack gap={2}>
            <Button size="sm" variant="ghost" color="whiteAlpha.500" onClick={() => setStep(1)}>← Retour</Button>
            {solveStatus !== "done" ? (
              <Button
                flex={1} colorPalette="purple" size="sm"
                loading={solveStatus === "capturing" || solveStatus === "solving"}
                onClick={handlePlateSolve}
              >
                <HStack gap={1}>
                  <Icon as={Star} boxSize={3} />
                  <Text>Lancer plate-solving</Text>
                </HStack>
              </Button>
            ) : (
              <Button flex={1} colorPalette="teal" size="sm" onClick={onClose}>
                <HStack gap={1}>
                  <Icon as={CheckCircle2} boxSize={3} />
                  <Text>Mise en station terminée</Text>
                </HStack>
              </Button>
            )}
          </HStack>

          {solveStatus === "failed" && (
            <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setSolveStatus("idle")}>
              <HStack gap={1}><Icon as={RotateCcw} boxSize={3} /><Text>Réessayer</Text></HStack>
            </Button>
          )}
        </VStack>
      )}
    </Box>
  );
};

export default MiseEnStationWizard;
