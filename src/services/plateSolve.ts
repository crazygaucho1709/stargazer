/**
 * Plate Solving Service
 *
 * Priority fallback chain:
 *  1. Local solve-field (astrometry CLI on Astroberry via backend bridge, image sent as base64 blob)
 *  2. Astrometry.net cloud API
 *  3. AI Vision (OpenAI GPT-4o) — rough star identification
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
export const plateSolveCloud = async (imageUrl: string, apiKey: string): Promise<SolvedPosition | null> => {
  if (!apiKey) return null;
  try {
    // Login
    const loginRes = await fetch('http://nova.astrometry.net/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `request-json=${encodeURIComponent(JSON.stringify({ apikey: apiKey }))}`
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
// Step 3: AI Vision fallback — GPT-4o identifies stars and estimates coords
// ---------------------------------------------------------------------------
export const plateSolveWithAI = async (imageUrl: string, aiKey: string): Promise<SolvedPosition | null> => {
  if (!aiKey) return null;
  try {
    // Fetch image and convert to base64 data URL for GPT-4o
    const b64 = await imageUrlToBase64(imageUrl);
    if (!b64) return null;
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This is an astronomical image taken through a telescope. Identify the brightest stars or star patterns you can see and estimate the center of field of view in equatorial coordinates (J2000). Reply ONLY with valid JSON in this exact format: {"ra": <decimal_hours_0_to_24>, "dec": <decimal_degrees_-90_to_90>}. If you cannot determine coordinates with reasonable confidence, reply with {"ra": null, "dec": null}.'
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' }
            }
          ]
        }],
        max_tokens: 100,
        temperature: 0
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.ra === null || parsed.dec === null) return null;
    return {
      ra: parseFloat(parsed.ra),
      dec: parseFloat(parsed.dec),
      confidence: 'low',
      source: 'ai_vision'
    };
  } catch (e) {
    console.warn('[plateSolve] AI vision error:', e);
  }
  return null;
};

// ---------------------------------------------------------------------------
// Main plate solve — tries all methods in priority order.
// ---------------------------------------------------------------------------
export const plateSolve = async (
  imageUrl: string,
  aiKey?: string
): Promise<SolvedPosition | null> => {
  // 1. Try local solve-field first (fastest, no internet needed)
  const local = await plateSolveLocal(imageUrl);
  if (local) return local;

  // 2. Try Astrometry.net cloud (uploads blob, not URL — works behind NAT)
  if (aiKey) {
    const cloud = await plateSolveCloud(imageUrl, aiKey);
    if (cloud) return cloud;
  }

  // 3. AI Vision fallback (rough, but better than nothing)
  if (aiKey) {
    const ai = await plateSolveWithAI(imageUrl, aiKey);
    if (ai) return ai;
  }

  return null;
};
