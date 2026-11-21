// src/components/ui/VisionControls.tsx
"use client";

import React, { useEffect } from "react";
import { Moon, Sun, Type } from "lucide-react";
import { clsx } from "clsx";
import { useStargazerStore } from "@/store/useStargazerStore";

/**
 * Réglages de confort d'observation : vision nocturne, assombrissement,
 * densité typographique. Appliqués en attributs sur <html>.
 */
export function VisionControls({ className }: { className?: string }) {
  const { vision, density, dim, setVision, setDensity, setDim } = useStargazerStore();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.vision = vision;
    root.dataset.density = density;
    root.dataset.dim = String(dim);
  }, [vision, density, dim]);

  const night = vision === "night";

  return (
    <div className={clsx("flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => setVision(night ? "day" : "night")}
        aria-pressed={night}
        aria-label={night ? "Désactiver la vision nocturne" : "Activer la vision nocturne"}
        title={night ? "Vision nocturne active (620nm+)" : "Passer en vision nocturne"}
        className={clsx(
          "hud-toolbar-btn text-hud-2xs uppercase tracking-wider font-medium",
          night && "!border-[--astro-teal]/50 !bg-[--astro-teal]/15 !text-[--astro-teal]",
        )}
      >
        {night ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
        <span className="hidden md:inline">{night ? "Nuit" : "Jour"}</span>
      </button>

      {night && (
        <div
          className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-0.5"
          role="group"
          aria-label="Niveau d'assombrissement"
        >
          {([0, 1, 2] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setDim(lvl)}
              aria-pressed={dim === lvl}
              aria-label={`Assombrissement niveau ${lvl}`}
              className={clsx(
                "min-h-[calc(var(--size-touch)-4px)] w-7 rounded-md text-hud-2xs cursor-pointer",
                "transition-colors duration-150 hud-numeric font-semibold",
                dim === lvl
                  ? "bg-[--astro-teal]/20 text-[--astro-teal]"
                  : "text-slate-400 hover:bg-white/10 hover:text-white",
              )}
            >
              {lvl}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          setDensity(
            density === "compact" ? "normal" : density === "normal" ? "outdoor" : "compact",
          )
        }
        aria-label={`Densité d'affichage : ${density}. Changer.`}
        title={`Densité HUD : ${density}`}
        // Masqué sous 640px : la barre du haut n'a pas la place.
        className="hud-toolbar-btn max-sm:!hidden text-hud-2xs uppercase tracking-wider font-medium"
      >
        <Type size={14} aria-hidden />
        <span className="hidden xl:inline">
          {density === "compact" ? "Compact" : density === "normal" ? "Normal" : "Extérieur"}
        </span>
      </button>
    </div>
  );
}
