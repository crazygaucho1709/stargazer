// src/components/observatory/TargetInspector.tsx
"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Crosshair,
  Frame,
  Sparkles,
  Clock,
  Eye,
  Compass,
  AlertCircle,
} from "lucide-react";
import { CelestialObject } from "@/data/celestialCatalog";
import { calculateAltitude } from "@/lib/targetRanking";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useGoTo } from "@/hooks/useGoTo";
import { notification } from "@/lib/notificationService";

interface TargetInspectorProps {
  target: CelestialObject;
  lat: number;
  lon: number;
  planDate: Date;
  onClose: () => void;
  onFrameFov: (target: CelestialObject) => void;
}

function suggestExposure(obj: CelestialObject): string {
  if (obj.magnitude <= 5) return "5–10 s × 30 poses (Live Stack)";
  if (obj.magnitude <= 8.5) return "10–15 s × 45 poses (Bin 2×2)";
  return "15–20 s × 60+ poses (Réd. 0,6× conseillé)";
}

export function TargetInspector({
  target,
  lat,
  lon,
  planDate,
  onClose,
  onFrameFov,
}: TargetInspectorProps) {
  const { isConnected, mountLimits } = useStargazerStore();
  const { goto, isSlewing } = useGoTo();
  const [imgError, setImgError] = useState(false);
  // Un objet cliqué dans Stellarium hors catalogue maison n'a ni description
  // ni conseils : on masque ces blocs plutôt que d'afficher des valeurs vides.
  const inCatalog = target.catalog !== "Stellarium";

  // DSS2 real photographic thumbnail via CDS HiPS2FITS
  const previewFov = useMemo(() => {
    const m = target.size_arcmin.match(/([\d.]+)/);
    const sizeArcmin = m ? parseFloat(m[1]) : 15;
    return Math.min(3.0, Math.max(0.25, (sizeArcmin / 60) * 2.4));
  }, [target.size_arcmin]);

  const previewUrl = `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=P/DSS2/color&ra=${target.ra_deg.toFixed(4)}&dec=${target.dec_deg.toFixed(4)}&fov=${previewFov.toFixed(3)}&width=420&height=210&format=jpg`;

  // 12-hour altitude curve centered around planDate (-4h to +8h)
  const curve = useMemo(() => {
    const samples: { hourLabel: string; alt: number; isNow: boolean }[] = [];
    for (let h = -4; h <= 8; h += 0.5) {
      const d = new Date(planDate.getTime() + h * 3600_000);
      const a = calculateAltitude(target.ra_deg, target.dec_deg, d, lat, lon);
      samples.push({
        hourLabel: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        alt: a,
        isNow: h === 0,
      });
    }
    const maxAlt = Math.max(...samples.map((s) => s.alt));
    const nowAlt = samples.find((s) => s.isNow)?.alt ?? 0;
    return { samples, maxAlt, nowAlt };
  }, [target, planDate, lat, lon]);

  const isWithinLimits =
    curve.nowAlt >= mountLimits.minAlt && curve.nowAlt <= mountLimits.maxAlt;

  const handleGoTo = async () => {
    if (!isConnected) {
      notification.info("Station hors ligne", {
        description: `Pointage simulé sur la carte pour ${target.id} (${target.name}). Connectez la station pour déplacer la monture.`,
        source: "GoTo",
      });
      onFrameFov(target);
      return;
    }
    await goto(target.ra_deg, target.dec_deg);
  };

  // SVG path computation
  const W = 280;
  const H = 76;
  const yOf = (deg: number) => H - ((Math.max(-10, Math.min(90, deg)) + 10) / 100) * H;
  const xOf = (i: number) => (i / (curve.samples.length - 1)) * W;
  const linePath = curve.samples
    .map((s, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(s.alt).toFixed(1)}`)
    .join(" ");
  const nowIdx = curve.samples.findIndex((s) => s.isNow);
  const nowX = nowIdx >= 0 ? xOf(nowIdx) : W / 3;
  const nowY = yOf(curve.nowAlt);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`Fiche de ${target.name}`}
      className="hud-glass w-[330px] max-w-[calc(100vw-24px)] rounded-2xl overflow-hidden flex flex-col text-slate-100 pointer-events-auto"
    >
      {/* DSS2 Photographic Preview */}
      <div className="relative h-[156px] w-full bg-slate-950 overflow-hidden shrink-0">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${target.id} ${target.name}`}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.35),rgba(3,6,14,1))]">
            <Sparkles size={24} className="text-slate-500" aria-hidden />
            <span className="text-hud-2xs text-slate-400">Aperçu DSS2 indisponible</span>
          </div>
        )}

        {/* Gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090d18] via-transparent to-black/40 pointer-events-none" />

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche objet"
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>

        {/* Catalog badge */}
        <div className="absolute top-2.5 left-3 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md text-hud-2xs font-semibold bg-black/60 border border-white/15 text-[--astro-teal] hud-numeric">
            {target.id}
          </span>
          <span className="px-2 py-0.5 rounded-md text-hud-2xs font-medium bg-black/60 border border-white/10 text-slate-200">
            {target.type}
          </span>
        </div>

        {/* Title over bottom of photo */}
        <div className="absolute bottom-2.5 left-3 right-3">
          <h3 className="text-base font-semibold text-white leading-tight truncate">
            {target.name}
          </h3>
          <p className="text-hud-2xs text-slate-300/85">
            {target.constellation ? `${target.constellation} · ` : ""}{target.ra} / {target.dec}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5 flex flex-col gap-3">
        <p className="text-xs text-slate-300 leading-relaxed">{target.description}</p>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
            <span className="text-hud-2xs text-slate-400 block">Altitude</span>
            <span
              className={`text-xs font-semibold hud-numeric ${
                isWithinLimits ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {curve.nowAlt.toFixed(1)}°
            </span>
          </div>
          <div className="rounded-xl px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
            <span className="text-hud-2xs text-slate-400 block">Magnitude</span>
            <span className="text-xs font-semibold hud-numeric text-slate-100">
              {Number.isFinite(target.magnitude) ? target.magnitude.toFixed(1) : "—"}
            </span>
          </div>
          <div className="rounded-xl px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
            <span className="text-hud-2xs text-slate-400 block">Taille</span>
            <span className="text-xs font-semibold hud-numeric text-slate-100 truncate block">
              {target.size_arcmin ? <>{target.size_arcmin}&prime;</> : "—"}
            </span>
          </div>
        </div>

        {/* Night Altitude Curve */}
        <div className="rounded-xl p-2.5 bg-white/[0.025] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-hud-2xs font-medium text-slate-300">
              <Compass size={12} className="text-[--astro-teal]" aria-hidden />
              Courbe d&apos;altitude (12h)
            </span>
            <span className="text-hud-2xs hud-numeric text-slate-400">
              Max {curve.maxAlt.toFixed(0)}°
            </span>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[76px] overflow-visible">
            {/* Safe mount altitude band */}
            <rect
              x={0}
              y={yOf(mountLimits.maxAlt)}
              width={W}
              height={Math.max(0, yOf(mountLimits.minAlt) - yOf(mountLimits.maxAlt))}
              style={{ fill: "color-mix(in srgb, var(--astro-teal) 6%, transparent)" }}
            />
            {/* Horizon line (0°) */}
            <line
              x1={0}
              y1={yOf(0)}
              x2={W}
              y2={yOf(0)}
              stroke="rgba(148, 163, 184, 0.25)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            {/* Altitude path */}
            <path
              d={linePath}
              fill="none"
              stroke="var(--astro-teal)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            {/* Current/planned time marker */}
            <line
              x1={nowX}
              y1={0}
              x2={nowX}
              y2={H}
              stroke="rgba(255, 179, 71, 0.45)"
              strokeDasharray="2 2"
              strokeWidth={1}
            />
            <circle cx={nowX} cy={nowY} r={4} fill="var(--astro-gold)" stroke="#090d18" strokeWidth={1.5} />
          </svg>

          <div className="flex justify-between text-hud-2xs text-slate-500 hud-numeric mt-1">
            <span>{curve.samples[0]?.hourLabel}</span>
            <span className="text-[--astro-gold]">{curve.samples[nowIdx]?.hourLabel}</span>
            <span>{curve.samples[curve.samples.length - 1]?.hourLabel}</span>
          </div>
        </div>

        {/* Recommended exposure for NexStar 4SE — fiches du catalogue maison uniquement */}
        {inCatalog && <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <Clock size={13} className="text-slate-400 shrink-0" aria-hidden />
          <div className="min-w-0">
            <span className="text-hud-2xs text-slate-400 block">Conseil NexStar 4SE</span>
            <span className="text-hud-2xs font-medium text-slate-200">{suggestExposure(target)}</span>
          </div>
        </div>}

        {!isWithinLimits && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/25 text-amber-200 text-hud-2xs">
            <AlertCircle size={13} className="shrink-0" aria-hidden />
            <span>
              Hors limites monture ({mountLimits.minAlt.toFixed(0)}°–{mountLimits.maxAlt.toFixed(0)}°) à cette heure
            </span>
          </div>
        )}

        {/* Primary actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleGoTo}
            disabled={isSlewing}
            className="flex-1 h-9 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
            style={{
              background: "var(--astro-teal)",
              color: "#030712",
            }}
          >
            <Crosshair size={14} aria-hidden />
            <span>{isSlewing ? "Pointage…" : isConnected ? "Pointer (GoTo)" : "Simuler GoTo"}</span>
          </button>

          <button
            type="button"
            onClick={() => onFrameFov(target)}
            className="h-9 px-3 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-200 bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.10] transition-colors cursor-pointer"
            title="Centrer la carte et activer le cadre capteur FOV"
          >
            <Frame size={14} aria-hidden />
            <span>FOV</span>
          </button>
        </div>

        {inCatalog && <div className="flex items-center justify-between text-hud-2xs text-slate-500 pt-0.5">
          <span className="inline-flex items-center gap-1">
            <Eye size={11} aria-hidden /> Difficulté : {target.difficulty}
          </span>
          <span>Meilleurs mois : {target.best_months.join(", ")}</span>
        </div>}
      </div>
    </motion.aside>
  );
}
