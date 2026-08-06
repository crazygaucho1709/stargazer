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

  const btn = (dir: JogDirection, IconComponent: React.ElementType) => (
    <button
      className="w-10 h-10 flex items-center justify-center rounded-full text-[--astro-starlight] bg-white/5 transition-all duration-200 hover:bg-white/10 hover:scale-110 active:bg-[--astro-teal] active:text-black cursor-pointer"
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
        <span className="text-[9px] text-white/30 uppercase tracking-wider mr-1">FOC</span>
        <button
          onClick={() => moveFocuser("out")}
          className="h-6 px-2.5 rounded text-[10px] font-mono font-medium text-white/60 bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:text-white/90 transition-all duration-150 cursor-pointer"
          title="Focuser OUT (−50 steps)"
        >
          FOC−
        </button>
        <button
          onClick={() => moveFocuser("in")}
          className="h-6 px-2.5 rounded text-[10px] font-mono font-medium text-white/60 bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:text-white/90 transition-all duration-150 cursor-pointer"
          title="Focuser IN (+50 steps)"
        >
          FOC+
        </button>
      </div>
    </div>
  );
};
