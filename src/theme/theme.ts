import { createSystem, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        astro: {
          teal: { value: "#FF3333" },
          gold: { value: "#FFB347" },
          cobalt: { value: "#1E3A8A" },
          starlight: { value: "#E2E8F0" },
          void: { value: "#030509" },
          glass: { value: "rgba(10, 20, 40, 0.45)" },
          glassHighlight: { value: "rgba(255, 51, 51, 0.15)" }
        },
      },
    },
    semanticTokens: {
      shadows: {
        astroGlowTeal: { value: "0 0 20px rgba(255, 51, 51, 0.4)" },
        astroGlowGold: { value: "0 0 20px rgba(255, 179, 71, 0.4)" },
        astroPanel: { value: "0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05)" },
      },
    },
  },
});

export const system = createSystem(config);
