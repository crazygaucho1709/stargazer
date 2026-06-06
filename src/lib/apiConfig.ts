/**
 * Configuration centralisée pour les URLs du backend
 * NEXT_PUBLIC_BACKEND_URL doit pointer vers le serveur Python (ex: http://macmini.local:5005)
 */
export function getBridgeUrl(): string {
    // Server-side: utilise la variable d'environnement
    if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL) {
        return process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, '');
    }
    // Par défaut: localhost (fonctionne en dev local)
    return 'http://127.0.0.1:5005';
}

// URL du backend Python (Next.js appelle ce backend, pas le navigateur)
export const BRIDGE_URL = getBridgeUrl();