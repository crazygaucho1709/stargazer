// src/components/telescope/ObservationSuggestions.tsx
"use client";

import { Target, ChevronRight, Sparkles } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useState } from "react";

export const ObservationSuggestions = () => {
    const { targets, setPosition, setSlewing } = useStargazerStore();
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const handleSlew = (ra: string, dec: string) => {
        setSlewing(true);
        setTimeout(() => {
            setPosition(ra, dec);
            setSlewing(false);
        }, 2000);
    };

    return (
        <div className="flex flex-col gap-3 w-full px-2">
            <div className="flex items-center gap-2 px-2 mb-1">
                <Sparkles size={12} color="#00F0FF" />
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em", fontWeight: "bold" }}>
                    AI_SUGGESTIONS
                </span>
            </div>

            <div
                className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2"
                style={{ maxHeight: "120px" }}
            >
                {targets.map((target) => (
                    <div
                        key={target.id}
                        className="flex items-center justify-between cursor-pointer rounded-md transition-all duration-200"
                        style={{
                            padding: "8px",
                            background: hoveredId === target.id ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                            border: hoveredId === target.id
                                ? "1px solid rgba(0, 240, 255, 0.3)"
                                : "1px solid rgba(255,255,255,0.1)",
                        }}
                        onMouseEnter={() => setHoveredId(target.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => handleSlew(target.ra, target.dec)}
                    >
                        <div className="flex items-center gap-3">
                            <Target size={12} color="rgba(255,255,255,0.4)" />
                            <div className="flex flex-col gap-0">
                                <span
                                    style={{ fontSize: "10px", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                >
                                    {target.name}
                                </span>
                                <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)" }}>{target.type}</span>
                            </div>
                        </div>
                        <ChevronRight size={12} color="rgba(255,255,255,0.3)" />
                    </div>
                ))}
            </div>
        </div>
    );
};
