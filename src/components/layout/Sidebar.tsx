// src/components/layout/Sidebar.tsx
"use client";

import { Box, Flex, VStack, Icon } from "@chakra-ui/react";
import { Telescope, Camera, Map, History, Settings, Zap } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";

const NavItem = ({ icon: LucideIcon, label, active = false }: { icon: any, label: string, active?: boolean }) => (
    <Flex
        align="center"
        justify="center"
        w="50px"
        h="50px"
        cursor="pointer"
        borderRadius="full"
        position="relative"
        bg={active ? "rgba(208, 0, 0, 0.2)" : "transparent"}
        color={active ? "#D00000" : "whiteAlpha.600"}
        transition="all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
        title={label}
        _hover={{
            color: "#D00000",
            bg: "rgba(208, 0, 0, 0.1)",
            transform: "scale(1.1)"
        }}
    >
        {active && (
            <Box
                position="absolute"
                left="-15px"
                w="4px"
                h="20px"
                bg="#D00000"
                borderRadius="full"
                className="glow-red"
            />
        )}
        <LucideIcon size={24} strokeWidth={active ? 2.5 : 2} />
    </Flex>
);

export const Sidebar = () => {
    const isConnected = useStargazerStore((state) => state.isConnected);

    return (
        <Box
            w="80px"
            h="calc(100vh - 40px)"
            className="glass-panel"
            borderRadius="2xl"
            position="fixed"
            left="20px"
            top="20px"
            zIndex={30}
        >
            <Flex direction="column" h="full" align="center" py="40px" justify="space-between">
                <VStack gap={10}>
                    <Box
                        p="10px"
                        borderRadius="15px"
                        bg="black"
                        border="1px solid"
                        borderColor={isConnected ? "#FFB300" : "whiteAlpha.100"}
                        className={isConnected ? "pulse" : ""}
                    >
                        <Icon as={Zap} boxSize={6} color={isConnected ? "#FFB300" : "whiteAlpha.400"} />
                    </Box>

                    <VStack gap={5}>
                        <NavItem icon={Telescope} label="Dashboard" active />
                        <NavItem icon={Camera} label="Imaging" />
                        <NavItem icon={Map} label="Star Map" />
                        <NavItem icon={History} label="Logs" />
                    </VStack>
                </VStack>

                <NavItem icon={Settings} label="Settings" />
            </Flex>
        </Box>
    );
};
