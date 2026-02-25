// src/store/useStargazerStore.ts
import { create } from "zustand";

interface Target {
    id: string;
    name: string;
    type: string;
    ra: string;
    dec: string;
}

interface StargazerState {
    isConnected: boolean;
    isSlewing: boolean;
    isExposing: boolean;
    ra: string;
    dec: string;
    iso: number;
    exposure: number;
    targets: Target[];

    setConnected: (status: boolean) => void;
    setSlewing: (status: boolean) => void;
    setExposing: (status: boolean) => void;
    setPosition: (ra: string, dec: string) => void;
    setIso: (iso: number) => void;
    setExposure: (exposure: number) => void;
    addTarget: (target: Target) => void;
}

export const useStargazerStore = create<StargazerState>((set) => ({
    isConnected: false,
    isSlewing: false,
    isExposing: false,
    ra: "05h 35m 17s",
    dec: "-05° 23' 28\"",
    iso: 800,
    exposure: 30,
    targets: [
        { id: "1", name: "M42 - Orion Nebula", type: "Nebula", ra: "05h 35m", dec: "-05° 23'" },
        { id: "2", name: "M31 - Andromeda Galaxy", type: "Galaxy", ra: "00h 42m", dec: "+41° 16'" },
    ],

    setConnected: (status) => set({ isConnected: status }),
    setSlewing: (status) => set({ isSlewing: status }),
    setExposing: (status) => set({ isExposing: status }),
    setPosition: (ra, dec) => set({ ra, dec }),
    setIso: (iso) => set({ iso }),
    setExposure: (exposure) => set({ exposure }),
    addTarget: (target) => set((state) => ({ targets: [...state.targets, target] })),
}));
