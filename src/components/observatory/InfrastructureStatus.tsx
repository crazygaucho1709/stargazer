"use client";

import { useState, useEffect } from "react";
import { 
    Grid, Box, Text, VStack, HStack, Icon, Badge, Spinner, Button
} from "@chakra-ui/react";
import { 
    Cpu, HardDrive, Activity, ShieldCheck, Terminal, RefreshCw
} from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import React from "react";
import { notification } from "@/lib/notificationService";

interface StatusCardProps {
    title: string;
    icon: any;
    status: 'ok' | 'warning' | 'error' | 'loading';
    metrics: { label: string; value: string | number; unit?: string }[];
    details?: string;
}

const StatusCard = ({ title, icon: IconComp, status, metrics, details }: StatusCardProps) => {
    const statusColor = {
        ok: "green.400",
        warning: "yellow.400",
        error: "red.400",
        loading: "whiteAlpha.400"
    }[status];

    const badgePalette = {
        ok: "green",
        warning: "yellow",
        error: "red",
        loading: "gray"
    }[status];

    return (
        <Box 
            bg="rgba(255,255,255,0.03)" 
            p={4} 
            borderRadius="xl" 
            border="1px solid" 
            borderColor="whiteAlpha.100"
            transition="all 0.2s"
            _hover={{ bg: "rgba(255,255,255,0.05)", borderColor: "whiteAlpha.300" }}
        >
            <HStack justify="space-between" mb={3}>
                <HStack gap={3}>
                    <IconComp size={18} color={statusColor} />
                    <Text fontSize="13px" fontWeight="bold" letterSpacing="0.05em" color="whiteAlpha.900">{title}</Text>
                </HStack>
                {status === 'loading' ? <Spinner size="xs" /> : <Badge colorPalette={badgePalette} variant="subtle" fontSize="9px">
                    {status.toUpperCase()}
                </Badge>}
            </HStack>
            <VStack align="stretch" gap={2}>
                {metrics.map((m, i) => (
                    <HStack key={i} justify="space-between" fontSize="11px">
                        <Text color="whiteAlpha.500">{m.label}</Text>
                        <Text color="whiteAlpha.800" fontWeight="medium">{m.value}{m.unit}</Text>
                    </HStack>
                ))}
                {details && (
                    <Text fontSize="10px" color="whiteAlpha.400" mt={1} fontStyle="italic" borderTop="1px solid rgba(255,255,255,0.05)" pt={1}>
                        {details}
                    </Text>
                )}
            </VStack>
        </Box>
    );
};

