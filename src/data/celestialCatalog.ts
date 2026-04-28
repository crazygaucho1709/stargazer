// Catalogue d'objets célestes - Messier, NGC, Caldwell
// Coordonnées J2000, magnitude, type, constellation

export interface CelestialObject {
  id: string;
  name: string;
  catalog: 'Messier' | 'NGC' | 'Caldwell' | 'IC';
  ra: string;  // Format: "05h 34m 32s"
  dec: string; // Format: "-05° 27' 00\""
  ra_deg: number;
  dec_deg: number;
  magnitude: number;
  type: 'Galaxy' | 'Nebula' | 'Star Cluster' | 'Planetary Nebula' | 'Supernova Remnant' | 'Double Star';
  constellation: string;
  size_arcmin: string;
  description: string;
  best_months: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export const CELESTIAL_CATALOG: CelestialObject[] = [
  // Messier Objects
  {
    id: "M1",
    name: "Crab Nebula",
    catalog: "Messier",
    ra: "05h 34m 32s",
    dec: "+22° 00' 52\"",
    ra_deg: 83.633,
    dec_deg: 22.014,
    magnitude: 8.4,
    type: "Supernova Remnant",
    constellation: "Taurus",
    size_arcmin: "6.0 x 4.0",
    description: "Reste de supernova observée en 1054 AD",
    best_months: ["Jan", "Feb", "Mar"],
    difficulty: "Medium"
  },
  {
    id: "M31",
    name: "Andromeda Galaxy",
    catalog: "Messier",
    ra: "00h 42m 44s",
    dec: "+41° 16' 08\"",
    ra_deg: 10.684,
    dec_deg: 41.269,
    magnitude: 3.4,
    type: "Galaxy",
    constellation: "Andromeda",
    size_arcmin: "178.0 x 63.0",
    description: "Galaxie spirale la plus proche, 2.5 millions d'années-lumière",
    best_months: ["Sep", "Oct", "Nov", "Dec"],
    difficulty: "Easy"
  },
  {
    id: "M42",
    name: "Orion Nebula",
    catalog: "Messier",
    ra: "05h 35m 17s",
    dec: "-05° 23' 28\"",
    ra_deg: 83.821,
    dec_deg: -5.391,
    magnitude: 4.0,
    type: "Nebula",
    constellation: "Orion",
    size_arcmin: "85.0 x 60.0",
    description: "Nébuleuse diffuse la plus brillante, zone de formation stellaire",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Easy"
  },
  {
    id: "M45",
    name: "Pleiades",
    catalog: "Messier",
    ra: "03h 47m 24s",
    dec: "+24° 07' 00\"",
    ra_deg: 56.850,
    dec_deg: 24.117,
    magnitude: 1.6,
    type: "Star Cluster",
    constellation: "Taurus",
    size_arcmin: "110.0",
    description: "Amas ouvert brillant, les Sept Sœurs",
    best_months: ["Oct", "Nov", "Dec", "Jan"],
    difficulty: "Easy"
  },
  {
    id: "M51",
    name: "Whirlpool Galaxy",
    catalog: "Messier",
    ra: "13h 29m 52s",
    dec: "+47° 11' 43\"",
    ra_deg: 202.469,
    dec_deg: 47.195,
    magnitude: 8.4,
    type: "Galaxy",
    constellation: "Canes Venatici",
    size_arcmin: "11.2 x 6.9",
    description: "Galaxie spirale en interaction avec NGC 5195",
    best_months: ["Mar", "Apr", "May", "Jun"],
    difficulty: "Medium"
  },
  {
    id: "M57",
    name: "Ring Nebula",
    catalog: "Messier",
    ra: "18h 53m 35s",
    dec: "+33° 01' 44\"",
    ra_deg: 283.396,
    dec_deg: 33.029,
    magnitude: 8.8,
    type: "Planetary Nebula",
    constellation: "Lyra",
    size_arcmin: "1.4 x 1.0",
    description: "Nébuleuse planétaire célèbre en forme d'anneau",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Medium"
  },
  {
    id: "M81",
    name: "Bode's Galaxy",
    catalog: "Messier",
    ra: "09h 55m 33s",
    dec: "+69° 03' 55\"",
    ra_deg: 148.889,
    dec_deg: 69.065,
    magnitude: 6.9,
    type: "Galaxy",
    constellation: "Ursa Major",
    size_arcmin: "26.9 x 14.1",
    description: "Galaxie spirale brillante près de la Grande Ourse",
    best_months: ["Feb", "Mar", "Apr", "May"],
    difficulty: "Easy"
  },
  {
    id: "M101",
    name: "Pinwheel Galaxy",
    catalog: "Messier",
    ra: "14h 03m 12s",
    dec: "+54° 20' 56\"",
    ra_deg: 210.802,
    dec_deg: 54.349,
    magnitude: 7.9,
    type: "Galaxy",
    constellation: "Ursa Major",
    size_arcmin: "28.8 x 26.9",
    description: "Grande galaxie spirale vue de face",
    best_months: ["Mar", "Apr", "May", "Jun"],
    difficulty: "Medium"
  },
  
  // NGC Objects
  {
    id: "NGC 7000",
    name: "North America Nebula",
    catalog: "NGC",
    ra: "20h 59m 17s",
    dec: "+44° 31' 44\"",
    ra_deg: 314.821,
    dec_deg: 44.529,
    magnitude: 4.0,
    type: "Nebula",
    constellation: "Cygnus",
    size_arcmin: "120.0 x 100.0",
    description: "Grande nébuleuse en émission en forme d'Amérique du Nord",
    best_months: ["Jul", "Aug", "Sep", "Oct"],
    difficulty: "Easy"
  },
  {
    id: "NGC 2244",
    name: "Rosette Nebula Core",
    catalog: "NGC",
    ra: "06h 32m 00s",
    dec: "+04° 56' 00\"",
    ra_deg: 98.000,
    dec_deg: 4.933,
    magnitude: 9.0,
    type: "Nebula",
    constellation: "Monoceros",
    size_arcmin: "80.0",
    description: "Coeur de la grande nébuleuse de la Rosette",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Medium"
  },
  {
    id: "NGC 7293",
    name: "Helix Nebula",
    catalog: "NGC",
    ra: "22h 29m 38s",
    dec: "-20° 50' 00\"",
    ra_deg: 337.408,
    dec_deg: -20.833,
    magnitude: 7.3,
    type: "Planetary Nebula",
    constellation: "Aquarius",
    size_arcmin: "16.0 x 28.0",
    description: "Nébuleuse planétaire la plus proche, 'Eye of God'",
    best_months: ["Aug", "Sep", "Oct", "Nov"],
    difficulty: "Medium"
  },
  
  // Bright stars for testing
  {
    id: "Sirius",
    name: "Sirius (Alpha CMa)",
    catalog: "NGC",
    ra: "06h 45m 09s",
    dec: "-16° 42' 58\"",
    ra_deg: 101.287,
    dec_deg: -16.716,
    magnitude: -1.46,
    type: "Double Star",
    constellation: "Canis Major",
    size_arcmin: "",
    description: "Étoile la plus brillante du ciel nocturne",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Easy"
  },
  {
    id: "Vega",
    name: "Vega (Alpha Lyr)",
    catalog: "NGC",
    ra: "18h 37m 37s",
    dec: "+38° 47' 01\"",
    ra_deg: 279.404,
    dec_deg: 38.784,
    magnitude: 0.03,
    type: "Double Star",
    constellation: "Lyra",
    size_arcmin: "",
    description: "Étoile brillante de l'été, référence magnitude 0",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Easy"
  }
];

// Fonction pour calculer la visibilité selon la date/heure et latitude
export function getVisibleObjects(
  date: Date,
  latitude: number,
  longitude: number,
  minAltitude: number = 30
): CelestialObject[] {
  // Simplification: retourner les objets visibles selon le mois
  const month = date.toLocaleString('en-US', { month: 'short' });
  
  return CELESTIAL_CATALOG.filter(obj => {
    // Vérifier si l'objet est bien visible ce mois-ci
    const isInSeason = obj.best_months.includes(month);
    
    // Calcul simple de l'altitude approximative
    // Pour une vraie astronomie, il faudrait calculer avec la date exacte
    const dec = obj.dec_deg;
    const lat = latitude;
    
    // Altitude approximative au méridien
    const maxAltitude = 90 - Math.abs(lat - dec);
    const minAltitudeForObj = 90 - Math.abs(lat + dec); // Au minimum (au sud pour l'hémisphère nord)
    
    // L'objet doit passer au-dessus de l'horizon
    const isVisible = maxAltitude > minAltitude && maxAltitude > 15;
    
    return isInSeason && isVisible;
  }).sort((a, b) => a.magnitude - b.magnitude);
}

// Fonction pour convertir RA/DEC en degrés
export function raToDegrees(ra: string): number {
  const parts = ra.match(/(\d+)h\s+(\d+)m\s+([\d.]+)s/);
  if (!parts) return 0;
  const h = parseInt(parts[1]);
  const m = parseInt(parts[2]);
  const s = parseFloat(parts[3]);
  return 15 * (h + m / 60 + s / 3600);
}

export function decToDegrees(dec: string): number {
  const parts = dec.match(/([+-]?)(\d+)°\s+(\d+)'\s+([\d.]+)"/);
  if (!parts) return 0;
  const sign = parts[1] === '-' ? -1 : 1;
  const d = parseInt(parts[2]);
  const m = parseInt(parts[3]);
  const s = parseFloat(parts[4]);
  return sign * (d + m / 60 + s / 3600);
}
