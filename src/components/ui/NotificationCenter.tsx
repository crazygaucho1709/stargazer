// src/components/ui/NotificationCenter.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X, Bell } from "lucide-react";
import { createPortal } from "react-dom";
import { Notification, subscribeNotifications, clearNotification } from "@/lib/notificationService";

const LEVEL_CFG = {
    info:     { Icon: Info,          color: "var(--astro-teal)", bg: "color-mix(in srgb, var(--astro-teal) 10%, transparent)" },
    success:  { Icon: CheckCircle2,  color: "#34D399",           bg: "rgba(52, 211, 153, 0.10)" },
    warning:  { Icon: AlertCircle,   color: "#FBBF24",           bg: "rgba(251, 191, 36, 0.10)" },
    error:    { Icon: AlertTriangle, color: "#F87171",           bg: "rgba(248, 113, 113, 0.12)" },
    critical: { Icon: AlertTriangle, color: "#EF4444",           bg: "rgba(239, 68, 68, 0.16)" },
};

export const NotificationCenter = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        setMounted(true);
        const unsub = subscribeNotifications(setNotifications);
        return unsub;
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                panelRef.current && !panelRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKey);
        };
    }, [isOpen]);

    const criticalCount = notifications.filter(n => n.level === "error" || n.level === "critical").length;

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                className="hud-toolbar-btn relative !px-2"
                style={{ color: criticalCount > 0 ? "#F87171" : undefined }}
                aria-label="Notifications"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(v => !v)}
            >
                <Bell size={15} aria-hidden />
                {notifications.length > 0 && (
                    <span
                        className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-hud-2xs font-bold text-slate-950 hud-numeric"
                        style={{ background: criticalCount > 0 ? "#F87171" : "var(--astro-teal)" }}
                    >
                        {criticalCount || notifications.length}
                    </span>
                )}
            </button>

            {mounted && isOpen && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Centre de notifications"
                    className="fixed flex flex-col rounded-xl overflow-hidden z-[var(--z-popover)] astro-panel"
                    style={{
                        // .astro-panel pose « position: relative » et l'emportait
                        // sur la classe « fixed » : le panneau partait en bas de page.
                        position: "fixed",
                        top: "92px",
                        right: "16px",
                        width: "min(380px, calc(100vw - 32px))",
                        maxHeight: "min(520px, calc(100dvh - 120px))",
                        background: "rgba(8, 14, 28, 0.96)",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.75)",
                    }}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <Bell size={14} style={{ color: "var(--astro-teal)" }} aria-hidden />
                            <span className="hud-font text-white text-xs font-bold tracking-[0.12em]">
                                NOTIFICATIONS
                            </span>
                            {notifications.length > 0 && (
                                <span className="text-hud-2xs text-slate-400 hud-numeric">
                                    ({notifications.length})
                                </span>
                            )}
                        </div>
                        {notifications.length > 0 && (
                            <button
                                type="button"
                                className="text-hud-2xs px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                onClick={() => { import("@/lib/notificationService").then(m => m.clearAll()); }}
                            >
                                Tout effacer
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col overflow-y-auto flex-1 hud-scroll">
                        {notifications.length === 0 ? (
                            <p className="text-xs text-center py-10 text-slate-400">
                                Aucune notification active
                            </p>
                        ) : (
                            notifications.map(n => {
                                const { Icon, color, bg } = LEVEL_CFG[n.level];
                                return (
                                    <div
                                        key={n.id}
                                        className="px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className="p-1.5 rounded-lg shrink-0 mt-0.5"
                                                style={{ background: bg }}
                                            >
                                                <Icon size={14} style={{ color }} aria-hidden />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-slate-100 text-xs font-semibold leading-snug">
                                                    {n.title}
                                                </p>
                                                {n.description && (
                                                    <p className="text-hud-2xs mt-0.5 text-slate-400 leading-relaxed">
                                                        {n.description}
                                                    </p>
                                                )}
                                                <p className="text-hud-2xs mt-1.5 text-slate-500 hud-numeric">
                                                    {new Date(n.timestamp).toLocaleTimeString("fr-FR")}
                                                    {n.source && ` · ${n.source}`}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                aria-label="Supprimer cette notification"
                                                className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                                                onClick={() => clearNotification(n.id)}
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
