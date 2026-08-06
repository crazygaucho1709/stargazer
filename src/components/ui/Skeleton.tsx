// src/components/ui/Skeleton.tsx
import React from "react";

let shimmerInjected = false;

function injectShimmer() {
  if (shimmerInjected || typeof document === "undefined") return;
  shimmerInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    .skeleton-shimmer {
      background: rgba(255,255,255,0.06);
      background-image: linear-gradient(
        90deg,
        rgba(255,255,255,0.06) 0%,
        rgba(0,240,255,0.08) 50%,
        rgba(255,255,255,0.06) 100%
      );
      background-size: 800px 100%;
      animation: shimmer 1.8s infinite linear;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  React.useEffect(() => {
    injectShimmer();
  }, []);

  return (
    <div
      className={`skeleton-shimmer${className ? ` ${className}` : ""}`}
      style={style}
    />
  );
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = "60%",
}: {
  lines?: number;
  lastLineWidth?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          style={{
            height: 12,
            width: i === lines - 1 ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = "120px" }: { height?: string }) {
  return (
    <Skeleton
      style={{
        height,
        width: "100%",
        borderRadius: 8,
      }}
    />
  );
}

export function SkeletonStat({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          style={{
            flex: 1,
            height: 64,
            borderRadius: 8,
          }}
        />
      ))}
    </div>
  );
}
