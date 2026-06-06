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
