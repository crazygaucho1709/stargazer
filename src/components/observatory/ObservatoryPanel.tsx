"use client";

import { VStack, Text, Heading, Box, HStack, Icon, Grid, Badge, Button, Spinner } from "@chakra-ui/react";
import { Radio, Activity, Terminal, ShieldCheck, AlertTriangle, Power, RefreshCw, Rocket, Cpu, BatteryWarning, Sun, Telescope, Camera } from "lucide-react";
import { useEffect } from "react";
import { InfrastructureStatus } from "./InfrastructureStatus";
import { ActionButtons } from "./ActionButtons";
import { LogStream } from "./LogStream";
import { useStargazerStore } from "@/store/useStargazerStore";
import { OBSERVATORY_LABELS, OBSERVATORY_COLORS, SubsystemHealth, SubsystemId, canObservatoryTransition, ObservatoryEvent } from "@/lib/observatoryMachine";

const SUBSYSTEM_ICONS: Record<SubsystemId, typeof Activity> = {
  mount: Telescope,
  ccd: Camera,
  indi_bridge: Cpu,
  astroberry: Radio,
  weather: Sun,
  power: BatteryWarning,
};

const STATUS_BADGE = {
  nominal: { color: "green", label: "OK" },
  degraded: { color: "yellow", label: "DÉGRADÉ" },
  failed: { color: "red", label: "PANNE" },
  recovering: { color: "cyan", label: "RECOVERY" },
  offline: { color: "whiteAlpha", label: "OFFLINE" },
};

const SubsystemCard = ({ sub }: { sub: SubsystemHealth }) => {
  const IconComp = SUBSYSTEM_ICONS[sub.id];
  const badge = STATUS_BADGE[sub.status];

  return (
    <Box
      p={3} borderRadius="md"
      bg="rgba(0,0,0,0.3)" border="1px solid"
      borderColor={sub.status === "failed" ? "red.800" : sub.status === "recovering" ? "cyan.800" : "rgba(255,255,255,0.08)"}
      opacity={sub.status === "offline" ? 0.65 : 1}
    >
      <HStack justify="space-between" mb={2}>
        <HStack gap={2}>
          <Icon as={IconComp} boxSize={4} color={sub.status === "failed" ? "red.400" : sub.status === "recovering" ? "cyan.400" : sub.status === "offline" ? "whiteAlpha.500" : sub.status === "degraded" ? "yellow.400" : "green.400"} />
          <Text fontSize="11px" fontWeight="bold" color="white">{sub.label}</Text>
        </HStack>
        <Badge colorScheme={badge.color} variant="outline" fontSize="8px">
          {sub.status === "recovering" ? <Spinner size="xs" mr={1} /> : null}
          {badge.label}
        </Badge>
      </HStack>
      {sub.errorCount > 0 && (
        <Text fontSize="9px" color="red.300" fontFamily="mono">
          {sub.errorCount} erreur{sub.errorCount > 1 ? "s" : ""}
          {sub.lastError ? `: ${sub.lastError.slice(0, 60)}` : ""}
        </Text>
      )}
      {sub.status === "recovering" && (
        <HStack gap={1} mt={1}>
          <Icon as={RefreshCw} boxSize={3} color="cyan.400" className="spin" />
          <Text fontSize="9px" color="cyan.400">Tentative {sub.recoveryAttempts + 1}/3</Text>
        </HStack>
      )}
      {sub.status === "failed" && (
        <Text fontSize="9px" color="gray.500" mt={1} fontStyle="italic">
          Actions: {sub.recoveryActions.join(", ")}
        </Text>
      )}
    </Box>
  );
};

function getHealthPct(subsystems: Record<SubsystemId, SubsystemHealth>): number {
  const values = Object.values(subsystems);
  const nom = values.filter((s) => s.status === "nominal").length;
  return Math.round((nom / values.length) * 100);
}

