"use client";

import React from "react";
import { clsx } from "clsx";

/**
 * État d'un sous-système matériel : monture, caméra, liaison encodeur.
 *
 * L'enjeu est opérationnel, pas décoratif. Le 5 août 2026 le tube a parcouru
 * 260° parce que la position affichée était figée sans que rien ne le signale.
 * Un état « perdu » doit donc se distinguer d'un état « au repos » au premier
 * coup d'œil, de loin.
 *
 * La couleur ne porte jamais l'information seule : le mode nuit rend
 * l'interface monochrome et écrase toutes les teintes. Chaque état a donc
 * aussi une FORME (rond, rond pulsé, carré, rond éteint) et un mot.
 */

export type HwState = "idle" | "moving" | "limit" | "lost";

const LABELS: Record<HwState, string> = {
  idle: "Au repos",
  moving: "En mouvement",
  limit: "En butée",
  lost: "Liaison perdue",
};

type Props = {
  name: string;
  state: HwState;
  /** Précision affichée à la place du libellé générique (ex. « AZ +2,7° »). */
  detail?: string;
  className?: string;
};

export function HardwareState({ name, state, detail, className }: Props) {
  const label = detail ?? LABELS[state];
  return (
    <div
      className={clsx(`state-${state}`, "flex items-center gap-2 min-w-0", className)}
      // Les changements d'état matériel sont annoncés aux lecteurs d'écran,
      // mais sans interrompre : "polite" et non "assertive".
      role="status"
      aria-live="polite"
    >
      <span aria-hidden className="state-dot" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-hud-2xs uppercase tracking-[0.14em] text-[--astro-starlight]/65 leading-none">
          {name}
        </span>
        <span className="text-hud-xs leading-none truncate text-[--astro-starlight]">
          {label}
        </span>
      </div>
      <span className="sr-only">{name} : {LABELS[state]}{detail ? `, ${detail}` : ""}</span>
    </div>
  );
}
