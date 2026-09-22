/**
 * Seed the LOCAL database with a believable day of work.
 *
 * Posts to the dev-only /api/dev/seed route while `npm run dev` is running, so
 * the rows go through the real insert path (dedupe keys, chunking) and nobody
 * has to run `wrangler d1 execute` by hand. The route 404s off localhost.
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

const response = await fetch(`${URL_BASE}/api/dev/seed`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prospects, script }),
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
console.log(`Seeded ${body.seeded} prospects and 1 active script for ${AGENT}.`);
