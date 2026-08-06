// src/components/ui/ReconnectBanner.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useStargazerStore } from "@/store/useStargazerStore";
import { useAutoReconnect, ReconnectState } from "@/hooks/useAutoReconnect";

interface ReconnectBannerProps {
  reconnectState: ReconnectState;
  onRetryNow: () => void;
}

function BannerContent({ reconnectState, onRetryNow }: ReconnectBannerProps) {
  const { isConnected } = useStargazerStore();
  const [dismissed, setDismissed] = useState(false);

  // Re-show banner whenever we lose connection
  useEffect(() => {
    if (!isConnected) setDismissed(false);
  }, [isConnected]);

  if (isConnected || dismissed) return null;

  const { attempt, nextRetryIn, isReconnecting, lastError } = reconnectState;

  const countdownText = isReconnecting
    ? "Connexion en cours…"
    : nextRetryIn > 0
    ? `dans ${nextRetryIn}s`
    : "maintenant…";

  const attemptLabel = `Tentative ${attempt + (isReconnecting ? 1 : 0)}/∞`;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(90deg, rgba(220,38,38,0.95) 0%, rgba(180,83,9,0.95) 100%)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 20px",
        minHeight: "42px",
        fontFamily: "var(--font-hud, monospace)",
        boxShadow: "0 2px 24px rgba(220,38,38,0.4)",
        gap: "12px",
      }}
    >
      {/* Left: icon + message */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "16px", flexShrink: 0 }}>⚡</span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Connexion INDI perdue — {attemptLabel} {countdownText}
        </span>
        {lastError && (
          <span
            style={{
              fontSize: "9px",
              color: "rgba(255,255,255,0.65)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "280px",
            }}
          >
            {lastError}
          </span>
        )}
      </div>

      {/* Progress bar for countdown */}
      {!isReconnecting && nextRetryIn > 0 && (
        <div
          style={{
            width: "80px",
            height: "3px",
            background: "rgba(255,255,255,0.2)",
            borderRadius: "2px",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: "100%",
              background: "rgba(255,255,255,0.8)",
              borderRadius: "2px",
              width: `${(nextRetryIn / 60) * 100}%`,
              transition: "width 1s linear",
            }}
          />
        </div>
      )}

      {/* Spinner when reconnecting */}
      {isReconnecting && (
        <div
          aria-hidden
          style={{
            width: "14px",
            height: "14px",
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            flexShrink: 0,
            animation: "spin 0.8s linear infinite",
          }}
        />
      )}

      {/* Retry now button */}
      <button
        onClick={onRetryNow}
        disabled={isReconnecting}
        style={{
          fontSize: "10px",
          fontWeight: 700,
          color: isReconnecting ? "rgba(255,255,255,0.4)" : "#fff",
          background: isReconnecting ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "4px",
          padding: "3px 10px",
          cursor: isReconnecting ? "not-allowed" : "pointer",
          letterSpacing: "0.05em",
          whiteSpace: "nowrap",
          flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        Réessayer maintenant
      </button>

      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Masquer la bannière"
        style={{
          fontSize: "14px",
          color: "rgba(255,255,255,0.6)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          lineHeight: 1,
          padding: "2px 4px",
          flexShrink: 0,
        }}
      >
        ×
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export function ReconnectBanner() {
  const reconnectState = useAutoReconnect();
  const { setConnected } = useStargazerStore();
  const [mounted, setMounted] = useState(false);
  const retryInProgressRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRetryNow = useCallback(async () => {
    if (retryInProgressRef.current || reconnectState.isReconnecting) return;
    retryInProgressRef.current = true;
    try {
      const res = await fetch("/api/indi/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconnect" }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        const healthRes = await fetch("/api/indi?endpoint=health", { cache: "no-store" });
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          const isOk = Array.isArray(healthData) && healthData[0]?.status === "True";
          if (isOk) setConnected(true);
        }
      }
    } finally {
      retryInProgressRef.current = false;
    }
  }, [reconnectState.isReconnecting, setConnected]);

  if (!mounted) return null;

  return createPortal(
    <BannerContent reconnectState={reconnectState} onRetryNow={handleRetryNow} />,
    document.body
  );
}
