// src/components/ui/SessionIndicator.tsx
"use client";

import { Box, HStack, Text, Icon } from "@chakra-ui/react";
import { Activity, Zap, Orbit } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { STATE_LABELS, STATE_COLORS, SessionState } from "@/lib/sessionMachine";

const STATE_ICONS: Record<SessionState, typeof Activity> = {
  IDLE: Activity,
  PARKED: Orbit,
  UNPARKING: Orbit,
  TRACKING: Activity,
  SLEWING: Zap,
  GUIDING: Activity,
  CAPTURING: Zap,
  STACKING: Zap,
  STOPPING: Activity,
  ERROR: Activity,
};

export const SessionIndicator = () => {
  const sessionState = useStargazerStore((s) => s.sessionState);
  const language = useStargazerStore((s) => s.language);
  const lang = language === "fr" ? "fr" : "en";
  const label = STATE_LABELS[sessionState][lang];
  const color = STATE_COLORS[sessionState];
  const IconComp = STATE_ICONS[sessionState];

  return (
    <HStack gap={2} px={3} py={1} borderRadius="full" bg="rgba(0,0,0,0.3)" border="1px solid" borderColor="rgba(255,255,255,0.08)">
      <Box
        w="6px" h="6px" borderRadius="full"
        bg={color}
        boxShadow={sessionState === "ERROR" || sessionState === "SLEWING" ? `0 0 8px ${color}` : "none"}
        className={sessionState === "CAPTURING" ? "ping-slow" : ""}
      />
      <Icon as={IconComp} boxSize={3} color={color} />
      <Text fontSize="10px" fontWeight="bold" color={color} letterSpacing="0.08em" className="hud-font">
        {label}
      </Text>
    </HStack>
  );
};
