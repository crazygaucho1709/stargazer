"use client";

/**
 * CaptureProgressPanel — UI séquence capture + stacking.
 * Logique métier déléguée à useCapture.
 */

import { useState, useEffect, useRef } from "react";
import {
  Box, VStack, HStack, Text, Button, Badge, Icon, Spinner, Grid
} from "@chakra-ui/react";
import {
  Camera, Layers, CheckCircle2, AlertTriangle, Square,
  Play, Clock, ChevronDown, ChevronUp
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useCapture } from "@/hooks/useCapture";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

const LOG_COLORS: Record<string, string> = {
  info:    "rgba(255,255,255,0.6)",
  success: "#68D391",
  error:   "#FC8181",
  warn:    "#F6AD55",
};

function ProgressBar({ value, color = "var(--astro-teal)" }: { value: number; color?: string }) {
  return (
    <Box w="full" h="4px" bg="rgba(255,255,255,0.06)" borderRadius="full" overflow="hidden">
      <Box
        h="full" borderRadius="full" bg={color}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, transition: "width 0.6s ease-out" }}
      />
    </Box>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const map: Record<string, { label: string; palette: string }> = {
    idle:      { label: "En attente", palette: "gray" },
    capturing: { label: "Capture",    palette: "blue" },
    stacking:  { label: "Stacking",   palette: "purple" },
    complete:  { label: "Terminé",    palette: "green" },
    error:     { label: "Erreur",     palette: "red" },
  };
  const { label, palette } = map[phase] ?? map["idle"];
  return <Badge colorPalette={palette} size="sm">{label}</Badge>;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CaptureProgressPanelProps {
  onClose?: () => void;
}

