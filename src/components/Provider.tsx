// src/components/Provider.tsx
"use client";

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "./ui/toaster";

export function Provider({ children }: { children: React.ReactNode }) {
    return (
        <ChakraProvider value={defaultSystem}>
            <ThemeProvider attribute="class" disableTransitionOnChange>
                {children}
                <Toaster />
            </ThemeProvider>
        </ChakraProvider>
    );
}
