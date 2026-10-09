// src/components/telescope/JogPad.tsx
"use client";

import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { UseJogReturn, JogDirection } from "@/hooks/useJog";
import { notification } from "@/lib/notificationService";

interface JogPadProps {
  jog: UseJogReturn;
  size?: "sm" | "md";
}

async function moveFocuser(direction: "in" | "out"): Promise<void> {
  try {
    const res = await fetch("/api/indi?endpoint=focuser/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction, steps: 50 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      notification.error("Focuser: commande échouée", {
        source: "JogPad",
        description: (data as { error?: string }).error ?? `HTTP ${res.status}`,
      });
    }
  } catch (e: unknown) {
    notification.error("Focuser: connexion impossible", {
      source: "JogPad",
      description: e instanceof Error ? e.message : "Erreur réseau",
    });
  }
}

export const JogPad = ({ jog }: JogPadProps) => {
  const { startJog, stopJog } = jog;

/** Les boutons du pavé n'ont qu'une icône : sans libellé, un lecteur d'écran
 *  annonce « bouton » quatre fois. Les directions sont celles perçues par
 *  l'observateur, pas les noms de commandes du driver (qui sont inversés). */
const JOG_LABELS: Record<string, string> = {
  up: "Monter le tube",
  down: "Descendre le tube",
  left: "Tourner vers l'est",
  right: "Tourner vers l'ouest",
};

  const btn = (dir: JogDirection, IconComponent: React.ElementType) => (
    <button
      aria-label={JOG_LABELS[dir] ?? dir}
      // 40px était sous la norme de 44px, pour LE contrôle qu'on vise dehors,
      // de nuit, les doigts froids. hover:scale-110 déplaçait en plus la cible
      // sous le doigt au moment de l'appui : remplacé par un changement de fond.
      className="w-12 h-12 flex items-center justify-center rounded-full text-[--astro-starlight] bg-white/5 transition-colors duration-200 hover:bg-white/15 active:bg-[--astro-teal] active:text-black cursor-pointer"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        startJog(dir);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        stopJog();
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        stopJog();
      }}
    >
      <IconComponent size={20} />
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Directional pad */}
      <div className="grid gap-[4px]" style={{ gridTemplateColumns: "repeat(3, 40px)", gridTemplateRows: "repeat(3, 40px)" }}>
        <div />
        {btn("up", ArrowUp)}
        <div />
        {btn("left", ArrowLeft)}
        <div className="rounded-full bg-white/[0.03]" />
        {btn("right", ArrowRight)}
        <div />
        {btn("down", ArrowDown)}
        <div />
      </div>

      {/* Focuser controls */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-hud-2xs text-white/30 uppercase tracking-wider mr-1">FOC</span>
        <button
          onClick={() => moveFocuser("out")}
          className="h-6 px-2.5 rounded text-hud-xs font-mono font-medium text-white/60 bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:text-white/90 transition-all duration-150 cursor-pointer"
          title="Focuser OUT (−50 steps)"
        >
          FOC−
        </button>
        <button
          onClick={() => moveFocuser("in")}
          className="h-6 px-2.5 rounded text-hud-xs font-mono font-medium text-white/60 bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:text-white/90 transition-all duration-150 cursor-pointer"
          title="Focuser IN (+50 steps)"
        >
          FOC+
        </button>
      </div>
    </div>
  );
};
