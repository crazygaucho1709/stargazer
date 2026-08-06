// src/components/observatory/LogStream.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
    Terminal, Trash2, Activity, Cpu, Radio, Globe
} from "lucide-react";
import { notification } from "@/lib/notificationService";
import React from "react";

interface LogEntry {
    time: string;
    source: string;
    level: string;
    message: string;
}

export const LogStream = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState("ALL");
    const scrollRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [clearHover, setClearHover] = useState(false);

    useEffect(() => {
        // Connect to SSE endpoint via Next.js proxy to avoid CORS and localhost issues
        const eventSource = new EventSource('/api/logs/stream');
        eventSourceRef.current = eventSource;

        let retryCount = 0;

        eventSource.onmessage = (event) => {
            try {
                const rawData = JSON.parse(event.data);

                // Map backend format to LogEntry interface
                const logEntry: LogEntry = {
                    time: rawData.time || new Date().toLocaleTimeString(),
                    source: (rawData.source || 'BACKEND').toUpperCase(),
                    level: (rawData.level || (rawData.message?.includes('ERROR') ? 'ERROR' : 'INFO')).toUpperCase(),
                    message: rawData.message || ''
                };

                setLogs(prev => [...prev.slice(-199), logEntry]);
                retryCount = 0;
            } catch (e) {
                notification.warning("Erreur de log", {
                    description: "Impossible de décoder un événement du flux de logs",
                    source: "Logs",
                });
            }
        };

        eventSource.onerror = (err: unknown) => {
            const msg = err instanceof Error ? err.message : "Tentative de reconnexion...";
            notification.error("Connexion aux logs perdue", {
                description: msg,
                source: "Logs",
            });
            eventSource.close();

            if (retryCount < 5) {
                retryCount++;
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            }
        };

        return () => {
            eventSource.close();
        };
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const clearLogs = () => setLogs([]);

    const filteredLogs = logs.filter(log => filter === "ALL" || log.source === filter);

    const getSourceIcon = (source: string) => {
        switch (source) {
            case "BACKEND": return Cpu;
            case "INDI": return Radio;
            case "KSTARS": return Globe;
            case "ASTROBERRY": return Activity;
            default: return Terminal;
        }
    };

    const getLevelColor = (level: string): string => {
        switch (level) {
            case "ERROR": return "#fc8181";
            case "WARNING": return "#f6e05e";
            case "SUCCESS": return "#68d391";
            default: return "rgba(255,255,255,0.7)";
        }
    };

    return (
        <div
            style={{
                flex: 1,
                background: "black",
                borderRadius: "0.75rem",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                flexDirection: "column",
                height: "500px",
            }}
        >
            {/* Header */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 1rem",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Terminal size={16} color="#00F0FF" />
                    <span style={{ fontSize: "12px", fontWeight: "bold", letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)" }}>
                        UNIFIED LOGS
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <select
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            color: 'white',
                            fontSize: '10px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            outline: 'none',
                            width: '120px',
                            cursor: 'pointer',
                        }}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    >
                        <option value="ALL" style={{ background: '#111' }}>ALL SOURCES</option>
                        <option value="BACKEND" style={{ background: '#111' }}>BACKEND</option>
                        <option value="INDI" style={{ background: '#111' }}>INDI</option>
                        <option value="KSTARS" style={{ background: '#111' }}>KSTARS</option>
                        <option value="ASTROBERRY" style={{ background: '#111' }}>ASTROBERRY</option>
                    </select>
                    <button
                        aria-label="Clear"
                        onClick={clearLogs}
                        onMouseEnter={() => setClearHover(true)}
                        onMouseLeave={() => setClearHover(false)}
                        style={{
                            background: clearHover ? "rgba(153,0,0,0.4)" : "transparent",
                            color: clearHover ? "#fc8181" : "rgba(255,255,255,0.4)",
                            border: "none",
                            borderRadius: "0.375rem",
                            padding: "4px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "color 0.15s, background 0.15s",
                        }}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Log body */}
            <div
                ref={scrollRef}
                className="custom-scrollbar"
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "1rem",
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(255,255,255,0.1) transparent",
                }}
            >
                {filteredLogs.length === 0 ? (
                    <div style={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        opacity: 0.3,
                        gap: "0.5rem",
                    }}>
                        <Terminal size={40} color="white" />
                        <span style={{ fontSize: "12px", color: "white" }}>Waiting for logs...</span>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {filteredLogs.map((log, i) => {
                            const SourceIcon = getSourceIcon(log.source);
                            return (
                                <div
                                    key={i}
                                    style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: "0.5rem",
                                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                                        paddingBottom: "4px",
                                    }}
                                >
                                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", minWidth: "65px" }}>
                                        {log.time}
                                    </span>
                                    <SourceIcon size={12} color="#0e7490" style={{ marginTop: "2px", flexShrink: 0 }} />
                                    <span style={{ fontSize: "10px", color: getLevelColor(log.level), fontWeight: "bold", minWidth: "50px" }}>
                                        [{log.level}]
                                    </span>
                                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.8)", fontFamily: "monospace", wordBreak: "break-all" }}>
                                        {log.message}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
