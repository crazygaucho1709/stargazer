/**
 * Returns a URL for Next.js API routes from the browser.
 * Uses NEXT_PUBLIC_STARGAZER_ORIGIN only when set (reverse proxy / tunnel).
 * Defaults to relative URLs to avoid CORS issues with LAN hostname mismatches.
 */
export function clientApiUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const fromEnv =
        typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_STARGAZER_ORIGIN?.replace(/\/$/, "");
    if (fromEnv) {
        return `${fromEnv}${normalized}`;
    }
    return normalized;
}

/**
 * Returns the FastAPI backend URL accessible directly from the browser.
 * Bypasses the Next.js proxy entirely — critical for low-latency MJPEG streaming.
 *
 * Priority:
 *  1. NEXT_PUBLIC_BACKEND_URL env var (explicit override)
 *  2. Same hostname as the app + port 5005 (works for any LAN client)
 *  3. localhost:5005 fallback (SSR / CI)
 */
export function getClientBridgeUrl(): string {
    const fromEnv =
        typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "");
    if (fromEnv) return fromEnv;

    if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.hostname}:5005`;
    }
    return "http://127.0.0.1:5005";
}
