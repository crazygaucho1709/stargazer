/**
 * Absolute URL for Next.js API routes from the browser.
 * Uses NEXT_PUBLIC_STARGAZER_ORIGIN when set (reverse proxy / tunnel), otherwise
 * the current page origin so LAN hostnames (e.g. http://macmini.local:3000) resolve correctly.
 */
export function clientApiUrl(path: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (typeof window === "undefined") {
        return normalized;
    }
    const fromEnv =
        typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_STARGAZER_ORIGIN?.replace(/\/$/, "");
    if (fromEnv) {
        return `${fromEnv}${normalized}`;
    }
    return `${window.location.origin}${normalized}`;
}
