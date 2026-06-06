import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { targetName, aiKey } = await request.json();

    if (!aiKey) {
      return NextResponse.json({ error: "OpenAI API key missing in config." }, { status: 400 });
    }
    if (!targetName) {
      return NextResponse.json({ error: "Target name missing." }, { status: 400 });
    }

    const prompt = `
I am an astrophotographer using a Celestron NexStar 4SE (focal length 1350mm, aperture 90mm, Alt-Azimuth mount) and a Canon EOS 600D (APS-C).
I want to photograph the object: "${targetName}".

Provide the optimal deep-sky live stacking capture sequence for this specific object and hardware. 
Consider the Alt-Az mount limitations (field rotation, tracking limits, typically max 10-30s per exposure before trails).

Reply ONLY with valid JSON in this exact format:
{
  "exposureTime": <number in seconds>,
  "isoGain": "<string, e.g., '800' or '1600'>",
  "frameCount": <number of light frames>
}
No markdown, no explanation, only the JSON.
`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API Error: ${err}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Extract JSON block in case GPT adds markdown
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from AI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);

  } catch (error: any) {
    console.error("AI Sequence error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
