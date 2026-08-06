// src/components/observatory/ActionButtons.tsx
"use client";

import React, { useState } from "react";
import {
    Power, Anchor, Compass, ShieldAlert, Rocket
} from "lucide-react";
import { useAstroAction } from "@/hooks/useAstroAction";

interface ActionBtnProps {
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    colorScheme?: string;
    isLoading?: boolean;
    variant?: "outline" | "solid";
}

const ActionBtn = ({ label, icon: IconComp, onClick, colorScheme = "gray", isLoading = false, variant = "outline" }: ActionBtnProps) => {
    const [hovered, setHovered] = useState(false);

    const getSolidBg = () => {
        if (!hovered) return colorScheme === 'red' ? '#c53030' : '#2b6cb0';
        return colorScheme === 'red' ? '#9b2c2c' : '#2c5282';
    };

    const getOutlineBg = () => hovered ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)";

    return (
        <button
            onClick={onClick}
            disabled={isLoading}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                flex: 1,
                fontSize: "11px",
                height: "40px",
                border: variant === 'solid' ? "1px solid transparent" : "1px solid rgba(255,255,255,0.2)",
                borderRadius: "0.375rem",
                background: variant === 'solid' ? getSolidBg() : getOutlineBg(),
                color: variant === 'solid' ? 'white' : 'rgba(255,255,255,0.8)',
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.6 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "background 0.15s",
                padding: "0 0.75rem",
            }}
        >
            {isLoading ? (
                <div style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.2)",
                    borderTopColor: "white",
                    animation: "spin 0.8s linear infinite",
                }} />
            ) : (
                <IconComp size={14} />
            )}
            <span>{label}</span>
        </button>
    );
};

export const ActionButtons = () => {
    const { execute, isPending } = useAstroAction();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%" }}>
            {/* Mount Control */}
            <div>
                <p style={{ fontSize: "12px", fontWeight: "bold", color: "rgba(255,255,255,0.6)", marginBottom: "0.75rem", letterSpacing: "0.1em" }}>
                    MOUNT CONTROL
                </p>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                    <ActionBtn
                        label="PARK MOUNT"
                        icon={Anchor}
                        colorScheme="yellow"
                        onClick={() => execute('/api/mount/park', 'PARK MOUNT')}
                        isLoading={isPending}
                    />
                    <ActionBtn
                        label="UNPARK"
                        icon={Compass}
                        colorScheme="green"
                        onClick={() => execute('/api/mount/unpark', 'UNPARK MOUNT')}
                        isLoading={isPending}
                    />
                    <ActionBtn
                        label="ABORT ALL"
                        icon={ShieldAlert}
                        colorScheme="red"
                        variant="solid"
                        onClick={() => execute('/api/indi', 'ABORTING ALL', { body: { action: 'abort_all' } })}
                        isLoading={isPending}
                    />
                </div>
            </div>

            <div style={{ height: "1px", background: "rgba(255,255,255,0.1)", width: "100%" }} />

            {/* Maintenance — escape hatch (la récupération courante passe par le panneau DIAGNOSTIC) */}
            <div>
                <p style={{ fontSize: "12px", fontWeight: "bold", color: "rgba(255,255,255,0.6)", marginBottom: "0.4rem", letterSpacing: "0.1em" }}>
                    MAINTENANCE
                </p>
                <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
                    Reconnexion, redémarrage INDI et verrou USB sont gérés par le panneau DIAGNOSTIC ci-dessus (Reset All).
                </p>
                <div style={{ display: "flex", width: "100%", gap: "0.75rem" }}>
                    <ActionBtn
                        label="LAUNCH EKOS"
                        icon={Rocket}
                        onClick={() => execute('/api/indi/launch_ekos', 'LAUNCH EKOS')}
                        isLoading={isPending}
                    />
                    <ActionBtn
                        label="REBOOT ASTROBERRY"
                        icon={Power}
                        colorScheme="red"
                        onClick={() => {
                            if (confirm("Redémarrer l'Astroberry ? L'observatoire sera hors-ligne ~60s.")) {
                                execute('/api/astroberry', 'REBOOT', { body: { action: 'reboot', confirm: 'confirm' } });
                            }
                        }}
                        isLoading={isPending}
                    />
                </div>
            </div>

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
