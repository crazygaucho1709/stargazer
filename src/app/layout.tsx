// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Provider } from "@/components/Provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Stargazer | Observatory Dashboard",
    description: "Advanced Telescope & Camera Control System",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" suppressHydrationWarning style={{ height: "100%", margin: 0, padding: 0 }}>
            <body
                className={inter.className}
                suppressHydrationWarning
                style={{
                    height: "100%",
                    minHeight: "100vh",
                    margin: 0,
                    padding: 0,
                    backgroundColor: "#000000",
                    position: "relative"
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
