// src/app/layout.tsx
import type { Metadata } from "next";
import { Provider } from "@/components/Provider";
import "./globals.css";

export const metadata: Metadata = {
    title: "Stargazer | Observatory Dashboard",
    description: "Advanced Telescope & Camera Control System",
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",          // lets dvh reach behind Safari notch/toolbar
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="fr" suppressHydrationWarning style={{ height: "100%", margin: 0, padding: 0 }}>
            <body
                suppressHydrationWarning
                style={{
                    height: "100%",
                    minHeight: "100vh",
                    margin: 0,
                    padding: 0,
                    backgroundColor: "#000000",
                    position: "relative",
                    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
                }}
            >
                <Provider>
                    <main style={{ minHeight: "100vh", width: "100%" }}>
                        {children}
                    </main>
                </Provider>
            </body>
        </html>
    );
}
