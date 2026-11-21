// src/hooks/useStationReadiness.ts
"use client";

import { useMemo } from "react";
import { useStationStream } from "@/hooks/useStationStream";
import { computeReadiness, StationReadiness } from "@/lib/stationReadiness";

/** État unique de la station, calculé depuis le flux poussé par le backend. */
export function useStationReadiness(): StationReadiness {
  const stream = useStationStream();
  const astro = stream.health?._raw?.astroberry as { throttled?: string } | undefined;
  const piThrottled = astro?.throttled ?? null;
  return useMemo(
    () => computeReadiness({
      loading: stream.loading,
      online: stream.online,
      indiConnected: stream.indiConnected,
      mountConnected: stream.mountConnected,
      ccdConnected: stream.ccdConnected,
      station: stream.station,
      piThrottled,
    }),
    [stream.loading, stream.online, stream.indiConnected, stream.mountConnected,
      stream.ccdConnected, stream.station, piThrottled],
  );
}
