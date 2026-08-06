// src/hooks/useSSE.ts
"use client";

/**
 * useSSE — hook SSE robuste avec reconnexion exponentielle, ping/pong latency,
 * et notification utilisateur en cas d'instabilité prolongée.
 *
 * Remplace tout usage de `new EventSource()` nu dans les hooks.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { notification } from "@/lib/notificationService";

export interface SSEOptions<T> {
  url: string;
  onMessage: (data: T) => void;
  onError?: (e: Event) => void;
  enabled?: boolean;          // default true
  reconnectDelay?: number;    // ms, default 2000
  maxReconnectDelay?: number; // ms, default 30000
  parseJson?: boolean;        // default true
}

export interface SSEState {
  isConnected: boolean;
  reconnectCount: number;
  latencyMs: number | null;
}

const PING_INTERVAL_MS = 10_000;
const UNSTABLE_THRESHOLD = 5;

export function useSSE<T = unknown>(options: SSEOptions<T>): SSEState {
  const {
    url,
    onMessage,
    onError,
    enabled = true,
    reconnectDelay = 2_000,
    maxReconnectDelay = 30_000,
    parseJson = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectCountRef = useRef(0);
  const pendingPingRef = useRef<number | null>(null); // timestamp of last ping
  const warnedRef = useRef(false);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current || esRef.current) return;

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);

      // Reset backoff on successful connection
      reconnectCountRef.current = 0;
      setReconnectCount(0);
      warnedRef.current = false;

      // Start ping loop
      clearInterval(pingTimerRef.current!);
      pingTimerRef.current = setInterval(() => {
        // We can't send to an SSE stream from the client side;
        // instead we track time-since-last-message as a proxy.
        // If server supports a /ping endpoint, we fire a fetch and measure RTT.
        pendingPingRef.current = performance.now();
        fetch(url.replace(/\/stream.*$/, "/ping"), { method: "GET" })
          .then((r) => {
            if (r.ok && pendingPingRef.current !== null) {
              const rtt = Math.round(performance.now() - pendingPingRef.current);
              pendingPingRef.current = null;
              if (mountedRef.current) setLatencyMs(rtt);
            }
          })
          .catch(() => {
            pendingPingRef.current = null;
          });
      }, PING_INTERVAL_MS);
    };

    es.onmessage = (evt: MessageEvent) => {
      if (!mountedRef.current) return;

      // Handle pong messages (server may push them)
      if (evt.data === "pong" && pendingPingRef.current !== null) {
        const rtt = Math.round(performance.now() - pendingPingRef.current);
        pendingPingRef.current = null;
        setLatencyMs(rtt);
        return;
      }

      let parsed: T;
      if (parseJson) {
        try {
          parsed = JSON.parse(evt.data) as T;
        } catch {
          // Silently skip malformed frames
          return;
        }
      } else {
        parsed = evt.data as unknown as T;
      }
      onMessage(parsed);
    };

    es.onerror = (e: Event) => {
      if (!mountedRef.current) return;

      es.close();
      esRef.current = null;
      clearInterval(pingTimerRef.current!);
      pingTimerRef.current = null;
      setIsConnected(false);
      setLatencyMs(null);
      pendingPingRef.current = null;

      onError?.(e);

      reconnectCountRef.current += 1;
      setReconnectCount(reconnectCountRef.current);

      if (
        reconnectCountRef.current >= UNSTABLE_THRESHOLD &&
        !warnedRef.current
      ) {
        warnedRef.current = true;
        notification.warning("Flux SSE instable", {
          source: "SSE",
          description: url,
        });
      }

      // Exponential backoff: delay = min(reconnectDelay * 2^n, maxReconnectDelay)
      const delay = Math.min(
        reconnectDelay * Math.pow(2, reconnectCountRef.current - 1),
        maxReconnectDelay
      );

      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [url, onMessage, onError, parseJson, reconnectDelay, maxReconnectDelay, clearTimers]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      return;
    }

    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      clearTimers();
      setIsConnected(false);
      setLatencyMs(null);
    };
  }, [url, enabled, connect, clearTimers]);

  return { isConnected, reconnectCount, latencyMs };
}
