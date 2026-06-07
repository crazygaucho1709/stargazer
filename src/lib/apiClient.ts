// src/lib/apiClient.ts
"use client";

import { clientApiUrl } from "./clientApi";
import { notification } from "./notificationService";

export interface ApiResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  silent?: boolean;
  label?: string;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY = 1000;

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const signal = options.signal
    ? combineSignals(options.signal, controller.signal)
    : controller.signal;

  try {
    const response = await fetch(url, { ...options, signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); return controller.signal; }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function apiRequest<T = any>(
  path: string,
  opts: RequestOptions = {}
): Promise<ApiResult<T>> {
  const url = clientApiUrl(path);
  const maxRetries = opts.retries ?? MAX_RETRIES;
  const retryDelay = opts.retryDelay ?? BASE_RETRY_DELAY;
  const label = opts.label || path;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: opts.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...opts.headers,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        timeout: opts.timeout,
        signal: opts.signal,
      });

      const status = response.status;
      let data: any = null;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { text };
      }

      const hasFailedField = data && typeof data === "object" && data.success === false;
      if (!response.ok || hasFailedField) {
        const errorMsg = data?.error || data?.message || `HTTP ${status}`;
        if (!opts.silent) {
          notification.error(`${label} a échoué`, {
            description: errorMsg,
            source: "API",
          });
        }
        return { success: false, error: errorMsg, status };
      }

      return { success: true, data, status };
    } catch (err: any) {
      const isAbort = err?.name === "AbortError";
      const isNetwork = err?.message?.includes("fetch") || err?.message?.includes("NetworkError");
      const errorMsg = isAbort
        ? "La requête a expiré"
        : isNetwork
        ? "Connexion au serveur impossible"
        : err?.message || "Erreur inconnue";

      if (attempt < maxRetries && !isAbort) {
        await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
        continue;
      }

      if (!opts.silent) {
        const level = isNetwork ? "warning" : "error";
        notification[level](`${label} : ${errorMsg}`, {
          description: isNetwork ? "Vérifie que le serveur est allumé" : undefined,
          source: "API",
        });
      }

      return { success: false, error: errorMsg };
    }
  }

  return { success: false, error: "Tentatives épuisées" };
}

// Convenience wrappers
export const api = {
  get: <T = any>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T = any>(path: string, body?: any, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  put: <T = any>(path: string, body?: any, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  del: <T = any>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "DELETE" }),
};
