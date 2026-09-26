/**
 * Seed the LOCAL database with about 300 places and 180 days of visits.
 *
 * Posts to the dev-only /api/dev/seed route while `npm run dev` is running, so
 * the rows go through the real insert path (dedupe keys, chunking, status
 * derivation) and nobody has to run `wrangler d1 execute` by hand. The route
 * 404s off localhost. The route generates each place's visit history from its
 * dedupe key, so running this twice inserts nothing the second time.
 *
 * Usage: npm run dev   (in one terminal)
 *        npm run db:seed:local
 */

const URL_BASE = process.env.SEED_URL ?? "http://localhost:5173";
const AGENT = process.env.DEV_USER_EMAIL ?? "admin@example.com";
const OTHER_AGENT = "agent@example.com";

// Around the Grand-Place, Brussels — the area this canvasses (docs/vision.md).
const CENTER = { lat: 50.8467, lng: 4.3525 };

const NAMES = [
  ["L'Estaminet des Halles", "restaurant"],
  ["Chez Léa", "restaurant"],
  ["Pizza Roma", "fast_food"],
  ["Café de la Gare", "cafe"],
  ["Le Comptoir Bruxellois", "restaurant"],
  ["Sushi Sablon", "restaurant"],
  ["Brasserie de la Senne", "bar"],
  ["Le Petit Creux", "fast_food"],
  ["Kebab Sainte-Catherine", "fast_food"],
  ["La Crêperie Bretonne", "restaurant"],
  ["Coffee & Co", "cafe"],
  ["Le Bistrot d'Édouard", "restaurant"],
  ["Tacos République", "fast_food"],
  ["Bar des Marolles", "bar"],
  ["Le Wagon Gourmand", "food_truck"],
  ["Burger Truck 1000", "food_truck"],
  ["Chez Mémé", "restaurant"],
  ["Thé & Compagnie", "cafe"],
  ["La Table de Paul", "restaurant"],
  ["Pasta Presto", "fast_food"],
  ["Le Zinc", "bar"],
  ["Boulangerie Saint-Géry", "other"],
  ["Street Food Bruxelles", "food_truck"],
  ["Le Relais des Voyageurs", "restaurant"],
  ["Curry House", "restaurant"],
  ["Le Café Perché", "cafe"],
  ["Friterie du Coin", "fast_food"],
  ["Les Trois Marmites", "restaurant"],
  ["Bagel Store", "fast_food"],
  ["La Cantine Mobile", "food_truck"],
];

const prospects = NAMES.map(([name, type], i) => ({
  name,
  type,
  // Spread over roughly a square kilometre so nearest-next ordering is visible.
  lat: i % 7 === 0 ? null : CENTER.lat + Math.sin(i) * 0.012,
  lng: i % 7 === 0 ? null : CENTER.lng + Math.cos(i) * 0.012,
  address: i % 7 === 0 ? `${i + 1} rue de la Ruche, Bruxelles` : null,
  // Two thirds to the dev user, the rest to a second agent, a few unassigned.
  assignedTo: i % 3 === 2 ? OTHER_AGENT : i % 11 === 0 ? null : AGENT,
}));

/**
 * The places the dashboard's À traiter panel needs: a live duplicate pair, a
 * merged prospect and a status set by hand. They go in the first request,
 * because `mergeInto` names a prospect in the same body. The 30 rows above stay
 * as they are, so their dedupe keys — and every id hashed from them — hold.
 */
const chezLea = prospects[1];
const pizzaRoma = prospects[2];
const specials = [
  // ~11 m from "Chez Léa": the pair Doublons shows.
  { ...chezLea, name: "Chez Léa et Paul", lat: chezLea.lat + 0.0001 },
  // ~10 m from "Pizza Roma", already merged into it.
  { ...pizzaRoma, name: "Pizzeria Roma", lng: pizzaRoma.lng + 0.00014, mergeInto: "Pizza Roma" },
  {
    name: "Le Jardin Suspendu",
    type: "restaurant",
    lat: CENTER.lat + 0.001,
    lng: CENTER.lng + 0.001,
    address: null,
    assignedTo: AGENT,
    manualStatus: "converted",
  },
];

