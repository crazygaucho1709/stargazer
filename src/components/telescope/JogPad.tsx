"use client";

import { Grid, Button, Icon, Box } from "@chakra-ui/react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { UseJogReturn, JogDirection } from "@/hooks/useJog";

interface JogPadProps {
  jog: UseJogReturn;
  /** Taille des boutons : "sm" = 28px (défaut), "md" = 36px */
  size?: "sm" | "md";
}

export const JogPad = ({ jog, size = "sm" }: JogPadProps) => {
  const btnSize = size === "md" ? "36px" : "28px";
  const iconSize = size === "md" ? 4 : 3;
  const { startJog, stopJog, activeDir } = jog;

  const btn = (dir: JogDirection, IconComponent: React.ElementType) => {
    const isActive = activeDir === dir;
    return (
      <Button
        size="xs"
        w={btnSize}
        h={btnSize}
        p={0}
        bg={isActive ? "var(--astro-teal)" : "rgba(255,255,255,0.06)"}
        color={isActive ? "black" : "whiteAlpha.700"}
        boxShadow={isActive ? "0 0 10px rgba(0,255,209,0.5)" : "none"}
        _hover={{ bg: isActive ? "var(--astro-teal)" : "rgba(255,255,255,0.12)" }}
        borderRadius="5px"
        border="1px solid rgba(255,255,255,0.08)"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          startJog(dir);
        }}
        onPointerUp={(e) => { e.preventDefault(); stopJog(); }}
        onPointerCancel={(e) => { e.preventDefault(); stopJog(); }}
      >
        <Icon as={IconComponent} boxSize={iconSize} />
      </Button>
    );
  };

  return (
    <Grid
      templateColumns={`repeat(3, ${btnSize})`}
      templateRows={`repeat(3, ${btnSize})`}
      gap="2px"
    >
      <Box />
      {btn("up", ArrowUp)}
      <Box />
      {btn("left", ArrowLeft)}
      <Box bg="rgba(255,255,255,0.03)" borderRadius="4px" />
      {btn("right", ArrowRight)}
      <Box />
      {btn("down", ArrowDown)}
      <Box />
    </Grid>
  );
};
