// src/theme/theme.ts
import { createSystem, defineConfig } from "@chakra-ui/react";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          red: { value: "#D00000" },
          orange: { value: "#FF7D00" },
          amber: { value: "#FFB300" },
          deep: { value: "#050505" },
          glass: { value: "rgba(15, 15, 15, 0.7)" },
        },
      },
    },
    semanticTokens: {
      shadows: {
        pod: { value: "0 10px 40px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.05)" },
        glowRed: { value: "0 0 20px rgba(208, 0, 0, 0.5)" },
        glowOrange: { value: "0 0 20px rgba(255, 125, 0, 0.5)" },
      },
    },
  },
});

export const system = createSystem(config);