export const CaptureProgressPanel = ({ onClose }: CaptureProgressPanelProps) => {
  const { detectedCcd } = useStargazerStore();
  const capture = useCapture();

  const [exposure, setExposure] = useState(30);
  const [count, setCount] = useState(20);
  const [gain, setGain] = useState(400);
  const [showLog, setShowLog] = useState(false);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [capture.state.log, showLog]);

  const { state } = capture;
  const isRunning = state.running;
  const isDone    = state.phase === "complete";
  const isError   = state.phase === "error";
  const frameProgress = state.total_frames > 0
    ? (state.current_frame / state.total_frames) * 100 : 0;
  const progressColor = isDone ? "#68D391" : isError ? "#FC8181" : "var(--astro-teal)";

  return (
    <Box
      bg="rgba(2, 8, 23, 0.95)" border="1px solid" borderColor="whiteAlpha.200"
      borderRadius="xl" p={4} backdropFilter="blur(12px)" w="full"
    >
      {/* Header */}
      <HStack justify="space-between" mb={3}>
        <HStack gap={2}>
          <Icon as={Camera} color="blue.300" boxSize={4} />
          <Text fontSize="sm" fontWeight="bold" color="white">Séquence de capture</Text>
        </HStack>
        <HStack gap={2}>
          <PhaseBadge phase={state.phase} />
          {onClose && (
            <Button size="xs" variant="ghost" color="whiteAlpha.400" onClick={onClose}>✕</Button>
          )}
        </HStack>
      </HStack>

      {/* Params (only when idle) */}
      {!isRunning && state.phase === "idle" && (
        <>
          <Grid templateColumns="repeat(3, 1fr)" gap={2} mb={3}>
            <VStack gap={0.5} align="start">
              <Text fontSize="9px" color="whiteAlpha.500" textTransform="uppercase" letterSpacing="wider">Exposition</Text>
              <HStack gap={1}>
                <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setExposure(Math.max(1, exposure - 5))}>−</Button>
                <Text fontSize="sm" color="white" fontFamily="mono" minW="40px" textAlign="center">{exposure}s</Text>
                <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setExposure(Math.min(300, exposure + 5))}>+</Button>
              </HStack>
            </VStack>
            <VStack gap={0.5} align="start">
              <Text fontSize="9px" color="whiteAlpha.500" textTransform="uppercase" letterSpacing="wider">Frames</Text>
              <HStack gap={1}>
                <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setCount(Math.max(1, count - 5))}>−</Button>
                <Text fontSize="sm" color="white" fontFamily="mono" minW="30px" textAlign="center">{count}</Text>
                <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setCount(Math.min(200, count + 5))}>+</Button>
              </HStack>
            </VStack>
            <VStack gap={0.5} align="start">
              <Text fontSize="9px" color="whiteAlpha.500" textTransform="uppercase" letterSpacing="wider">Gain ISO</Text>
              <HStack gap={1}>
                <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setGain(Math.max(100, gain - 100))}>−</Button>
                <Text fontSize="sm" color="white" fontFamily="mono" minW="40px" textAlign="center">{gain}</Text>
                <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setGain(Math.min(6400, gain + 100))}>+</Button>
              </HStack>
            </VStack>
          </Grid>

          <Text fontSize="10px" color="whiteAlpha.400" mb={3}>
            Durée estimée: {formatDuration(exposure * count)} · {detectedCcd || "Canon DSLR"}
          </Text>
        </>
      )}

      {/* Progress section */}
      {(isRunning || isDone || isError) && (
        <VStack gap={3} align="stretch" mb={3}>
          <VStack gap={1} align="stretch">
            <HStack justify="space-between">
              <HStack gap={1}>
                {isRunning && <Spinner size="xs" color="blue.300" />}
                <Icon as={Camera} boxSize={3} color="blue.300" />
                <Text fontSize="xs" color="whiteAlpha.700">
                  Frame {state.current_frame}/{state.total_frames}
                </Text>
              </HStack>
              <HStack gap={2}>
                <HStack gap={1}>
                  <Icon as={Clock} boxSize={2.5} color="whiteAlpha.400" />
                  <Text fontSize="10px" color="whiteAlpha.500" fontFamily="mono">
                    {formatDuration(state.elapsed_s)}
                  </Text>
                </HStack>
                {state.eta_s > 0 && (
                  <Text fontSize="10px" color="whiteAlpha.400" fontFamily="mono">
                    ETA {formatDuration(state.eta_s)}
                  </Text>
                )}
              </HStack>
            </HStack>
            <ProgressBar value={frameProgress} color={progressColor} />
          </VStack>

          {state.stack_count > 0 && (
            <HStack gap={2}>
              <Icon as={Layers} boxSize={3} color="purple.300" />
              <Text fontSize="xs" color="whiteAlpha.600">
                Stack: <Text as="span" color="purple.200">{state.stack_count} frames</Text>
              </Text>
              {state.hfr && (
                <Text fontSize="xs" color="whiteAlpha.500">
                  HFR: <Text as="span" color="teal.200">{state.hfr.toFixed(2)}</Text>
                </Text>
              )}
            </HStack>
          )}

          {isError && state.error && (
            <HStack bg="red.900" borderRadius="md" p={2} gap={2} border="1px solid" borderColor="red.600">
              <Icon as={AlertTriangle} boxSize={3} color="red.300" />
              <Text fontSize="xs" color="red.200">{state.error}</Text>
            </HStack>
          )}

          {isDone && (
            <HStack gap={1} justify="center">
              <Icon as={CheckCircle2} boxSize={3} color="green.300" />
              <Text fontSize="xs" color="green.200">Séquence terminée — {state.stack_count} frames</Text>
            </HStack>
          )}
        </VStack>
      )}

      {/* Thumbnail + metrics */}
      {state.last_thumbnail && (
        <HStack gap={3} mb={3}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.last_thumbnail} alt="Stack preview"
            style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <VStack align="start" gap={0.5}>
            <Text fontSize="9px" color="whiteAlpha.500" textTransform="uppercase" letterSpacing="wider">Dernier stack</Text>
            {state.hfr && (
              <Text fontSize="xs" color="whiteAlpha.700">HFR: <Text as="span" color="teal.200">{state.hfr.toFixed(2)}</Text></Text>
            )}
            {state.snr && (
              <Text fontSize="xs" color="whiteAlpha.700">SNR: <Text as="span" color="yellow.200">{state.snr.toFixed(1)}</Text></Text>
            )}
            <Text fontSize="9px" color="whiteAlpha.400">{state.stack_count} frames empilées</Text>
          </VStack>
        </HStack>
      )}

      {/* Action buttons */}
      <HStack gap={2} mb={capture.startError ? 3 : 0}>
        {!isRunning ? (
          <Button
            flex={1} size="sm" colorPalette="blue"
            loading={capture.starting}
            onClick={() => capture.start({ exposure, count, gain, device: detectedCcd || null })}
          >
            <HStack gap={1}>
              <Icon as={Play} boxSize={3} />
              <Text>{isDone ? "Nouvelle séquence" : "Démarrer"}</Text>
            </HStack>
          </Button>
        ) : (
          <Button flex={1} size="sm" variant="outline" colorPalette="red" onClick={capture.stop}>
            <HStack gap={1}>
              <Icon as={Square} boxSize={3} />
              <Text>Arrêter</Text>
            </HStack>
          </Button>
        )}
      </HStack>

      {capture.startError && (
        <HStack bg="red.900" borderRadius="md" p={2} gap={2} mt={3} border="1px solid" borderColor="red.600">
          <Icon as={AlertTriangle} boxSize={3} color="red.300" />
          <Text fontSize="xs" color="red.200">{capture.startError}</Text>
        </HStack>
      )}

      {/* Log toggle */}
      {state.log.length > 0 && (
        <>
          <Box h="1px" bg="whiteAlpha.100" mt={3} mb={2} />
          <Button variant="ghost" size="xs" color="whiteAlpha.500" w="full" onClick={() => setShowLog(!showLog)}>
            <HStack gap={1} justify="center">
              <Text>Journal ({state.log.length})</Text>
              <Icon as={showLog ? ChevronUp : ChevronDown} boxSize={3} />
            </HStack>
          </Button>

          {showLog && (
            <Box
              mt={2} maxH="120px" overflowY="auto"
              bg="rgba(0,0,0,0.3)" borderRadius="md" p={2}
              fontSize="10px" fontFamily="mono"
            >
              {state.log.map((entry, i) => (
                <HStack key={i} gap={2} align="start" mb={0.5}>
                  <Text color="whiteAlpha.300" flexShrink={0}>{entry.time}</Text>
                  <Text color={LOG_COLORS[entry.type] ?? "rgba(255,255,255,0.6)"}>{entry.msg}</Text>
                </HStack>
              ))}
              <div ref={logEndRef} />
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default CaptureProgressPanel;
