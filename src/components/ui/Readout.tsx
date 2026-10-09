"use client";

import React from "react";
import { clsx } from "clsx";

/**
 * Affichage d'une valeur instrumentale (coordonnée, température, HFR…).
 *
 * Remplace le motif répété dans tout le HUD : un libellé en text-hud-2xs
 * opacity-60 au-dessus d'une valeur en text-hud-xs. Ce motif est lisible sur
 * un écran de bureau et illisible dehors, de nuit, à bout de bras — l'audit
 * en a compté 255 occurrences sous 12px, dont une à 6px.
 *
 * Ici les deux lignes passent par l'échelle --hud-scale, donc le réglage de
 * densité les suit. Le libellé garde sa discrétion par la graisse et
 * l'espacement des lettres plutôt que par une opacité qui détruit le
 * contraste.
 */

type Props = {
  label: string;
  value: React.ReactNode;
  /** Unité affichée en retrait, sans concurrencer la valeur. */
  unit?: string;
  icon?: React.ReactNode;
  /** Valeur hors norme : attire l'œil sans recourir à la seule couleur. */
  alert?: boolean;
  /** Chiffres alignés — indispensable pour une valeur qui défile. */
  mono?: boolean;
  className?: string;
};

export function Readout({
  label, value, unit, icon, alert = false, mono = true, className,
}: Props) {
  return (
    <div className={clsx("flex items-center gap-2.5 min-w-0", className)}>
      {icon && <span aria-hidden className="shrink-0 opacity-70">{icon}</span>}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-hud-2xs uppercase tracking-[0.14em] text-[--astro-starlight]/65 leading-none">
          {label}
        </span>
        <span
          className={clsx(
            "flex items-baseline gap-1 leading-none",
            mono && "mono-font tabular-nums",
            alert ? "text-[--color-warning] font-bold" : "text-[--astro-starlight]",
          )}
        >
          <span className="text-hud-sm truncate">{value}</span>
          {unit && (
            <span className="text-hud-2xs text-[--astro-starlight]/60">{unit}</span>
          )}
        </span>
      </div>
    </div>
  );
}
