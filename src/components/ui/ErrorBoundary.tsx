// src/components/ui/ErrorBoundary.tsx
"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  panel?: string;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const { panel, onError } = this.props;

    // Fire-and-forget remote log — no await, no throw
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        source: panel ?? "ErrorBoundary",
        message: error.message,
        stack: error.stack,
      }),
    }).catch(() => {
      // intentionally swallowed — logging must never cause a secondary crash
    });

    if (onError) {
      onError(error, info);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const { panel } = this.props;
      const error = this.state.error;

      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            minHeight: "120px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "24px",
            background: "#030509",
            border: "1px solid var(--astro-teal, #00F0FF)",
            borderRadius: "8px",
            boxSizing: "border-box",
          }}
        >
          <AlertTriangle size={32} color="#fc8181" strokeWidth={1.5} />

          {panel && (
            <p
              className="hud-font"
              style={{
                color: "var(--astro-teal, #00F0FF)",
                fontSize: "11px",
                fontWeight: "bold",
                letterSpacing: "0.15em",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              {panel}
            </p>
          )}

          <p
            className="hud-font"
            style={{ color: "#fc8181", fontSize: "13px", fontWeight: "bold", margin: 0 }}
          >
            ERREUR PANNEAU
          </p>

          <p
            style={{
              color: "#9ca3af",
              fontSize: "12px",
              margin: 0,
              textAlign: "center",
              maxWidth: "320px",
            }}
          >
            {error?.message || "Erreur inconnue"}
          </p>

          {error?.stack && (
            <details
              style={{
                width: "100%",
                maxWidth: "400px",
                fontSize: "10px",
                color: "#6b7280",
                fontFamily: "monospace",
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  color: "#6b7280",
                  userSelect: "none",
                  marginBottom: "4px",
                }}
              >
                Stack trace
              </summary>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "rgba(0,0,0,0.4)",
                  padding: "8px",
                  borderRadius: "4px",
                  maxHeight: "160px",
                  overflowY: "auto",
                }}
              >
                {error.stack}
              </pre>
            </details>
          )}

          <button
            onClick={this.handleReset}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#ffffff";
              (e.currentTarget as HTMLButtonElement).style.color = "#000000";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--astro-teal, #00F0FF)";
            }}
            style={{
              background: "transparent",
              color: "var(--astro-teal, #00F0FF)",
              border: "1px solid var(--astro-teal, #00F0FF)",
              borderRadius: "6px",
              padding: "6px 18px",
              fontSize: "11px",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "background 0.2s ease, color 0.2s ease",
              letterSpacing: "0.08em",
            }}
          >
            Recharger ce panneau
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
