// src/components/ui/toaster.tsx
"use client";

import { useEffect, useRef } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { subscribeNotifications, type Notification } from "@/lib/notificationService";

const LEVEL_BORDER: Record<Notification["level"], string> = {
    info:     "4px solid #0d9488",  // teal-600
    success:  "4px solid #16a34a",  // green-600
    warning:  "4px solid #d97706",  // amber-600
    error:    "4px solid #dc2626",  // red-600
    critical: "4px solid #9f1239",  // rose-800
};

function renderToast(n: Notification) {
    const borderLeft = LEVEL_BORDER[n.level];
    const duration   = n.level === "critical" ? Infinity : n.timeout;

    const description = n.description ?? undefined;

    const opts = {
        id:          n.id,
        duration,
        description,
        style:       { borderLeft },
        action:      n.retryFn
            ? { label: "Réessayer", onClick: n.retryFn }
            : n.action
                ? { label: n.action.label, onClick: n.action.onClick }
                : undefined,
    };

    switch (n.level) {
        case "success":  toast.success(n.title, opts); break;
        case "warning":  toast.warning(n.title, opts); break;
        case "error":
        case "critical": toast.error(n.title, opts);   break;
        default:         toast.info(n.title, opts);    break;
    }
}

function SonnerBridge() {
    const seenRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        return subscribeNotifications((notifications: Notification[]) => {
            const latest = notifications[0];
            if (!latest) return;
            if (seenRef.current.has(latest.id)) return;
            seenRef.current.add(latest.id);
            renderToast(latest);
        });
    }, []);

    return null;
}

export function Toaster() {
    return (
        <>
            <SonnerBridge />
            <Sonner
                theme="dark"
                position="top-right"
                visibleToasts={5}
                toastOptions={{
                    style: {
                        background:     "rgba(10, 20, 40, 0.95)",
                        backdropFilter: "blur(16px)",
                        border:         "1px solid rgba(255, 255, 255, 0.08)",
                        borderTop:      "1px solid rgba(255, 255, 255, 0.15)",
                        color:          "#E2E8F0",
                        fontFamily:     "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                        fontSize:       "13px",
                        borderRadius:   "12px",
                    },
                }}
            />
        </>
    );
}
