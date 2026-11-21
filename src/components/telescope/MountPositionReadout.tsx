// src/components/telescope/MountPositionReadout.tsx
"use client";

import { useStationStream } from "@/hooks/useStationStream";

const fmt = (v: number | null | undefined) =>
  typeof v === "number" ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}°` : "—";

/**
 * Où est la monture, d'après ses encodeurs, et peut-on se fier au ciel affiché.
 * Hauteur : 0° = tube à l'horizontale. Azimut : 0° = repère du trépied, ouest positif.
 */
export function MountPositionReadout() {
  const station = useStationStream().station;
  const aligned = !!station?.sky_synced;
  const limits = station?.limits;
  const cells = [
    { label: "Hauteur", value: fmt(station?.encoder_alt), hint: limits ? `${limits.alt_min}° à ${limits.alt_max}°` : "" },
    { label: "Azimut", value: fmt(station?.encoder_az), hint: limits ? `${limits.az_min}° à ${limits.az_max}°` : "" },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col">
            <span className="text-hud-2xs uppercase tracking-wider text-slate-400">{c.label}</span>
            <span className="hud-numeric text-hud-lg text-slate-100">{c.value}</span>
            {c.hint && <span className="text-hud-2xs text-slate-500">limites {c.hint}</span>}
          </div>
        ))}
      </div>
      <p role="status" className={`text-hud-xs ${aligned ? "text-emerald-300" : "text-amber-300"}`}>
        {station?.encoder_alt == null
          ? "Position non lue sur la monture"
          : aligned
            ? "Alignée sur le ciel"
            : "Non alignée sur le ciel — les coordonnées célestes ne sont pas fiables"}
      </p>
    </div>
  );
}
