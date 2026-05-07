"use client";

import { Box, VStack, Text, Center, Portal, Grid, HStack, Icon } from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import { useStargazerStore } from "@/store/useStargazerStore";
import { Orbit, Cpu, Shield, Globe, Activity, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

const MotionBox = motion(Box);
const MotionText = motion(Text);

const Particle = ({ i }: { i: number }) => {
    const randomX = Math.random() * 100;
    const randomY = Math.random() * 100;
    const randomDelay = Math.random() * 5;
    const randomDuration = 10 + Math.random() * 20;

    return (
        <MotionBox
            position="absolute"
            w="2px"
            h="2px"
            bg="var(--astro-teal)"
            borderRadius="full"
            initial={{ left: `${randomX}%`, top: `${randomY}%`, opacity: 0 }}
            animate={{ 
                top: ["0%", "100%"],
                opacity: [0, 0.8, 0],
                x: [0, Math.random() * 50 - 25]
            }}
            transition={{ 
                duration: randomDuration, 
                repeat: Infinity, 
                delay: randomDelay,
                ease: "linear"
            }}
        />
    );
};

export const GlobalLoader = () => {
    const { isGlobalLoading, globalLoadingMessage } = useStargazerStore();
    const [glitchText, setGlitchText] = useState("");

    useEffect(() => {
        if (isGlobalLoading) {
            const message = globalLoadingMessage || "EXECUTING_COMMAND";
            let i = 0;
            const timer = setInterval(() => {
                setGlitchText(message.substring(0, i));
                i++;
                if (i > message.length) clearInterval(timer);
            }, 50);
            return () => clearInterval(timer);
        }
    }, [isGlobalLoading, globalLoadingMessage]);

    return (
        <AnimatePresence>
            {isGlobalLoading && (
                <Portal>
                    <MotionBox
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        position="fixed"
                        inset={0}
                        zIndex={9999}
                        bg="rgba(2, 4, 8, 0.95)"
                        backdropFilter="blur(40px)"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        overflow="hidden"
                    >
                        {/* 1. Background Particle System */}
                        <Box position="absolute" inset={0} pointerEvents="none" opacity={0.3}>
                            {Array.from({ length: 40 }).map((_, i) => (
                                <Particle key={i} i={i} />
                            ))}
                        </Box>

                        {/* 2. Dynamic Scanning Grid */}
                        <Box position="absolute" inset={0} pointerEvents="none">
                            <MotionBox 
                                h="full" w="full" 
                                opacity={0.03}
                                backgroundImage="radial-gradient(var(--astro-teal) 1px, transparent 0)"
                                backgroundSize="40px 40px"
                                animate={{ backgroundPosition: ["0px 0px", "40px 40px"] }}
                                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            />
                            <Box 
                                h="1px" w="full" 
                                bg="linear-gradient(90deg, transparent, var(--astro-teal), transparent)" 
                                position="absolute" top="0" 
                                className="scanline" 
                                boxShadow="0 0 20px var(--astro-teal)"
                            />
                        </Box>

                        {/* 3. Main HUD Content */}
                        <VStack gap={16} position="relative" w="full">
                            
                            {/* Animated Central Core */}
                            <Box position="relative" w="300px" h="300px">
                                {/* Large HUD Circle 1 */}
                                <MotionBox
                                    position="absolute"
                                    inset="-40px"
                                    borderRadius="full"
                                    border="1px solid"
                                    borderColor="rgba(255, 51, 51, 0.1)"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                />
                                <Box position="absolute" top="-42px" left="50%" transform="translateX(-50%)" px={2} bg="rgba(2,4,8,1)" border="1px solid rgba(255,51,51,0.2)" borderRadius="sm">
                                    <Text fontSize="8px" className="hud-font" color="var(--astro-teal)">AZ_LIMIT_LOCK</Text>
                                </Box>

                                {/* Rotating Arcs */}
                                <MotionBox
                                    position="absolute"
                                    inset="-20px"
                                    borderRadius="full"
                                    border="4px double"
                                    borderColor="transparent"
                                    borderTopColor="rgba(255, 51, 51, 0.4)"
                                    borderBottomColor="rgba(255, 51, 51, 0.4)"
                                    animate={{ rotate: -360 }}
                                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                />

                                {/* Middle Data Ring */}
                                <MotionBox
                                    position="absolute"
                                    inset="20px"
                                    borderRadius="full"
                                    border="1px dashed"
                                    borderColor="rgba(255, 51, 51, 0.3)"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                                />

                                {/* Inner Core Shadow */}
                                <Box 
                                    position="absolute" inset="50px" 
                                    borderRadius="full" 
                                    bg="radial-gradient(circle, rgba(255, 51, 51, 0.1) 0%, transparent 70%)"
                                    className="pulse-glow"
                                />

                                {/* Central Icon with Glitch Pulse */}
                                <Center position="absolute" inset="0">
                                    <MotionBox
                                        animate={{ 
                                            scale: [0.95, 1.05, 0.95],
                                            filter: ["hue-rotate(0deg)", "hue-rotate(15deg)", "hue-rotate(0deg)"]
                                        }}
                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    >
                                        <Orbit size={120} color="var(--astro-teal)" className="pulse-glow" />
                                    </MotionBox>
                                </Center>

                                {/* Orbital Elements */}
                                {[0, 90, 180, 270].map((angle, i) => (
                                    <MotionBox
                                        key={i}
                                        position="absolute"
                                        top="50%"
                                        left="50%"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 15 + i*5, repeat: Infinity, ease: "linear" }}
                                        style={{ transformOrigin: "0 130px", marginTop: "-65px" }}
                                    >
                                        <Box transform={`rotate(${angle}deg)`}>
                                            <Box w="6px" h="6px" bg="var(--astro-gold)" borderRadius="full" boxShadow="0 0 10px var(--astro-gold)" />
                                        </Box>
                                    </MotionBox>
                                ))}
                            </Box>

                            {/* Text & Status HUD */}
                            <VStack gap={8} w="full">
                                <VStack gap={2}>
                                    <Box position="relative">
                                        <MotionText 
                                            className="hud-font" 
                                            color="white" 
                                            fontSize="42px" 
                                            letterSpacing="0.3em"
                                            fontWeight="black"
                                            textAlign="center"
                                            textTransform="uppercase"
                                            textShadow="0 0 20px var(--astro-teal)"
                                        >
                                            {glitchText}
                                            <motion.span
                                                animate={{ opacity: [1, 0] }}
                                                transition={{ duration: 0.5, repeat: Infinity }}
                                            >
                                                _
                                            </motion.span>
                                        </MotionText>
                                    </Box>
                                    <HStack gap={10} opacity={0.6}>
                                        <Text fontSize="10px" className="hud-font" color="var(--astro-teal)">LAT: -17.6008</Text>
                                        <Text fontSize="10px" className="hud-font" color="var(--astro-teal)">LON: -149.6091</Text>
                                        <Text fontSize="10px" className="hud-font" color="var(--astro-teal)">SYS: READY</Text>
                                    </HStack>
                                </VStack>

                                {/* Animated Data Stream */}
                                <HStack 
                                    gap={6} 
                                    bg="rgba(255, 51, 51, 0.05)" 
                                    px={10} py={4} 
                                    borderRadius="sm" 
                                    border="1px solid rgba(255, 51, 51, 0.2)"
                                    position="relative"
                                    overflow="hidden"
                                >
                                    <MotionBox
                                        position="absolute"
                                        top="0" left="0" w="full" h="1px"
                                        bg="var(--astro-teal)"
                                        initial={{ left: "-100%" }}
                                        animate={{ left: "100%" }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    />
                                    
                                    <HStack gap={3}>
                                        <Activity size={16} color="var(--astro-teal)" className="pulse-glow" />
                                        <Text fontSize="11px" color="var(--astro-teal)" fontWeight="bold" letterSpacing="0.2em" className="hud-font">
                                            ASTROBERRY UP-LINK ESTABLISHED
                                        </Text>
                                    </HStack>
                                    
                                    <Box w="1px" h="20px" bg="rgba(255, 51, 51, 0.3)" />
                                    
                                    <HStack gap={3}>
                                        <Terminal size={16} color="var(--astro-gold)" />
                                        <Text fontSize="11px" color="var(--astro-gold)" fontWeight="bold" letterSpacing="0.2em" className="hud-font">
                                            INDI STREAM ACTIVE
                                        </Text>
                                    </HStack>
                                </HStack>
                            </VStack>

                            {/* Corner HUD Decorations */}
                            <Box position="absolute" top="-100px" left="-100px" w="120px" h="120px" borderTop="1px solid var(--astro-teal)" borderLeft="1px solid var(--astro-teal)" opacity={0.3} />
                            <Box position="absolute" top="-100px" right="-100px" w="120px" h="120px" borderTop="1px solid var(--astro-teal)" borderRight="1px solid var(--astro-teal)" opacity={0.3} />
                            <Box position="absolute" bottom="-100px" left="-100px" w="120px" h="120px" borderBottom="1px solid var(--astro-teal)" borderLeft="1px solid var(--astro-teal)" opacity={0.3} />
                            <Box position="absolute" bottom="-100px" right="-100px" w="120px" h="120px" borderBottom="1px solid var(--astro-teal)" borderRight="1px solid var(--astro-teal)" opacity={0.3} />
                        </VStack>
                    </MotionBox>
                </Portal>
            )}

            <style jsx global>{`
                .scanline {
                    animation: scan 4s linear infinite;
                }
                @keyframes scan {
                    0% { top: -5%; }
                    100% { top: 105%; }
                }
                .pulse-glow {
                    animation: pulse-glow-hud 2s infinite alternate ease-in-out;
                }
                @keyframes pulse-glow-hud {
                    from { filter: drop-shadow(0 0 5px var(--astro-teal)); opacity: 0.8; }
                    to { filter: drop-shadow(0 0 15px var(--astro-teal)); opacity: 1; }
                }
            `}</style>
        </AnimatePresence>
    );
};

