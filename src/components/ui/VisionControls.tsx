"use client";

import React, { useEffect } from "react";
import { Moon, Sun, Type } from "lucide-react";
import { clsx } from "clsx";
import { useStargazerStore } from "@/store/useStargazerStore";

/**
 * Réglages de confort d'observation : vision nocturne, assombrissement,
 * densité typographique.
 *
 * C'est le réglage le plus utilisé d'une soirée et le plus pénible à trouver
 * dans un menu quand on a les mains prises : il reste donc en permanence dans
 * l'en-tête, pas dans la configuration.
 *
 * Les trois réglages sont appliqués en attributs sur <html>, d'où le CSS les
 * reprend. Passer par le document plutôt que par des classes React permet au
 * filtre de vision nocturne de couvrir TOUTE l'application d'un coup — y
 * compris les mille styles inline hérités que rien d'autre n'atteindrait.
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
    <div className={clsx("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => setVision(night ? "day" : "night")}
        aria-pressed={night}
        aria-label={night ? "Désactiver la vision nocturne" : "Activer la vision nocturne"}
        title={night ? "Vision nocturne active" : "Vision nocturne"}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border px-3 min-h-[var(--size-touch)]",
          "text-hud-2xs uppercase tracking-wider cursor-pointer transition-colors duration-200",
          night
            ? "border-[--astro-teal]/50 bg-[--astro-teal]/15 text-[--astro-teal]"
            : "border-white/10 bg-white/5 text-[--astro-starlight]/80 hover:bg-white/10",
        )}
      >
        {night ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
        <span className="hidden sm:inline">{night ? "Nuit" : "Jour"}</span>
      </button>

      {/* L'assombrissement n'a de sens qu'en vision nocturne : un écran rouge
          trop lumineux éblouit tout autant qu'un écran blanc. */}
      {night && (
        <div
          className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5"
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
                "min-h-[var(--size-touch)] w-9 rounded-md text-hud-2xs cursor-pointer",
                "transition-colors duration-200 mono-font",
                dim === lvl
                  ? "bg-[--astro-teal]/20 text-[--astro-teal]"
                  : "text-[--astro-starlight]/60 hover:bg-white/10",
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
        title={`Densité : ${density}`}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3",
          "min-h-[var(--size-touch)] text-hud-2xs uppercase tracking-wider",
          "text-[--astro-starlight]/80 hover:bg-white/10 cursor-pointer transition-colors duration-200",
        )}
      >
        <Type size={16} aria-hidden />
        <span className="hidden sm:inline">
          {density === "compact" ? "Compact" : density === "normal" ? "Normal" : "Extérieur"}
        </span>
      </button>
    </div>
  );
}
