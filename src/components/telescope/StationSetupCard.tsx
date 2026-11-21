// src/components/telescope/StationSetupCard.tsx
"use client";

import { Check, CircleAlert, CircleDashed, Loader2, Square, Wand2, X } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useStationSetup, SetupStepStatus } from "@/hooks/useStationSetup";
import { useStationStream } from "@/hooks/useStationStream";
import { limitBreach } from "@/lib/stationReadiness";

const ICON: Record<SetupStepStatus, React.ElementType> = {
  pending: CircleDashed, running: Loader2, done: Check,
  warning: CircleAlert, failed: X, aborted: X,
};

const TONE: Record<SetupStepStatus, string> = {
  pending: "text-slate-500", running: "text-[--astro-teal]", done: "text-emerald-300",
  warning: "text-amber-300", failed: "text-red-300", aborted: "text-slate-400",
};

/** Préparer la station : où l'on en est, un seul bouton, puis le suivi des six étapes. */
export function StationSetupCard() {
  const isConnected = useStargazerStore((s) => s.isConnected);
  const { setup, start, stop, pending } = useStationSetup();
  const running = !!setup?.running;
  const zone = setup?.horizon?.zone ?? null;
  const station = useStationStream().station;
  const breach = limitBreach(station);
  // Ce qu'il reste à obtenir avant d'observer. C'est la même liste, quel que
  // soit le chemin : la préparation automatique les traite dans cet ordre.
  const checklist = [
    { ok: station?.encoder_alt != null, label: "Position lue sur la monture" },
    { ok: station?.encoder_alt != null && !breach, label: breach ?? "Monture dans ses limites" },
    { ok: !!station?.location_source && station.location_source !== "fallback", label: "Lieu et heure connus" },
    { ok: !!station?.sky_synced, label: "Alignée sur le ciel" },
  ];

  return (
    <section
      aria-label="Préparer la station"
      className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.07] flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-hud-sm font-semibold text-white normal-case tracking-normal">
            Préparer la station
          </h3>
          <p className="text-hud-2xs text-slate-400">
            Un seul geste : balayage du ciel, limites, alignement et mise au point numérique. La monture se déplace seule.
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={stop}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[var(--size-touch-lg)] rounded-lg text-hud-xs font-bold text-white bg-red-600 hover:bg-red-500 cursor-pointer"
          >
            <Square size={12} fill="currentColor" aria-hidden /> Arrêter
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!isConnected || pending}
            title={isConnected ? "Lancer la préparation complète de la station" : "Station hors ligne"}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[var(--size-touch-lg)] rounded-lg text-hud-xs font-semibold border border-[--astro-teal]/40 bg-[--astro-teal]/12 text-[--astro-teal] hover:bg-[--astro-teal]/20 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wand2 size={13} aria-hidden /> Préparer
          </button>
        )}
      </div>

      {!running && (
        <ul className="flex flex-col gap-1" aria-label="État de préparation">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-hud-xs">
              {item.ok
                ? <Check size={13} className="shrink-0 text-emerald-300" aria-hidden />
                : <CircleDashed size={13} className="shrink-0 text-amber-300" aria-hidden />}
              <span className={item.ok ? "text-slate-300" : "text-amber-200"}>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
      {!running && breach && (
        <p className="text-hud-2xs text-amber-200">
          Éteignez puis rallumez la monture sur ses repères : ses compteurs repartiront de zéro.
        </p>
      )}

      {setup && setup.steps.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {setup.steps.map((step) => {
            const Icon = ICON[step.status];
            const showProgress = step.status === "running" && setup.progress;
            return (
              <li key={step.id} className="flex items-start gap-2 text-hud-xs">
                <Icon
                  size={14}
                  aria-hidden
                  className={`mt-0.5 shrink-0 ${TONE[step.status]} ${step.status === "running" ? "animate-spin" : ""}`}
                />
                <div className="min-w-0">
                  <span className={step.status === "pending" ? "text-slate-500" : "text-slate-100"}>
                    {step.label}
                    {showProgress && (
                      <span className="hud-numeric text-slate-400">
                        {" "}— {setup.progress!.done}/{setup.progress!.total}
                      </span>
                    )}
                  </span>
                  {step.detail && (
                    <p className={`text-hud-2xs ${TONE[step.status]}`}>{step.detail}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {running && setup?.logs.length ? (
        <p role="status" className="text-hud-2xs text-slate-400 truncate">
          {/* Le journal du backend préfixe ses lignes d'un pictogramme : on ne garde que le texte. */}
          {setup.logs[setup.logs.length - 1].replace(/^[^A-Za-zÀ-ÿ0-9]+/, "")}
        </p>
      ) : null}

      {!running && zone && (
        <p className="text-hud-2xs text-slate-400">
          Zone d&apos;observation connue : hauteur {zone.altMin.toFixed(0)}° à {zone.altMax.toFixed(0)}°,
          azimut {zone.azMin >= 0 ? "+" : ""}{zone.azMin.toFixed(0)}° à {zone.azMax >= 0 ? "+" : ""}{zone.azMax.toFixed(0)}° du repère
          ({setup!.horizon!.sky_cells} cases de ciel, {setup!.horizon!.blocked_cells} masquées).
        </p>
      )}
    </section>
  );
}
