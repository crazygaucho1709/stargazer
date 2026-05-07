"use client";

import { useState, useRef, useCallback } from "react";
import {
  Box, VStack, HStack, Text, Button, Badge, Flex, Spinner, Icon
} from "@chakra-ui/react";
import {
  Crosshair, Play, Square, CheckCircle2, AlertTriangle, 
  RotateCw, Navigation, Camera, Zap, MapPin, Info
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { plateSolve, SolvedPosition } from "@/services/plateSolve";
import { mockApi } from "@/services/mockApi";

// ─── Types ──────────────────────────────────────────────────────────────────

type AlignPhase =
  | 'idle'
  | 'preflight'
  | 'capture-1'
  | 'solve-1'
  | 'jog-1'
  | 'capture-2'
  | 'solve-2'
  | 'jog-2'
  | 'capture-3'
  | 'solve-3'
  | 'triangulate'
  | 'sync'
  | 'complete'
  | 'failed';

interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

// ─── Phase metadata ──────────────────────────────────────────────────────────

const PHASE_LABELS: Record<AlignPhase, { fr: string; en: string }> = {
  idle:        { fr: "En attente", en: "Idle" },
  preflight:   { fr: "Vérification pré-vol", en: "Pre-flight check" },
  'capture-1': { fr: "Capture initiale (1/3)", en: "Initial capture (1/3)" },
  'solve-1':   { fr: "Analyse image #1", en: "Plate solving #1" },
  'jog-1':     { fr: "Rotation Est 15°", en: "Jog East 15°" },
  'capture-2': { fr: "Capture #2", en: "Capture #2" },
  'solve-2':   { fr: "Analyse image #2", en: "Plate solving #2" },
  'jog-2':     { fr: "Rotation Nord 10°", en: "Jog North 10°" },
  'capture-3': { fr: "Capture #3", en: "Capture #3" },
  'solve-3':   { fr: "Analyse image #3", en: "Plate solving #3" },
  triangulate: { fr: "Triangulation de position", en: "Position triangulation" },
  sync:        { fr: "Synchronisation monture", en: "Mount sync" },
  complete:    { fr: "Alignement réussi ✓", en: "Alignment complete ✓" },
  failed:      { fr: "Alignement échoué", en: "Alignment failed" },
};

const PHASE_PROGRESS: Record<AlignPhase, number> = {
  idle: 0, preflight: 5, 'capture-1': 15, 'solve-1': 25,
  'jog-1': 35, 'capture-2': 45, 'solve-2': 55,
  'jog-2': 65, 'capture-3': 75, 'solve-3': 85,
  triangulate: 90, sync: 95, complete: 100, failed: 0
};

// ─── Component ───────────────────────────────────────────────────────────────

export const AutoAlignWizard = () => {
  const { language, config, setPosition } = useStargazerStore();
  const bridgeIp = config.astroberryUrl.includes('http')
    ? new URL(config.astroberryUrl).hostname
    : config.astroberryUrl.split(':')[0];

  const [phase, setPhase] = useState<AlignPhase>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [solvedPositions, setSolvedPositions] = useState<SolvedPosition[]>([]);
  const [finalRA, setFinalRA] = useState<number | null>(null);
  const [finalDEC, setFinalDEC] = useState<number | null>(null);
  const [captureImages, setCaptureImages] = useState<(string | null)[]>([null, null, null]);
  const abortRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const L = (fr: string, en: string) => language === 'fr' ? fr : en;

  const log = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      msg,
      type
    };
    setLogs(prev => [...prev, entry]);
    // Auto-scroll
    setTimeout(() => {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  const abort = () => {
    abortRef.current = true;
    log(L("⛔ Interruption demandée par l'utilisateur.", "⛔ Abort requested by user."), 'warn');
    setPhase('failed');
  };

  const reset = () => {
    abortRef.current = false;
    setPhase('idle');
    setLogs([]);
    setSolvedPositions([]);
    setFinalRA(null);
    setFinalDEC(null);
    setCaptureImages([null, null, null]);
  };

  // ── Jog mount for a fixed duration ──
  const jogMount = async (direction: 'up' | 'down' | 'left' | 'right', ms: number) => {
    await fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'jog', direction, duration: ms / 1000, ip: bridgeIp })
    });
    await new Promise(r => setTimeout(r, ms + 500));
    // Stop motion
    await fetch('/api/indi/mount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'abort', ip: bridgeIp })
    });
  };

  // ── Capture + plate solve helper ──
  const captureAndSolve = async (captureIndex: number): Promise<SolvedPosition | null> => {
    log(L(
      `📷 Déclenchement de la capture (${config.exposureTime}s ISO ${config.isoGain})...`,
      `📷 Triggering capture (${config.exposureTime}s ISO ${config.isoGain})...`
    ));

    const captureResult = await mockApi.capture(parseInt(config.isoGain), config.exposureTime);
    if (!captureResult.success) {
      log(L(`❌ Échec de la capture: ${captureResult.error}`, `❌ Capture failed: ${captureResult.error}`), 'error');
      return null;
    }

    const imageUrl = captureResult.data;
    setCaptureImages(prev => {
      const next = [...prev];
      next[captureIndex] = imageUrl;
      return next;
    });
    log(L("✅ Image reçue. Lancement du plate solve...", "✅ Image received. Starting plate solve..."), 'success');

    // Try plate solving
    const solved = await plateSolve(imageUrl, config.aiKey || undefined);

    if (!solved) {
      log(L(
        "⚠️ Plate solve impossible (aucune méthode n'a abouti). Continuons avec les autres captures.",
        "⚠️ Plate solve failed (all methods exhausted). Continuing with other captures."
      ), 'warn');
      return null;
    }

    const sourceLabel = solved.source === 'local' ? 'solve-field local' :
                        solved.source === 'astrometry_net' ? 'Astrometry.net cloud' : 'IA Vision';
    log(L(
      `🎯 Position résolue via ${sourceLabel}: AR ${solved.ra.toFixed(4)}h / DÉC ${solved.dec.toFixed(4)}°`,
      `🎯 Solved via ${sourceLabel}: RA ${solved.ra.toFixed(4)}h / DEC ${solved.dec.toFixed(4)}°`
    ), 'success');

    return solved;
  };

  // ── Triangulate from 3 positions ──
  const triangulatePosition = (positions: SolvedPosition[]): { ra: number; dec: number } => {
    // Average the solved positions (weighted by confidence: high=3, medium=2, low=1)
    const weights = { high: 3, medium: 2, low: 1 };
    let totalWeight = 0;
    let raSum = 0;
    let decSum = 0;

    for (const pos of positions) {
      const w = weights[pos.confidence];
      raSum += pos.ra * w;
      decSum += pos.dec * w;
      totalWeight += w;
    }

    return {
      ra: raSum / totalWeight,
      dec: decSum / totalWeight
    };
  };

  // ── Format RA decimal hours → hh h mm m ss s ──
  const formatRA = (h: number): string => {
    const hours = Math.floor(h);
    const minutes = Math.floor((h - hours) * 60);
    const seconds = Math.floor(((h - hours) * 60 - minutes) * 60);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  };

  // ── Format DEC decimal degrees → ±DD° MM' SS" ──
  const formatDEC = (d: number): string => {
    const sign = d >= 0 ? '+' : '-';
    const abs = Math.abs(d);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    const sec = Math.floor(((abs - deg) * 60 - min) * 60);
    return `${sign}${String(deg).padStart(2, '0')}° ${String(min).padStart(2, '0')}' ${String(sec).padStart(2, '0')}"`;
  };

  // ── Main routine ──────────────────────────────────────────────────────────
  const runAutoAlign = async () => {
    abortRef.current = false;
    setSolvedPositions([]);
    setLogs([]);
    setCaptureImages([null, null, null]);
    setFinalRA(null);
    setFinalDEC(null);

    // ── Step 1: Pre-flight ──────────────────────────────────────────────────
    setPhase('preflight');
    log(L("🚀 Démarrage de l'AutoAlign AI — Vérification pré-vol...", "🚀 Starting AutoAlign AI — Pre-flight check..."));
    log(L(`📍 Coordonnées observatoire: Lat ${config.latitude}° / Lon ${config.longitude}°`,
          `📍 Observatory: Lat ${config.latitude}° / Lon ${config.longitude}°`));
    log(L(`⏱ Exposition: ${config.exposureTime}s — ISO: ${config.isoGain}`,
          `⏱ Exposure: ${config.exposureTime}s — ISO: ${config.isoGain}`));

    // Check connectivity
    const ping = await mockApi.ping(config.astroberryUrl, config.driverInstance);
    if (!ping.success) {
      log(L(`❌ Hardware non accessible: ${ping.error}`, `❌ Hardware unreachable: ${ping.error}`), 'error');
      setPhase('failed');
      return;
    }
    log(L("✅ Hardware accessible. Monture et caméra en ligne.", "✅ Hardware reachable. Mount and camera online."), 'success');

    if (abortRef.current) return;

    // ── Step 2: Capture #1 ──────────────────────────────────────────────────
    setPhase('capture-1');
    log(L("📡 Capture initiale à la position actuelle...", "📡 Initial capture at current position..."));
    await new Promise(r => setTimeout(r, 500));

    setPhase('solve-1');
    const solved1 = await captureAndSolve(0);
    if (abortRef.current) return;

    const positions: SolvedPosition[] = [];
    if (solved1) positions.push(solved1);

    // ── Step 3: Jog East 15° ────────────────────────────────────────────────
    setPhase('jog-1');
    log(L("↩ Rotation de la monture vers l'Est de 15° (2s)...", "↩ Rotating mount East 15° (2s)..."));
    await jogMount('right', 2000);
    log(L("✅ Rotation terminée.", "✅ Rotation complete."), 'success');
    if (abortRef.current) return;

    // ── Step 4: Capture #2 ──────────────────────────────────────────────────
    setPhase('capture-2');
    log(L("📡 Capture #2 après rotation Est...", "📡 Capture #2 after East rotation..."));
    await new Promise(r => setTimeout(r, 500));

    setPhase('solve-2');
    const solved2 = await captureAndSolve(1);
    if (abortRef.current) return;

    if (solved2) positions.push(solved2);

    // ── Step 5: Jog North 10° ───────────────────────────────────────────────
    setPhase('jog-2');
    log(L("↑ Rotation de la monture vers le Nord de 10° (1.5s)...", "↑ Rotating mount North 10° (1.5s)..."));
    await jogMount('up', 1500);
    log(L("✅ Rotation terminée.", "✅ Rotation complete."), 'success');
    if (abortRef.current) return;

    // ── Step 6: Capture #3 ──────────────────────────────────────────────────
    setPhase('capture-3');
    log(L("📡 Capture #3 après rotation Nord...", "📡 Capture #3 after North rotation..."));
    await new Promise(r => setTimeout(r, 500));

    setPhase('solve-3');
    const solved3 = await captureAndSolve(2);
    if (abortRef.current) return;

    if (solved3) positions.push(solved3);
    setSolvedPositions(positions);

    // ── Step 7: Triangulate ─────────────────────────────────────────────────
    setPhase('triangulate');
    log(L(
      `🧮 Triangulation à partir de ${positions.length} position(s) résolue(s)...`,
      `🧮 Triangulating from ${positions.length} solved position(s)...`
    ));

    if (positions.length === 0) {
      log(L(
        "❌ Aucune position résolue — impossible de continuer. Vérifiez la connexion et la caméra.",
        "❌ No positions solved — cannot continue. Check connection and camera."
      ), 'error');
      setPhase('failed');
      return;
    }

    await new Promise(r => setTimeout(r, 1000));
    const { ra, dec } = triangulatePosition(positions);
    setFinalRA(ra);
    setFinalDEC(dec);

    log(L(
      `🌟 Position calculée: AR = ${formatRA(ra)} / DÉC = ${formatDEC(dec)}`,
      `🌟 Computed position: RA = ${formatRA(ra)} / DEC = ${formatDEC(dec)}`
    ), 'success');

    // ── Step 8: Sync mount ──────────────────────────────────────────────────
    setPhase('sync');
    log(L("🔄 Synchronisation de la monture avec la position calculée...", "🔄 Syncing mount to computed position..."));

    const syncResult = await mockApi.sync(
      formatRA(ra),
      formatDEC(dec),
      config.driverInstance
    );

    if (!syncResult.success) {
      log(L(
        `⚠️ Sync partiellement échoué: ${syncResult.error || 'Erreur inconnue'}. Position enregistrée localement.`,
        `⚠️ Sync partially failed: ${syncResult.error || 'Unknown error'}. Position saved locally.`
      ), 'warn');
    } else {
      log(L("✅ Monture synchronisée avec succès!", "✅ Mount synced successfully!"), 'success');
    }

    // Update UI store
    setPosition(formatRA(ra), formatDEC(dec));

    setPhase('complete');
    log(L(
      "🎉 AutoAlign IA terminé! Le télescope connaît maintenant sa position dans le ciel.",
      "🎉 AutoAlign AI complete! The telescope now knows its position in the sky."
    ), 'success');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const progress = PHASE_PROGRESS[phase];
  const isRunning = !['idle', 'complete', 'failed'].includes(phase);
  const phaseLabel = PHASE_LABELS[phase][language === 'fr' ? 'fr' : 'en'];

  const logColors: Record<LogEntry['type'], string> = {
    info:    'whiteAlpha.600',
    success: 'green.300',
    error:   'red.400',
    warn:    'orange.300'
  };

  return (
    <VStack align="stretch" gap={4} w="full">
      {/* ── Header ── */}
      <HStack justify="space-between">
        <HStack gap={2}>
          <Icon as={Navigation} boxSize={5} color="var(--astro-teal)" />
          <VStack align="start" gap={0}>
            <Text fontSize="13px" fontWeight="bold" letterSpacing="0.15em" color="white">
              {L("AUTO-ALIGN IA", "AUTO-ALIGN AI")}
            </Text>
            <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.05em">
              {L("LOCALISATION AUTONOME PAR PLATE SOLVING", "AUTONOMOUS PLATE-SOLVING LOCALIZATION")}
            </Text>
          </VStack>
        </HStack>
        <Badge
          colorPalette={phase === 'complete' ? 'green' : phase === 'failed' ? 'red' : isRunning ? 'cyan' : 'gray'}
          variant="subtle"
          fontSize="9px"
          letterSpacing="0.05em"
        >
          {phaseLabel.toUpperCase()}
        </Badge>
      </HStack>

      {/* ── Progress Bar ── */}
      <VStack align="stretch" gap={1}>
        <HStack justify="space-between">
          <Text fontSize="10px" color="whiteAlpha.500">
            {isRunning && <Spinner size="xs" mr={1} color="var(--astro-teal)" />}
            {phaseLabel}
          </Text>
          <Text fontSize="10px" fontWeight="bold" color={phase === 'complete' ? 'green.300' : 'whiteAlpha.700'}>
            {progress}%
          </Text>
        </HStack>
        <Box w="full" h="3px" bg="rgba(255,255,255,0.05)" borderRadius="full" overflow="hidden">
          <Box
            h="full"
            bg={phase === 'failed' ? 'red.500' : phase === 'complete' ? 'green.400' : 'var(--astro-teal)'}
            transition="width 0.6s ease-out"
            style={{ width: `${progress}%` }}
            boxShadow={phase === 'complete' ? '0 0 10px #68d391' : '0 0 8px var(--astro-teal)'}
          />
        </Box>
      </VStack>

      {/* ── Capture Thumbnails ── */}
      {(isRunning || phase === 'complete') && (
        <HStack gap={2} justify="center">
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              w="80px"
              h="60px"
              bg="rgba(0,0,0,0.5)"
              borderRadius="4px"
              border="1px solid"
              borderColor={captureImages[i] ? 'var(--astro-teal)' : 'whiteAlpha.100'}
              overflow="hidden"
              position="relative"
              flexShrink={0}
            >
              {captureImages[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={captureImages[i]!}
                  alt={`Capture ${i + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Flex align="center" justify="center" h="full">
                  <Icon as={Camera} boxSize={4} color="whiteAlpha.300" />
                </Flex>
              )}
              <Box
                position="absolute"
                bottom="2px"
                left="50%"
                transform="translateX(-50%)"
              >
                <Text fontSize="8px" color={captureImages[i] ? 'var(--astro-teal)' : 'whiteAlpha.300'}>
                  #{i + 1}
                </Text>
              </Box>
            </Box>
          ))}
        </HStack>
      )}

      {/* ── Log Panel ── */}
      {logs.length > 0 && (
        <Box
          bg="rgba(0,0,0,0.4)"
          borderRadius="6px"
          border="1px solid rgba(255,255,255,0.06)"
          p={3}
          maxH="160px"
          overflowY="auto"
          fontFamily="monospace"
          css={{
            '&::-webkit-scrollbar': { width: '3px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: 'rgba(0,255,209,0.3)', borderRadius: '2px' }
          }}
        >
          <VStack align="stretch" gap={1}>
            {logs.map((entry, i) => (
              <HStack key={i} gap={2} align="start">
                <Text fontSize="9px" color="whiteAlpha.300" flexShrink={0} mt="1px">
                  {entry.time}
                </Text>
                <Text fontSize="9px" color={logColors[entry.type]} lineHeight="1.4">
                  {entry.msg}
                </Text>
              </HStack>
            ))}
            <div ref={logEndRef} />
          </VStack>
        </Box>
      )}

      {/* ── Solved Position Result ── */}
      {phase === 'complete' && finalRA !== null && finalDEC !== null && (
        <Box
          bg="rgba(72, 187, 120, 0.08)"
          border="1px solid rgba(72, 187, 120, 0.3)"
          borderRadius="6px"
          p={3}
        >
          <HStack gap={2} mb={2}>
            <Icon as={MapPin} boxSize={4} color="green.400" />
            <Text fontSize="11px" fontWeight="bold" color="green.300" letterSpacing="0.05em">
              {L("POSITION RÉSOLUE", "SOLVED POSITION")}
            </Text>
          </HStack>
          <HStack gap={4}>
            <VStack align="start" gap={0}>
              <Text fontSize="9px" color="whiteAlpha.500">AR / RA</Text>
              <Text fontSize="12px" fontWeight="bold" color="white" fontFamily="monospace">
                {formatRA(finalRA)}
              </Text>
            </VStack>
            <VStack align="start" gap={0}>
              <Text fontSize="9px" color="whiteAlpha.500">DÉC / DEC</Text>
              <Text fontSize="12px" fontWeight="bold" color="white" fontFamily="monospace">
                {formatDEC(finalDEC)}
              </Text>
            </VStack>
            {solvedPositions.length > 0 && (
              <VStack align="start" gap={0}>
                <Text fontSize="9px" color="whiteAlpha.500">SOURCE</Text>
                <Text fontSize="10px" color="var(--astro-teal)" fontWeight="medium">
                  {solvedPositions[0].source === 'local' ? 'solve-field' :
                   solvedPositions[0].source === 'astrometry_net' ? 'Astrometry.net' : 'IA Vision'}
                </Text>
              </VStack>
            )}
          </HStack>
        </Box>
      )}

      {/* ── Idle Info Box ── */}
      {phase === 'idle' && (
        <Box
          bg="rgba(0,255,209,0.03)"
          border="1px solid rgba(0,255,209,0.12)"
          borderRadius="6px"
          p={3}
        >
          <HStack gap={2} mb={2}>
            <Icon as={Info} boxSize={3} color="var(--astro-teal)" />
            <Text fontSize="10px" fontWeight="bold" color="var(--astro-teal)" letterSpacing="0.05em">
              {L("FONCTIONNEMENT", "HOW IT WORKS")}
            </Text>
          </HStack>
          <VStack align="start" gap={1}>
            {[
              L("1. Capture initiale à la position actuelle", "1. Initial capture at current position"),
              L("2. Rotation Est 15° → Capture #2", "2. East rotation 15° → Capture #2"),
              L("3. Rotation Nord 10° → Capture #3", "3. North rotation 10° → Capture #3"),
              L("4. Plate solving IA des 3 images", "4. AI plate solving of 3 images"),
              L("5. Triangulation & synchronisation monture", "5. Triangulation & mount sync"),
            ].map((step, i) => (
              <Text key={i} fontSize="9px" color="whiteAlpha.500">{step}</Text>
            ))}
          </VStack>
        </Box>
      )}

      {/* ── Control Buttons ── */}
      <HStack gap={3} w="full">
        {phase === 'idle' && (
          <Button
            flex={1}
            bg="var(--astro-teal)"
            color="black"
            fontWeight="bold"
            fontSize="12px"
            letterSpacing="0.1em"
            _hover={{ bg: "white", transform: "scale(1.02)" }}
            transition="all 0.3s"
            onClick={runAutoAlign}
          >
            <Zap size={14} style={{ marginRight: '6px' }} />
            {L("LANCER AUTO-ALIGN", "LAUNCH AUTO-ALIGN")}
          </Button>
        )}

        {isRunning && (
          <Button
            flex={1}
            variant="outline"
            borderColor="red.500"
            color="red.400"
            fontSize="12px"
            letterSpacing="0.1em"
            _hover={{ bg: "red.500/10" }}
            onClick={abort}
          >
            <Square size={14} style={{ marginRight: '6px' }} />
            {L("INTERROMPRE", "ABORT")}
          </Button>
        )}

        {(phase === 'complete' || phase === 'failed') && (
          <Button
            flex={1}
            variant="outline"
            borderColor="whiteAlpha.300"
            color="whiteAlpha.600"
            fontSize="12px"
            letterSpacing="0.1em"
            _hover={{ borderColor: 'whiteAlpha.500', color: 'white' }}
            onClick={reset}
          >
            <RotateCw size={14} style={{ marginRight: '6px' }} />
            {L("RÉINITIALISER", "RESET")}
          </Button>
        )}
      </HStack>

      {/* ── Status Icon ── */}
      {phase === 'complete' && (
        <HStack justify="center" pt={1}>
          <Icon as={CheckCircle2} boxSize={5} color="green.400" />
          <Text fontSize="11px" fontWeight="bold" color="green.300">
            {L("Télescope aligné avec le ciel", "Telescope aligned to the sky")}
          </Text>
        </HStack>
      )}
      {phase === 'failed' && (
        <HStack justify="center" pt={1} bg="red.500/10" p={2} borderRadius="4px">
          <Icon as={AlertTriangle} boxSize={4} color="red.400" />
          <Text fontSize="11px" color="red.400">
            {L("Alignement échoué. Vérifiez la connexion et les logs.", "Alignment failed. Check connection and logs.")}
          </Text>
        </HStack>
      )}
    </VStack>
  );
};
