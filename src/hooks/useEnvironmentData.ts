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

    // Handle GPS & Weather
    useEffect(() => {
        if (!navigator.geolocation) {
            setData(prev => ({ ...prev, error: "Geolocation not supported" }));
            return;
        }

        const fetchWeather = async (lat: number, lon: number) => {
            try {
                // Open-Meteo free API
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

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setData(prev => ({ ...prev, latitude, longitude }));
                fetchWeather(latitude, longitude);
            },
            (err) => {
                setData(prev => ({ ...prev, error: err.message }));
                // Fallback to a default location (e.g. Paris) to still show API functionality
                const defLat = 48.8566;
                const defLon = 2.3522;
                setData(prev => ({ ...prev, latitude: defLat, longitude: defLon }));
                fetchWeather(defLat, defLon);
            }
        );
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
