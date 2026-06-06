// src/components/ui/ErrorBoundary.tsx
"use client";

import React from "react";
import { Box, Text, Button, VStack, Icon } from "@chakra-ui/react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Box
          position="fixed" inset="0" zIndex={9999}
          bg="rgba(3, 5, 9, 0.98)"
          display="flex" alignItems="center" justifyContent="center"
          p={8}
        >
          <VStack gap={6} maxW="500px" textAlign="center">
            <Icon as={AlertTriangle} boxSize={16} color="red.400" />
            <Text color="red.400" fontSize="xl" fontWeight="bold" className="hud-font">
              ERREUR SYSTÈME
            </Text>
            <Text color="gray.300" fontSize="sm">
              Une erreur inattendue s&apos;est produite. Le système a été interrompu.
            </Text>
            <Text color="gray.500" fontSize="xs" fontFamily="mono" maxW="full" wordBreak="break-all">
              {this.state.error?.message || "Erreur inconnue"}
            </Text>
            <Button
              bg="var(--astro-teal)" color="black"
              _hover={{ bg: "white" }}
              onClick={this.handleReset}
            >
              RELANCER L&apos;INTERFACE
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}
