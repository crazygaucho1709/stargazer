// InteractiveSkyMap.tsx – Carte du ciel interactive pour GoTo, capture et stack
// Cette carte remplace le SkyDome statique avec une vision du ciel réelle
// Intègre les catalogues Messier/Hipparcos, affiche la position du NexStar et permet le click→slew

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, VStack, HStack, Text, Button, Icon, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure, Badge } from '@chakra-ui/react';
import { Telescope, Camera, Zap, X } from 'lucide-react';
import { useStargazerStore } from '@/store/useStargazerStore';

// Types
interface SkyObject {
  id: string;
  name: string;
  ra: number;  // heures
  dec: number; // degrés
  type: 'star' | 'nebula' | 'galaxy' | 'cluster';
  magnitude?: number;
  constellation?: string;
}

// Catalogue simplifié (Messier + Hipparcos majeurs) – on pourra étendre
const loadMessierCatalog = () => {
  // D'après le fichier M de Stellarium (extrait)
  const catalog: SkyObject[] = [
    { id: 'M31', name: 'Andromède', ra: 0.7129, dec: 41.2692, type: 'galaxy', magnitude: 3.4, constellation: 'And' },
    { id: 'M42', name: 'Orion', ra: 5.5865, dec: -5.2361, type: 'nebula', magnitude: 4.0, constellation: 'Ori' },
    { id: 'M45', name: 'Pleiades', ra: 3.7917, dec: 24.1167, type: 'cluster', magnitude: 1.6, constellation: 'Tau' },
    { id: 'M13', name: 'Hercules', ra: 16.6950, dec: 36.4525, type: 'cluster', magnitude: 5.8, constellation: 'Her' },
    { id: 'M20', name: 'Trifid', ra: 18.0363, dec: -23.0322, type: 'nebula', magnitude: 6.3, constellation: 'Sgr' },
    { id: 'Polaris', name: 'Étoile Polaire', ra: 2.5303, dec: 89.2641, type: 'star', magnitude: 1.9, constellation: 'Umi' },
  ];
  return catalog;
};

// Conversion coordonnées → coordonnées écran (projection stereographique simple)
const raDecToXY = (ra: number, dec: number, width: number, height: number) => {
  const x = (ra / 24) * width;
  const y = (90 - dec) / 180 * height;
  return { x, y };
};

const InteractiveSkyMap: React.FC = () => {
  const { config } = useStargazerStore();
  const [objects] = useState<SkyObject[]>(loadMessierCatalog());
  const [telescopePos, setTelescopePos] = useState<{ ra: number; dec: number } | null>(null);
  const [selectedObj, setSelectedObj] = useState<SkyObject | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Polling de la position du télescope
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/indi/mount/status', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.ra !== undefined && data.dec !== undefined) {
            const raHours = data.ra / 15; // INDI RA en degrés → heures
            setTelescopePos({ ra: raHours, dec: data.dec });
          }
        }
      } catch (e) {
        console.error('Mount status error:', e);
      }
    };
    poll();
    const interval = setInterval(() => { if (active) poll(); }, 2000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const handleObjectClick = useCallback(async (obj: SkyObject) => {
    setSelectedObj(obj);
    onOpen();
  }, [onOpen]);

  const handleSlew = useCallback(async () => {
    if (!selectedObj) return;
    try {
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'slew', ra: selectedObj.ra, dec: selectedObj.dec })
      });
      onClose();
    } catch (e) {
      console.error('Slew error:', e);
    }
  }, [selectedObj, onClose]);

  const handleCapture = useCallback(async () => {
    if (!selectedObj) return;
    try {
      await fetch('/api/indi/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exposure: 30 }) // 30s capture
      });
      onClose();
    } catch (e) {
      console.error('Capture error:', e);
    }
  }, [onClose]);

  const objectMarkers = useMemo(() => {
    return objects.map((obj) => {
      const W = 600, H = 400;
      const { x, y } = raDecToXY(obj.ra, obj.dec, W, H);
      const isTargeted = telescopePos && Math.abs(telescopePos.ra - obj.ra) < 0.1 && Math.abs(telescopePos.dec - obj.dec) < 0.1;
      const size = obj.magnitude ? Math.max(4, 10 - obj.magnitude) : 6;
      const color = { star: '#fff', nebula: '#ff6b6b', galaxy: '#4dabf7', cluster: '#a99' }[obj.type];
      return (
        <g key={obj.id} onClick={() => handleObjectClick(obj)} style={{ cursor: 'pointer' }}>
          <circle cx={x} cy={y} r={isTargeted ? size + 2 : size} fill={isTargeted ? '#ffdd57' : color} opacity={0.9} />
          <title>{obj.name}</title>
        </g>
      );
    });
  }, [objects, telescopePos, handleObjectClick]);

  return (
    <Box bg="#030509" borderRadius="8px" p={2} position="relative">
      <svg width="100%" height="400px" viewBox="0 0 600 400">
        {/* Fond étoilé */}
        <rect width="600" height="400" fill="#030509" />
        {/* Grid équatorial */}
        {[...Array(13)].map((_, i) => (
          <line key={i} x1={i * 50} y1={0} x2={i * 50} y2={400} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        ))}
        {/* Marqueurs objets */}
        {objectMarkers}
        {/* Position télescope (cercle jaune si parked = NULL, sinon croix) */}
        {telescopePos && (
          <g>
            <circle cx={raDecToXY(telescopePos.ra, telescopePos.dec, 600, 400).x} cy={raDecToXY(telescopePos.ra, telescopePos.dec, 600, 400).y} r={8} fill="none" stroke="#ffdd57" strokeWidth={2} strokeDasharray="4,2" />
            <text x={raDecToXY(telescopePos.ra, telescopePos.dec, 600, 400).x + 12} y={raDecToXY(telescopePos.ra, telescopePos.dec, 600, 400).y} fontSize={8} fill="#ffdd57">NexStar</text>
          </g>
        )}
      </svg>
      {/* Modal pour actions sur objet sélectionné */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="whiteAlpha.900">
          <ModalHeader>{selectedObj?.name || 'Objet sélectionné'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <HStack justify="space-between">
                <Badge colorScheme="purple">{selectedObj?.type}</Badge>
                <Badge>{selectedObj?.constellation}</Badge>
              </HStack>
              <Text fontSize="sm">RA: {selectedObj?.ra.toFixed(3)}h / DEC: {selectedObj?.dec.toFixed(2)}°</Text>
              <HStack>
                <Button leftIcon={<Icon as={Telescope} />} colorScheme="teal" flex="1" onClick={handleSlew}>
                  GoTo
                </Button>
                <Button leftIcon={<Icon as={Camera} />} colorScheme="orange" flex="1" onClick={handleCapture}>
                  Capturer
                </Button>
                <Button leftIcon={<Icon as={Zap} />} colorScheme="green" flex="1">
                  Stack
                </Button>
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default InteractiveSkyMap;