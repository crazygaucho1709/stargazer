// src/components/Provider.tsx
"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "./ui/toaster";

export function Provider({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" disableTransitionOnChange forcedTheme="dark">
            {children}
            <Toaster />
        </ThemeProvider>
    );
}
