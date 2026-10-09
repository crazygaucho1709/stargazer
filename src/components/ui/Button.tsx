"use client";

import React from "react";
import { clsx } from "clsx";

/**
 * Bouton unique de l'application.
 *
 * Il existe parce que l'audit d'interface a relevé 163 balises <button> pour
 * 7 aria-label et AUCUN état de focus : chaque bouton réinventait son style,
 * et aucun n'était utilisable au clavier. Passer par une primitive rend ces
 * garanties structurelles plutôt que déclaratives.
 *
 * Trois choses ne sont pas négociables ici :
 *  - une cible tactile d'au moins 44px, parce qu'on vise ces boutons dehors,
 *    de nuit, avec les doigts froids ;
 *  - un nom accessible, imposé par le typage dès qu'il n'y a pas de texte ;
 *  - un état de chargement qui désactive réellement le bouton, pour qu'un
 *    double appui ne déclenche pas deux captures.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[--astro-teal]/15 text-[--astro-teal] border-[--astro-teal]/40 " +
    "hover:bg-[--astro-teal]/25 active:bg-[--astro-teal]/35",
  secondary:
    "bg-white/5 text-[--astro-starlight] border-white/10 " +
    "hover:bg-white/10 active:bg-white/15",
  ghost:
    "bg-transparent text-[--astro-starlight]/80 border-transparent " +
    "hover:bg-white/5 hover:text-[--astro-starlight] active:bg-white/10",
  // Le rouge seul ne suffit pas à signaler le danger en mode nuit, où tout
  // devient rouge : la bordure plus épaisse reste lisible une fois monochrome.
  danger:
    "bg-[--color-danger]/15 text-[--color-danger] border-[--color-danger]/50 border-2 " +
    "hover:bg-[--color-danger]/25 active:bg-[--color-danger]/35",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-[var(--size-touch)] px-3 text-hud-2xs gap-1.5",
  md: "min-h-[var(--size-touch)] px-4 text-hud-xs gap-2",
  lg: "min-h-[var(--size-touch-lg)] px-6 text-hud-sm gap-2.5",
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
};

/** Le nom accessible devient obligatoire quand il n'y a pas d'enfant texte —
 *  c'est le typage qui l'impose, pas une revue de code. */
type Props = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> &
  ({ children: React.ReactNode } | { children?: never; "aria-label": string });

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  function Button(
    { variant = "secondary", size = "md", loading = false, icon, className,
      children, disabled, ...rest },
    ref,
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={rest.type ?? "button"}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={clsx(
          "inline-flex items-center justify-center rounded-lg border",
          "font-medium tracking-wide uppercase select-none",
          "transition-colors duration-200",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          !isDisabled && "cursor-pointer",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  },
);
