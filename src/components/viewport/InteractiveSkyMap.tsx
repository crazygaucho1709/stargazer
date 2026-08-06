// InteractiveSkyMap.tsx – Carte du ciel interactive pour GoTo, capture et stack

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Telescope, Camera, X } from 'lucide-react';
import { useStargazerStore } from '@/store/useStargazerStore';
import { notification } from '@/lib/notificationService';

interface SkyObject {
    id: string;
    name: string;
    ra: number;
    dec: number;
    type: 'star' | 'nebula' | 'galaxy' | 'cluster';
    magnitude?: number;
    constellation?: string;
}

const loadMessierCatalog = (): SkyObject[] => [
    { id: 'M31',     name: 'Andromède',      ra: 0.7129,  dec: 41.2692,   type: 'galaxy',  magnitude: 3.4, constellation: 'And' },
    { id: 'M42',     name: 'Orion',          ra: 5.5865,  dec: -5.2361,   type: 'nebula',  magnitude: 4.0, constellation: 'Ori' },
    { id: 'M45',     name: 'Pleiades',       ra: 3.7917,  dec: 24.1167,   type: 'cluster', magnitude: 1.6, constellation: 'Tau' },
    { id: 'M13',     name: 'Hercules',       ra: 16.6950, dec: 36.4525,   type: 'cluster', magnitude: 5.8, constellation: 'Her' },
    { id: 'M20',     name: 'Trifid',         ra: 18.0363, dec: -23.0322,  type: 'nebula',  magnitude: 6.3, constellation: 'Sgr' },
    { id: 'Polaris', name: 'Étoile Polaire', ra: 2.5303,  dec: 89.2641,   type: 'star',    magnitude: 1.9, constellation: 'Umi' },
];

const raDecToXY = (ra: number, dec: number, width: number, height: number) => ({
    x: (ra / 24) * width,
    y: (90 - dec) / 180 * height,
});

const InteractiveSkyMap: React.FC = () => {
    const { config } = useStargazerStore();
    const [objects] = useState<SkyObject[]>(loadMessierCatalog());
    const [telescopePos, setTelescopePos] = useState<{ ra: number; dec: number } | null>(null);
    const [selectedObj, setSelectedObj] = useState<SkyObject | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        let active = true;
        const poll = async () => {
            try {
                const res = await fetch('/api/indi/mount/status', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.ra !== undefined && data.dec !== undefined) {
                        setTelescopePos({ ra: data.ra / 15, dec: data.dec });
                    }
                }
            } catch { /* background poll — silent */ }
        };
        poll();
        const interval = setInterval(() => { if (active) poll(); }, 2000);
        return () => { active = false; clearInterval(interval); };
    }, []);

    const handleObjectClick = useCallback((obj: SkyObject) => {
        setSelectedObj(obj);
        setModalOpen(true);
    }, []);

    const handleSlew = useCallback(async () => {
        if (!selectedObj) return;
        try {
            await fetch('/api/indi/mount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'slew', ra: selectedObj.ra * 15.0, dec: selectedObj.dec })
            });
            setModalOpen(false);
        } catch (e: unknown) {
            notification.error("Erreur GoTo", {
                source: "Monture",
                description: e instanceof Error ? e.message : "Impossible de pointer l'objet",
            });
        }
    }, [selectedObj]);

    const handleCapture = useCallback(async () => {
        if (!selectedObj) return;
        try {
            await fetch('/api/indi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'capture', exposure: 30, endpoint: 'ccd/capture' })
            });
            setModalOpen(false);
        } catch (e: unknown) {
            notification.error("Erreur capture", {
                source: "Caméra",
                description: e instanceof Error ? e.message : "Impossible de démarrer la capture",
            });
        }
    }, [selectedObj]);

    const objectMarkers = useMemo(() => {
        const W = 600, H = 400;
        return objects.map((obj) => {
            const { x, y } = raDecToXY(obj.ra, obj.dec, W, H);
            const isTargeted = telescopePos &&
                Math.abs(telescopePos.ra - obj.ra) < 0.1 &&
                Math.abs(telescopePos.dec - obj.dec) < 0.1;
            const size = obj.magnitude ? Math.max(4, 10 - obj.magnitude) : 6;
            const color = { star: '#fff', nebula: '#ff6b6b', galaxy: '#4dabf7', cluster: '#a99' }[obj.type];
            return (
                <g key={obj.id} onClick={() => handleObjectClick(obj)} style={{ cursor: 'pointer' }}>
                    <circle cx={x} cy={y} r={isTargeted ? size + 2 : size} fill={isTargeted ? '#ffdd57' : color} opacity={0.9} />
                    <title>{obj.name}</title>
                </g>
            );
        });
    }, [objects, telescopePos, handleObjectClick]);

    return (
        <div className="relative rounded-lg p-2" style={{ background: "#030509" }}>
            <svg width="100%" height="400px" viewBox="0 0 600 400">
                <rect width="600" height="400" fill="#030509" />
                {[...Array(13)].map((_, i) => (
                    <line key={i} x1={i * 50} y1={0} x2={i * 50} y2={400} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                ))}
                {objectMarkers}
                {telescopePos && (() => {
                    const { x, y } = raDecToXY(telescopePos.ra, telescopePos.dec, 600, 400);
                    return (
                        <g>
                            <circle cx={x} cy={y} r={8} fill="none" stroke="#ffdd57" strokeWidth={2} strokeDasharray="4,2" />
                            <text x={x + 12} y={y} fontSize={8} fill="#ffdd57">NexStar</text>
                        </g>
                    );
                })()}
            </svg>

            {modalOpen && selectedObj && (
                <div
                    className="absolute z-[100] rounded-xl p-6 min-w-[300px]"
                    style={{
                        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                        background: "#1a202c",
                        color: "rgba(255,255,255,0.9)",
                        boxShadow: "0 0 20px rgba(0,0,0,0.8)",
                    }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xl font-bold">{selectedObj.name}</span>
                        <button
                            className="p-1 rounded transition-colors cursor-pointer"
                            style={{ color: "rgba(255,255,255,0.5)" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "white")}
                            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
                            onClick={() => setModalOpen(false)}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(147,51,234,0.3)", color: "#C4B5FD" }}>
                                {selectedObj.type}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                                {selectedObj.constellation}
                            </span>
                        </div>
                        <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                            RA: {selectedObj.ra.toFixed(3)}h / DEC: {selectedObj.dec.toFixed(2)}°
                        </p>
                        <div className="flex gap-2">
                            <button
                                className="flex flex-1 items-center justify-center gap-2 h-9 rounded-lg text-white font-medium cursor-pointer transition-colors"
                                style={{ background: "#2C7A7B" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#285E61")}
                                onMouseLeave={e => (e.currentTarget.style.background = "#2C7A7B")}
                                onClick={handleSlew}
                            >
                                <Telescope size={16} />
                                GoTo
                            </button>
                            <button
                                className="flex flex-1 items-center justify-center gap-2 h-9 rounded-lg text-white font-medium cursor-pointer transition-colors"
                                style={{ background: "#C05621" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#9C4221")}
                                onMouseLeave={e => (e.currentTarget.style.background = "#C05621")}
                                onClick={handleCapture}
                            >
                                <Camera size={16} />
                                Capturer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InteractiveSkyMap;
