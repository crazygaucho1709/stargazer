// src/app/layout.tsx
import type { Metadata } from "next";
import { Provider } from "@/components/Provider";
import { ConnectionStatusBar } from "@/components/ui/ConnectionStatusBar";
import "./globals.css";

export const metadata: Metadata = {
    title: "Stargazer | Observatory Dashboard",
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
            <body suppressHydrationWarning className="min-h-screen bg-[#030509] text-[#E2E8F0] font-sans antialiased">
                <Provider>
                    <ConnectionStatusBar />
                    <main className="min-h-screen w-full">
                        {children}
                    </main>
                </Provider>
            </body>
        </html>
    );
}
