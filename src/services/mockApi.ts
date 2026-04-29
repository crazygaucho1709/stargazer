// src/services/mockApi.ts
import { useStargazerStore } from '@/store/useStargazerStore';

let isHardwareConnected = false;

const getBridgeIp = () => {
    return useStargazerStore.getState().config.astroberryUrl.replace('http://', '').replace(':8624', '');
};

export const mockApi = {
    ping: async (url: string, driver: string): Promise<{ success: boolean, error?: string }> => {
        if (!url) return { success: false, error: "No URL configured" };
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000);
            
            const apiUrl = `/api/indi?ip=${getBridgeIp()}`;
            
            const res = await fetch(apiUrl, { 
                method: 'GET',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' } 
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
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return { success: false, message: "ERR: Invalid URL format. Must start with http:// or https://" };
        }
        if (driver.trim() === '') {
            return { success: false, message: "ERR: Driver instance cannot be empty." };
        }
        
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            
            const apiUrl = `/api/indi?ip=${getBridgeIp()}`;
            
            const res = await fetch(apiUrl, {
                signal: controller.signal
            });
            clearTimeout(id);

            if (res.ok) {
                const data = await res.json();
                
                if (Array.isArray(data) && data.length > 0 && data[0].status === "True") {
                    isHardwareConnected = true;
                    return { success: true, message: `Connected to INDI server at ${url}` };
                } else {
                    isHardwareConnected = false;
                    return { success: false, message: `INDI server reachable, but driver is down.` };
                }
            } else {
                isHardwareConnected = false;
                return { success: false, message: `Server responded with status: ${res.status}` };
            }
        } catch (error: any) {
            isHardwareConnected = false;
            return { success: false, message: `ERR: Connection failed. ${error.message}` };
        }
    },

    slew: async (ra: string, dec: string, device: string = 'Celestron NexStar HC'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot slew." };
        }
        try {
            // Use Python bridge via proxy
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'slew',
                    device,
                    ip: getBridgeIp(),
                    ra: parseFloat(ra.split('h')[0]),
                    dec: parseFloat(dec.split('°')[0])
                })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    startMotion: async (direction: 'up' | 'down' | 'left' | 'right', device: string = 'Celestron NexStar HC'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot move." };
        }
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

    stopMotion: async (direction: 'up' | 'down' | 'left' | 'right', device: string = 'Celestron NexStar HC'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot move." };
        }
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

    // Legacy jog - for backward compatibility
    jog: async (direction: 'up' | 'down' | 'left' | 'right', device: string = 'Celestron NexStar HC'): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot move." };
        }
        try {
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'jog',
                    device,
                    direction,
                    duration: 0.5,
                    ip: getBridgeIp()
                })
            });
            const data = await res.json();
            return { success: data.success, error: data.error };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    setSlewRate: async (rate: number, device: string = 'Celestron NexStar HC'): Promise<{ success: boolean, error?: string, rate?: number }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot set slew rate.", rate: Math.max(1, Math.min(9, Math.round(rate))) };
        }
        // Clamp rate between 1 and 9
        const clampedRate = Math.max(1, Math.min(9, Math.round(rate)));
        try {
            // NOTE: the mount endpoint does not currently implement setting slew rate natively in route.ts
            // Sending it to 'jog' might not do what we want. We'll pass action 'rate' just in case we implement it in bridge later
            const res = await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'rate',
                    device,
                    rate: clampedRate,
                    ip: getBridgeIp()
                })
            });
            const data = await res.json();
            return { success: data.success, error: data.error, rate: clampedRate };
        } catch (err: any) {
            return { success: false, error: err.message, rate: clampedRate };
        }
    },

    getWeather: async (lat: number = 48.8566, lon: number = 2.3522): Promise<{
        success: boolean,
        temperature?: number,
        windSpeed?: number,
        humidity?: number,
        cloudCover?: number,
        seeing?: number,
        error?: string
    }> => {
        try {
            const res = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover`
            );
            const data = await res.json();
            
            if (data.current) {
                // Estimate seeing based on cloud cover and wind (simplified model)
                const seeing = Math.max(0.1, Math.min(2.0, 2.0 - (data.current.cloud_cover / 100) - (data.current.wind_speed_10m / 20)));
                
                return {
                    success: true,
                    temperature: data.current.temperature_2m,
                    windSpeed: data.current.wind_speed_10m,
                    humidity: data.current.relative_humidity_2m,
                    cloudCover: data.current.cloud_cover,
                    seeing: parseFloat(seeing.toFixed(2))
                };
            }
            return { success: false, error: "No weather data available" };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },

    capture: async (iso: number, exposure: number): Promise<{ success: boolean, data?: string, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot capture." };
        }
        return { success: true, data: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80" };
    },

    runAiFocus: async (): Promise<{ success: boolean, hfr?: number, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. No image stream available for focus." };
        }
        return { success: true, hfr: 1.2 + Math.random() * 0.5 };
    },

    syncLocation: async (lat: number, lon: number, device: string): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot sync location." };
        }
        try {
            // Check if lon is out of standard bounds or if the mount requires positive East longitude
            // Some telescope drivers require Longitude 0-360 instead of -180 to 180
            // Send both LAT/LONG and optionally ensure it's formatted to avoid float errors
            const formattedLat = parseFloat(lat.toFixed(4));
            let formattedLon = parseFloat(lon.toFixed(4));
            
            // If the user's mount requires positive longitude:
            if (formattedLon < 0) {
                formattedLon = formattedLon + 360;
            }

            const res = await fetch('/api/indi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'syncLocation',
                    device: device,
                    property: 'GEOGRAPHIC_COORD',
                    values: { LAT: formattedLat, LONG: formattedLon, ELEV: 0 },
                    ip: getBridgeIp()
                })
            });
            const json = await res.json();
            if (json.success) {
                return { success: true };
            }
            return { success: false, error: json.error || "Failed to update INDI location." };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
};
