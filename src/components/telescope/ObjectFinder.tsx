"use client";

import { useState, useEffect, useMemo } from "react";
import { Box, VStack, HStack, Text, Button, Icon, Input, Badge, Flex, Grid } from "@chakra-ui/react";
import { Search, Target, Star, Telescope, MapPin, Clock, Compass, Filter, ChevronRight, Navigation } from "lucide-react";
import { useStargazerStore } from "@/store/useStargazerStore";
import { CELESTIAL_CATALOG, getVisibleObjects, CelestialObject } from "@/data/celestialCatalog";
import { t } from "@/i18n/translations";
import { mockApi } from "@/services/mockApi";

interface ObjectFinderProps {
  onSlew?: (ra: number, dec: number) => void;
}

export const ObjectFinder = ({ onSlew }: ObjectFinderProps) => {
  const { language, ra, dec, alt, az, setPosition, setSlewing, config } = useStargazerStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");
  const [selectedObject, setSelectedObject] = useState<CelestialObject | null>(null);
  const [isSlewingToTarget, setIsSlewingToTarget] = useState(false);
  const [visibleObjects, setVisibleObjects] = useState<CelestialObject[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate visible objects based on current time and location
  useEffect(() => {
    // Default to Paris coordinates if not set
    const lat = 48.8566;
    const lon = 2.3522;
    
    const objects = getVisibleObjects(currentTime, lat, lon, 20);
    setVisibleObjects(objects);
  }, [currentTime]);

  // Filter objects based on search and filters
  const filteredObjects = useMemo(() => {
    return visibleObjects.filter(obj => {
      const matchesSearch = 
        obj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obj.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obj.constellation.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = filterType === "all" || obj.type === filterType;
      const matchesDifficulty = filterDifficulty === "all" || obj.difficulty === filterDifficulty;
      
      return matchesSearch && matchesType && matchesDifficulty;
    });
  }, [visibleObjects, searchQuery, filterType, filterDifficulty]);

  const handleSlewToObject = async (obj: CelestialObject) => {
    setIsSlewingToTarget(true);
    setSelectedObject(obj);
    setSlewing(true);

    // Call API to slew mount
    try {
      const res = await fetch('/api/indi/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'slew',
          ra: obj.ra_deg,
          dec: obj.dec_deg,
          ip: config.astroberryUrl.replace('http://', '').replace(':8624', '')
        })
      });

      if (res.ok) {
        // Update UI position
        setPosition(obj.ra, obj.dec, 45, 180); // Placeholder alt/az
        
        // Simulate slew time based on distance
        setTimeout(() => {
          setSlewing(false);
          setIsSlewingToTarget(false);
        }, 3000);
      } else {
        throw new Error('Slew failed');
      }
    } catch (e) {
      console.error('GOTO failed:', e);
      setSlewing(false);
      setIsSlewingToTarget(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Galaxy': return '#FF6B6B';
      case 'Nebula': return '#4ECDC4';
      case 'Star Cluster': return '#FFE66D';
      case 'Planetary Nebula': return '#95E1D3';
      case 'Supernova Remnant': return '#F38181';
      default: return '#00F0FF';
    }
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Easy': return 'green';
      case 'Medium': return 'yellow';
      case 'Hard': return 'red';
      default: return 'gray';
    }
  };

  return (
    <VStack align="stretch" gap={4} w="full">
      {/* Header */}
      <HStack justify="space-between">
        <HStack gap={2}>
          <Icon as={Telescope} boxSize={5} color="var(--astro-teal)" />
          <Text fontSize="14px" fontWeight="bold" letterSpacing="0.1em">
            {language === 'fr' ? 'CHERCHEUR D\'OBJETS' : 'OBJECT FINDER'}
          </Text>
        </HStack>
        <Badge colorScheme="cyan" variant="outline">
          {visibleObjects.length} {language === 'fr' ? 'visibles' : 'visible'}
        </Badge>
      </HStack>

      {/* Search & Filters */}
      <Box bg="rgba(0,0,0,0.3)" p={3} borderRadius="8px">
        <VStack gap={3} align="stretch">
          {/* Search Input */}
          <HStack>
            <Icon as={Search} boxSize={4} color="whiteAlpha.500" />
            <Input
              placeholder={language === 'fr' ? 'Rechercher M31, Orion...' : 'Search M31, Orion...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              bg="rgba(255,255,255,0.05)"
              border="none"
              fontSize="12px"
              _focus={{ bg: "rgba(255,255,255,0.1)" }}
            />
          </HStack>

          {/* Filters */}
          <HStack gap={2}>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                width: '110px',
                cursor: 'pointer'
              }}
            >
              <option value="all">{language === 'fr' ? 'Tous types' : 'All types'}</option>
              <option value="Galaxy">{language === 'fr' ? 'Galaxies' : 'Galaxies'}</option>
              <option value="Nebula">{language === 'fr' ? 'Nébuleuses' : 'Nebulae'}</option>
              <option value="Star Cluster">{language === 'fr' ? 'Amas' : 'Clusters'}</option>
              <option value="Planetary Nebula">{language === 'fr' ? 'Néb. Planétaires' : 'Planetary'}</option>
            </select>

            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'white',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                width: '100px',
                cursor: 'pointer'
              }}
            >
              <option value="all">{language === 'fr' ? 'Tous niveaux' : 'All levels'}</option>
              <option value="Easy">{language === 'fr' ? 'Facile' : 'Easy'}</option>
              <option value="Medium">{language === 'fr' ? 'Moyen' : 'Medium'}</option>
              <option value="Hard">{language === 'fr' ? 'Difficile' : 'Hard'}</option>
            </select>
          </HStack>
        </VStack>
      </Box>

      {/* Object List */}
      <VStack 
        align="stretch" 
        gap={2} 
        maxH="300px" 
        overflowY="auto" 
        className="custom-scrollbar"
        pr={1}
      >
        {filteredObjects.map((obj) => (
          <Box
            key={obj.id}
            p={3}
            bg={selectedObject?.id === obj.id ? "rgba(0,240,255,0.1)" : "rgba(255,255,255,0.03)"}
            borderRadius="8px"
            border="1px solid"
            borderColor={selectedObject?.id === obj.id ? "var(--astro-teal)" : "transparent"}
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            onClick={() => setSelectedObject(obj)}
          >
            <HStack justify="space-between" mb={2}>
              <HStack gap={2}>
                <Icon as={Star} boxSize={3} color={getTypeColor(obj.type)} />
                <Text fontSize="12px" fontWeight="bold">{obj.id}</Text>
                <Text fontSize="11px" color="whiteAlpha.700">{obj.name}</Text>
              </HStack>
              <Badge size="sm" colorScheme={getDifficultyColor(obj.difficulty)} variant="outline">
                {obj.magnitude.toFixed(1)}m
              </Badge>
            </HStack>

            <Flex justify="space-between" align="center">
              <HStack gap={3} fontSize="10px" color="whiteAlpha.500">
                <span>{obj.constellation}</span>
                <span>•</span>
                <span style={{ color: getTypeColor(obj.type) }}>{obj.type}</span>
              </HStack>

              <Button
                size="xs"
                bg="var(--astro-teal)"
                color="black"
                _hover={{ bg: "white" }}
                loading={isSlewingToTarget && selectedObject?.id === obj.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSlewToObject(obj);
                }}
              >
                <Icon as={Navigation} boxSize={3} mr={1} />
                GOTO
              </Button>
            </Flex>
          </Box>
        ))}

        {filteredObjects.length === 0 && (
          <Text fontSize="12px" color="whiteAlpha.500" textAlign="center" py={4}>
            {language === 'fr' 
              ? 'Aucun objet trouvé. Essayez d\'autres critères.' 
              : 'No objects found. Try different criteria.'}
          </Text>
        )}
      </VStack>

      {/* Selected Object Details */}
      {selectedObject && (
        <Box 
          bg="rgba(0,0,0,0.4)" 
          p={4} 
          borderRadius="8px" 
          borderLeft="3px solid var(--astro-teal)"
        >
          <VStack align="stretch" gap={3}>
            <HStack justify="space-between">
              <Text fontSize="14px" fontWeight="bold" color="var(--astro-teal)">
                {selectedObject.name}
              </Text>
              <Badge colorScheme="cyan">{selectedObject.id}</Badge>
            </HStack>

            <Text fontSize="11px" color="whiteAlpha.700">
              {selectedObject.description}
            </Text>

            <Grid templateColumns="repeat(2, 1fr)" gap={2} fontSize="10px">
              <HStack>
                <Icon as={Compass} boxSize={3} color="whiteAlpha.500" />
                <Text color="whiteAlpha.600">RA: {selectedObject.ra}</Text>
              </HStack>
              <HStack>
                <Icon as={MapPin} boxSize={3} color="whiteAlpha.500" />
                <Text color="whiteAlpha.600">DEC: {selectedObject.dec}</Text>
              </HStack>
              <HStack>
                <Icon as={Target} boxSize={3} color="whiteAlpha.500" />
                <Text color="whiteAlpha.600">{selectedObject.size_arcmin}</Text>
              </HStack>
              <HStack>
                <Icon as={Clock} boxSize={3} color="whiteAlpha.500" />
                <Text color="whiteAlpha.600">{selectedObject.best_months.slice(0, 2).join(', ')}</Text>
              </HStack>
            </Grid>

            <Button
              w="full"
              bg="var(--astro-teal)"
              color="black"
              _hover={{ bg: "white" }}
              loading={isSlewingToTarget}
              onClick={() => handleSlewToObject(selectedObject)}
            >
              <Icon as={Navigation} boxSize={4} mr={2} />
              {language === 'fr' ? 'SLEW VERS L\'OBJET' : 'SLEW TO OBJECT'}
            </Button>
          </VStack>
        </Box>
      )}
    </VStack>
  );
};
