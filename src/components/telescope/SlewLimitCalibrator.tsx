// SlewLimitCalibrator.tsx – composant réutilisable pour le calibrage des limites de slew
// Ce composant regroupe :
//   • Le flux vidéo en temps réel (CCD) via l'API /api/indi/stream
//   • Un jog‑pad compact pour piloter la monture
//   • L'enregistrement des 4 points limites (Basse, Haute, Gauche, Droite)
//   • Une visualisation SkyDome avec la position actuelle et les limites
// Il est invoqué depuis la Home (via modal) et depuis l'Auto‑Align Wizard (étape 0).

import { useState, useEffect, useRef, useCallback } from "react";
import { Box, VStack, HStack, Grid, Button, Text, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Center, useDisclosure } from "@chakra-ui/react";
import { Icon } from "@chakra-ui/react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { JogPad } from "@/components/telescope/JogPad"; // will create a tiny wrapper if not exist
import { SkyDome } from "@/components/telescope/SkyDome"; // wrapper for the SVG visualisation defined in AutoAlignWizard

// Types partagés avec l'auto‑align
interface LimitPoint {
  alt: number; // degrés altitude
  az: number;  // degrés azimut
  ra: number;  // heures décimales (pour persistance)
  dec: number; // degrés décimaux
}
interface TelescopeLimits {
  low?:   LimitPoint;
  high?:  LimitPoint;
  left?:  LimitPoint;
  right?: LimitPoint;
}
const LIMIT_KEYS = ["low", "high", "left", "right"] as const;
type LimitKey = typeof LIMIT_KEYS[number];

// Metadonnées affichées (fr/en) – vous pouvez étendre si besoin
const LIMIT_META: Record<LimitKey, { fr: string; color: string }> = {
  low:   { fr: "Basse",   color: "#f6ad55" },
  high:  { fr: "Haute",   color: "#63b3ed" },
  left:  { fr: "Gauche",  color: "#68d391" },
  right: { fr: "Droite",  color: "#fc8181" },
};

/**
 * SlewLimitCalibrator
 * Props :
 *   - initialLimits : charge les limites déjà connues (si elles existent).
 *   - onValidate : callback exécuté quand l'utilisateur valide les 4 points.
 */
