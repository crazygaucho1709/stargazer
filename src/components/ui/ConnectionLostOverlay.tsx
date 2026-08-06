// src/components/ui/ConnectionLostOverlay.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WifiOff, RefreshCw } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

const GRACE_PERIOD_MS = 10_000;

export function ConnectionLostOverlay() {
  const isConnected = useStargazerStore((s) => s.isConnected);

  // Track when connection was first lost
  const lostAtRef = useRef<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isConnected) {
      lostAtRef.current = null;
      setShowOverlay(false);
      setLastSeenAt(new Date());
      return;
    }

    // Connection just dropped — record when
    if (lostAtRef.current === null) {
      lostAtRef.current = Date.now();
    }

    // Wait the grace period before showing overlay
    const remaining = GRACE_PERIOD_MS - (Date.now() - lostAtRef.current);
    const delay = Math.max(0, remaining);
    const timer = setTimeout(() => {
      setShowOverlay(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [isConnected]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetch("/api/indi/connect", { method: "POST" });
    } catch {
      // Ignore — the health-check loop in page.tsx will pick up the result
    } finally {
      // Give the health check a moment to respond before resetting spinner
      setTimeout(() => setIsRetrying(false), 2000);
    }
  };

  if (!mounted || !showOverlay) return null;

  const formattedLastSeen = lastSeenAt
    ? lastSeenAt.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return createPortal(
    <>
      {/* Backdrop — pointer-events none so the UI behind stays interactive */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8000,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          background: "rgba(3, 5, 9, 0.55)",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      />

      {/* Central panel — pointer-events auto so it's clickable */}
      <div
        role="alertdialog"
        aria-modal="false"
        aria-label="Connexion INDI perdue"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none", // let clicks fall through around the panel
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            padding: "36px 44px",
            borderRadius: "16px",
            background: "rgba(8, 12, 22, 0.97)",
            border: "1px solid rgba(248, 113, 113, 0.35)",
            boxShadow:
              "0 0 60px rgba(248,113,113,0.15), 0 24px 80px rgba(0,0,0,0.6), inset 0 0 80px rgba(248,113,113,0.03)",
            maxWidth: 380,
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(248, 113, 113, 0.12)",
              border: "1px solid rgba(248, 113, 113, 0.4)",
              boxShadow: "0 0 24px rgba(248,113,113,0.2)",
            }}
          >
            <WifiOff size={24} color="#f87171" />
          </div>

          {/* Title */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#f87171",
                fontFamily: "var(--font-hud, monospace)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Connexion INDI perdue
            </span>

            {formattedLastSeen && (
              <span
                style={{
                  fontSize: "11px",
                  color: "rgba(226,232,240,0.45)",
                  fontFamily: "var(--font-hud, monospace)",
                }}
              >
                Dernière connexion : {formattedLastSeen}
              </span>
            )}
          </div>

          {/* Auto-reconnect status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              borderRadius: "6px",
              background: "rgba(251, 191, 36, 0.07)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
            }}
          >
            <RefreshCw
              size={12}
              color="#fbbf24"
              style={{ animation: "spin 1.4s linear infinite", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: "11px",
                color: "#fbbf24",
                fontFamily: "var(--font-hud, monospace)",
              }}
            >
              Reconnexion en cours…
            </span>
          </div>

          {/* Manual retry */}
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              padding: "10px 24px",
              borderRadius: "8px",
              border: "1px solid rgba(45, 212, 191, 0.45)",
              background: "rgba(45, 212, 191, 0.1)",
              color: "#2dd4bf",
              fontSize: "12px",
              cursor: isRetrying ? "not-allowed" : "pointer",
              opacity: isRetrying ? 0.5 : 1,
              fontFamily: "var(--font-hud, monospace)",
              letterSpacing: "0.08em",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isRetrying) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(45, 212, 191, 0.2)";
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "rgba(45, 212, 191, 0.7)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(45, 212, 191, 0.1)";
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "rgba(45, 212, 191, 0.45)";
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: isRetrying ? "spin 1s linear infinite" : "none",
              }}
            />
            Réessayer maintenant
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>,
    document.body
  );
}
