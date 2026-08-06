// src/components/layout/Sidebar.tsx
"use client";

import React from "react";
import { Telescope, Camera, Map, History, Settings, Zap, LucideIcon } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}

const NavItem = ({ icon: LucideIconComponent, label, active = false }: NavItemProps) => {
  const [hovered, setHovered] = React.useState(false);

  const isHighlighted = active || hovered;

  return (
    <div
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "50px",
        height: "50px",
        cursor: "pointer",
        borderRadius: "50%",
        background: isHighlighted ? "rgba(208, 0, 0, 0.1)" : "transparent",
        color: isHighlighted ? "#D00000" : "rgba(255,255,255,0.4)",
        transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        transform: hovered ? "scale(1.1)" : "scale(1)",
      }}
    >
      {active && (
        <span
          className="glow-red"
          style={{
            position: "absolute",
            left: "-15px",
            width: "4px",
            height: "20px",
            background: "#D00000",
            borderRadius: "9999px",
          }}
        />
      )}
      <LucideIconComponent size={24} strokeWidth={active ? 2.5 : 2} />
    </div>
  );
};

export const Sidebar = () => {
  const isConnected = useStargazerStore((state) => state.isConnected);

  return (
    <div
      className="glass-panel"
      style={{
        width: "80px",
        height: "calc(100vh - 40px)",
        borderRadius: "16px",
        position: "fixed",
        left: "20px",
        top: "20px",
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          alignItems: "center",
          paddingTop: "40px",
          paddingBottom: "40px",
          justifyContent: "space-between",
        }}
      >
        {/* Top section: status indicator + nav items */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}>
          {/* Connection status indicator */}
          <div
            className={isConnected ? "pulse" : ""}
            style={{
              padding: "10px",
              borderRadius: "15px",
              background: "black",
              border: `1px solid ${isConnected ? "#FFB300" : "rgba(255,255,255,0.1)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap
              size={24}
              color={isConnected ? "#FFB300" : "rgba(255,255,255,0.25)"}
              strokeWidth={2}
            />
          </div>

          {/* Navigation items */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
            <NavItem icon={Telescope} label="Dashboard" active />
            <NavItem icon={Camera} label="Imaging" />
            <NavItem icon={Map} label="Star Map" />
            <NavItem icon={History} label="Logs" />
          </div>
        </div>

        {/* Bottom: settings */}
        <NavItem icon={Settings} label="Settings" />
      </div>
    </div>
  );
};
