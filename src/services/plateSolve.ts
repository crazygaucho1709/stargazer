/**
 * Plate Solving Service
 *
 * Priority fallback chain:
 *  1. Local solve-field (astrometry CLI on Astroberry via backend bridge, image sent as base64 blob)
 *  2. Astrometry.net cloud API
 *  3. AI Vision (Claude/Gemini via le backend) — rough star identification
 */

export interface SolvedPosition {
  ra: number;  // decimal hours  (0–24)
  dec: number; // decimal degrees (-90 to +90)
  confidence: 'high' | 'medium' | 'low';
  source: 'local' | 'astrometry_net' | 'ai_vision';
}

// ---------------------------------------------------------------------------
// Helper: fetch an image URL and convert it to a base64 string (JPEG bytes)
// ---------------------------------------------------------------------------
async function imageUrlToBase64(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 1: Local solve-field via the FastAPI bridge
// Sends the image as a base64 blob — works entirely offline / behind a router.
// ---------------------------------------------------------------------------
export const plateSolveLocal = async (imageUrl: string): Promise<SolvedPosition | null> => {
  try {
    // Convert the image URL to a base64 blob so the backend can SCP it to Astroberry
    const image_b64 = await imageUrlToBase64(imageUrl);
    if (!image_b64) {
      console.warn('[plateSolve] Could not fetch image for local solve');
      return null;
    }

    const res = await fetch('/api/indi/autoalign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'solve',
        image_b64,
        scale_low: 0.5,   // adjust to your telescope FOV
        scale_high: 5.0,
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && typeof data.ra === 'number' && typeof data.dec === 'number') {
      return { ra: data.ra, dec: data.dec, confidence: 'high', source: 'local' };
    }
    console.warn('[plateSolve] local solve returned:', data);
  } catch (e) {
    console.warn('[plateSolve] local solve error:', e);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Step 2: Astrometry.net cloud plate solve
// Uploads the raw image blob — avoids the "local URL not reachable" problem.
// ---------------------------------------------------------------------------
export const plateSolveCloud = async (imageUrl: string): Promise<SolvedPosition | null> => {
  try {
    // Anonymous login — Astrometry.net supports unauthenticated submissions
    const loginRes = await fetch('http://nova.astrometry.net/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `request-json=${encodeURIComponent(JSON.stringify({ apikey: 'anonymous' }))}`,
    });
    const loginData = await loginRes.json();
    if (loginData.status !== 'success') return null;
    const session = loginData.session;

    // Fetch the actual image bytes and upload as a file (not URL, since we're behind a router)
    const imgRes = await fetch(imageUrl, { cache: 'no-store' });
    if (!imgRes.ok) return null;
    const imgBlob = await imgRes.blob();

    const formData = new FormData();
    formData.append('request-json', JSON.stringify({
      session,
      scale_units: 'degwidth',
      scale_lower: 0.5,
      scale_upper: 5.0,
      publicly_visible: 'n',
    }));
    formData.append('file', imgBlob, 'capture.jpg');

    const submitRes = await fetch('http://nova.astrometry.net/api/upload', {
      method: 'POST',
      body: formData,
    });
    const submitData = await submitRes.json();
    if (submitData.status !== 'success') return null;
    const submissionId = submitData.subid;

    // Poll for result (max 90s, 15s intervals)
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 15000));
      const statusRes = await fetch(`http://nova.astrometry.net/api/submissions/${submissionId}`);
      const statusData = await statusRes.json();
      if (statusData.jobs?.length > 0) {
        const jobId = statusData.jobs[0];
        const jobRes = await fetch(`http://nova.astrometry.net/api/jobs/${jobId}/calibration`);
        const jobData = await jobRes.json();
        if (jobData.ra != null && jobData.dec != null) {
          return {
            ra: jobData.ra / 15,  // degrees → hours
            dec: jobData.dec,
            confidence: 'high',
            source: 'astrometry_net'
          };
        }
      }
    }
  } catch (e) {
    console.warn('[plateSolve] cloud solve error:', e);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Step 3: AI Vision fallback — routed through backend (Claude or Gemini via CLI creds)
// ---------------------------------------------------------------------------
export const plateSolveWithAI = async (imageUrl: string): Promise<SolvedPosition | null> => {
  try {
    const b64 = await imageUrlToBase64(imageUrl);
    if (!b64) return null;

    const res = await fetch('/api/ai/platesolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: b64 }),
      signal: AbortSignal.timeout(35000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || data.ra == null || data.dec == null) return null;
    return {
      ra: parseFloat(data.ra),
      dec: parseFloat(data.dec),
      confidence: 'low',
      source: 'ai_vision',
    };
  } catch {
    // Silent — AI plate solve is best-effort fallback
  }
  return null;
};

// ---------------------------------------------------------------------------
// Main plate solve — tries all methods in priority order.
// ---------------------------------------------------------------------------
export const plateSolve = async (
  imageUrl: string,
): Promise<SolvedPosition | null> => {
  // 1. Local solve-field (fastest, no internet)
  const local = await plateSolveLocal(imageUrl);
  if (local) return local;

  // 2. Astrometry.net cloud
  const cloud = await plateSolveCloud(imageUrl);
  if (cloud) return cloud;

  // 3. AI Vision fallback via backend (uses CLI credentials)
  return plateSolveWithAI(imageUrl);
};
