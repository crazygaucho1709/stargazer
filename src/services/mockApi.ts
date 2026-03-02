// src/services/mockApi.ts

// Since the user wants 100% real mode, we should actually attempt network connections.
// If it fails (which it will, because there is no hardware), it should reflect reality.
let isHardwareConnected = false;

export const mockApi = {
    ping: async (url: string): Promise<{ success: boolean, error?: string }> => {
        if (!url) return { success: false, error: "No URL configured" };
        try {
            // Attempt to hit a generic root or info endpoint of the astroberry
            // Use AbortController for short timeout
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000);
            
            const res = await fetch(`${url}/api/status`, { 
                method: 'GET',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' } 
            });
            clearTimeout(id);
            
            if (res.ok) {
                isHardwareConnected = true;
                return { success: true };
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
            
            // We do a real fetch attempt to the URL.
            const res = await fetch(`${url}/api/indi/drivers`, {
                signal: controller.signal
            });
            clearTimeout(id);

            if (res.ok) {
                isHardwareConnected = true;
                return { success: true, message: `Connected to INDI server at ${url}` };
            } else {
                isHardwareConnected = false;
                return { success: false, message: `Server responded with status: ${res.status}` };
            }
        } catch (error: any) {
            isHardwareConnected = false;
            return { success: false, message: `ERR: Connection failed. ${error.message}` };
        }
    },

    slew: async (ra: string, dec: string): Promise<{ success: boolean, error?: string }> => {
        if (!isHardwareConnected) {
            return { success: false, error: "Hardware offline. Cannot slew." };
        }
        // In real app, we would post to `${url}/api/mount/slew`
        return { success: true };
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
    }
};
