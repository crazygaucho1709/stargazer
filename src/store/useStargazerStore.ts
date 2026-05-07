// src/store/useStargazerStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Target {
    id: string;
    name: string;
    type: string;
    ra: string;
    dec: string;
}

interface Config {
    aiKey: string;
    astroberryUrl: string;
    driverInstance: string;
    baudRate: string;
    wifiSsid: string;
    autoTracking: boolean;
    slewSpeed: number;
    captureFormat: string;
    sensorCooling: boolean;
    aiFocus: boolean;
    showHfrOverlay: boolean;
    showAiFocusCorrections: boolean;
    exposureTime: number;
    isoGain: string;
    frameCount: number;
    dithering: boolean;
    liveStacking: boolean;
    aiColorization: boolean;
    autoSave: boolean;
    unitSystem: string;
    latitude: string;
    longitude: string;
}

interface MountLimits {
    maxAlt: number;
    minAlt: number;
    maxAz: number;
    minAz: number;
}

interface StargazerState {
    language: "en" | "fr";
    isConnected: boolean;
    isSlewing: boolean;
    isExposing: boolean;
    ra: string;
    dec: string;
    alt: number;
    az: number;
    zoom: number;
    targets: Target[];
    liveViewMode: "NASA" | "CANON";
    config: Config;
    mountLimits: MountLimits;
    captureProgress: number;
    stackingProgress: number;
    isLoading: boolean;
    hfr: number | null;
    isGlobalLoading: boolean;
    globalLoadingMessage: string;

    setLanguage: (lang: "en" | "fr") => void;
    setConnected: (status: boolean) => void;
    setSlewing: (status: boolean) => void;
    setExposing: (status: boolean) => void;
    setCaptureProgress: (progress: number) => void;
    setStackingProgress: (progress: number) => void;
    setIsLoading: (status: boolean) => void;
    setHfr: (hfr: number | null) => void;
    setGlobalLoading: (isLoading: boolean, message?: string) => void;
    setPosition: (ra: string, dec: string, alt?: number, az?: number) => void;
    setZoom: (zoom: number) => void;
    addTarget: (target: Target) => void;
    setLiveViewMode: (mode: "NASA" | "CANON") => void;
    updateConfig: (config: Partial<Config>) => void;
    setMountLimits: (limits: Partial<MountLimits>) => void;
}

export const useStargazerStore = create<StargazerState>()(
    persist(
        (set) => ({
            language: "en",
            isConnected: false,
            isSlewing: false,
            isExposing: false,
            ra: "05h 35m 17s",
            dec: "-05° 23' 28\"",
            alt: 45.2,
            az: 180.5,
            zoom: 1,
            liveViewMode: "NASA",
            config: {
                aiKey: "",
                astroberryUrl: "http://192.168.178.91:5005",
                driverInstance: "Celestron GPS",
                baudRate: "9600",
                wifiSsid: "Stargazer_Net",
                autoTracking: true,
                slewSpeed: 5,
                captureFormat: "RAW",
                sensorCooling: true,
                aiFocus: true,
                showHfrOverlay: true,
                showAiFocusCorrections: true,
                exposureTime: 120,
                isoGain: "800",
                frameCount: 30,
                dithering: true,
                liveStacking: true,
                aiColorization: true,
                autoSave: true,
                unitSystem: "METRIC",
                latitude: "-17.6008",
                longitude: "-149.6091",
            },
            mountLimits: {
                maxAlt: 85,
                minAlt: 15,
                maxAz: 360,
                minAz: 0,
            },
            captureProgress: 0,
            stackingProgress: 0,
            isLoading: false,
            hfr: null,
            isGlobalLoading: false,
            globalLoadingMessage: "",
            targets: [
                { id: "1", name: "M42 - Orion Nebula", type: "Nebula", ra: "05h 35m", dec: "-05° 23'" },
                { id: "2", name: "M31 - Andromeda Galaxy", type: "Galaxy", ra: "00h 42m", dec: "+41° 16'" },
                { id: "3", name: "M45 - Pleiades", type: "Star Cluster", ra: "03h 47m", dec: "+24° 07'" },
                { id: "4", name: "M51 - Whirlpool Galaxy", type: "Galaxy", ra: "13h 29m", dec: "+47° 11'" },
            ],

            setLanguage: (language) => set({ language }),
            setConnected: (status) => set({ isConnected: status }),
            setSlewing: (status) => set({ isSlewing: status }),
            setExposing: (status) => set({ isExposing: status }),
            setCaptureProgress: (captureProgress) => set({ captureProgress }),
            setStackingProgress: (stackingProgress) => set({ stackingProgress }),
            setIsLoading: (status) => set({ isLoading: status }),
            setHfr: (hfr) => set({ hfr }),
            setGlobalLoading: (isGlobalLoading, globalLoadingMessage = "") => 
                set({ isGlobalLoading, globalLoadingMessage }),
            setPosition: (ra, dec, alt, az) => set((state) => ({ 
                ra, dec, 
                alt: alt ?? state.alt, 
                az: az ?? state.az 
            })),
            setZoom: (zoom) => set({ zoom }),
            addTarget: (target) => set((state) => ({ targets: [...state.targets, target] })),
            setLiveViewMode: (mode) => set({ liveViewMode: mode }),
            updateConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),
            setMountLimits: (limits) => set((state) => ({ mountLimits: { ...state.mountLimits, ...limits } })),
        }),
        {
            name: 'stargazer-storage',
            partialize: (state) => ({
                language: state.language,
                config: state.config,
                mountLimits: state.mountLimits,
                liveViewMode: state.liveViewMode,
                zoom: state.zoom,
                alt: state.alt,
                az: state.az,
                ra: state.ra,
                dec: state.dec
            })
        }
    )
);
