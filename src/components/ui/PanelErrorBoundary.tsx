// src/components/ui/PanelErrorBoundary.tsx
"use client";

import { type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface PanelErrorBoundaryProps {
  name: string;
  children: ReactNode;
}

export function PanelErrorBoundary({ name, children }: PanelErrorBoundaryProps) {
  return (
    <ErrorBoundary panel={name}>
      {children}
    </ErrorBoundary>
  );
}

export default PanelErrorBoundary;
