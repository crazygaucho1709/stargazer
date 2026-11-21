// src/app/layout.tsx
import type { Metadata } from "next";
import { Provider } from "@/components/Provider";
import "./globals.css";

export const metadata: Metadata = {
    title: "Stargazer | Observatory",
    description: "Advanced Telescope & Camera Control System",
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="fr" suppressHydrationWarning>
            <body suppressHydrationWarning className="h-dvh overflow-hidden flex flex-col bg-[#05070E] text-[#E2E8F0] font-sans antialiased">
                <Provider>
                    <main className="flex-1 min-h-0 w-full relative">
                        {children}
                    </main>
                </Provider>
            </body>
        </html>
    );
}
