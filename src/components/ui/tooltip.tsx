// src/components/ui/tooltip.tsx
"use client"

import * as React from "react"

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  showArrow?: boolean
  disabled?: boolean
  /** Position of the tooltip relative to the trigger */
  side?: "top" | "bottom" | "left" | "right"
}

/**
 * Pure-CSS tooltip — no Radix, no Chakra.
 * The trigger is wrapped in a relative container; the tooltip panel uses
 * absolute positioning + opacity transition driven by CSS :hover on the wrapper.
 */
export const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  function Tooltip({ content, children, showArrow = false, disabled = false, side = "top" }, ref) {
    if (disabled) return <>{children}</>

    const positionStyles: React.CSSProperties = (() => {
      switch (side) {
        case "bottom":
          return { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }
        case "left":
          return { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
        case "right":
          return { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
        case "top":
        default:
          return { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }
      }
    })()

    const arrowStyles: React.CSSProperties = (() => {
      switch (side) {
        case "bottom":
          return {
            top: "-4px", left: "50%", transform: "translateX(-50%)",
            borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
            borderBottom: "4px solid rgba(30,40,60,0.95)",
          }
        case "left":
          return {
            right: "-4px", top: "50%", transform: "translateY(-50%)",
            borderTop: "4px solid transparent", borderBottom: "4px solid transparent",
            borderLeft: "4px solid rgba(30,40,60,0.95)",
          }
        case "right":
          return {
            left: "-4px", top: "50%", transform: "translateY(-50%)",
            borderTop: "4px solid transparent", borderBottom: "4px solid transparent",
            borderRight: "4px solid rgba(30,40,60,0.95)",
          }
        case "top":
        default:
          return {
            bottom: "-4px", left: "50%", transform: "translateX(-50%)",
            borderLeft: "4px solid transparent", borderRight: "4px solid transparent",
            borderTop: "4px solid rgba(30,40,60,0.95)",
          }
      }
    })()

    return (
      <div ref={ref} className="tooltip-wrapper" style={{ position: "relative", display: "inline-flex" }}>
        <style>{`
          .tooltip-wrapper .tooltip-panel {
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s ease;
          }
          .tooltip-wrapper:hover .tooltip-panel {
            opacity: 1;
          }
        `}</style>

        {children}

        <div
          className="tooltip-panel"
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 9999,
            whiteSpace: "nowrap",
            background: "rgba(30,40,60,0.95)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "12px",
            color: "rgba(255,255,255,0.9)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            ...positionStyles,
          }}
        >
          {showArrow && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                width: 0,
                height: 0,
                ...arrowStyles,
              }}
            />
          )}
          {content}
        </div>
      </div>
    )
  },
)
