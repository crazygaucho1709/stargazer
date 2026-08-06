// src/components/ui/switch.tsx
"use client"

import * as React from "react"

export interface SwitchProps {
  /** Controlled checked state */
  checked?: boolean
  /** Default (uncontrolled) checked state */
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  /** Label rendered beside the thumb */
  children?: React.ReactNode
  /** Extra props forwarded to the hidden <input> */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>
  rootRef?: React.Ref<HTMLLabelElement>
  /** Optional text/icons inside the track */
  trackLabel?: { on: React.ReactNode; off: React.ReactNode }
  /** Optional text/icons inside the thumb */
  thumbLabel?: { on: React.ReactNode; off: React.ReactNode }
  id?: string
  name?: string
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  function Switch(props, ref) {
    const {
      checked: controlledChecked,
      defaultChecked = false,
      onChange,
      disabled = false,
      children,
      inputProps,
      rootRef,
      trackLabel,
      thumbLabel,
      id,
      name,
    } = props

    const isControlled = controlledChecked !== undefined
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
    const checked = isControlled ? controlledChecked : internalChecked

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.checked
      if (!isControlled) setInternalChecked(next)
      onChange?.(next)
    }

    const tealColor = "#00F0FF"
    const trackBg = checked
      ? `color-mix(in srgb, ${tealColor} 30%, transparent)`
      : "rgba(255,255,255,0.1)"
    const trackBorder = checked ? tealColor : "rgba(255,255,255,0.2)"

    return (
      <label
        ref={rootRef}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          userSelect: "none",
        }}
      >
        {/* Hidden native checkbox — keeps accessibility + form integration */}
        <input
          ref={ref}
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          style={{ position: "absolute", width: 0, height: 0, opacity: 0, margin: 0 }}
          {...inputProps}
        />

        {/* Track */}
        <span
          aria-hidden
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            width: "44px",
            height: "24px",
            borderRadius: "12px",
            background: trackBg,
            border: `1px solid ${trackBorder}`,
            transition: "background 0.2s ease, border-color 0.2s ease",
            flexShrink: 0,
          }}
        >
          {/* Optional track label */}
          {trackLabel && (
            <span
              style={{
                position: "absolute",
                fontSize: "9px",
                color: "rgba(255,255,255,0.7)",
                left: checked ? "6px" : "auto",
                right: checked ? "auto" : "6px",
                transition: "all 0.2s ease",
                lineHeight: 1,
              }}
            >
              {checked ? trackLabel.on : trackLabel.off}
            </span>
          )}

          {/* Thumb */}
          <span
            style={{
              position: "absolute",
              left: checked ? "calc(100% - 20px)" : "2px",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: checked ? tealColor : "rgba(255,255,255,0.6)",
              boxShadow: checked ? `0 0 8px ${tealColor}` : "none",
              transition: "left 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "9px",
            }}
          >
            {thumbLabel && (checked ? thumbLabel.on : thumbLabel.off)}
          </span>
        </span>

        {/* Side label */}
        {children && (
          <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.85)" }}>
            {children}
          </span>
        )}
      </label>
    )
  },
)
