// src/components/observatory/TonightDrawer.tsx
"use client";

import { useMemo, useState } from "react";
import { Sparkles, Clock, RotateCcw, Compass } from "lucide-react";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import { rankTargets } from "@/lib/targetRanking";
import { calcSunAlt, hoursUntilDark, DARK_SUN_ALT_DEG } from "@/lib/sun";

interface TonightDrawerProps {
  lat: number;
  lon: number;
  timeOffsetHours: number;
  onTimeOffsetChange: (hours: number) => void;
  selectedId?: string | null;
  onSelectObject: (obj: CelestialObject) => void;
}

const FILTERS = [
  { id: "all",       label: "Tout" },
  { id: "Nebula",    label: "Nébuleuses" },
  { id: "Galaxy",    label: "Galaxies" },
  { id: "Cluster",   label: "Amas" },
  { id: "Planetary", label: "Planétaires" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function TonightDrawer({
  lat,
  lon,
  timeOffsetHours,
  onTimeOffsetChange,
  selectedId,
  onSelectObject,
}: TonightDrawerProps) {
  const [filter, setFilter] = useState<FilterId>("all");

  const planDate = useMemo(
    () => new Date(Date.now() + timeOffsetHours * 3600_000),
    [timeOffsetHours],
  );

  const ranked = useMemo(() => {
    const all = rankTargets(CELESTIAL_CATALOG, planDate, lat, lon, 15);
    return all.filter((item) => {
      if (filter === "all") return true;
      if (filter === "Nebula") return item.type === "Nebula" || item.type === "Supernova Remnant";
      if (filter === "Galaxy") return item.type === "Galaxy";
      if (filter === "Cluster") return item.type === "Star Cluster";
      if (filter === "Planetary") return item.type === "Planetary Nebula";
      return true;
    });
  }, [planDate, lat, lon, filter]);

  const visibleCount = ranked.filter((r) => r.isVisible).length;

  // À l'heure choisie, fait-il assez noir ? Sinon la liste classe des cibles
  // hautes dans le ciel mais invisibles : on le dit, et on propose la nuit.
  const sunAlt = calcSunAlt(lat, lon, planDate);
  const tooBright = sunAlt >= DARK_SUN_ALT_DEG;
  const darkIn = tooBright ? hoursUntilDark(lat, lon, planDate) : null;
  const nightOffset = darkIn === null ? null : Math.ceil((timeOffsetHours + darkIn) * 2) / 2;
  const nightTime = darkIn === null ? null : new Date(planDate.getTime() + darkIn * 3600_000);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Time planner slider (great for offline session prep) */}
      <div className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.07] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
            <Clock size={13} className="text-[--astro-teal]" aria-hidden />
            Planification horaire
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold hud-numeric text-[--astro-teal]">
              {planDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {timeOffsetHours !== 0 && (
              <button
                type="button"
                onClick={() => onTimeOffsetChange(0)}
                title="Revenir à l'heure actuelle"
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min={-6}
          max={12}
          step={0.5}
          value={timeOffsetHours}
          onChange={(e) => onTimeOffsetChange(parseFloat(e.target.value))}
          aria-label="Décalage horaire pour la préparation de session"
          className="w-full accent-[--astro-teal] cursor-pointer"
        />
        <div className="flex justify-between text-hud-2xs text-slate-500 hud-numeric">
          <span>-6h</span>
          <span>Maintenant ({timeOffsetHours >= 0 ? `+${timeOffsetHours}h` : `${timeOffsetHours}h`})</span>
          <span>+12h</span>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="px-2.5 py-1 rounded-lg text-hud-2xs font-medium transition-colors cursor-pointer border"
              style={{
                background: active ? "color-mix(in srgb, var(--astro-teal) 14%, transparent)" : "rgba(255,255,255,0.03)",
                borderColor: active ? "color-mix(in srgb, var(--astro-teal) 40%, transparent)" : "rgba(255,255,255,0.08)",
                color: active ? "var(--astro-teal)" : "#94A3B8",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {tooBright && (
        <div role="status" className="rounded-xl p-3 border border-amber-400/30 bg-amber-400/[0.07] flex flex-col gap-2">
          <p className="text-hud-xs text-amber-200">
            {sunAlt > 0
              ? `Il fait jour à cette heure (Soleil à ${sunAlt.toFixed(0)}°).`
              : "Le ciel n'est pas encore noir à cette heure."}{" "}
            Le classement ci-dessous ne vaut que de nuit.
          </p>
          {nightOffset !== null && nightOffset <= 12 && nightTime && (
            <button
              type="button"
              onClick={() => onTimeOffsetChange(nightOffset)}
              className="self-start inline-flex items-center px-3 min-h-[var(--size-touch)] rounded-lg text-hud-xs font-semibold border border-[--astro-teal]/40 bg-[--astro-teal]/12 text-[--astro-teal] hover:bg-[--astro-teal]/20 transition-colors duration-150 cursor-pointer"
            >
              Voir les cibles à la nuit tombée ({nightTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-hud-2xs text-slate-400 px-0.5">
        <span>
          {tooBright
            ? `${visibleCount} cible(s) au-dessus de 15°, invisibles de jour`
            : `${visibleCount} cible(s) au-dessus de 15°`}
        </span>
        {!tooBright && <span>Triées par score</span>}
      </div>

      {/* Ranked cards */}
      <div className="flex-1 overflow-y-auto hud-scroll flex flex-col gap-2 pr-0.5">
        {ranked.slice(0, 30).map((item) => {
          const selected = selectedId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectObject(item)}
              className="w-full text-left p-3 rounded-xl transition-all duration-150 cursor-pointer border"
              style={{
                background: selected
                  ? "color-mix(in srgb, var(--astro-teal) 10%, transparent)"
                  : item.isVisible
                  ? "rgba(255, 255, 255, 0.035)"
                  : "rgba(255, 255, 255, 0.015)",
                borderColor: selected
                  ? "color-mix(in srgb, var(--astro-teal) 45%, transparent)"
                  : "rgba(255, 255, 255, 0.07)",
                opacity: item.isVisible ? 1 : 0.55,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles
                      size={13}
                      style={{ color: item.isVisible ? "var(--astro-teal)" : "#64748B" }}
                      aria-hidden
                    />
                    <span className="text-xs font-semibold text-white hud-numeric">{item.id}</span>
                    <span className="text-xs text-slate-200 truncate">{item.name}</span>
                  </div>
                  <p className="text-hud-2xs text-slate-400 mt-0.5 truncate">
                    {item.type} · {item.constellation} · mag {item.magnitude.toFixed(1)}
                  </p>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold hud-numeric ${
                      item.isVisible ? "text-emerald-300" : "text-slate-500"
                    }`}
                  >
                    <Compass size={11} aria-hidden />
                    {item.altitude.toFixed(0)}°
                  </span>
                  {item.isVisible && (
                    <span className="text-hud-2xs text-slate-400 hud-numeric">
                      Score {item.score.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>

              {item.bestFor.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mt-2">
                  {item.bestFor.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-hud-2xs px-1.5 py-0.5 rounded-md bg-white/[0.05] text-slate-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
