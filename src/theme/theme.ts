// src/theme/theme.ts
// Design tokens for Stargazer — Chakra-free.
// Consumed as CSS custom properties (injected via globals.css or layout.tsx)
// and as a plain TypeScript object for programmatic access.

export const astroTokens = {
  colors: {
    teal: "#00F0FF",
    gold: "#FFB347",
    cobalt: "#1E3A8A",
    starlight: "#E2E8F0",
    void: "#030509",
    glass: "rgba(10, 20, 40, 0.45)",
    glassHighlight: "rgba(255, 51, 51, 0.15)",
    /** Alias kept for legacy references that used --astro-teal as red during a design phase */
    accent: "#FF3333",
  },
  shadows: {
    glowTeal: "0 0 20px rgba(0, 240, 255, 0.4)",
    glowGold: "0 0 20px rgba(255, 179, 71, 0.4)",
    panel: "0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
  },
} as const;

/**
 * Returns an inline-style object with all design tokens as CSS custom properties.
 * Spread this onto a root <div> or inject it into a <style> tag via layout.tsx.
 *
 * Example (layout.tsx):
 *   import { cssVars } from "@/theme/theme";
 *   <body style={cssVars}>…</body>
 */
export const cssVars: React.CSSProperties = {
  "--astro-teal": astroTokens.colors.teal,
  "--astro-gold": astroTokens.colors.gold,
  "--astro-cobalt": astroTokens.colors.cobalt,
  "--astro-starlight": astroTokens.colors.starlight,
  "--astro-void": astroTokens.colors.void,
  "--astro-glass": astroTokens.colors.glass,
  "--astro-glass-highlight": astroTokens.colors.glassHighlight,
  "--astro-accent": astroTokens.colors.accent,
  "--astro-glow-teal": astroTokens.shadows.glowTeal,
  "--astro-glow-gold": astroTokens.shadows.glowGold,
  "--astro-shadow-panel": astroTokens.shadows.panel,
} as React.CSSProperties;
