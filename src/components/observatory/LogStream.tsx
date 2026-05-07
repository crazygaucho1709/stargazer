"use client";

import { useState, useEffect, useRef } from "react";
import { 
    Box, Text, VStack, HStack, Icon, IconButton
} from "@chakra-ui/react";
import { 
    Terminal, Trash2, Activity, Cpu, Radio, Globe
} from "lucide-react";
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
                console.error("Error parsing log event:", e);
            }
        };

        eventSource.onerror = (err) => {
            console.error("SSE Connection Error:", err);
            eventSource.close();
            
            // Simple retry logic
            if (retryCount < 5) {
                retryCount++;
                setTimeout(() => {
                    console.log(`Retrying log connection (attempt ${retryCount})...`);
                    // Triggers effect cleanup and re-run if we were to depend on a state,
                    // but since this is in mount, we just manually reconnect
                    window.location.reload(); // Simple way to reset stateful SSE
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

    const getLevelColor = (level: string) => {
        switch (level) {
            case "ERROR": return "red.400";
            case "WARNING": return "yellow.400";
            case "SUCCESS": return "green.400";
            default: return "whiteAlpha.700";
        }
    };

    return (
        <Box 
            flex={1} 
            bg="black" 
            borderRadius="xl" 
            border="1px solid" 
            borderColor="whiteAlpha.100" 
            display="flex" 
            flexDirection="column"
            h="500px"
        >
            <HStack px={4} py={3} borderBottom="1px solid" borderColor="whiteAlpha.100" justify="space-between">
                <HStack gap={3}>
                    <Icon as={Terminal} color="#00F0FF" boxSize={4} />
                    <Text fontSize="12px" fontWeight="bold" letterSpacing="0.1em" color="whiteAlpha.900">UNIFIED LOGS</Text>
                </HStack>
                <HStack gap={2}>
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
                            cursor: 'pointer'
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
                    <IconButton 
                        aria-label="Clear" 
                        size="xs" 
                        variant="ghost" 
                        color="whiteAlpha.400"
                        _hover={{ color: "red.400", bg: "red.900" }}
                        onClick={clearLogs}
                    >
                        <Trash2 size={14} />
                    </IconButton>
                </HStack>
            </HStack>

            <Box 
                flex={1} 
                overflowY="auto" 
                p={4} 
                ref={scrollRef}
                className="custom-scrollbar"
                css={{
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: '10px' },
                }}
            >
                {filteredLogs.length === 0 ? (
                    <VStack h="full" justify="center" opacity={0.3}>
                        <Terminal size={40} />
                        <Text fontSize="12px">Waiting for logs...</Text>
                    </VStack>
                ) : (
                    <VStack align="stretch" gap={1}>
                        {filteredLogs.map((log, i) => (
                            <HStack key={i} align="start" gap={2} borderBottom="1px solid rgba(255,255,255,0.03)" pb={1}>
                                <Text fontSize="9px" color="whiteAlpha.400" fontFamily="monospace" minW="65px">{log.time}</Text>
                                <Icon as={getSourceIcon(log.source)} boxSize={3} mt={0.5} color="cyan.600" />
                                <Text fontSize="10px" color={getLevelColor(log.level)} fontWeight="bold" minW="50px">[{log.level}]</Text>
                                <Text fontSize="10px" color="whiteAlpha.800" fontFamily="monospace" wordBreak="break-all">{log.message}</Text>
                            </HStack>
                        ))}
                    </VStack>
                )}
            </Box>
        </Box>
    );
};