export default function ObservatoryPanel() {
  const language = useStargazerStore((s) => s.language);
  const obsState = useStargazerStore((s) => s.observatoryState);
  const subsystems = useStargazerStore((s) => s.subsystems);
  const updateSubsystem = useStargazerStore((s) => s.updateSubsystem);
  const sendObservatoryEvent = useStargazerStore((s) => s.sendObservatoryEvent);
  const lang = language === "fr" ? "fr" : "en";
  const label = OBSERVATORY_LABELS[obsState][lang];
  const color = OBSERVATORY_COLORS[obsState];
  const healthPct = getHealthPct(subsystems);
  const isOnline = obsState === "ONLINE";
  const isStarting = obsState === "STARTING" || obsState.includes("CONNECTING");
  const isCritical = obsState === "CRITICAL";

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch(`/api/indi?endpoint=health`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const health = data[0];
            if (health.status === "True") {
              const store = useStargazerStore.getState();
              if (health.indi_connected) store.updateSubsystem("indi_bridge", { status: "nominal" });
              if (health.mount_connected) store.updateSubsystem("mount", { status: "nominal" });
              if (health.ccd_connected) store.updateSubsystem("ccd", { status: "nominal" });
              if (store.observatoryState === "OFFLINE") store.sendObservatoryEvent("START");
              const events: { check: boolean; event: ObservatoryEvent }[] = [
                { check: health.indi_connected, event: "INDI_READY" },
                { check: health.mount_connected, event: "MOUNT_CONNECTED" },
                { check: health.ccd_connected, event: "CCD_CONNECTED" },
                { check: !!(health.indi_connected && health.mount_connected && health.ccd_connected), event: "WEATHER_CONNECTED" },
              ];
              for (const { check, event } of events) {
                if (check) {
                  const s = useStargazerStore.getState();
                  if (canObservatoryTransition(s.observatoryState, event)) s.sendObservatoryEvent(event);
                }
              }
            }
          }
        }
      } catch {
        // Backend unreachable
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleRecovery = () => {
    sendObservatoryEvent("START_RECOVERY");
  };

  return (
    <VStack align="stretch" gap={6} h="full" w="full" maxW="1200px" mx="auto" pb={10}>
      {/* Header with Observatory State */}
      <VStack align="start" gap={2}>
        <HStack w="full" justify="space-between">
          <HStack>
            <Icon as={Radio} color={color} boxSize={6} />
            <Heading size="md" color="white" letterSpacing="0.1em">REMOTE OBSERVATORY CENTER</Heading>
          </HStack>
          <HStack gap={3}>
            <Box
              px={3} py={1} borderRadius="full"
              bg={`${color}15`} border={`1px solid ${color}`}
            >
              <HStack gap={2}>
                <Box w="6px" h="6px" borderRadius="full" bg={color}
                  className={isStarting || isCritical ? "ping-slow" : ""} />
                <Text fontSize="11px" fontWeight="bold" color={color} className="hud-font">
                  {label}
                </Text>
              </HStack>
            </Box>
            <Badge colorScheme={healthPct > 80 ? "green" : healthPct > 50 ? "yellow" : "red"} fontSize="sm">
              {healthPct}% HEALTH
            </Badge>
          </HStack>
        </HStack>
        <Text fontSize="13px" color="whiteAlpha.600">
          {language === "fr"
            ? "Contrôle complet de l'infrastructure : Mac Mini M4, Astroberry Pi, NexStar 4SE."
            : "Full control of Stargazer infrastructure: Mac Mini M4, Astroberry Pi, and NexStar 4SE."}
        </Text>
      </VStack>

      <Box h="1px" bg="whiteAlpha.100" w="full" />

      {/* Startup Sequence */}
      {isStarting && (
        <Box p={4} borderRadius="lg" bg="rgba(255, 179, 71, 0.08)" border="1px solid rgba(255, 179, 71, 0.3)">
          <HStack gap={3} mb={3}>
            <Icon as={Rocket} color="var(--astro-gold)" boxSize={5} className="ping-slow" />
            <Text fontSize="13px" fontWeight="bold" color="var(--astro-gold)">
              {language === "fr" ? "SÉQUENCE DE DÉMARRAGE" : "STARTUP SEQUENCE"}
            </Text>
          </HStack>
          <VStack align="stretch" gap={2}>
            {(["indi_bridge", "mount", "ccd", "weather"] as SubsystemId[]).map((id) => {
              const sub = subsystems[id];
              const isDone = sub.status === "nominal";
              const isActive = sub.status === "recovering" || (sub.status === "offline" && id === getActiveId(subsystems));
              return (
                <HStack key={id} gap={3} opacity={isDone ? 0.7 : 1}>
                  <Box
                    w="20px" h="20px" borderRadius="full"
                    bg={isDone ? "green.500" : isActive ? "var(--astro-gold)" : "gray.700"}
                    display="flex" alignItems="center" justifyContent="center"
                  >
                    {isDone ? (
                      <Icon as={ShieldCheck} boxSize={3} color="black" />
                    ) : isActive ? (
                      <Spinner size="xs" color="black" />
                    ) : (
                      <Text fontSize="9px" color="gray.400">{getIndex(id)}</Text>
                    )}
                  </Box>
                  <Text fontSize="11px" color={isDone ? "gray.400" : isActive ? "var(--astro-gold)" : "gray.500"}>
                    {sub.label}
                  </Text>
                  {isActive && (
                    <Text fontSize="9px" color="var(--astro-gold)" fontStyle="italic">
                      {language === "fr" ? "Connexion..." : "Connecting..."}
                    </Text>
                  )}
                  {isDone && (
                    <Icon as={ShieldCheck} boxSize={3} color="green.400" />
                  )}
                </HStack>
              );
            })}
          </VStack>
        </Box>
      )}

      {/* Critical Warning */}
      {isCritical && (
        <Box p={4} borderRadius="lg" bg="rgba(255, 0, 0, 0.1)" border="1px solid red.500">
          <HStack gap={3}>
            <Icon as={AlertTriangle} color="red.400" boxSize={6} className="ping-slow" />
            <VStack align="start" gap={0}>
              <Text fontSize="13px" fontWeight="bold" color="red.400">
                {language === "fr" ? "ÉTAT CRITIQUE" : "CRITICAL STATE"}
              </Text>
              <Text fontSize="10px" color="red.200">
                {language === "fr"
                  ? "Un ou plusieurs sous-systèmes critiques sont en panne. Intervention requise."
                  : "One or more critical subsystems have failed. Intervention required."}
              </Text>
            </VStack>
            <Button size="sm" bg="red.600" color="white" ml="auto" onClick={() => sendObservatoryEvent("RESET")}>
              <Icon as={Power} boxSize={3} mr={1} />
              RESET
            </Button>
          </HStack>
        </Box>
      )}

      {/* Subsystems Grid */}
      <Box>
        <HStack mb={3} justify="space-between">
          <HStack gap={2}>
            <Icon as={Activity} color="green.400" boxSize={4} />
            <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="whiteAlpha.800">
              {language === "fr" ? "SOUS-SYSTÈMES" : "SUBSYSTEMS"}
            </Text>
          </HStack>
          {isOnline && (
            <Button size="xs" variant="ghost" color="cyan.400" onClick={() => sendObservatoryEvent("SHUTDOWN")}>
              <Icon as={Power} boxSize={3} mr={1} />
              SHUTDOWN
            </Button>
          )}
          {!isOnline && !isStarting && !isCritical && (
            <Button size="xs" variant="ghost" color="green.400" onClick={() => sendObservatoryEvent("START")}>
              <Icon as={Rocket} boxSize={3} mr={1} />
              START
            </Button>
          )}
        </HStack>
        <Grid templateColumns="repeat(3, 1fr)" gap={3}>
          {(Object.values(subsystems) as SubsystemHealth[]).map((sub) => (
            <SubsystemCard key={sub.id} sub={sub} />
          ))}
        </Grid>
      </Box>

      {/* Recovery button */}
      {obsState === "DEGRADED" && (
        <Box p={3} borderRadius="lg" bg="rgba(255, 179, 71, 0.06)" border="1px solid rgba(255, 179, 71, 0.2)">
          <HStack gap={3}>
            <Icon as={AlertTriangle} color="var(--astro-gold)" boxSize={5} />
            <Text fontSize="11px" color="gray.300" flex={1}>
              {language === "fr"
                ? "Sous-systèmes dégradés. Lancer la procédure de récupération automatique ?"
                : "Degraded subsystems. Launch automatic recovery procedure?"}
            </Text>
            <Button size="sm" bg="var(--astro-gold)" color="black" onClick={handleRecovery}>
              <Icon as={RefreshCw} boxSize={3} mr={1} />
              RECOVERY
            </Button>
          </HStack>
        </Box>
      )}

      {/* Health Section */}
      <Box>
        <InfrastructureStatus />
      </Box>

      {/* Main Content: Actions & Logs */}
      <Grid templateColumns={{ base: "1fr", xl: "350px 1fr" }} gap={8} alignItems="start">
        <Box bg="rgba(255,255,255,0.02)" p={6} borderRadius="2xl" border="1px solid rgba(255,255,255,0.05)">
          <ActionButtons />
        </Box>
        <Box h="full">
          <LogStream />
        </Box>
      </Grid>

      {/* Safety Footer */}
      <HStack bg="red.900" p={3} borderRadius="lg" border="1px solid" borderColor="red.700" gap={3}>
        <Icon as={Terminal} color="red.200" />
        <Text fontSize="11px" color="red.100" fontWeight="bold">
          SAFETY NOTE: Always ensure the telescope is balanced and cables are free before remote slewing. In case of emergency, use &quot;ABORT ALL&quot;.
        </Text>
      </HStack>
    </VStack>
  );
}

function getActiveId(subsystems: Record<string, SubsystemHealth>): SubsystemId | "weather" {
  const order: SubsystemId[] = ["indi_bridge", "mount", "ccd", "weather"];
  for (const id of order) {
    if (subsystems[id]?.status === "offline") return id;
  }
  return "weather";
}

function getIndex(id: SubsystemId): number {
  const order: SubsystemId[] = ["indi_bridge", "mount", "ccd", "weather"];
  return order.indexOf(id) + 1;
}
