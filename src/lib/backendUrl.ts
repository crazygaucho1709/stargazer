/**
 * Backend URL - utilise NEXT_PUBLIC_BACKEND_URL ou 127.0.0.1:5005 par défaut
 */
const getBackendUrl = (): string => {
    return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:5005';
};

export const BRIDGE_URL = getBackendUrl();
export default BRIDGE_URL;