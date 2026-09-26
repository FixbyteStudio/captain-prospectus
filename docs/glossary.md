# Glossary

Use these words in code, UI and docs. One concept, one name.

**Code, database values, docs and commits are English. The UI is French** ([ADR-0013](adr/0013-frontend-conventions.md)).
The French column is the only sanctioned translation of each term; every French string in the app
lives in `src/client/copy.ts`, so the whole UI vocabulary stays reviewable in one file.

| Term | French (UI) | Meaning | Not |
|---|---|---|---|
| **Prospect** | Prospect | A business we want to canvass (restaurant, café, food truck…) | lead, venue, entity |
| **Agent** | Agent | Field person doing visits | rep, user, worker |
| **Admin** | Admin | Person who imports, assigns, configures scripts | manager |
| **Visit** | Visite | One physical attempt at a prospect. A revisit is a new visit | check-in (that's the action) |
| **Outcome** | Résultat | Result of a visit: `no_contact`, `interested`, `not_interested`, `follow_up`, `converted` | result |
| **Status** | Statut | Lifecycle of a prospect: `new`, `assigned`, `follow_up`, `converted`, `rejected` | state |
| **Script** | Script | Versioned list of questions an agent asks during a visit | survey, form |
| **Answers** | Réponses | Responses to a script, stored on the visit | |
| **Import** | Import | Bulk creation of prospects from CSV or map | upload |
| **Map import** | Import carte | Import from an OpenStreetMap area via Overpass | scrape |
| **Field prospect** | Prospect terrain | Prospect created by an agent on the ground (`source = field`) | |
| **Sync** | Synchronisation | One request that pushes pending local writes and pulls the agent's list | |
| **Dedupe key** | — (internal) | Stable key that makes re-imports update instead of duplicate | |
| **Today list** | Tournée du jour | The agent's open prospects, ordered by distance | route |
| **Flyer** | Flyer | The leaflet handed over during a visit | prospectus, brochure |
| **Dashboard** | Tableau de bord | The admin's landing screen at `/admin`: how canvassing is going over 7, 30 or 90 days | home, overview |
| **Open prospect** | Prospect ouvert | A live prospect (`merged_into IS NULL`) whose status is `new`, `assigned` or `follow_up` | active lead |

## Enum values

Stored in English, rendered in French. These are the only labels the UI may show for them.

| `outcome` | French |
|---|---|
| `no_contact` | Personne sur place |
| `interested` | Intéressé |
| `not_interested` | Pas intéressé |
| `follow_up` | À relancer |
| `converted` | Converti |

| `status` | French |
|---|---|
| `new` | Nouveau |
| `assigned` | Assigné |
| `follow_up` | À relancer |
| `converted` | Converti |
| `rejected` | Refusé |

| `type` | French |
|---|---|
| `restaurant` | Restaurant |
| `fast_food` | Restauration rapide |
| `cafe` | Café |
| `bar` | Bar |
| `food_truck` | Food truck |
| `other` | Autre |

| `source` | French |
|---|---|
| `csv` | CSV |
| `osm` | Carte |
| `field` | Terrain |
