// src/components/camera/CapturePreviewModal.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, Layers, CheckCircle2, AlertTriangle, Save, Trash2, Sparkles, Images, RefreshCw } from "lucide-react";
import { useCapture } from "@/hooks/useCapture";
import { useGallery } from "@/hooks/useGallery";

const PHASE_COLOR: Record<string, string> = {
    capturing: "#93C5FD",
    stacking:  "#C4B5FD",
    complete:  "#86EFAC",
    error:     "#FCA5A5",
    idle:      "rgba(255,255,255,0.3)",
};

const PHASE_LABEL: Record<string, string> = {
    capturing: "Capture",
    stacking:  "Empilement",
    complete:  "Terminé",
    error:     "Erreur",
    idle:      "",
};

function ProgressBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(2, value))}%`, background: color, transition: "width 0.7s ease-out" }}
            />
        </div>
    );
}

export function CapturePreviewModal() {
    const { state, discard, enhance } = useCapture();
    const gallery = useGallery();

    const [open, setOpen]               = useState(false);
    const [dismissed, setDismissed]     = useState(false);
    const [displayThumb, setDisplayThumb] = useState<string | null>(null);
    const [loading, setLoading]         = useState(false);
    const [deleting, setDeleting]       = useState(false);
    const [enhancing, setEnhancing]     = useState(false);
    const [enhanced, setEnhanced]       = useState<string | null>(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [zoomed, setZoomed]           = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [selected, setSelected]       = useState<Set<string>>(new Set());

    const prevPhaseRef = useRef(state.phase);
    const prevThumbRef = useRef(state.last_thumbnail);

    // Ouvrir sur changement de phase → non-idle
    useEffect(() => {
        const prev = prevPhaseRef.current;
        const cur  = state.phase;
        prevPhaseRef.current = cur;

        if (cur === "idle") {
            // Réinitialiser dismissed pour la prochaine capture
            setDismissed(false);
            return;
        }
        // Captures techniques (autofocus, calibration...) : ne jamais ouvrir le modal
        if (state.preview_suppressed) return;
        // Nouvelle capture : rouvrir SYSTÉMATIQUEMENT, même si le modal précédent
        // a été fermé (le passage par "idle" entre deux captures est trop bref
        // pour être vu par le SSE — dismissed resterait bloqué à true sinon).
        if (prev !== "capturing" && cur === "capturing") {
            setDismissed(false);
            setDisplayThumb(null);
            setOpen(true);
            setLoading(true);
            return;
        }
        if (prev !== cur && !dismissed) {
            setOpen(true);
            if (cur === "capturing" || cur === "stacking") setLoading(true);
            if (cur === "complete" || cur === "error")     setLoading(false);
        }
    }, [state.phase, dismissed]);

    // Mettre à jour l'image dès qu'un nouveau thumbnail arrive
    useEffect(() => {
        if (state.last_thumbnail && state.last_thumbnail !== prevThumbRef.current) {
            prevThumbRef.current = state.last_thumbnail;
            setDisplayThumb(state.last_thumbnail);
            setLoading(false);
            // Nouvelle image : réinitialiser l'amélioration et le zoom
            setEnhanced(null);
            setShowOriginal(false);
            setZoomed(false);
            if (!dismissed && !state.preview_suppressed) setOpen(true);
        }
        // Réinitialiser l'image si le backend remet last_thumbnail à null (début nouvelle capture)
        if (!state.last_thumbnail) {
            prevThumbRef.current = null;
        }
    }, [state.last_thumbnail, dismissed]);

    // ESC pour fermer
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
        if (open) document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleClose = useCallback(() => {
        setOpen(false);
        setDismissed(true);
    }, []);

    if (!open) return null;

    const isActive = state.phase === "capturing" || state.phase === "stacking";
    const isDone   = state.phase === "complete";
    const isError  = state.phase === "error";
    const phaseColor = PHASE_COLOR[state.phase] ?? PHASE_COLOR.idle;
    const barColor   = isDone ? "#86EFAC" : isError ? "#FCA5A5"
        : state.phase === "stacking" ? "#C4B5FD" : "#93C5FD";
    const frameProgress = state.total_frames > 0
        ? (state.current_frame / state.total_frames) * 100 : 0;

    // Capture unique : progression temps réel basée sur elapsed/exposure.
    // L'exposition couvre 0→80% de la barre ; sauvegarde/téléchargement/aperçu 80→100%.
    const singleProgress = (() => {
        if (state.exposure_s <= 0) return 0;
        const expoRatio = Math.min(1, state.elapsed_s / state.exposure_s);
        if (state.preview_label.startsWith("Exposition")) return expoRatio * 80;
        if (state.preview_label.startsWith("Téléchargement")) return 85;
        if (state.preview_label.startsWith("Sauvegarde")) return 92;
        if (state.preview_label.startsWith("Génération")) return 97;
        return isDone ? 100 : expoRatio * 80;
    })();

    const handleDiscard = async () => {
        if (deleting) return;
        setDeleting(true);
        const ok = await discard();
        setDeleting(false);
        if (ok) {
            setDisplayThumb(null);
            setEnhanced(null);
            handleClose();
        }
    };

    const handleEnhance = async () => {
        if (enhancing) return;
        if (enhanced) { setShowOriginal(!showOriginal); return; } // toggle avant/après
        setEnhancing(true);
        const img = await enhance();
        setEnhancing(false);
        if (img) { setEnhanced(img); setShowOriginal(false); }
    };

    const openGallery = () => {
        setGalleryOpen(true);
        setSelected(new Set());
        gallery.refresh();
    };

    const toggleSelect = (thumb: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(thumb)) next.delete(thumb); else next.add(thumb);
            return next;
        });
    };

    const handleGalleryDelete = async () => {
        if (selected.size === 0) return;
        const ok = await gallery.remove(Array.from(selected));
        if (ok) setSelected(new Set());
    };

    const shownImage = enhanced && !showOriginal ? enhanced : displayThumb;

    return (
        <>
            {/* Backdrop — zIndex 10000 : doit passer au-dessus de la skymap et de la
                barre de statut (9999), quel que soit le mode de vue actif */}
            <div
                className="fixed inset-0"
                style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", zIndex: 10000 }}
                onClick={handleClose}
            />

            {/* Panel centré */}
            <div
                className="fixed flex flex-col"
                style={{
                    zIndex: 10001,
                    top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "min(92vw, 780px)",
                    maxHeight: "90vh",
                    background: "rgba(4, 10, 28, 0.97)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 16,
                    boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-2">
                        <Camera size={15} style={{ color: phaseColor }} />
                        <span className="text-sm font-semibold text-white">Prévisualisation</span>
                        {PHASE_LABEL[state.phase] && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium ml-1"
                                style={{ background: `${phaseColor}22`, color: phaseColor }}>
                                {PHASE_LABEL[state.phase]}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                    <button onClick={() => (galleryOpen ? setGalleryOpen(false) : openGallery())}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors"
                        style={{
                            background: galleryOpen ? "rgba(147,197,253,0.15)" : "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: galleryOpen ? "#93C5FD" : "rgba(255,255,255,0.6)",
                        }}>
                        <Images size={12} /> {galleryOpen ? "Retour" : "Galerie"}
                    </button>
                    <button onClick={handleClose} className="rounded-md p-1 cursor-pointer transition-colors"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "white")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}>
                        <X size={16} />
                    </button>
                    </div>
                </div>

                {/* Vue galerie de session */}
                {galleryOpen && (
                    <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 280, maxHeight: "62vh", background: "#000" }}>
                        {gallery.loading && (
                            <div className="flex items-center justify-center h-40 gap-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                                <RefreshCw size={14} className="animate-spin" />
                                <span className="text-xs">Chargement...</span>
                            </div>
                        )}
                        {!gallery.loading && gallery.items.length === 0 && (
                            <div className="flex items-center justify-center h-40 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                                Aucune capture en galerie
                            </div>
                        )}
                        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                            {gallery.items.map((item) => (
                                <div key={item.thumb} onClick={() => toggleSelect(item.thumb)}
                                    className="relative rounded-lg overflow-hidden cursor-pointer"
                                    style={{
                                        border: selected.has(item.thumb) ? "2px solid #FCA5A5" : "2px solid rgba(255,255,255,0.08)",
                                        opacity: selected.has(item.thumb) ? 0.75 : 1,
                                    }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={gallery.thumbUrl(item.thumb)} alt={item.ts}
                                        style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                                    <div className="px-1.5 py-1 text-[10px] font-mono flex justify-between"
                                        style={{ background: "rgba(0,0,0,0.7)", color: "rgba(255,255,255,0.5)" }}>
                                        <span>{item.ts.slice(9, 11)}:{item.ts.slice(11, 13)}:{item.ts.slice(13, 15)}</span>
                                        <span>{item.capture_size_mb ? `${item.capture_size_mb}Mo` : "thumb seul"}</span>
                                    </div>
                                    {selected.has(item.thumb) && (
                                        <div className="absolute top-1 right-1 rounded-full p-1" style={{ background: "#FCA5A5" }}>
                                            <Trash2 size={10} style={{ color: "#000" }} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {selected.size > 0 && (
                            <div className="sticky bottom-0 mt-3 flex justify-end">
                                <button onClick={handleGalleryDelete}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer"
                                    style={{ background: "rgba(252,165,165,0.15)", border: "1px solid rgba(252,165,165,0.4)", color: "#FCA5A5" }}>
                                    <Trash2 size={12} /> Supprimer {selected.size} sélection{selected.size > 1 ? "s" : ""}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Zone image */}
                {!galleryOpen && (
                <div className="relative flex-1 flex items-center justify-center"
                    style={{ minHeight: 280, background: "#000", overflow: zoomed ? "auto" : "hidden" }}>
                    {shownImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={shownImage} alt="Preview capture"
                            onClick={() => setZoomed(!zoomed)}
                            title={zoomed ? "Cliquer pour dézoomer" : "Cliquer pour zoomer à 100%"}
                            style={{
                                maxWidth: zoomed ? "none" : "100%",
                                maxHeight: zoomed ? "none" : "62vh",
                                width: zoomed ? "250%" : undefined,
                                objectFit: "contain", display: "block",
                                cursor: zoomed ? "zoom-out" : "zoom-in",
                                filter: loading ? "brightness(0.5)" : "brightness(1)",
                                transition: "filter 0.4s ease",
                            }} />
                    ) : (
                        <div className="flex flex-col items-center gap-3" style={{ color: "rgba(255,255,255,0.2)" }}>
                            <Camera size={52} strokeWidth={0.8} />
                            <span className="text-xs">En attente de l&apos;image...</span>
                        </div>
                    )}

                    {/* Overlay spinner + label pendant le chargement */}
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                            style={{ pointerEvents: "none" }}>
                            <div className="w-10 h-10 rounded-full border-2 border-blue-300/20 border-t-blue-300 animate-spin" />
                            {state.preview_label && (
                                <span className="text-xs font-medium px-3 py-1.5 rounded-full"
                                    style={{ background: "rgba(0,0,0,0.65)", color: phaseColor, backdropFilter: "blur(4px)" }}>
                                    {state.preview_label}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Badge avant/après quand l'image améliorée est affichée */}
                    {enhanced && (
                        <span className="absolute top-2 left-2 text-[10px] font-medium px-2 py-1 rounded-full"
                            style={{ background: "rgba(0,0,0,0.7)", color: showOriginal ? "rgba(255,255,255,0.5)" : "#C4B5FD" }}>
                            {showOriginal ? "Originale" : "✨ Améliorée"}
                        </span>
                    )}
                </div>
                )}

                {/* Footer */}
                <div className="px-4 py-3 flex flex-col gap-2"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>

                    {/* Label + compteur */}
                    <div className="flex items-center justify-between">
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                            {!loading && (state.preview_label || (isDone ? "Terminée" : isError ? (state.error ?? "Erreur") : ""))}
                            {loading && (state.preview_label || "En cours...")}
                        </span>
                        {state.total_frames > 0 && (
                            <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                                {state.current_frame}/{state.total_frames}
                            </span>
                        )}
                    </div>

                    {/* Barre progression séquence */}
                    {state.total_frames > 0 && (
                        <ProgressBar value={frameProgress} color={barColor} />
                    )}

    {/* Barre déterministe pour capture unique : exposition → sauvegarde → aperçu */}
                    {state.total_frames === 0 && isActive && (
                        <>
                            <ProgressBar value={singleProgress} color={barColor} />
                            {state.exposure_s > 0 && state.eta_s > 0 && state.preview_label.startsWith("Exposition") && (
                                <div className="flex justify-end">
                                    <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                                        {state.eta_s.toFixed(0)}s restantes
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    {/* Alerte exposition + suggestion (calculée backend sur l'histogramme) */}
                    {!galleryOpen && state.stats && state.stats.verdict !== "ok" && (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
                            style={{
                                background: "rgba(236,201,75,0.08)",
                                border: "1px solid rgba(236,201,75,0.25)",
                            }}>
                            <AlertTriangle size={12} style={{ color: "#ECC94B", flexShrink: 0 }} />
                            <span className="text-[11px]" style={{ color: "#ECC94B" }}>
                                {state.stats.suggestion ??
                                    (state.stats.verdict === "overexposed" ? "Image surexposée" : "Image sous-exposée")}
                            </span>
                        </div>
                    )}

                    {/* Métriques */}
                    <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                        {state.stack_count > 0 && (
                            <div className="flex items-center gap-1">
                                <Layers size={11} style={{ color: "#C4B5FD" }} />
                                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                                    {state.stack_count} frame{state.stack_count > 1 ? "s" : ""} empilée{state.stack_count > 1 ? "s" : ""}
                                </span>
                            </div>
                        )}
                        {state.hfr != null && (
                            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                                HFR <span style={{ color: "#5EEAD4" }}>{state.hfr.toFixed(2)}</span>
                            </span>
                        )}
                        {state.snr != null && (
                            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                                SNR <span style={{ color: "#FDE047" }}>{state.snr.toFixed(1)}</span>
                            </span>
                        )}
                        {state.elapsed_s > 0 && (
                            <span className="text-[11px] ml-auto font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                                {Math.floor(state.elapsed_s / 60)}m{String(Math.floor(state.elapsed_s % 60)).padStart(2, "0")}s
                            </span>
                        )}
                    </div>

                    {/* État final : conserver ou supprimer définitivement la capture */}
                    {isDone && (
                        <div className="flex items-center gap-2 mt-1">
                            <CheckCircle2 size={13} style={{ color: "#86EFAC" }} />
                            <span className="text-xs" style={{ color: "#86EFAC" }}>
                                Terminée — {state.stack_count || state.current_frame || 1} frame{((state.stack_count || state.current_frame) ?? 0) > 1 ? "s" : ""}
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                {displayThumb && (
                                    <button
                                        onClick={handleEnhance}
                                        disabled={enhancing}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                                        style={{
                                            background: "rgba(196,181,253,0.12)",
                                            border: "1px solid rgba(196,181,253,0.35)",
                                            color: "#C4B5FD",
                                            opacity: enhancing ? 0.5 : 1,
                                        }}
                                    >
                                        <Sparkles size={12} />
                                        {enhancing ? "Traitement IA..." : enhanced ? (showOriginal ? "Voir améliorée" : "Voir originale") : "Amélioration auto"}
                                    </button>
                                )}
                                <button
                                    onClick={handleClose}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                                    style={{
                                        background: "rgba(134,239,172,0.12)",
                                        border: "1px solid rgba(134,239,172,0.35)",
                                        color: "#86EFAC",
                                    }}
                                >
                                    <Save size={12} /> Conserver
                                </button>
                                {state.last_file && (
                                    <button
                                        onClick={handleDiscard}
                                        disabled={deleting}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors"
                                        style={{
                                            background: "rgba(252,165,165,0.10)",
                                            border: "1px solid rgba(252,165,165,0.35)",
                                            color: "#FCA5A5",
                                            opacity: deleting ? 0.5 : 1,
                                        }}
                                    >
                                        <Trash2 size={12} /> {deleting ? "Suppression..." : "Supprimer"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {isError && state.error && (
                        <div className="flex items-center gap-2 mt-1">
                            <AlertTriangle size={13} style={{ color: "#FCA5A5" }} />
                            <span className="text-xs" style={{ color: "#FCA5A5" }}>{state.error}</span>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

export default CapturePreviewModal;
