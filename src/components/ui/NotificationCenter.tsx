// src/components/ui/NotificationCenter.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X, Bell } from "lucide-react";
import { createPortal } from "react-dom";
import { Notification, subscribeNotifications, clearNotification } from "@/lib/notificationService";

const LEVEL_CFG = {
    info:     { Icon: Info,          color: "var(--astro-teal)", bg: "rgba(0, 240, 255, 0.1)" },
    success:  { Icon: CheckCircle2,  color: "#48BB78",           bg: "rgba(72, 187, 120, 0.1)" },
    warning:  { Icon: AlertCircle,   color: "#ECC94B",           bg: "rgba(236, 201, 75, 0.1)" },
    error:    { Icon: AlertTriangle, color: "#FC8181",           bg: "rgba(252, 129, 129, 0.1)" },
    critical: { Icon: AlertTriangle, color: "#F56565",           bg: "rgba(245, 101, 101, 0.15)" },
};

export const NotificationCenter = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsub = subscribeNotifications(setNotifications);
        return unsub;
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const criticalCount = notifications.filter(n => n.level === "error" || n.level === "critical").length;

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell button */}
            <button
                className="relative p-2 rounded transition-colors cursor-pointer"
                style={{ color: criticalCount > 0 ? "#FC8181" : "#A0AEC0" }}
                onMouseEnter={e => (e.currentTarget.style.color = "white")}
                onMouseLeave={e => (e.currentTarget.style.color = criticalCount > 0 ? "#FC8181" : "#A0AEC0")}
                aria-label="Notifications"
                onClick={() => setIsOpen(v => !v)}
            >
                <Bell size={16} />
                {notifications.length > 0 && (
                    <span
                        className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-black"
                        style={{ background: criticalCount > 0 ? "#EF4444" : "var(--astro-teal)" }}
                    >
                        {criticalCount || notifications.length}
                    </span>
                )}
            </button>

            {/* Dropdown panel — teleported to body */}
            {isOpen && createPortal(
                <div
                    className="fixed flex flex-col rounded-lg overflow-hidden z-[9998]"
                    style={{
                        top: "60px", right: "80px",
                        width: "380px", maxHeight: "500px",
                        background: "rgba(10, 20, 40, 0.98)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.8)",
                        backdropFilter: "blur(20px)",
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <span className="hud-font text-white text-sm font-bold">NOTIFICATIONS</span>
                        {notifications.length > 0 && (
                            <button
                                className="text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer"
                                style={{ color: "#A0AEC0" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "white")}
                                onMouseLeave={e => (e.currentTarget.style.color = "#A0AEC0")}
                                onClick={() => { import("@/lib/notificationService").then(m => m.clearAll()); }}
                            >
                                TOUT EFFACER
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="flex flex-col overflow-y-auto flex-1">
                        {notifications.length === 0 ? (
                            <p className="text-sm text-center py-8" style={{ color: "#718096" }}>Aucune notification</p>
                        ) : (
                            notifications.map(n => {
                                const { Icon, color } = LEVEL_CFG[n.level];
                                return (
                                    <div
                                        key={n.id}
                                        className="p-3 transition-colors"
                                        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Icon size={16} style={{ color, marginTop: 2, flexShrink: 0 }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-bold">{n.title}</p>
                                                {n.description && (
                                                    <p className="text-xs mt-0.5" style={{ color: "#A0AEC0" }}>{n.description}</p>
                                                )}
                                                <p className="text-[10px] mt-1" style={{ color: "#4A5568" }}>
                                                    {new Date(n.timestamp).toLocaleTimeString()}
                                                    {n.source && ` • ${n.source}`}
                                                </p>
                                            </div>
                                            <button
                                                className="p-0.5 rounded transition-colors cursor-pointer"
                                                style={{ color: "#718096" }}
                                                onMouseEnter={e => (e.currentTarget.style.color = "white")}
                                                onMouseLeave={e => (e.currentTarget.style.color = "#718096")}
                                                onClick={() => clearNotification(n.id)}
                                            >
                                                <X size={12} />
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

export const NotificationToast = ({ notification: n }: { notification: Notification }) => {
    const { Icon, color, bg } = LEVEL_CFG[n.level];
    return (
        <div
            className="rounded-md p-3 max-w-[400px]"
            style={{ background: bg, border: `1px solid ${color}`, boxShadow: "0 8px 30px rgba(0,0,0,0.6)" }}
        >
            <div className="flex items-start gap-3">
                <Icon size={20} style={{ color }} />
                <div className="flex-1">
                    <p className="text-white text-sm font-bold">{n.title}</p>
                    {n.description && (
                        <p className="text-xs mt-0.5" style={{ color: "#CBD5E0" }}>{n.description}</p>
                    )}
                </div>
            </div>
        </div>
    );
};
