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
            {/* Coquille en colonne, hauteur exacte de la fenetre.
                Avant : la barre d'etat (32px) PUIS un <main> en min-h-screen,
                soit 32px de trop — la barre d'etat du bas sortait de l'ecran et
                etait tronquee, sans defilement pour la rattraper.
                h-dvh et non h-screen : sur iPhone, h-screen compte la barre
                d'adresse de Safari meme quand elle est repliee. */}
            <body suppressHydrationWarning className="h-dvh overflow-hidden flex flex-col bg-[#030509] text-[#E2E8F0] font-sans antialiased">
                <Provider>
                    <ConnectionStatusBar />
                    <main className="flex-1 min-h-0 w-full">
                        {children}
                    </main>
                </Provider>
            </body>
        </html>
    );
}
