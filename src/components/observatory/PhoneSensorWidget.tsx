"use client";

/**
 * PhoneSensorWidget — affiche l'état du capteur smartphone en temps réel.
 * Pollingtoutes les 2 secondes vers /api/phone-sensor.
 * Lorsque connecté, propose de synchroniser le GPS dans le store Stargazer.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Box, VStack, HStack, Text, Button, Icon, Badge, Spinner
} from "@chakra-ui/react";
import { Smartphone, Compass, Navigation, MapPin, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface PhoneSensorState {
  connected: boolean;
  alpha: number | null;   // azimut compas 0-360°
  beta: number | null;    // pitch
  gamma: number | null;   // roll
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  timestamp: string | null;
}

function betaToAlt(beta: number | null): number | null {
  if (beta == null) return null;
  return Math.max(0, Math.min(90, 90 - Math.abs(beta)));
}

function fmt(v: number | null, dec = 1): string {
  return v == null ? "—" : v.toFixed(dec);
}

function deltaAz(current: number, target: number): number {
  let d = current - target;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function PhoneSensorWidget() {
  const [data, setData] = useState<PhoneSensorState | null>(null);
  const [parkTarget, setParkTarget] = useState<{ az: number; alt: number } | null>(null);
  const { updateConfig, language } = useStargazerStore();

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/phone-sensor", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // backend offline
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, [fetchState]);

  const syncGps = () => {
    if (data?.lat != null && data?.lon != null) {
      updateConfig({
        latitude: data.lat.toFixed(6),
        longitude: data.lon.toFixed(6),
      });
    }
  };

  const alt = betaToAlt(data?.beta ?? null);

  const azDelta = parkTarget != null && data?.alpha != null
    ? deltaAz(data.alpha, parkTarget.az)
    : null;
  const altDelta = parkTarget != null && alt != null
    ? alt - parkTarget.alt
    : null;

  const isConnected = data?.connected === true;

  const sensorUrl = typeof window !== "undefined"
    ? `http://${window.location.hostname}:3001/sensor`
    : "/sensor";

  return (
    <Box
      bg="rgba(255,255,255,0.02)"
      border="1px solid"
      borderColor={isConnected ? "rgba(0,255,180,0.25)" : "rgba(255,255,255,0.08)"}
      borderRadius="xl"
      p={4}
      w="full"
    >
      {/* Header */}
      <HStack justify="space-between" mb={3}>
        <HStack gap={2}>
          <Icon as={Smartphone} boxSize={4} color={isConnected ? "var(--astro-teal)" : "whiteAlpha.400"} />
          <Text fontSize="12px" fontWeight="bold" letterSpacing="0.08em" color="whiteAlpha.900">
            {language === "fr" ? "CAPTEUR SMARTPHONE" : "PHONE SENSOR"}
          </Text>
        </HStack>
        <HStack gap={2}>
          {isConnected ? (
            <Badge colorPalette="green" variant="subtle" fontSize="8px">
              <Icon as={Wifi} boxSize={3} mr={1} />LIVE
            </Badge>
          ) : (
            <Badge colorPalette="gray" variant="subtle" fontSize="8px">
              <Icon as={WifiOff} boxSize={3} mr={1} />
              {language === "fr" ? "DÉCONNECTÉ" : "OFFLINE"}
            </Badge>
          )}
        </HStack>
      </HStack>

      {/* Not connected: show URL */}
      {!isConnected && (
        <VStack align="start" gap={2}>
          <Text fontSize="10px" color="whiteAlpha.500">
            {language === "fr"
              ? "Ouvre cette URL sur ton smartphone fixé sur le tube :"
              : "Open this URL on the phone mounted on the tube:"}
          </Text>
          <Box
            bg="rgba(0,255,180,0.06)"
            border="1px solid rgba(0,255,180,0.2)"
            borderRadius="md"
            px={3} py={2}
            w="full"
          >
            <Text fontSize="11px" color="var(--astro-teal)" fontFamily="mono" wordBreak="break-all">
              {sensorUrl}
            </Text>
          </Box>
          <Text fontSize="9px" color="whiteAlpha.400" fontStyle="italic">
            {language === "fr"
              ? "iOS 13+ requiert HTTPS — Android fonctionne en HTTP local."
              : "iOS 13+ requires HTTPS — Android works over local HTTP."}
          </Text>
        </VStack>
      )}

      {/* Connected: show sensor data */}
      {isConnected && data && (
        <VStack align="stretch" gap={3}>

          {/* Compass + altitude */}
          <HStack gap={2}>
            <Box flex={1} bg="rgba(0,0,0,0.3)" borderRadius="lg" p={3} textAlign="center">
              <HStack justify="center" gap={1} mb={1}>
                <Icon as={Compass} boxSize={3} color="var(--astro-teal)" />
                <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.1em">AZIMUT</Text>
              </HStack>
              <Text fontSize="22px" className="hud-font" color="var(--astro-teal)">{fmt(data.alpha)}°</Text>
            </Box>
            <Box flex={1} bg="rgba(0,0,0,0.3)" borderRadius="lg" p={3} textAlign="center">
              <HStack justify="center" gap={1} mb={1}>
                <Icon as={Navigation} boxSize={3} color="var(--astro-gold)" />
                <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.1em">ALTITUDE TUBE</Text>
              </HStack>
              <Text fontSize="22px" className="hud-font" color="var(--astro-gold)">{fmt(alt)}°</Text>
            </Box>
          </HStack>

          {/* Level indicator */}
          <LevelIndicator beta={data.beta} gamma={data.gamma} />

          {/* GPS */}
          {data.lat != null && (
            <HStack
              bg="rgba(0,0,0,0.3)" borderRadius="lg" p={3}
              justify="space-between"
            >
              <HStack gap={2}>
                <Icon as={MapPin} boxSize={3} color="var(--astro-teal)" />
                <VStack align="start" gap={0}>
                  <Text fontSize="9px" color="whiteAlpha.400" letterSpacing="0.1em">GPS</Text>
                  <Text fontSize="11px" className="hud-font" color="white">
                    {data.lat.toFixed(5)}°, {data.lon?.toFixed(5)}°
                  </Text>
                  {data.accuracy_m != null && (
                    <Text fontSize="9px" color="whiteAlpha.400">±{fmt(data.accuracy_m, 0)} m</Text>
                  )}
                </VStack>
              </HStack>
              <Button size="xs" variant="ghost" color="var(--astro-teal)" onClick={syncGps}
                fontSize="9px" letterSpacing="0.05em">
                SYNC →
              </Button>
            </HStack>
          )}

          {/* Parking guidance */}
          <Box borderTop="1px solid rgba(255,255,255,0.06)" pt={3}>
            <Text fontSize="9px" color="var(--astro-gold)" letterSpacing="0.15em" mb={2}>
              {language === "fr" ? "GUIDAGE PARKING" : "PARKING GUIDANCE"}
            </Text>

            {parkTarget == null ? (
              <Button
                size="sm" w="full"
                bg="rgba(255,215,0,0.1)"
                border="1px solid rgba(255,215,0,0.3)"
                color="var(--astro-gold)"
                fontSize="10px"
                _hover={{ bg: "rgba(255,215,0,0.2)" }}
                onClick={() => setParkTarget({ az: data.alpha ?? 0, alt: alt ?? 0 })}
              >
                📍 {language === "fr" ? "DÉFINIR POSITION ACTUELLE COMME PARKING" : "SET CURRENT AS PARK POSITION"}
              </Button>
            ) : (
              <VStack align="stretch" gap={2}>
                <HStack gap={2}>
                  <GuidanceTile
                    label="AZIMUT"
                    delta={azDelta}
                    leftLabel="← GAUCHE"
                    rightLabel="DROITE →"
                  />
                  <GuidanceTile
                    label="ALTITUDE"
                    delta={altDelta}
                    leftLabel="↓ BAS"
                    rightLabel="HAUT ↑"
                  />
                </HStack>
                <HStack gap={2}>
                  <Button
                    flex={1} size="xs"
                    variant="ghost" color="var(--astro-gold)"
                    fontSize="9px"
                    onClick={() => setParkTarget({ az: data.alpha ?? 0, alt: alt ?? 0 })}
                  >
                    <Icon as={RotateCcw} boxSize={3} mr={1} />
                    {language === "fr" ? "RECALIBRER" : "RECALIBRATE"}
                  </Button>
                  <Button
                    flex={1} size="xs"
                    variant="ghost" color="whiteAlpha.400"
                    fontSize="9px"
                    onClick={() => setParkTarget(null)}
                  >
                    {language === "fr" ? "EFFACER" : "CLEAR"}
                  </Button>
                </HStack>
              </VStack>
            )}
          </Box>

        </VStack>
      )}
    </Box>
  );
}

