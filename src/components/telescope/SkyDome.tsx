// src/components/telescope/SkyDome.tsx
import React from 'react';

interface LimitPoint {
  alt: number;
  az: number;
  ra?: number;
  dec?: number;
}
interface TelescopeLimits {
  low?: LimitPoint;
  high?: LimitPoint;
  left?: LimitPoint;
  right?: LimitPoint;
}

const LIMIT_KEYS = ['low', 'high', 'left', 'right'] as const;
type LimitKey = typeof LIMIT_KEYS[number];
const LIMIT_COLORS: Record<LimitKey, string> = {
  low: '#f6ad55',
  high: '#63b3ed',
  left: '#68d391',
  right: '#fc8181',
};
const LIMIT_LABELS: Record<LimitKey, string> = { low: 'B', high: 'H', left: 'G', right: 'D' };

// Convert altitude/azimuth to SVG coordinates (same maths as the original AutoAlignWizard)
const toXY = (alt: number, az: number) => {
  const W = 200,
    H = 100,
    CX = W / 2,
    CY = H * 0.92,
    R = H * 0.86;
  const r = R * (1 - alt / 90);
  const theta = ((az - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta) };
};

export const SkyDome: React.FC<{ limits: TelescopeLimits; liveAlt?: number; liveAz?: number }> = ({ limits, liveAlt, liveAz }) => {
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.5)",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "8px",
      }}
    >
      <p style={{ fontSize: "8px", color: "rgba(255,255,255,0.4)", marginBottom: "4px", letterSpacing: "0.08em" }}>
        CARTE CIEL
      </p>
      <svg width={200} height={100} style={{ display: 'block', margin: '0 auto' }}>
        {/* Horizon line */}
        <path d="M 14 92 A 86 86 0 0 1 186 92" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        {/* Altitude rings */}
        {[30, 60].map((alt) => {
          const r = 86 * (1 - alt / 90);
          return (
            <ellipse
              key={alt}
              cx={100}
              cy={92}
              rx={r}
              ry={r * 0.38}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.5"
              strokeDasharray="3,3"
            />
          );
        })}
        {/* Recorded limits */}
        {LIMIT_KEYS.map((key) => {
          const lp = limits[key];
          if (!lp) return null;
          const p = toXY(lp.alt, lp.az);
          return (
            <g key={key}>
              <circle cx={p.x} cy={p.y} r={5} fill={LIMIT_COLORS[key]} opacity={0.9} />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">
                {LIMIT_LABELS[key]}
              </text>
            </g>
          );
        })}
        {/* Live position */}
        {liveAlt !== undefined && liveAz !== undefined && (
          (() => {
            const p = toXY(liveAlt, liveAz);
            return (
              <g>
                <circle cx={p.x} cy={p.y} r={5} fill="none" stroke="white" strokeWidth="1.5" opacity={0.8} />
                <circle cx={p.x} cy={p.y} r={2} fill="white" opacity={0.9} />
              </g>
            );
          })()
        )}
        {/* Cardinal points */}
        <text x={100} y={7} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.25)">
          N
        </text>
        <text x={100} y={99} textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.25)">
          S
        </text>
        <text x={2} y={95} textAnchor="start" fontSize="6" fill="rgba(255,255,255,0.25)">
          E
        </text>
        <text x={198} y={95} textAnchor="end" fontSize="6" fill="rgba(255,255,255,0.25)">
          O
        </text>
      </svg>
    </div>
  );
};