export const InfrastructureStatus = () => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/indi/health-full');
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                notification.warning("Erreur de données santé", {
                  description: "Impossible de décoder la réponse du serveur",
                  source: "Infrastructure",
                });
                setError(true);
                return;
            }
            setData(json);
            if (json.camera?.device && json.mount?.device) {
                // Sync with store for other components to use
                useStargazerStore.getState().setDetectedDevices(json.camera.device, json.mount.device);
            }
            setError(false);
        } catch (e: any) {
            notification.error("Impossible de récupérer l'état", {
              description: e?.message || "Le serveur est peut-être hors ligne",
              source: "Infrastructure",
            });
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) return (
        <HStack p={10} justify="center" w="full">
            <Spinner size="sm" color="cyan.400" />
            <Text fontSize="12px" color="whiteAlpha.600">Loading infrastructure data...</Text>
        </HStack>
    )

    const mac = data?.mac_mini || {};
    const astro = data?.astroberry || {};
    const indi = data?.indi_bridge || {};
    const mount = data?.mount || {};

    return (
        <VStack align="stretch" w="full" gap={4}>
            <HStack justify="space-between" w="full">
                <Text fontSize="11px" color="whiteAlpha.500" letterSpacing="0.1em">STATUS OVERVIEW</Text>
                <Button 
                    size="xs" 
                    variant="ghost" 
                    colorPalette="cyan" 
                    onClick={() => fetchData()} 
                    fontSize="10px"
                >
                    <HStack gap={1}>
                        <RefreshCw size={12} />
                        <Text>REFRESH</Text>
                    </HStack>
                </Button>
            </HStack>
            
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }} gap={4} w="full">
            {(() => {
                // Find backend app by name rather than assuming index 0
                const backendApp = (mac.pm2_apps || []).find((a: any) => a.name === 'stargazer-backend');
                const backendRestarts = backendApp?.restarts ?? 0;

                // Format raw RA float (decimal hours) → HH:MM:SS
                const formatRa = (ra: any): string => {
                    if (ra == null || ra === "" ) return "N/A";
                    const h = typeof ra === 'number' ? ra : parseFloat(ra);
                    if (isNaN(h)) return String(ra); // already formatted string
                    const hh = Math.floor(h);
                    const mm = Math.floor((h - hh) * 60);
                    const ss = Math.round(((h - hh) * 60 - mm) * 60);
                    return `${String(hh).padStart(2,'0')}h${String(mm).padStart(2,'0')}m${String(ss).padStart(2,'0')}s`;
                };

                // Format raw DEC float (decimal degrees) → ±DD°MM'SS"
                const formatDec = (dec: any): string => {
                    if (dec == null || dec === "") return "N/A";
                    const d = typeof dec === 'number' ? dec : parseFloat(dec);
                    if (isNaN(d)) return String(dec);
                    const sign = d >= 0 ? "+" : "-";
                    const abs = Math.abs(d);
                    const dd = Math.floor(abs);
                    const mm = Math.floor((abs - dd) * 60);
                    const ss = Math.round(((abs - dd) * 60 - mm) * 60);
                    return `${sign}${String(dd).padStart(2,'0')}°${String(mm).padStart(2,'0')}'${String(ss).padStart(2,'0')}"`;
                };

                // Astroberry metrics: show "N/A" when not connected instead of 0
                const astroCpu = astro.reachable ? (astro.cpu_percent ?? "N/A") : "N/A";
                const astroTemp = astro.reachable
                    ? (astro.temperature && astro.temperature !== "N/A" ? astro.temperature : "N/A")
                    : "N/A";

                // INDI devices: filter empty strings from split
                const indiDeviceList = (astro.indi_devices || "").split(/\s+/).filter(Boolean);

                // Mount details: only say "In Motion" when actually connected and not parked/idle
                const mountDetails = !mount.connected
                    ? "Not connected"
                    : mount.parked
                        ? "Secure • Home Position"
                        : mount.tracking
                            ? "Tracking • Sidereal"
                            : "Idle";

                return (
                    <>
                    <StatusCard
                        title="Mac Mini M4"
                        icon={Cpu}
                        status={error ? 'error' : 'ok'}
                        metrics={[
                            { label: "CPU", value: mac.cpu_percent ?? 0, unit: "%" },
                            { label: "RAM", value: mac.memory_used_gb ?? 0, unit: " GB" },
                            { label: "Storage", value: mac.disk_percent ?? 0, unit: "%" }
                        ]}
                        details={`Backend UP • ${backendRestarts} restarts`}
                    />

                    <StatusCard
                        title="Astroberry RPi"
                        icon={Activity}
                        status={astro.reachable ? 'ok' : 'error'}
                        metrics={[
                            { label: "Ping", value: astro.reachable ? (astro.ping_ms || "< 1") : "—", unit: astro.reachable ? "ms" : "" },
                            { label: "CPU", value: astroCpu, unit: astroCpu !== "N/A" ? "%" : "" },
                            { label: "Temp", value: astroTemp, unit: astroTemp !== "N/A" ? "°C" : "" }
                        ]}
                        details={astro.reachable ? `SSH Connected • ${astro.uptime || 'N/A'}` : "Unreachable via SSH"}
                    />

                    <StatusCard
                        title="INDI Server"
                        icon={Terminal}
                        status={indi.connected ? 'ok' : 'error'}
                        metrics={[
                            { label: "PID", value: astro.indi_pid || "N/A" },
                            { label: "Devices", value: indiDeviceList.length },
                            { label: "Uptime", value: astro.uptime || "N/A" }
                        ]}
                        details={indiDeviceList.length > 0 ? indiDeviceList.join(", ") : "No devices"}
                    />

                    <StatusCard
                        title="NexStar 4SE"
                        icon={ShieldCheck}
                        status={mount.connected ? 'ok' : 'error'}
                        metrics={[
                            { label: "RA", value: formatRa(mount.ra) },
                            { label: "DEC", value: formatDec(mount.dec) },
                            { label: "Status", value: mount.parked ? "PARKED" : (mount.tracking ? "TRACKING" : "IDLE") }
                        ]}
                        details={mountDetails}
                    />

                    <StatusCard
                        title="Canon EOS"
                        icon={HardDrive}
                        status={data?.camera?.connected ? 'ok' : 'warning'}
                        metrics={[
                            { label: "Model", value: data?.camera?.device || "None" },
                            { label: "Battery", value: data?.camera?.battery || "N/A" },
                            { label: "Storage", value: data?.camera?.space || "N/A" }
                        ]}
                        details={data?.camera?.connected ? "Ready for capture" : "Camera disconnected"}
                    />

                    <StatusCard
                        title="KStars + Ekos"
                        icon={ShieldCheck}
                        status={data?.kstars?.running ? 'ok' : 'error'}
                        metrics={[
                            { label: "Status", value: data?.kstars?.running ? "RUNNING" : "STOPPED" },
                            { label: "Profile", value: data?.kstars?.ekos_profile || "Nexstar4SE" },
                            { label: "PID", value: data?.kstars?.pid || "N/A" }
                        ]}
                        details={data?.kstars?.running ? "GUI Active on Mac Mini" : "Process not found"}
                    />
                    </>
                );
            })()}
        </Grid>
        </VStack>
    );
};