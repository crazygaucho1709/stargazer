// src/hooks/useCameraAutoDetect.ts
"use client";

import { useEffect, useRef } from "react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { notification } from "@/lib/notificationService";

interface IndiDevice {
    name: string;
    [key: string]: unknown;
}

function isCcd(name: string): boolean {
    return /CCD Simulator|ZWO|QHY/i.test(name);
}

function isCanon(name: string): boolean {
    return /Canon|DSLR/i.test(name);
}

export function useCameraAutoDetect(): void {
    const isConnected   = useStargazerStore((s) => s.isConnected);
    const setLiveViewMode = useStargazerStore((s) => s.setLiveViewMode);
    const setDetectedDevices = useStargazerStore((s) => s.setDetectedDevices);
    const detectedMount = useStargazerStore((s) => s.detectedMount);
    const hasRunRef = useRef(false);

    useEffect(() => {
        if (!isConnected) {
            hasRunRef.current = false;
            return;
        }
        if (hasRunRef.current) return;
        hasRunRef.current = true;

        async function detect() {
            try {
                const res = await fetch("/api/indi?endpoint=devices");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const devices: IndiDevice[] = await res.json();

                const ccdDevice    = devices.find((d) => isCcd(d.name));
                const canonDevice  = devices.find((d) => isCanon(d.name));

                if (ccdDevice) {
                    setLiveViewMode("NASA");
                    setDetectedDevices(ccdDevice.name, detectedMount);
                    notification.success(`Caméra détectée: ${ccdDevice.name}`, {
                        source: "AutoDetect",
                        description: "Mode CCD activé",
                    });
                } else if (canonDevice) {
                    setLiveViewMode("CANON");
                    setDetectedDevices(canonDevice.name, detectedMount);
                    notification.success(`Caméra détectée: ${canonDevice.name}`, {
                        source: "AutoDetect",
                        description: "Mode Canon DSLR activé",
                    });
                } else {
                    notification.warning("Aucune caméra INDI détectée", {
                        source: "AutoDetect",
                        description: "Vérifiez la connexion INDI et les pilotes chargés",
                    });
                }
            } catch (err) {
                notification.error("Échec de la détection caméra", {
                    source: "AutoDetect",
                    description: err instanceof Error ? err.message : String(err),
                    retryFn: detect,
                });
            }
        }

        detect();
    }, [isConnected, setLiveViewMode, setDetectedDevices, detectedMount]);
}
