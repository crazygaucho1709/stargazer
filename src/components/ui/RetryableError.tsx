// src/components/ui/RetryableError.tsx
"use client";

import { AlertTriangle, WifiOff, RefreshCw } from "lucide-react";

export interface RetryableErrorProps {
  title: string;
  description?: string;
  onRetry: () => void;
  isRetrying?: boolean;
  retryLabel?: string;
  variant?: "inline" | "panel" | "fullscreen";
  icon?: "alert" | "wifi";
}

export function RetryableError({
  title,
  description,
  onRetry,
  isRetrying = false,
  retryLabel = "Réessayer",
  variant = "panel",
  icon = "alert",
}: RetryableErrorProps) {
  const Icon = icon === "wifi" ? WifiOff : AlertTriangle;

  if (variant === "inline") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 12px",
          borderRadius: "6px",
          background: "rgba(248, 113, 113, 0.08)",
          border: "1px solid rgba(248, 113, 113, 0.3)",
        }}
      >
        <Icon size={14} color="#f87171" style={{ flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            fontSize: "12px",
            color: "#f87171",
            fontFamily: "var(--font-hud, monospace)",
          }}
        >
          {title}
          {description && (
            <span style={{ opacity: 0.7, marginLeft: 6 }}>{description}</span>
          )}
        </span>
        <button
          onClick={onRetry}
          disabled={isRetrying}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            padding: "4px 10px",
            borderRadius: "4px",
            border: "1px solid rgba(45, 212, 191, 0.4)",
            background: "rgba(45, 212, 191, 0.08)",
            color: "#2dd4bf",
            fontSize: "11px",
            cursor: isRetrying ? "not-allowed" : "pointer",
            opacity: isRetrying ? 0.5 : 1,
            flexShrink: 0,
            fontFamily: "var(--font-hud, monospace)",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isRetrying) {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(45, 212, 191, 0.16)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(45, 212, 191, 0.08)";
          }}
        >
          <RefreshCw
            size={10}
            style={{
              animation: isRetrying ? "spin 1s linear infinite" : "none",
            }}
          />
          {retryLabel}
        </button>
      </div>
    );
  }

  if (variant === "fullscreen") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(3, 5, 9, 0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <ErrorCard
          Icon={Icon}
          title={title}
          description={description}
          onRetry={onRetry}
          isRetrying={isRetrying}
          retryLabel={retryLabel}
          accentColor="#f87171"
        />
      </div>
    );
  }

  // panel (default)
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        padding: "24px",
      }}
    >
      <ErrorCard
        Icon={Icon}
        title={title}
        description={description}
        onRetry={onRetry}
        isRetrying={isRetrying}
        retryLabel={retryLabel}
        accentColor="#f87171"
      />
    </div>
  );
}

// ── Internal card shared by panel + fullscreen ────────────────────────────────

function ErrorCard({
  Icon,
  title,
  description,
  onRetry,
  isRetrying,
  retryLabel,
  accentColor,
}: {
  Icon: React.ElementType;
  title: string;
  description?: string;
  onRetry: () => void;
  isRetrying: boolean;
  retryLabel: string;
  accentColor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        padding: "32px 40px",
        borderRadius: "12px",
        background: "rgba(10, 15, 25, 0.95)",
        border: `1px solid ${accentColor}44`,
        boxShadow: `0 0 40px ${accentColor}22, inset 0 0 60px rgba(248,113,113,0.03)`,
        maxWidth: 360,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${accentColor}18`,
          border: `1px solid ${accentColor}44`,
        }}
      >
        <Icon size={22} color={accentColor} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#e2e8f0",
            fontFamily: "var(--font-hud, monospace)",
            letterSpacing: "0.05em",
          }}
        >
          {title}
        </span>
        {description && (
          <span
            style={{
              fontSize: "12px",
              color: "rgba(226,232,240,0.5)",
              lineHeight: 1.5,
            }}
          >
            {description}
          </span>
        )}
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 20px",
          borderRadius: "6px",
          border: "1px solid rgba(45, 212, 191, 0.4)",
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
            "rgba(45, 212, 191, 0.4)";
        }}
      >
        <RefreshCw
          size={12}
          style={{
            animation: isRetrying ? "spin 1s linear infinite" : "none",
          }}
        />
        {isRetrying ? "Reconnexion…" : retryLabel}
      </button>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
