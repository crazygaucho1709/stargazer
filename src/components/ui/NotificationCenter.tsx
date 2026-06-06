// src/components/ui/NotificationCenter.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import {
  Box, VStack, HStack, Text, Icon, Button, Portal,
} from "@chakra-ui/react";
import {
  AlertCircle, CheckCircle2, Info, AlertTriangle, X, Bell,
} from "lucide-react";
import { Notification, subscribeNotifications, clearNotification } from "@/lib/notificationService";

const levelConfig = {
  info: { icon: Info, color: "var(--astro-teal)", bg: "rgba(0, 240, 255, 0.1)" },
  success: { icon: CheckCircle2, color: "#48bb78", bg: "rgba(72, 187, 120, 0.1)" },
  warning: { icon: AlertCircle, color: "#ecc94b", bg: "rgba(236, 201, 75, 0.1)" },
  error: { icon: AlertTriangle, color: "#fc8181", bg: "rgba(252, 129, 129, 0.1)" },
  critical: { icon: AlertTriangle, color: "#f56565", bg: "rgba(245, 101, 101, 0.15)" },
};

export const NotificationCenter = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeNotifications(setNotifications);
    return unsub;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const criticalCount = notifications.filter((n) => n.level === "error" || n.level === "critical").length;

  return (
    <Box position="relative" ref={panelRef}>
      {/* Bell button */}
      <Button
        size="sm" variant="ghost"
        position="relative"
        onClick={() => setIsOpen(!isOpen)}
        color={criticalCount > 0 ? "red.400" : "gray.400"}
        _hover={{ color: "white" }}
        aria-label="Notifications"
      >
        <Icon as={Bell} boxSize={4} />
        {notifications.length > 0 && (
          <Box
            position="absolute" top="0" right="0"
            w="16px" h="16px" borderRadius="full"
            bg={criticalCount > 0 ? "red.500" : "var(--astro-teal)"}
            display="flex" alignItems="center" justifyContent="center"
            fontSize="9px" fontWeight="bold" color="black"
          >
            {criticalCount || notifications.length}
          </Box>
        )}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <Portal>
          <Box
            position="fixed" top="60px" right="80px"
            w="380px" maxH="500px"
            bg="rgba(10, 20, 40, 0.98)"
            borderRadius="lg"
            border="1px solid rgba(255,255,255,0.1)"
            boxShadow="0 10px 40px rgba(0,0,0,0.8)"
            backdropFilter="blur(20px)"
            zIndex={9998}
            overflow="hidden"
            display="flex" flexDirection="column"
          >
            {/* Header */}
            <HStack justify="space-between" p={3} borderBottom="1px solid rgba(255,255,255,0.1)">
              <Text color="white" fontSize="sm" fontWeight="bold" className="hud-font">
                NOTIFICATIONS
              </Text>
              {notifications.length > 0 && (
                <Button size="xs" variant="ghost" color="gray.400"
                  onClick={() => { import("@/lib/notificationService").then((m) => m.clearAll()); }}
                >
                  TOUT EFFACER
                </Button>
              )}
            </HStack>

            {/* List */}
            <VStack gap={0} overflowY="auto" flex={1} align="stretch">
              {notifications.length === 0 ? (
                <Text color="gray.500" fontSize="sm" textAlign="center" py={8}>
                  Aucune notification
                </Text>
              ) : (
                notifications.map((n) => {
                  const cfg = levelConfig[n.level];
                  return (
                    <Box
                      key={n.id}
                      p={3}
                      borderBottom="1px solid rgba(255,255,255,0.05)"
                      _hover={{ bg: "rgba(255,255,255,0.03)" }}
                    >
                      <HStack align="start" gap={3}>
                        <Icon as={cfg.icon} boxSize={4} color={cfg.color} mt={0.5} />
                        <Box flex={1} minW={0}>
                          <Text color="white" fontSize="sm" fontWeight="bold">{n.title}</Text>
                          {n.description && (
                            <Text color="gray.400" fontSize="xs" mt={0.5}>{n.description}</Text>
                          )}
                          <Text color="gray.600" fontSize="10px" mt={1}>
                            {new Date(n.timestamp).toLocaleTimeString()}
                            {n.source && ` • ${n.source}`}
                          </Text>
                        </Box>
                        <Button size="xs" variant="ghost" color="gray.500"
                          onClick={() => clearNotification(n.id)}
                        >
                          <Icon as={X} boxSize={3} />
                        </Button>
                      </HStack>
                    </Box>
                  );
                })
              )}
            </VStack>
          </Box>
        </Portal>
      )}
    </Box>
  );
};

// Inline toast for transient notifications
export const NotificationToast = ({ notification: n }: { notification: Notification }) => {
  const cfg = levelConfig[n.level];
  return (
    <Box
      bg={cfg.bg} border="1px solid" borderColor={cfg.color}
      borderRadius="md" p={3} maxW="400px"
      boxShadow="0 8px 30px rgba(0,0,0,0.6)"
    >
      <HStack gap={3}>
        <Icon as={cfg.icon} boxSize={5} color={cfg.color} />
        <Box flex={1}>
          <Text color="white" fontSize="sm" fontWeight="bold">{n.title}</Text>
          {n.description && (
            <Text color="gray.300" fontSize="xs" mt={0.5}>{n.description}</Text>
          )}
        </Box>
      </HStack>
    </Box>
  );
};
