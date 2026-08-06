// src/hooks/useAiAuth.ts
"use client";

import { useEffect, useState } from "react";

export interface AiAuthStatus {
  claude: boolean;
  gemini: boolean;
  provider: "claude" | "gemini" | null;
  gemini_sa: string | null;
  loading: boolean;
}

const _defaultStatus: AiAuthStatus = { claude: false, gemini: false, provider: null, gemini_sa: null, loading: true };

const POLL_MS = 30_000;

export function useAiAuth(): AiAuthStatus {
  const [status, setStatus] = useState<AiAuthStatus>(_defaultStatus);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/ai/auth", {
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setStatus({ ...data, loading: false });
        } else {
          setStatus((s) => ({ ...s, loading: false }));
        }
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, loading: false }));
      }
    };

    check();
    const id = setInterval(check, POLL_MS);
    window.addEventListener("ai-auth-refresh", check);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("ai-auth-refresh", check);
    };
  }, []);

  return status;
}