/**
 * About 270 more, so the dashboard's chart has the shape of a real 180 days.
 * They sit on a grid ~3 km north of the Grand-Place with ≥ 110 m between
 * neighbours — past the 50 m duplicate radius, and far from the places above.
 */
const PREFIXES = [
  "Brasserie",
  "Café",
  "Friterie",
  "Pizzeria",
  "Bistrot",
  "Snack",
  "Traiteur",
  "Crêperie",
  "Boulangerie",
  "Taverne",
  "Cantine",
  "Food truck",
  "Salon de thé",
  "Grill",
  "Auberge",
];
const PLACES = [
  "du Parc",
  "de la Place",
  "des Arts",
  "du Canal",
  "de la Gare du Nord",
  "du Marché",
  "des Tilleuls",
  "de l'Église",
  "du Moulin",
  "des Écoles",
  "du Théâtre",
  "de la Fontaine",
  "du Port",
  "des Glycines",
  "de la Colline",
  "du Square",
  "des Brasseurs",
  "de Laeken",
];
const TYPES = ["bar", "cafe", "fast_food", "fast_food", "restaurant", "fast_food", "other"];
const GRID = { lat: CENTER.lat + 0.027, lng: CENTER.lng - 0.012, dLat: 0.0012, dLng: 0.0016 };
const generated = PLACES.flatMap((place, row) =>
  PREFIXES.map((prefix, col) => {
    const i = row * PREFIXES.length + col;
    return {
      name: `${prefix} ${place}`,
      type: prefix === "Food truck" ? "food_truck" : TYPES[i % TYPES.length],
      lat: Number((GRID.lat + row * GRID.dLat).toFixed(6)),
      lng: Number((GRID.lng + col * GRID.dLng).toFixed(6)),
      address: null,
      assignedTo: i % 10 === 9 ? null : i % 2 === 0 ? AGENT : OTHER_AGENT,
    };
  }),
);

const script = {
  name: "Questionnaire par défaut",
  questions: [
    { key: "has_delivery", label: "Proposez-vous la livraison ?", type: "yes_no", required: true },
    {
      key: "pos_system",
      label: "Quel logiciel de caisse utilisez-vous ?",
      type: "single",
      options: ["Aucun", "Papier", "Une autre application"],
    },
    { key: "covers_per_day", label: "Combien de couverts par jour ?", type: "number" },
    { key: "remarks", label: "Remarques", type: "text" },
  ],
};

// IMPORT_ROWS_PER_REQUEST in src/shared/constants.ts: one request stays inside
// the Worker's CPU budget. The specials sit in the first batch.
const ROWS_PER_REQUEST = 250;
const all = [...prospects, ...specials, ...generated];
const totals = { seeded: 0, prospects: 0, visits: 0, orphans: 0 };

for (let i = 0; i < all.length; i += ROWS_PER_REQUEST) {
  const response = await fetch(`${URL_BASE}/api/dev/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prospects: all.slice(i, i + ROWS_PER_REQUEST), script }),
  }).catch((error) => {
    console.error(`Could not reach ${URL_BASE}. Is \`npm run dev\` running?`);
    console.error(String(error));
    process.exit(1);
  });

  if (!response.ok) {
    console.error(`Seed failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  const body = await response.json();
  totals.seeded += body.seeded;
  totals.prospects += body.inserted.prospects;
  totals.visits += body.inserted.visits;
  totals.orphans += body.inserted.orphans;
}

console.log(
  `Seeded ${totals.seeded} prospects and 1 active script for ${AGENT} and ${OTHER_AGENT}. ` +
    `Inserted ${totals.prospects} prospects, ${totals.visits} visits and ` +
    `${totals.orphans} quarantined visits.`,
);
