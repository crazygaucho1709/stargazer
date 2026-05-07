/**
 * Plate Solving Service
 * 
 * Priority fallback chain:
 *  1. Local solve-field (astrometry CLI on Astroberry via backend bridge)
 *  2. Astrometry.net cloud API  
 *  3. AI Vision (OpenAI GPT-4o) — rough star identification
 */

export interface SolvedPosition {
  ra: number;  // decimal hours
  dec: number; // decimal degrees
  confidence: 'high' | 'medium' | 'low';
  source: 'local' | 'astrometry_net' | 'ai_vision';
}

/** Step 1: Try local solve-field via the FastAPI bridge */
export const plateSolveLocal = async (imageUrl: string): Promise<SolvedPosition | null> => {
  try {
    const res = await fetch('/api/indi/autoalign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'solve', image_url: imageUrl })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && typeof data.ra === 'number' && typeof data.dec === 'number') {
      return { ra: data.ra, dec: data.dec, confidence: 'high', source: 'local' };
    }
  } catch { /* fall through */ }
  return null;
};

/** Step 2: Astrometry.net cloud plate solve */
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

    // Submit URL job
    const submitRes = await fetch('http://nova.astrometry.net/api/url_upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `request-json=${encodeURIComponent(JSON.stringify({
        session,
        url: imageUrl,
        scale_units: 'degwidth',
        scale_lower: 0.1,
        scale_upper: 180,
      }))}`
    });
    const submitData = await submitRes.json();
    if (submitData.status !== 'success') return null;
    const submissionId = submitData.subid;

    // Poll for result (max 60s)
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(`http://nova.astrometry.net/api/submissions/${submissionId}`);
      const statusData = await statusRes.json();
      if (statusData.jobs?.length > 0) {
        const jobId = statusData.jobs[0];
        const jobRes = await fetch(`http://nova.astrometry.net/api/jobs/${jobId}/calibration`);
        const jobData = await jobRes.json();
        if (jobData.ra && jobData.dec) {
          return {
            ra: jobData.ra / 15, // degrees to hours
            dec: jobData.dec,
            confidence: 'high',
            source: 'astrometry_net'
          };
        }
      }
    }
  } catch { /* fall through */ }
  return null;
};

/** Step 3: AI Vision fallback — ask GPT-4o to identify stars and estimate center coords */
export const plateSolveWithAI = async (imageUrl: string, aiKey: string): Promise<SolvedPosition | null> => {
  if (!aiKey) return null;
  try {
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
              text: 'This is an astronomical image. Identify the brightest stars you can see and estimate the center of field of view in equatorial coordinates. Reply ONLY with valid JSON in this exact format: {"ra": <decimal_hours_0_to_24>, "dec": <decimal_degrees_-90_to_90>}. If you cannot determine coordinates, reply with {"ra": null, "dec": null}.'
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' }
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
    // Extract JSON from response
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
  } catch { /* fall through */ }
  return null;
};

/**
 * Main plate solve function — tries all methods in priority order.
 * Returns the first successful result or null if all fail.
 */
export const plateSolve = async (
  imageUrl: string,
  aiKey?: string
): Promise<SolvedPosition | null> => {
  // 1. Try local solve-field first (fastest, no internet needed)
  const local = await plateSolveLocal(imageUrl);
  if (local) return local;

  // 2. Try Astrometry.net cloud
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
