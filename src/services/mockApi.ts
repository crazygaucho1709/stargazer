// src/services/mockApi.ts
import { useStargazerStore } from '@/store/useStargazerStore';

let isHardwareConnected = false;

const getBridgeIp = () => {
    return useStargazerStore.getState().config.astroberryUrl.includes('http') ? new URL(useStargazerStore.getState().config.astroberryUrl).hostname : useStargazerStore.getState().config.astroberryUrl.split(':')[0];
};

// Helper to parse "06h 23m" into decimal hours
const parseRA = (s: string) => {
    if (typeof s !== 'string') return s;
    const parts = s.match(/(\d+)h\s*(\d+)m/);
    if (parts) return parseInt(parts[1]) + parseInt(parts[2]) / 60;
    return parseFloat(s);
};

// Helper to parse "-52° 41'" into decimal degrees
const parseDec = (s: string) => {
    if (typeof s !== 'string') return s;
    const parts = s.match(/([+-]?\d+)°\s*(\d+)/);
    if (parts) {
        const deg = parseInt(parts[1]);
        const min = parseInt(parts[2]);
        return deg >= 0 ? deg + min / 60 : deg - min / 60;
    }
    return parseFloat(s);
};

export const mockApi = {
    ping: async (url: string, driver: string): Promise<{ success: boolean, error?: string }> => {
        if (!url) return { success: false, error: "No URL configured" };
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 10000); 
            
            const apiUrl = `/api/indi?ip=${getBridgeIp()}`;
            
            const res = await fetch(apiUrl, { 
                method: 'GET',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store'
            });
            clearTimeout(id);
            
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0 && data[0].status === "True") {
                    isHardwareConnected = true;
                    return { success: true };
                } else {
                    isHardwareConnected = false;
                    return { success: false, error: `INDI server reachable, but driver is down.` };
                }
            } else {
                isHardwareConnected = false;
                return { success: false, error: `HTTP Error: ${res.status}` };
            }
        } catch (err: any) {
            isHardwareConnected = false;
            return { success: false, error: err.message || "Connection refused" };
        }
    },

    testConnection: async (url: string, driver: string): Promise<{ success: boolean, message: string }> => {
        const res = await mockApi.ping(url, driver);
        if (res.success) {
            return { success: true, message: `Connected to INDI server at ${url}` };
        }
        return { success: false, message: res.error || "Connection failed" };
    },

    slew: async (ra: string, dec: string, device: string = 'Celestron GPS'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'slew',
                    device,
                    ip: getBridgeIp(),
                    ra: parseRA(ra),
                    dec: parseDec(dec)
                })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    sync: async (ra: string, dec: string, device: string = 'Celestron GPS'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'sync',
                    device,
                    ip: getBridgeIp(),
                    ra: parseRA(ra),
                    dec: parseDec(dec)
                })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    syncMaster: async (data: { lat: number, lon: number, elev?: number, alt: number, az: number }): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'sync_master',
                    ...data,
                    ip: getBridgeIp()
                })
            });
            const json = await res.json();
            return { success: json.success, error: json.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    startMotion: async (direction: 'up' | 'down' | 'left' | 'right', device: string = 'Celestron GPS'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'jog', device, direction, duration: 999, ip: getBridgeIp() })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    stopMotion: async (direction: 'up' | 'down' | 'left' | 'right', device: string = 'Celestron GPS'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'abort', device, direction, ip: getBridgeIp() })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    jog: async (direction: 'up' | 'down' | 'left' | 'right', device: string = 'Celestron GPS'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'jog', device, direction, duration: 0.5, ip: getBridgeIp() })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    setSlewRate: async (rate: number, device: string = 'Celestron GPS'): Promise<{ success: boolean, error?: string, rate?: number }> => {
        const clampedRate = Math.max(1, Math.min(9, Math.round(rate)));
        if (!isHardwareConnected) return { success: false, error: "Hardware offline.", rate: clampedRate };
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rate', device, rate: clampedRate, ip: getBridgeIp() })
            });
            const data = await res.json();
            return { success: data.success, error: data.error, rate: clampedRate };
        } catch (err: any) {
            return { success: false, error: err.message, rate: clampedRate };
        }
    },

    getConfig: async (): Promise<any> => {
        try {
            const res = await fetch(`/api/indi/config?ip=${getBridgeIp()}`);
            if (res.ok) return await res.json();
        } catch (e) { console.error("Config load error", e); }
        return {};
    },

    saveConfig: async (config: any): Promise<boolean> => {
        try {
            const res = await fetch(`/api/indi/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, ip: getBridgeIp() })
            });
            return res.ok;
        } catch (e) { console.error("Config save error", e); return false; }
    },

    getWeather: async (lat: number = 48.8566, lon: number = 2.3522): Promise<any> => {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover&daily=sunrise,sunset&timezone=auto`);
            const data = await res.json();
            if (data.current) {
                const seeing = Math.max(0.1, Math.min(2.0, 2.0 - (data.current.cloud_cover / 100) - (data.current.wind_speed_10m / 20)));
                return {
                    success: true,
                    temperature: data.current.temperature_2m,
                    windSpeed: data.current.wind_speed_10m,
                    humidity: data.current.relative_humidity_2m,
                    cloudCover: data.current.cloud_cover,
                    seeing: parseFloat(seeing.toFixed(2)),
                    sunrise: data.daily?.sunrise?.[0]?.split('T')[1],
                    sunset: data.daily?.sunset?.[0]?.split('T')[1]
                };
            }
        } catch (err: any) { return { success: false, error: err.message }; }
        return { success: false };
    },

    capture: async (iso: number, exposure: number): Promise<any> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        return { success: true, data: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80" };
    },

    runAiFocus: async (): Promise<any> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        return { success: true, hfr: 1.2 + Math.random() * 0.5 };
    },

    getStarPosition: async (ra: string, dec: string): Promise<{ success: boolean, alt?: number, az?: number, error?: string }> => {
        try {
            const { config } = useStargazerStore.getState();
            const res = await fetch('/api/indi/astro/coords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ra: parseRA(ra),
                    dec: parseDec(dec),
                    lat: parseFloat(config.latitude),
                    lon: parseFloat(config.longitude),
                    elev: 0
                })
            });
            return await res.json();
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    syncLocation: async (lat: number, lon: number, device: string): Promise<any> => {
        if (!isHardwareConnected) return { success: false, error: "Hardware offline." };
        try {
            const formattedLat = parseFloat(lat.toFixed(4));
            let formattedLon = parseFloat(lon.toFixed(4));
            if (formattedLon < 0) formattedLon += 360;

            const res = await fetch('/api/indi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'syncLocation',
                    device,
                    property: 'GEOGRAPHIC_COORD',
                    values: { LAT: formattedLat, LONG: formattedLon, ELEV: 0 },
                    ip: getBridgeIp()
                })
            });
            const json = await res.json();
            return { success: json.success, error: json.error };
        } catch (err: any) { return { success: false, error: err.message }; }
    }
};