// ─── Level indicator (compact) ────────────────────────────────────────────────

function LevelIndicator({ beta, gamma }: { beta: number | null; gamma: number | null }) {
  const tilt = beta != null && gamma != null
    ? Math.sqrt(beta * beta + gamma * gamma)
    : null;
  const ok   = tilt != null && tilt < 1.5;
  const warn = tilt != null && tilt >= 1.5 && tilt < 4;
  const bad  = tilt != null && tilt >= 4;
  const color = ok ? "var(--astro-teal)" : warn ? "var(--astro-gold)" : bad ? "#ff6b6b" : "whiteAlpha.300";
  const label = ok ? "✓ NIVEAU" : warn ? "⚠ AJUSTE" : bad ? "✗ PAS NIVEAU" : "—";

  // Bubble position (clamped to ±1 within a small circle)
  const MAX_TILT = 15;
  const R = 24; // outer radius px
  const br = 7;  // bubble radius
  const bx = gamma != null ? Math.max(-1, Math.min(1, gamma / MAX_TILT)) * (R - br - 2) : 0;
  const by = beta  != null ? Math.max(-1, Math.min(1, beta  / MAX_TILT)) * (R - br - 2) : 0;
  const bubbleColor = ok ? "#00ffb4" : warn ? "#ffd700" : bad ? "#ff6b6b" : "#334";

  return (
    <Box bg="rgba(0,0,0,0.3)" borderRadius="lg" p={3}>
      <HStack gap={3} align="center">
        {/* Mini bubble */}
        <Box position="relative" w={`${R * 2}px`} h={`${R * 2}px`} flexShrink={0}>
          <Box
            position="absolute" inset={0} borderRadius="full"
            border="1px solid rgba(255,255,255,0.1)"
            bg="rgba(0,10,20,0.8)"
          />
          {/* crosshair */}
          <Box position="absolute" top="50%" left={0} right={0} h="1px" bg="rgba(255,255,255,0.08)" transform="translateY(-50%)" />
          <Box position="absolute" left="50%" top={0} bottom={0} w="1px" bg="rgba(255,255,255,0.08)" transform="translateX(-50%)" />
          {/* bubble */}
          <Box
            position="absolute"
            w={`${br * 2}px`} h={`${br * 2}px`}
            borderRadius="full"
            bg={bubbleColor}
            opacity={0.85}
            boxShadow={`0 0 6px ${bubbleColor}`}
            top="50%" left="50%"
            transform={`translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))`}
            transition="transform 0.2s ease-out"
          />
        </Box>

        <VStack align="start" gap={0} flex={1}>
          <Text fontSize="9px" color="whiteAlpha.400" letterSpacing="0.12em">NIVEAU TRÉPIED</Text>
          <Text fontSize="12px" fontWeight="bold" color={color}>{label}</Text>
          {tilt != null && (
            <Text fontSize="9px" color="whiteAlpha.400" fontFamily="mono">
              β {beta?.toFixed(1)}° γ {gamma?.toFixed(1)}° · écart {tilt.toFixed(1)}°
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}

// ─── Guidance tile ─────────────────────────────────────────────────────────────

function GuidanceTile({
  label, delta, leftLabel, rightLabel
}: {
  label: string;
  delta: number | null;
  leftLabel: string;
  rightLabel: string;
}) {
  if (delta == null) return null;
  const abs = Math.abs(delta);
  const ok = abs < 1.5;
  const color = ok ? "var(--astro-teal)" : abs < 5 ? "var(--astro-gold)" : "var(--astro-error, #ff6b6b)";
  const arrow = ok ? "✓" : delta < 0 ? leftLabel : rightLabel;

  return (
    <Box flex={1} bg="rgba(0,0,0,0.4)" borderRadius="md" p={3} textAlign="center">
      <Text fontSize="8px" color="whiteAlpha.400" letterSpacing="0.1em" mb={1}>{label}</Text>
      <Text fontSize="13px" color={color} fontWeight="bold" mb={1}>{arrow}</Text>
      <Text fontSize="16px" className="hud-font" color={color}>
        {ok ? "OK" : `${Math.abs(delta).toFixed(1)}°`}
      </Text>
    </Box>
  );
}
