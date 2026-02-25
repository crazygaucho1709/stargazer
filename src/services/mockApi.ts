// src/services/mockApi.ts
import { useStargazerStore } from "@/store/useStargazerStore";

export const mockApi = {
    ping: async (): Promise<boolean> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(Math.random() > 0.1); // 90% chance of success
            }, 500);
        });
    },

    slew: async (ra: string, dec: string): Promise<void> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 2000);
        });
    },

    capture: async (iso: number, exposure: number): Promise<string> => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve("https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80");
            }, exposure * 100); // Simulated delay
        });
    },
};
