// src/components/Provider.tsx
"use client";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import { system } from "@/theme/theme";

export function Provider({ children }: { children: React.ReactNode }) {
    return (
        <ChakraProvider value={system || defaultSystem}>
            <ThemeProvider attribute="class" disableTransitionOnChange>
                {children}
            </ThemeProvider>
        </ChakraProvider>
    );
}

