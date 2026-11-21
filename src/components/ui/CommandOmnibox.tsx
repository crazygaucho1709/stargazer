// src/components/ui/CommandOmnibox.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, Compass, X } from "lucide-react";
import { CELESTIAL_CATALOG, CelestialObject } from "@/data/celestialCatalog";
import { calculateAltitude } from "@/lib/targetRanking";

interface CommandOmniboxProps {
  lat: number;
  lon: number;
  planDate: Date;
  onSelectObject: (obj: CelestialObject) => void;
}

export function CommandOmnibox({ lat, lon, planDate, onSelectObject }: CommandOmniboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? CELESTIAL_CATALOG.filter(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            o.name.toLowerCase().includes(q) ||
            o.constellation.toLowerCase().includes(q) ||
            o.type.toLowerCase().includes(q),
        )
      : CELESTIAL_CATALOG.slice(0, 8);

    return list.slice(0, 10).map((obj) => ({
      obj,
      alt: calculateAltitude(obj.ra_deg, obj.dec_deg, planDate, lat, lon),
    }));
  }, [query, planDate, lat, lon]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const commit = (obj: CelestialObject) => {
    onSelectObject(obj);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    // Sous 640px la barre du haut n'a pas la place d'un champ : la recherche se
    // réduit à une loupe, et recouvre la barre le temps de la saisie.
    <div
      ref={wrapRef}
      className={[
        "relative sm:flex-1 sm:max-w-[440px] sm:min-w-[160px]",
        open
          ? "max-sm:absolute max-sm:inset-0 max-sm:z-10 max-sm:flex max-sm:items-center max-sm:px-2 max-sm:rounded-2xl max-sm:bg-[#090d18]"
          : "max-sm:w-8 max-sm:shrink-0",
      ].join(" ")}
    >
      <div
        onClick={() => inputRef.current?.focus()}
        className={[
          "flex items-center gap-2 h-8 px-3 rounded-xl transition-colors duration-150",
          open ? "max-sm:flex-1" : "max-sm:px-0 max-sm:justify-center max-sm:cursor-pointer",
        ].join(" ")}
        style={{
          background: open ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.05)",
          border: `1px solid ${open ? "color-mix(in srgb, var(--astro-teal) 42%, transparent)" : "rgba(255, 255, 255, 0.10)"}`,
        }}
      >
        <Search size={14} className="text-slate-400 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit(results[activeIndex].obj);
            }
          }}
          placeholder="Rechercher un astre (M42, M31, Orion…)"
          aria-label="Rechercher un objet céleste"
          className={[
            "flex-1 min-w-0 bg-transparent text-xs text-slate-100 placeholder:text-slate-400 outline-none border-none",
            // 16px pendant la saisie : en dessous, iOS zoome sur le champ.
            open ? "max-sm:text-base" : "max-sm:w-0 max-sm:flex-none max-sm:opacity-0",
          ].join(" ")}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={13} />
          </button>
        ) : (
          <kbd className="hidden md:inline-flex items-center px-1.5 h-5 rounded-md text-hud-2xs text-slate-400 bg-white/[0.06] border border-white/[0.08] hud-numeric">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-2xl overflow-hidden z-[var(--z-popover)]"
          style={{
            background: "rgba(9, 13, 24, 0.96)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.11)",
            boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8)",
          }}
        >
          <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-hud-2xs font-medium text-slate-400">
              {query.trim() ? `${results.length} résultat(s)` : "Suggestions rapides"}
            </span>
            <span className="text-hud-2xs text-slate-500">Entrée pour centrer</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto hud-scroll py-1">
            {results.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Aucun objet trouvé pour « {query} »
              </p>
            ) : (
              results.map(({ obj, alt }, idx) => {
                const isActive = idx === activeIndex;
                const isUp = alt >= 15;
                return (
                  <button
                    key={obj.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commit(obj)}
                    className={[
                      "w-full px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer",
                      isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Sparkles
                        size={14}
                        className="shrink-0"
                        style={{ color: isUp ? "var(--astro-teal)" : "#64748B" }}
                        aria-hidden
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white hud-numeric">{obj.id}</span>
                          <span className="text-xs text-slate-300 truncate">{obj.name}</span>
                        </div>
                        <span className="text-hud-2xs text-slate-400 truncate">
                          {obj.type} · {obj.constellation} · mag {obj.magnitude.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Compass size={11} className={isUp ? "text-emerald-400" : "text-slate-500"} aria-hidden />
                      <span
                        className={`text-hud-2xs hud-numeric font-medium ${
                          isUp ? "text-emerald-300" : "text-slate-500"
                        }`}
                      >
                        {alt.toFixed(0)}°
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
