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
  },

  // === More Messier Objects ===
  {
    id: "M13",
    name: "Hercules Cluster",
    catalog: "Messier",
    ra: "16h 41m 42s",
    dec: "+36° 27' 37\"",
    ra_deg: 250.425,
    dec_deg: 36.460,
    magnitude: 5.8,
    type: "Star Cluster",
    constellation: "Hercules",
    size_arcmin: "20.0",
    description: "Plus bel amas globulaire de l'hémisphère nord",
    best_months: ["May", "Jun", "Jul", "Aug"],
    difficulty: "Easy"
  },
  {
    id: "M27",
    name: "Dumbbell Nebula",
    catalog: "Messier",
    ra: "19h 59m 36s",
    dec: "+22° 43' 16\"",
    ra_deg: 299.900,
    dec_deg: 22.721,
    magnitude: 7.5,
    type: "Planetary Nebula",
    constellation: "Vulpecula",
    size_arcmin: "8.0 x 5.7",
    description: "Première nébuleuse planétaire découverte, en forme d'haltère",
    best_months: ["Jul", "Aug", "Sep", "Oct"],
    difficulty: "Easy"
  },
  {
    id: "M64",
    name: "Black Eye Galaxy",
    catalog: "Messier",
    ra: "12h 56m 44s",
    dec: "+21° 40' 58\"",
    ra_deg: 194.183,
    dec_deg: 21.683,
    magnitude: 8.5,
    type: "Galaxy",
    constellation: "Coma Berenices",
    size_arcmin: "10.7 x 5.1",
    description: "Galaxie spirale avec bande de poussière sombre distinctive",
    best_months: ["Mar", "Apr", "May", "Jun"],
    difficulty: "Medium"
  },
  {
    id: "M65",
    name: "Leo Triplet (M65)",
    catalog: "Messier",
    ra: "11h 18m 56s",
    dec: "+13° 05' 32\"",
    ra_deg: 169.733,
    dec_deg: 13.092,
    magnitude: 9.3,
    type: "Galaxy",
    constellation: "Leo",
    size_arcmin: "9.8 x 2.9",
    description: "Galaxie spirale barrée, membre du Triplet du Lion",
    best_months: ["Mar", "Apr", "May", "Jun"],
    difficulty: "Medium"
  },
  {
    id: "M82",
    name: "Cigar Galaxy",
    catalog: "Messier",
    ra: "09h 55m 52s",
    dec: "+69° 40' 47\"",
    ra_deg: 148.967,
    dec_deg: 69.680,
    magnitude: 8.4,
    type: "Galaxy",
    constellation: "Ursa Major",
    size_arcmin: "11.2 x 4.3",
    description: "Galaxie à sursaut de formation d'étoiles, vue par la tranche",
    best_months: ["Feb", "Mar", "Apr", "May"],
    difficulty: "Easy"
  },
  {
    id: "M97",
    name: "Owl Nebula",
    catalog: "Messier",
    ra: "11h 14m 48s",
    dec: "+55° 01' 00\"",
    ra_deg: 168.700,
    dec_deg: 55.017,
    magnitude: 9.9,
    type: "Planetary Nebula",
    constellation: "Ursa Major",
    size_arcmin: "3.4 x 3.3",
    description: "Nébuleuse planétaire aux yeux de hibou caractéristiques",
    best_months: ["Jan", "Feb", "Mar", "Apr"],
    difficulty: "Hard"
  },
  {
    id: "M104",
    name: "Sombrero Galaxy",
    catalog: "Messier",
    ra: "12h 39m 59s",
    dec: "-11° 37' 23\"",
    ra_deg: 189.996,
    dec_deg: -11.623,
    magnitude: 8.0,
    type: "Galaxy",
    constellation: "Virgo",
    size_arcmin: "8.7 x 3.5",
    description: "Galaxie spirale avec bulbe central proéminent en forme de sombrero",
    best_months: ["Apr", "May", "Jun", "Jul"],
    difficulty: "Medium"
  },
  {
    id: "M3",
    name: "Canes Venatici Cluster",
    catalog: "Messier",
    ra: "13h 42m 11s",
    dec: "+28° 22' 38\"",
    ra_deg: 205.546,
    dec_deg: 28.377,
    magnitude: 6.3,
    type: "Star Cluster",
    constellation: "Canes Venatici",
    size_arcmin: "18.0",
    description: "Amas globulaire brillant, l'un des plus riches en étoiles variables",
    best_months: ["Apr", "May", "Jun", "Jul"],
    difficulty: "Easy"
  },
  {
    id: "M5",
    name: "Serpens Cluster",
    catalog: "Messier",
    ra: "15h 18m 34s",
    dec: "+02° 04' 58\"",
    ra_deg: 229.642,
    dec_deg: 2.083,
    magnitude: 5.7,
    type: "Star Cluster",
    constellation: "Serpens",
    size_arcmin: "23.0",
    description: "Amas globulaire majestueux, l'un des plus grands connus",
    best_months: ["May", "Jun", "Jul", "Aug"],
    difficulty: "Easy"
  },
  {
    id: "M11",
    name: "Wild Duck Cluster",
    catalog: "Messier",
    ra: "18h 51m 05s",
    dec: "-06° 16' 12\"",
    ra_deg: 282.771,
    dec_deg: -6.270,
    magnitude: 5.8,
    type: "Star Cluster",
    constellation: "Scutum",
    size_arcmin: "14.0",
    description: "Amas ouvert très riche, l'un des plus denses du ciel",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Easy"
  },
  {
    id: "M15",
    name: "Pegasus Cluster",
    catalog: "Messier",
    ra: "21h 30m 00s",
    dec: "+12° 10' 00\"",
    ra_deg: 322.500,
    dec_deg: 12.167,
    magnitude: 6.2,
    type: "Star Cluster",
    constellation: "Pegasus",
    size_arcmin: "18.0",
    description: "Amas globulaire ancien avec nébuleuse planétaire PK 65-27.1",
    best_months: ["Aug", "Sep", "Oct", "Nov"],
    difficulty: "Easy"
  },
  {
    id: "M92",
    name: "Hercules B Cluster",
    catalog: "Messier",
    ra: "17h 17m 07s",
    dec: "+43° 08' 00\"",
    ra_deg: 259.279,
    dec_deg: 43.133,
    magnitude: 6.4,
    type: "Star Cluster",
    constellation: "Hercules",
    size_arcmin: "14.0",
    description: "Amas globulaire brillant dans Hercule, souvent négligé",
    best_months: ["May", "Jun", "Jul", "Aug"],
    difficulty: "Easy"
  },

  // === NGC Favorites ===
  {
    id: "NGC 4565",
    name: "Needle Galaxy",
    catalog: "NGC",
    ra: "12h 36m 21s",
    dec: "+25° 59' 14\"",
    ra_deg: 189.088,
    dec_deg: 25.987,
    magnitude: 9.6,
    type: "Galaxy",
    constellation: "Coma Berenices",
    size_arcmin: "15.9 x 1.9",
    description: "Galaxie spirale vue par la tranche, l'aiguille céleste",
    best_months: ["Mar", "Apr", "May", "Jun"],
    difficulty: "Medium"
  },
  {
    id: "NGC 6960",
    name: "Veil Nebula (West)",
    catalog: "NGC",
    ra: "20h 45m 38s",
    dec: "+30° 42' 30\"",
    ra_deg: 311.408,
    dec_deg: 30.708,
    magnitude: 7.0,
    type: "Supernova Remnant",
    constellation: "Cygnus",
    size_arcmin: "60.0 x 8.0",
    description: "Reste de supernova filamentaire, magnifique en OIII",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Medium"
  },
  {
    id: "NGC 6888",
    name: "Crescent Nebula",
    catalog: "NGC",
    ra: "20h 12m 07s",
    dec: "+38° 21' 18\"",
    ra_deg: 303.029,
    dec_deg: 38.355,
    magnitude: 7.4,
    type: "Nebula",
    constellation: "Cygnus",
    size_arcmin: "18.0 x 12.0",
    description: "Nébuleuse en émission en forme de croissant, créée par WR 136",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Medium"
  },
  {
    id: "NGC 7789",
    name: "Caroline's Rose",
    catalog: "NGC",
    ra: "23h 57m 24s",
    dec: "+56° 42' 30\"",
    ra_deg: 359.350,
    dec_deg: 56.708,
    magnitude: 6.7,
    type: "Star Cluster",
    constellation: "Cassiopeia",
    size_arcmin: "25.0",
    description: "Amas ouvert riche découvert par Caroline Herschel",
    best_months: ["Sep", "Oct", "Nov", "Dec"],
    difficulty: "Easy"
  },
  {
    id: "NGC 1502",
    name: "Camelopardalis Cluster",
    catalog: "NGC",
    ra: "04h 07m 50s",
    dec: "+62° 19' 54\"",
    ra_deg: 61.958,
    dec_deg: 62.332,
    magnitude: 6.9,
    type: "Star Cluster",
    constellation: "Camelopardalis",
    size_arcmin: "8.0",
    description: "Amas ouvert dans la constellation de la Girafe",
    best_months: ["Nov", "Dec", "Jan", "Feb"],
    difficulty: "Easy"
  },
  {
    id: "NGC 2392",
    name: "Eskimo Nebula",
    catalog: "NGC",
    ra: "07h 29m 11s",
    dec: "+20° 54' 42\"",
    ra_deg: 112.296,
    dec_deg: 20.912,
    magnitude: 9.1,
    type: "Planetary Nebula",
    constellation: "Gemini",
    size_arcmin: "0.8 x 0.7",
    description: "Nébuleuse planétaire bipolaire, visage d'Esquimau",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Hard"
  },
  {
    id: "NGC 6543",
    name: "Cat's Eye Nebula",
    catalog: "NGC",
    ra: "17h 58m 33s",
    dec: "+66° 37' 59\"",
    ra_deg: 269.638,
    dec_deg: 66.633,
    magnitude: 8.1,
    type: "Planetary Nebula",
    constellation: "Draco",
    size_arcmin: "5.8 x 5.8",
    description: "Nébuleuse planétaire parmi les plus complexes connues",
    best_months: ["May", "Jun", "Jul", "Aug"],
    difficulty: "Medium"
  },
  {
    id: "NGC 7009",
    name: "Saturn Nebula",
    catalog: "NGC",
    ra: "21h 04m 11s",
    dec: "-11° 21' 48\"",
    ra_deg: 316.046,
    dec_deg: -11.363,
    magnitude: 8.0,
    type: "Planetary Nebula",
    constellation: "Aquarius",
    size_arcmin: "1.2 x 0.9",
    description: "Nébuleuse planétaire en forme de Saturne avec ses anneaux",
    best_months: ["Aug", "Sep", "Oct", "Nov"],
    difficulty: "Hard"
  },

  // === Caldwell ===
  {
    id: "C13",
    name: "Owl Cluster (NGC 457)",
    catalog: "Caldwell",
    ra: "01h 19m 35s",
    dec: "+58° 17' 00\"",
    ra_deg: 19.896,
    dec_deg: 58.283,
    magnitude: 6.4,
    type: "Star Cluster",
    constellation: "Cassiopeia",
    size_arcmin: "13.0",
    description: "Amas ouvert en forme de hibou avec deux yeux brillants",
    best_months: ["Oct", "Nov", "Dec", "Jan"],
    difficulty: "Easy"
  },
  {
    id: "C14",
    name: "Double Cluster (NGC 869/884)",
    catalog: "Caldwell",
    ra: "02h 20m 00s",
    dec: "+57° 08' 00\"",
    ra_deg: 35.000,
    dec_deg: 57.133,
    magnitude: 3.7,
    type: "Star Cluster",
    constellation: "Perseus",
    size_arcmin: "60.0",
    description: "Deux amas ouverts côte-à-côte, spectacle magnifique aux jumelles",
    best_months: ["Sep", "Oct", "Nov", "Dec"],
    difficulty: "Easy"
  },
  {
    id: "C23",
    name: "Silver Needle (NGC 891)",
    catalog: "Caldwell",
    ra: "02h 22m 33s",
    dec: "+42° 20' 57\"",
    ra_deg: 35.638,
    dec_deg: 42.349,
    magnitude: 10.0,
    type: "Galaxy",
    constellation: "Andromeda",
    size_arcmin: "13.5 x 2.5",
    description: "Galaxie spirale vue par la tranche avec bande de poussière",
    best_months: ["Sep", "Oct", "Nov", "Dec"],
    difficulty: "Hard"
  },
  {
    id: "C27",
    name: "Crescent Nebula (NGC 6888)",
    catalog: "Caldwell",
    ra: "20h 12m 07s",
    dec: "+38° 21' 18\"",
    ra_deg: 303.029,
    dec_deg: 38.355,
    magnitude: 7.4,
    type: "Nebula",
    constellation: "Cygnus",
    size_arcmin: "18.0 x 12.0",
    description: "Nébuleuse en forme de croissant autour de l'étoile WR 136",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Medium"
  },
  {
    id: "C30",
    name: "Veil Nebula (NGC 6960/6992)",
    catalog: "Caldwell",
    ra: "20h 45m 38s",
    dec: "+30° 42' 30\"",
    ra_deg: 311.408,
    dec_deg: 30.708,
    magnitude: 7.0,
    type: "Supernova Remnant",
    constellation: "Cygnus",
    size_arcmin: "75.0 x 8.0",
    description: "Immense reste de supernova dans le Cygne",
    best_months: ["Jun", "Jul", "Aug", "Sep"],
    difficulty: "Medium"
  },
  {
    id: "C39",
    name: "Eskimo Nebula (NGC 2392)",
    catalog: "Caldwell",
    ra: "07h 29m 11s",
    dec: "+20° 54' 42\"",
    ra_deg: 112.296,
    dec_deg: 20.912,
    magnitude: 9.1,
    type: "Planetary Nebula",
    constellation: "Gemini",
    size_arcmin: "0.8 x 0.7",
    description: "Nébuleuse planétaire ressemblant à un visage emmitouflé",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Hard"
  },
  {
    id: "C41",
    name: "Hyades Cluster (Mel 25)",
    catalog: "Caldwell",
    ra: "04h 26m 54s",
    dec: "+15° 52' 00\"",
    ra_deg: 66.725,
    dec_deg: 15.867,
    magnitude: 0.5,
    type: "Star Cluster",
    constellation: "Taurus",
    size_arcmin: "330.0",
    description: "Amas ouvert le plus proche, V-shaped dans le Taureau",
    best_months: ["Nov", "Dec", "Jan", "Feb"],
    difficulty: "Easy"
  },
  {
    id: "C49",
    name: "Rosette Nebula (NGC 2237)",
    catalog: "Caldwell",
    ra: "06h 33m 45s",
    dec: "+05° 00' 00\"",
    ra_deg: 98.438,
    dec_deg: 5.000,
    magnitude: 6.0,
    type: "Nebula",
    constellation: "Monoceros",
    size_arcmin: "80.0 x 60.0",
    description: "Grande nébuleuse en émission en forme de rose",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Medium"
  },
  {
    id: "C50",
    name: "NGC 2244 (Rosette Core)",
    catalog: "Caldwell",
    ra: "06h 32m 00s",
    dec: "+04° 56' 00\"",
    ra_deg: 98.000,
    dec_deg: 4.933,
    magnitude: 4.8,
    type: "Star Cluster",
    constellation: "Monoceros",
    size_arcmin: "30.0",
    description: "Amas ouvert au coeur de la nébuleuse de la Rosette",
    best_months: ["Dec", "Jan", "Feb", "Mar"],
    difficulty: "Easy"
  },
  {
    id: "C55",
    name: "Saturn Nebula (NGC 7009)",
    catalog: "Caldwell",
    ra: "21h 04m 11s",
    dec: "-11° 21' 48\"",
    ra_deg: 316.046,
    dec_deg: -11.363,
    magnitude: 8.0,
    type: "Planetary Nebula",
    constellation: "Aquarius",
    size_arcmin: "1.2 x 0.9",
    description: "Nébuleuse planétaire en forme de planète Saturne",
    best_months: ["Aug", "Sep", "Oct", "Nov"],
    difficulty: "Hard"
  },
  {
    id: "C60",
    name: "Antennae Galaxies (NGC 4038/9)",
    catalog: "Caldwell",
    ra: "12h 01m 53s",
    dec: "-18° 52' 30\"",
    ra_deg: 180.471,
    dec_deg: -18.875,
    magnitude: 10.3,
    type: "Galaxy",
    constellation: "Corvus",
    size_arcmin: "5.2 x 3.1",
    description: "Deux galaxies en collision avec queues de marée",
    best_months: ["Mar", "Apr", "May", "Jun"],
    difficulty: "Hard"
  },
  {
    id: "C63",
    name: "Helix Nebula (NGC 7293)",
    catalog: "Caldwell",
    ra: "22h 29m 38s",
    dec: "-20° 50' 00\"",
    ra_deg: 337.408,
    dec_deg: -20.833,
    magnitude: 7.3,
    type: "Planetary Nebula",
    constellation: "Aquarius",
    size_arcmin: "16.0 x 28.0",
    description: "Nébuleuse planétaire la plus proche, oeil de Dieu",
    best_months: ["Aug", "Sep", "Oct", "Nov"],
    difficulty: "Medium"
  },
  {
    id: "C20",
    name: "North America Nebula (NGC 7000)",
    catalog: "Caldwell",
    ra: "20h 59m 17s",
    dec: "+44° 31' 44\"",
    ra_deg: 314.821,
    dec_deg: 44.529,
    magnitude: 4.0,
    type: "Nebula",
    constellation: "Cygnus",
    size_arcmin: "120.0 x 100.0",
    description: "Grande nébuleuse en forme d'Amérique du Nord",
    best_months: ["Jul", "Aug", "Sep", "Oct"],
    difficulty: "Easy"
  },
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
