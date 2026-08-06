// src/hooks/useSessionLogger.ts
import { useEffect, useRef } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";

const STORAGE_KEY = "stargazer_session_log";
const MAX_ENTRIES = 500;

export interface SessionEntry {
    timestamp: string;
    ra: number;
    dec: number;
    targetName: string;
    hfr: number | null;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function parseRaHms(ra: string): number {
    // "05h 35m 17s" → decimal degrees
    const m = ra.match(/(\d+)h\s*(\d+)m\s*([\d.]+)s/);
    if (!m) return NaN;
    const hours = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
    return hours * 15;
}

function parseDecDms(dec: string): number {
    // "-05° 23' 28\"" → decimal degrees
    const m = dec.match(/([+-]?\d+)[°\s]\s*(\d+)['\s]\s*([\d.]+)/);
    if (!m) return NaN;
    const sign = dec.trim().startsWith("-") ? -1 : 1;
    return sign * (Math.abs(parseFloat(m[1])) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600);
}

export function getSessionLog(): SessionEntry[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
        return [];
    }
}

export function clearSessionLog(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
}

function appendEntry(entry: SessionEntry): void {
    const log = getSessionLog();
    log.push(entry);
    // FIFO: keep last MAX_ENTRIES
    if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Call once in page.tsx.
 * Watches ra/dec in the store; whenever the GoTo completes (sessionState
 * transitions from SLEWING → TRACKING) it appends an entry to localStorage.
 */
export function useSessionLogger(): void {
    const prevStateRef = useRef<string>("");
    const raRef = useRef<string>("");
    const decRef = useRef<string>("");
    const hfrRef = useRef<number | null>(null);
    const targetNameRef = useRef<string>("Unknown");

    useEffect(() => {
        const unsub = useStargazerStore.subscribe((state) => {
            const { sessionState, ra, dec, hfr, targets, selectedObjectId } = state;

            // Track current coords
            raRef.current = ra;
            decRef.current = dec;
            hfrRef.current = hfr;

            // Resolve target name from store
            if (selectedObjectId) {
                const found = targets.find((t) => t.id === selectedObjectId);
                if (found) targetNameRef.current = found.name;
            }

            // Detect SLEWING → TRACKING transition (GoTo completed)
            const prev = prevStateRef.current;
            if (prev === "SLEWING" && sessionState === "TRACKING") {
                const raDeg = parseRaHms(raRef.current);
                const decDeg = parseDecDms(decRef.current);
                if (!isNaN(raDeg) && !isNaN(decDeg)) {
                    appendEntry({
                        timestamp: new Date().toISOString(),
                        ra: raDeg,
                        dec: decDeg,
                        targetName: targetNameRef.current,
                        hfr: hfrRef.current,
                    });
                }
            }

            prevStateRef.current = sessionState;
        });

        return unsub;
    }, []);
}
