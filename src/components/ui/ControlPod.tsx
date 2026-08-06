// src/components/ui/ControlPod.tsx
"use client";

interface ControlPodProps {
    title?: string;
    children: React.ReactNode;
    size?: string;
    glowColor?: string;
    accentColor?: string;
}

export const ControlPod = ({
    title,
    children,
    size = "180px",
    glowColor = "rgba(0, 240, 255, 0.3)",
    accentColor = "#00F0FF",
}: ControlPodProps) => {
    return (
        <div className="flex flex-col items-center gap-4 relative">
            {title && (
                <div className="relative">
                    <span
                        className="hud-font text-[9px] font-black tracking-[0.4em] px-4 py-1 rounded-full"
                        style={{
                            color: "rgba(255,255,255,0.7)",
                            background: "rgba(0,0,0,0.6)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            backdropFilter: "blur(10px)",
                            boxShadow: `0 0 10px ${glowColor}`,
                            display: "inline-block",
                        }}
                    >
                        {title.toUpperCase()}
                    </span>
                </div>
            )}

            <div
                className="glass-panel relative flex items-center justify-center transition-all duration-[600ms]"
                style={{
                    width: size,
                    height: size,
                    borderRadius: "9999px",
                    border: "1px solid rgba(255,255,255,0.2)",
                }}
                onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "scale(1.08)";
                    el.style.boxShadow = `0 0 40px ${glowColor}, inset 0 0 25px rgba(0,0,0,0.6)`;
                    el.style.borderColor = accentColor;
                }}
                onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "";
                    el.style.boxShadow = "";
                    el.style.borderColor = "rgba(255,255,255,0.2)";
                }}
            >
                {/* HUD arcs */}
                <div
                    className="absolute rounded-full border-2 opacity-40"
                    style={{ inset: "-8px", borderColor: accentColor, animation: "spin 12s linear infinite" }}
                />
                <div
                    className="absolute rounded-full border opacity-20"
                    style={{ inset: "-15px", borderColor: accentColor, animation: "spin 25s linear infinite reverse" }}
                />

                {/* Static HUD guides */}
                <div className="absolute inset-0 rounded-full border border-white/10 pointer-events-none" />
                <div className="absolute rounded-full border border-dashed border-white/5 pointer-events-none" style={{ inset: "15%" }} />

                {/* Rotating accent ring */}
                <div
                    className="absolute rounded-full opacity-30"
                    style={{
                        inset: "-4px",
                        border: "2px solid transparent",
                        borderTopColor: accentColor,
                        borderRightColor: accentColor,
                        animation: "spin 15s cubic-bezier(0.4, 0, 0.2, 1) infinite",
                    }}
                />

                {/* Inner ambient glow */}
                <div
                    className="absolute inset-0 rounded-full pointer-events-none opacity-20"
                    style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 75%)` }}
                />

                <div className="z-[1]">{children}</div>
            </div>
        </div>
    );
};
