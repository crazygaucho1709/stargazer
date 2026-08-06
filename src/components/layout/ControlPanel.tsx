// src/components/layout/ControlPanel.tsx
"use client";

import { TelescopeControls } from "@/components/telescope/TelescopeControls";
import { CameraControls } from "@/components/camera/CameraControls";
import { ObjectFinder } from "@/components/telescope/ObjectFinder";
import { CaptureAndStack } from "@/components/camera/CaptureAndStack";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Boxes, Telescope, Camera } from "lucide-react";

const insetSection = {
    background: "rgba(0,0,0,0.3)",
    padding: "20px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
} as const;

export const ControlPanel = () => {
    const isConnected = useStargazerStore((state) => state.isConnected);

    return (
        <div
            className="glass-panel fixed overflow-y-auto"
            style={{
                width: "340px",
                height: "calc(100vh - 40px)",
                borderRadius: "16px",
                right: "20px",
                top: "20px",
                padding: "25px",
                zIndex: 30,
            }}
        >
            <div className="flex flex-col gap-10">
                {/* Header */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Boxes size={20} color="#D00000" className="text-glow-red" />
                        <h2 style={{ fontSize: "14px", color: "white", letterSpacing: "0.1em", fontWeight: 900, margin: 0 }}>
                            INSTRUMENT HUB
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <div
                            className={isConnected ? "pulse" : ""}
                            style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                background: isConnected ? "#10b981" : "rgba(255,255,255,0.4)",
                                boxShadow: isConnected ? "0 0 10px #10b981" : "none",
                            }}
                        />
                        <span
                            style={{
                                fontSize: "10px",
                                fontWeight: 900,
                                color: isConnected ? "#10b981" : "rgba(255,255,255,0.4)",
                                letterSpacing: "0.2em",
                            }}
                        >
                            {isConnected ? "SENTRY LINK ACTIVE" : "LINK OFFLINE"}
                        </span>
                    </div>
                </div>

                {/* Telescope Controls */}
                <div style={insetSection}>
                    <TelescopeControls variant="pad" />
                </div>

                {/* Camera Controls */}
                <div style={insetSection}>
                    <CameraControls />
                </div>

                {/* Object Finder - GOTO */}
                <div style={insetSection}>
                    <div className="flex items-center gap-3 mb-4">
                        <Telescope size={16} color="#FFB300" />
                        <h3 style={{ fontSize: "12px", color: "#FFB300", letterSpacing: "0.2em", fontWeight: 900, margin: 0 }}>
                            CHERCHEUR D&apos;OBJETS
                        </h3>
                    </div>
                    <ObjectFinder />
                </div>

                {/* Capture & Stacking */}
                <div style={insetSection}>
                    <div className="flex items-center gap-3 mb-4">
                        <Camera size={16} color="#00F0FF" />
                        <h3 style={{ fontSize: "12px", color: "#00F0FF", letterSpacing: "0.2em", fontWeight: 900, margin: 0 }}>
                            CAPTURE &amp; STACKING
                        </h3>
                    </div>
                    <CaptureAndStack />
                </div>
            </div>
        </div>
    );
};
