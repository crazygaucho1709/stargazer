// src/components/ui/ConfirmDialog.tsx
"use client";

import { Box, VStack, HStack, Text, Button, Icon } from "@chakra-ui/react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const variantConfig = {
  danger: { icon: ShieldAlert, color: "red.400", border: "red.500", btnBg: "red.500", btnHover: "red.600" },
  warning: { icon: AlertTriangle, color: "var(--astro-gold)", border: "var(--astro-gold)", btnBg: "var(--astro-gold)", btnHover: "yellow.400" },
  info: { icon: AlertTriangle, color: "var(--astro-teal)", border: "var(--astro-teal)", btnBg: "var(--astro-teal)", btnHover: "white" },
};

export const ConfirmDialog = ({
  isOpen, title, message, confirmLabel, cancelLabel,
  variant = "warning", onConfirm, onCancel, isLoading,
}: ConfirmDialogProps) => {
  if (!isOpen) return null;

  const cfg = variantConfig[variant];

  return (
    <Box
      position="fixed" inset="0" zIndex={9999}
      bg="rgba(0,0,0,0.85)" backdropFilter="blur(10px)"
      display="flex" alignItems="center" justifyContent="center"
      onClick={onCancel}
    >
      <VStack
        bg="rgba(10, 20, 40, 0.98)"
        p={8} borderRadius="16px"
        border={`2px solid ${cfg.border}`}
        maxW="420px" textAlign="center" gap={5}
        boxShadow={`0 0 50px rgba(0,0,0,0.5)`}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon as={cfg.icon} boxSize={12} color={cfg.color} />
        <Text color="white" fontSize="lg" fontWeight="bold" className="hud-font">
          {title}
        </Text>
        <Text color="gray.300" fontSize="sm">
          {message}
        </Text>
        <HStack gap={4} w="full">
          <Button
            flex={1} variant="ghost" color="gray.400"
            border="1px solid rgba(255,255,255,0.2)"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel || "ANNULER"}
          </Button>
          <Button
            flex={1} bg={cfg.btnBg} color="black"
            fontWeight="bold"
            _hover={{ bg: cfg.btnHover }}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmLabel || "CONFIRMER"}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};
