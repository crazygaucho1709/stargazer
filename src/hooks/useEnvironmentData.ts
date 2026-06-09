import { useState, useEffect } from "react";

interface WeatherData {
    temperature: number;
    windSpeed: number;
    humidity: number;
    description: string;
}

interface EnvData {
    latitude: number | null;
    longitude: number | null;
    time: string;
    date: string;
    weather: WeatherData | null;
    error: string | null;
}

export function useEnvironmentData() {
    const [data, setData] = useState<EnvData>({
        latitude: null,
        longitude: null,
        time: "",
        date: "",
        weather: null,
        error: null,
    });

    // Handle Time
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setData(prev => ({
                ...prev,
                time: now.toLocaleTimeString("en-US", { hour12: false }),
                date: now.toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: '2-digit' })
            }));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    // Handle Hardware GPS & Weather
    useEffect(() => {
        const fetchWeather = async (lat: number, lon: number) => {
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`);
                const json = await res.json();
                
                if (json.current) {
                    setData(prev => ({
                        ...prev,
                        weather: {
                            temperature: json.current.temperature_2m,
                            humidity: json.current.relative_humidity_2m,
                            windSpeed: json.current.wind_speed_10m,
                            description: getWeatherDescription(json.current.weather_code)
                        }
                    }));
                }
            } catch (err) {
                console.error("Failed to fetch weather", err);
            }
        };

        const syncWithHardware = async () => {
            try {
                const res = await fetch('/api/indi');
                if (!res.ok) throw new Error("Backend offline");
                const status = await res.json();
                
                // If hardware has GPS (lat/lon not 0), use it
                if (status.lat !== undefined && status.lon !== undefined && (status.lat !== 0 || status.lon !== 0)) {
                    setData(prev => ({ ...prev, latitude: status.lat, longitude: status.lon, error: null }));
                    fetchWeather(status.lat, status.lon);
                    return true;
                }
            } catch (e) {
                console.warn("Hardware GPS sync failed, falling back to browser/defaults", e);
            }
            return false;
        };

        const startBrowserGeolocation = () => {
            if (!window.isSecureContext || !navigator.geolocation) {
                applyDefaultFallback();
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setData(prev => ({ ...prev, latitude, longitude, error: null }));
                    fetchWeather(latitude, longitude);
                },
                () => applyDefaultFallback(),
                { timeout: 5000, maximumAge: 60000 }
            );
        };

        const applyDefaultFallback = () => {
            // Default to Tahiti (Puna'auia) as per user's location
            const defLat = -17.6333;
            const defLon = -149.6000;
            setData(prev => ({ ...prev, latitude: defLat, longitude: defLon, error: "Using default location" }));
            fetchWeather(defLat, defLon);
        };

        const init = async () => {
            // Apply default fallback immediately so GPS is never "ACQUISITION..."
            applyDefaultFallback();
            // Then try to override with better sources
            const synced = await syncWithHardware();
            if (!synced) {
                startBrowserGeolocation();
            }
        };

        init();
        
        // Re-sync with hardware every minute in case GPS fix is acquired later
        const interval = setInterval(syncWithHardware, 60000);
        return () => clearInterval(interval);
    }, []);

    return data;
}

// WMO Weather interpretation codes (https://open-meteo.com/en/docs)
function getWeatherDescription(code: number): string {
    if (code === 0) return "CLEAR SKY";
    if (code === 1 || code === 2 || code === 3) return "PARTLY CLOUDY";
    if (code === 45 || code === 48) return "FOG";
    if (code >= 51 && code <= 57) return "DRIZZLE";
    if (code >= 61 && code <= 67) return "RAIN";
    if (code >= 71 && code <= 77) return "SNOW";
    if (code >= 80 && code <= 82) return "RAIN SHOWERS";
    if (code >= 95 && code <= 99) return "THUNDERSTORM";
    return "UNKNOWN";
}
