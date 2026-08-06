// src/components/ui/AstroPod.tsx
"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface AstroPodProps {
    title?: string;
    children: ReactNode;
    width?: string;
    height?: string;
    glowColor?: "teal" | "gold" | "cobalt" | "starlight";
}

export const AstroPod = ({ title, children, width = "auto", height = "auto", glowColor = "teal" }: AstroPodProps) => {
    const colorMap = {
        teal:      "var(--astro-teal)",
        gold:      "var(--astro-gold)",
        cobalt:    "var(--astro-cobalt)",
        starlight: "var(--astro-starlight)",
    };
    const activeColor = colorMap[glowColor];

    return (
        <div className="flex flex-col gap-2" style={{ width, height }}>
            {title && (
                <div className="self-start">
                    <span
                        className="hud-font text-[11px] font-semibold tracking-[0.15em] px-4 py-1.5"
                        style={{
                            color: activeColor,
                            background: "rgba(10, 20, 40, 0.7)",
                            borderRadius: "4px 16px 4px 4px",
                            borderLeft: `2px solid ${activeColor}`,
                            borderBottom: "1px solid rgba(255,255,255,0.1)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                            display: "inline-block",
                        }}
                    >
                        {title}
                    </span>
                </div>
            )}

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ width: "100%", height: "100%" }}
            >
                <div className="astro-panel w-full h-full p-4">
                    {children}
                </div>
            </motion.div>
        </div>
    );
};
