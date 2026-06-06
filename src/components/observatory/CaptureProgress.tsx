"use client";

import { Box, Text, Progress, VStack, HStack, Icon, Badge, Portal } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Layers, CheckCircle2, Loader2 } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

const MotionBox = motion.create(Box);

export const CaptureProgress = () => {
  const { captureProgress, stackingProgress, isExposing, language } = useStargazerStore();

  if (!isExposing && captureProgress === 0 && stackingProgress === 0) return null;

  return (
    <Portal>
      <AnimatePresence>
        <MotionBox
          initial={{ opacity: 0, x: 50, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 50, scale: 0.95 }}
          position="fixed"
          bottom="100px"
          right="40px"
          zIndex="overlay"
        w="340px"
        bg="rgba(10, 15, 30, 0.9)"
        backdropFilter="blur(16px)"
        borderRadius="2xl"
        p={5}
        border="1px solid"
        borderColor={isExposing ? "rgba(255, 200, 100, 0.3)" : "rgba(100, 255, 255, 0.2)"}
        boxShadow="0 20px 50px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(255,255,255,0.05)"
      >
        <VStack align="stretch" gap={5} position="relative">
          {/* Decorative Corners */}
          <Box position="absolute" top="-2px" left="-2px" w="10px" h="10px" borderTop="2px solid var(--astro-teal)" borderLeft="2px solid var(--astro-teal)" />
          <Box position="absolute" top="-2px" right="-2px" w="10px" h="10px" borderTop="2px solid var(--astro-teal)" borderRight="2px solid var(--astro-teal)" />
          
          <HStack justify="space-between">
            <HStack gap={3}>
              <Box className={isExposing ? "pulse-glow" : ""} position="relative">
                <Icon as={Camera} color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"} boxSize={5} />
                {isExposing && (
                  <Box 
                    position="absolute" 
                    top="-50%" 
                    left="-50%" 
                    w="200%" 
                    h="200%" 
                    borderRadius="full" 
                    border="1px solid var(--astro-gold)"
                    opacity={0.3}
                    className="ping-slow"
                  />
                )}
              </Box>
              <VStack align="start" gap={0}>
                <Text fontSize="12px" fontWeight="bold" color="white" letterSpacing="0.1em" className="hud-font">
                  {isExposing ? "DATA ACQUISITION" : "PROCESSING STACK"}
                </Text>
                <Text fontSize="9px" color="whiteAlpha.500" letterSpacing="0.05em">SENS. EOS 600D • FRM_CAPT_01</Text>
              </VStack>
            </HStack>
            <Badge 
              bg={isExposing ? "rgba(255, 180, 0, 0.2)" : "rgba(0, 255, 200, 0.2)"} 
              color={isExposing ? "var(--astro-gold)" : "var(--astro-teal)"}
              variant="subtle" 
              borderRadius="sm" 
              px={2} 
              py={0.5}
              fontSize="8px"
              letterSpacing="0.1em"
              border="1px solid"
              borderColor="whiteAlpha.200"
            >
              {isExposing ? "ACTIVE_STREAM" : "INTEGRATION"}
            </Badge>
          </HStack>

          {/* Capture Progress */}
          <Box position="relative">
            <HStack justify="space-between" mb={2}>
              <HStack gap={2}>
                <Box w="2px" h="10px" bg="var(--astro-gold)" />
                <Text fontSize="10px" color="whiteAlpha.700" letterSpacing="0.05em" fontWeight="bold">BUFFER_RAW</Text>
              </HStack>
              <Text fontSize="12px" fontWeight="bold" color="var(--astro-gold)" className="hud-font" style={{ fontVariantNumeric: 'tabular-nums' }}>{captureProgress}%</Text>
            </HStack>
            <Box w="full" h="6px" bg="whiteAlpha.100" borderRadius="0" overflow="hidden" position="relative" border="1px solid rgba(255, 255, 255, 0.05)">
              <MotionBox 
                h="full" 
                bg="var(--astro-gold)" 
                initial={{ width: 0 }}
                animate={{ width: `${captureProgress}%` }}
                transition={{ duration: 0.5 }}
                boxShadow="0 0 10px var(--astro-gold)"
              />
              {/* Scanline overlay */}
              <Box position="absolute" top={0} left={0} right={0} bottom={0} background="repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.3) 4px, rgba(0,0,0,0.3) 5px)" pointerEvents="none" />
            </Box>
          </Box>

          {/* Stacking Progress */}
          <Box position="relative">
            <HStack justify="space-between" mb={2}>
              <HStack gap={2}>
                <Box w="2px" h="10px" bg="var(--astro-teal)" />
                <Text fontSize="10px" color="whiteAlpha.700" letterSpacing="0.05em" fontWeight="bold">PROC_INTEGRATION</Text>
              </HStack>
              <Text fontSize="12px" fontWeight="bold" color="var(--astro-teal)" className="hud-font" style={{ fontVariantNumeric: 'tabular-nums' }}>{stackingProgress}%</Text>
            </HStack>
            <Box w="full" h="6px" bg="whiteAlpha.100" borderRadius="0" overflow="hidden" position="relative" border="1px solid rgba(255, 255, 255, 0.05)">
              <MotionBox 
                h="full" 
                bg="var(--astro-teal)" 
                initial={{ width: 0 }}
                animate={{ width: `${stackingProgress}%` }}
                transition={{ duration: 0.5 }}
                boxShadow="0 0 10px var(--astro-teal)"
              />
              {/* Scanline overlay */}
              <Box position="absolute" top={0} left={0} right={0} bottom={0} background="repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.3) 4px, rgba(0,0,0,0.3) 5px)" pointerEvents="none" />
            </Box>
          </Box>

          <AnimatePresence>
            {stackingProgress === 100 && (
              <MotionBox
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <HStack color="var(--astro-teal)" gap={3} fontSize="10px" mt={1} bg="rgba(0, 255, 180, 0.05)" p={2} borderRadius="0" border="1px solid rgba(0, 255, 180, 0.2)">
                  <Icon as={CheckCircle2} boxSize={3} />
                  <Text fontWeight="bold" letterSpacing="0.1em">MASTER_FRAME_SYNCHRONIZED_OK</Text>
                </HStack>
              </MotionBox>
            )}
          </AnimatePresence>
        </VStack>

        <style jsx global>{`
          .spin {
            animation: spin 2s linear infinite;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </MotionBox>
      </AnimatePresence>
    </Portal>
  );
};
