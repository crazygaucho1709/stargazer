"use client";

import React from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

/**
 * Bouton de fermeture d'un panneau, d'une fenêtre ou d'un assistant.
 *
 * Il existe parce que les quatre fermetures du projet étaient écrites quatre
 * fois différemment, et cumulaient chacune les mêmes trois défauts : un
 * caractère « ✕ » en guise d'icône (qu'un lecteur d'écran épelle « multiplié
 * par »), aucun nom accessible, et une cible de quelques pixels.
 *
 * L'icône vient de Lucide, déjà utilisé partout ailleurs dans le projet. La
 * cible fait 44px sans que le bouton paraisse plus gros : la zone sensible est
 * étendue par un pseudo-élément, pas par la boîte visible.
 */
export function CloseButton({
  onClick,
  label = "Fermer",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx(
        "touch-target relative inline-flex items-center justify-center",
        "h-8 w-8 rounded-lg cursor-pointer",
        "text-[--astro-starlight]/55 hover:text-[--astro-starlight]",
        "hover:bg-white/10 transition-colors duration-200",
        className,
      )}
    >
      <X size={18} aria-hidden />
    </button>
  );
}