export const SlewLimitCalibrator = ({
  initialLimits = {},
  onValidate,
  isOpen,
  onClose,
}: {
  initialLimits?: TelescopeLimits;
  onValidate: (limits: TelescopeLimits) => void;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { config } = useStargazerStore();
  const [limits, setLimits] = useState<TelescopeLimits>(initialLimits);
  const [liveAlt, setLiveAlt] = useState<number>();
  const [liveAz, setLiveAz] = useState<number>();
  const [liveRa, setLiveRa] = useState<number>();
  const [liveDec, setLiveDec] = useState<number>();
  const [recording, setRecording] = useState<LimitKey | null>(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [ccdImage, setCcdImage] = useState<string | null>(null);
  const abortRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  /** ---------------------------------------------------
   *  1️⃣  POLL POSITION – continue de récupérer l'ALT/AZ en temps réel
   * --------------------------------------------------- */
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        // 1️⃣ Fetch du statut du mount (RA/DEC en degrés)
        const res = await fetch('/api/indi/mount/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.connected) return;
        const raHours = (data.ra ?? 0) / 15; // conversion deg → h
        const decDeg = data.dec ?? 0;
        setLiveRa(raHours);
        setLiveDec(decDeg);

        // 2️⃣ Conversion RA/DEC → Alt/Az via le backend
        const lat = parseFloat(config.latitude) || -17.6333; // valeur par défaut (Tahiti)
        const lon = parseFloat(config.longitude) || -149.6;
        const conv = await fetch('/api/indi/astro/coords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ra: raHours, dec: decDeg, lat, lon })
        });
        if (!conv.ok) return;
        const { alt, az, success } = await conv.json();
        if (success) {
          setLiveAlt(alt);
          setLiveAz(az);
        }
      } catch (e) {
        console.error('poll error', e);
      }
    };
    poll();
    const interval = setInterval(() => active && poll(), 2500);
    return () => { active = false; clearInterval(interval); };
  }, [config.latitude, config.longitude]);

  /** ---------------------------------------------------
   *  2️⃣  VIDÉO LIVE – démarre/arrête le flux CCD
   * --------------------------------------------------- */
  const startLiveView = async () => {
    try {
      const res = await fetch('/api/indi/liveview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      if (!res.ok) return;
      const streamUrl = `/api/indi/stream?t=${Date.now()}`;
      setCcdImage(streamUrl);
      setIsLiveStreaming(true);
    } catch (e) {
      console.error('live view error', e);
    }
  };
  const stopLiveView = async () => {
    try {
      await fetch('/api/indi/liveview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
    } catch (e) { console.error(e); }
    setIsLiveStreaming(false);
    setCcdImage(null);
  };

  // Arrêt du stream à la fermeture du modal (cleanup)
  useEffect(() => {
    return () => { stopLiveView(); };
  }, []);

  /** ---------------------------------------------------
   *  3️⃣  JOGGING – petite fonction de déplacement de la monture
   * --------------------------------------------------- */
  const jog = async (dir: string) => {
    try {
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'jog', direction: dir, state: 'start', duration: 0.5, device: config.driverInstance })
      });
      await new Promise(r => setTimeout(r, 600));
      await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'jog', direction: dir, state: 'stop', device: config.driverInstance })
      });
    } catch (e) { console.error('jog error', e); }
  };

  /** ---------------------------------------------------
   *  4️⃣  ENREGISTREMENT D'UNE LIMITE
   * --------------------------------------------------- */
  const recordLimit = async (key: LimitKey) => {
    if (liveAlt === undefined || liveAz === undefined || liveRa === undefined || liveDec === undefined) {
      alert('Position indisponible – vérifie la connexion INDI');
      return;
    }
    setRecording(key);
    // petit délai visuel
    await new Promise(r => setTimeout(r, 300));
    setLimits(prev => ({
      ...prev,
      [key]: { alt: liveAlt, az: liveAz, ra: liveRa, dec: liveDec }
    }));
    setRecording(null);
  };

  /** ---------------------------------------------------
   *  5️⃣  VALIDATION – bouton “Valider”
   * --------------------------------------------------- */
  const ready = limits.low && limits.high && limits.left && limits.right;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="gray.800" color="whiteAlpha.900">
        <ModalHeader>Calibrage des limites de slew</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Grid templateColumns="2fr 1fr" gap={4}>
            {/* LEFT : Vidéo + Jog */}
            <VStack spacing={3} align="stretch">
              <Box position="relative" bg="black" borderRadius="md" overflow="hidden" h="260px">
                {isLiveStreaming && ccdImage ? (
                  <img src={ccdImage} alt="Live view" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Center h="100%"><Text color="whiteAlpha.500">Live désactivée</Text></Center>
                )}
                <Button
                  size="sm"
                  position="absolute"
                  top={2}
                  right={2}
                  onClick={isLiveStreaming ? stopLiveView : startLiveView}
                >
                  {isLiveStreaming ? 'Stop' : 'Start'} Live
                </Button>
              </Box>
              <Box>
                <Text mb={1}>Piloter la monture (jog)</Text>
                <JogPad onJog={jog} />
              </Box>
            </VStack>

            {/* RIGHT : SkyDome + boutons d'enregistrement */}
            <VStack spacing={3} align="stretch">
              <SkyDome limits={limits} liveAlt={liveAlt} liveAz={liveAz} />
              <VStack align="start" spacing={2}>
                {LIMIT_KEYS.map(k => (
                  <Button
                    key={k}
                    size="sm"
                    colorScheme="teal"
                    variant={limits[k as keyof TelescopeLimits] ? 'solid' : 'outline'}
                    isLoading={recording === k}
                    onClick={() => recordLimit(k as LimitKey)}
                  >
                    Enregistrer {LIMIT_META[k as LimitKey].fr}
                  </Button>
                ))}
              </VStack>
            </VStack>
          </Grid>
          <Box mt={4} textAlign="right">
            <Button
              colorScheme="green"
              isDisabled={!ready}
              onClick={() => { onValidate(limits); onClose(); }}
            >
              Valider les limites
            </Button>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
