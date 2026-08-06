// src/components/ui/ConfirmDialog.tsx
"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
    onCancel: () => void;
    isLoading?: boolean;
}

const VARIANT = {
    danger:  { Icon: ShieldAlert, color: "#FC8181",            border: "#EF4444",           btnBg: "#EF4444",            btnHover: "#DC2626" },
    warning: { Icon: AlertTriangle, color: "var(--astro-gold)", border: "var(--astro-gold)", btnBg: "var(--astro-gold)",  btnHover: "#ECC94B" },
    info:    { Icon: AlertTriangle, color: "var(--astro-teal)", border: "var(--astro-teal)", btnBg: "var(--astro-teal)",  btnHover: "white" },
};

function Spinner() {
    return <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />;
}

export const ConfirmDialog = ({
    isOpen, title, message, confirmLabel, cancelLabel,
    variant = "warning", onConfirm, onCancel, isLoading,
}: ConfirmDialogProps) => {
    if (!isOpen) return null;

    const { Icon, color, border, btnBg, btnHover } = VARIANT[variant];

    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center z-[9999]"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
            onClick={onCancel}
        >
            <div
                className="flex flex-col items-center gap-5 p-8 rounded-2xl text-center max-w-[420px] w-full mx-4"
                style={{
                    background: "rgba(10, 20, 40, 0.98)",
                    border: `2px solid ${border}`,
                    boxShadow: "0 0 50px rgba(0,0,0,0.5)",
                }}
                onClick={e => e.stopPropagation()}
            >
                <Icon size={48} style={{ color }} />
                <h2 className="hud-font text-white text-lg font-bold">{title}</h2>
                <p className="text-sm" style={{ color: "#CBD5E0" }}>{message}</p>
                <div className="flex gap-4 w-full">
                    <button
                        className="flex-1 h-10 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40"
                        style={{ color: "#A0AEC0", border: "1px solid rgba(255,255,255,0.2)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        {cancelLabel || "ANNULER"}
                    </button>
                    <button
                        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-bold text-black transition-colors cursor-pointer disabled:opacity-40"
                        style={{ background: btnBg }}
                        onMouseEnter={e => (e.currentTarget.style.background = btnHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = btnBg)}
                        onClick={onConfirm}
                        disabled={isLoading}
                    >
                        {isLoading && <Spinner />}
                        {confirmLabel || "CONFIRMER"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
