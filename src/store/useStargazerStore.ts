// src/store/useStargazerStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SessionState, SessionEvent, transitionState, canTransition } from "@/lib/sessionMachine";
import { ObservatoryState, ObservatoryEvent, SubsystemHealth, SubsystemId, createSubsystems, canObservatoryTransition, obsTransition } from "@/lib/observatoryMachine";

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
    sessionState: SessionState;
    observatoryState: ObservatoryState;
    subsystems: Record<SubsystemId, SubsystemHealth>;
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
    detectedCcd: string;
    detectedMount: string;
    selectedObjectId: string | null;

    setLanguage: (lang: "en" | "fr") => void;
    setConnected: (status: boolean) => void;
    sendSessionEvent: (event: SessionEvent) => void;
    sendObservatoryEvent: (event: ObservatoryEvent) => void;
    updateSubsystem: (id: SubsystemId, health: Partial<SubsystemHealth>) => void;
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
    setDetectedDevices: (ccd: string, mount: string) => void;
    setSelectedObjectId: (id: string | null) => void;

    // Legacy compat — derived from sessionState
    isSlewing: boolean;
    isExposing: boolean;
    setSlewing: (status: boolean) => void;
    setExposing: (status: boolean) => void;
}

const SESSION_SLEWING: SessionState[] = ["SLEWING", "UNPARKING", "STOPPING"];
const SESSION_CAPTURING: SessionState[] = ["CAPTURING", "STACKING"];

export const useStargazerStore = create<StargazerState>()(
    persist(
        (set, get) => ({
            language: "en",
            isConnected: false,
            sessionState: "IDLE" as SessionState,
            observatoryState: "OFFLINE" as ObservatoryState,
            subsystems: createSubsystems(),
            ra: "05h 35m 17s",
            dec: "-05° 23' 28\"",
            alt: 45.2,
            az: 180.5,
            zoom: 1,
            liveViewMode: "NASA",
            config: {
                aiKey: "",
                astroberryUrl: "http://macmini.local:5005",
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
                exposureTime: 3,
                isoGain: "800",
                frameCount: 30,
                dithering: true,
                liveStacking: true,
                aiColorization: true,
                autoSave: true,
                unitSystem: "METRIC",
                latitude: "-17.6333",
                longitude: "-149.6000",
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
            detectedCcd: "Canon DSLR EOS 600D", // Default
            detectedMount: "Celestron GPS", // Default
            selectedObjectId: null,
            targets: [
                { id: "1", name: "M42 - Orion Nebula", type: "Nebula", ra: "05h 35m", dec: "-05° 23'" },
                { id: "2", name: "M31 - Andromeda Galaxy", type: "Galaxy", ra: "00h 42m", dec: "+41° 16'" },
                { id: "3", name: "M45 - Pleiades", type: "Star Cluster", ra: "03h 47m", dec: "+24° 07'" },
                { id: "4", name: "M51 - Whirlpool Galaxy", type: "Galaxy", ra: "13h 29m", dec: "+47° 11'" },
            ],

            // Legacy compat (computed)
            get isSlewing() { return SESSION_SLEWING.includes(get().sessionState); },
            get isExposing() { return SESSION_CAPTURING.includes(get().sessionState); },
            setSlewing: (status: boolean) => {
                const state = get().sessionState;
                if (status && state === "IDLE") set({ sessionState: "SLEWING" });
                else if (!status && SESSION_SLEWING.includes(state)) set({ sessionState: "TRACKING" });
            },
            setExposing: (status: boolean) => {
                const state = get().sessionState;
                if (status && state === "TRACKING") set({ sessionState: "CAPTURING" });
                else if (!status && SESSION_CAPTURING.includes(state)) set({ sessionState: "TRACKING" });
            },

            setLanguage: (language) => set({ language }),
            setConnected: (status) => set({ isConnected: status }),
            sendSessionEvent: (event) => {
                const current = get().sessionState;
                if (canTransition(current, event)) {
                    set({ sessionState: transitionState(current, event) });
                }
            },
            sendObservatoryEvent: (event) => {
                const current = get().observatoryState;
                if (canObservatoryTransition(current, event)) {
                    set({ observatoryState: obsTransition(current, event) });
                }
            },
            updateSubsystem: (id, health) => {
                set((state) => ({
                    subsystems: {
                        ...state.subsystems,
                        [id]: { ...state.subsystems[id], ...health },
                    },
                }));
            },
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
            setDetectedDevices: (detectedCcd, detectedMount) => set({ detectedCcd, detectedMount }),
            setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId }),
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
                dec: state.dec,
                selectedObjectId: state.selectedObjectId
            })
        }
    )
);
