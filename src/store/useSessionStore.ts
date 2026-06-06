import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionConfig {
  profile: string;
  weather_station: string;
  battery_level: number;
  ekos_status: string;
  gemini_api_key: string;
  last_session_date: string;
  custom_settings: Record<string, unknown>;
}

interface SessionState {
  config: SessionConfig;
  updateConfig: (updates: Partial<SessionConfig>) => void;
  resetConfig: () => void;
}

const DEFAULT_CONFIG: SessionConfig = {
  profile: 'Nexstar4SE',
  weather_station: '',
  battery_level: 0,
  ekos_status: 'STOPPED',
  gemini_api_key: '',
  last_session_date: new Date().toISOString().split('T')[0],
  custom_settings: {},
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      updateConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),
      resetConfig: () =>
        set({
          config: DEFAULT_CONFIG,
        }),
    }),
    {
      name: 'stargazer-session-storage',
      partialize: (state) => ({ config: state.config }),
    }
  )
);