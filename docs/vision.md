# Vision

## Problem
Field canvassing of restaurants and food trucks is run from spreadsheets and memory. Nobody knows in real time who was visited, what they said, or when to go back.

## Users
| Role | Count | Device | Needs |
|---|---|---|---|
| Admin | 1–2 | Laptop | Import prospects, assign them, edit the question script, watch visits live |
| Field agent | 2 | Phone, often poor signal | Today's list ordered by distance, a fast visit form, works offline, add new places |

## Core jobs
1. **Build the prospect base** from a CSV or an area drawn on a map.
2. **Assign** prospects to agents.
3. **Visit**: agent checks in, gives a flyer, answers scripted questions, records an outcome.
4. **Revisit**: prospects needing follow-up come back on the agent's list.
5. **Discover**: agents add prospects not in the base.
6. **Monitor**: admin sees visits as they sync.

## Non-goals (v1)
- PDF import (dropped, see [ADR-0009](adr/0009-no-pdf-import.md)).
- Route optimisation beyond nearest-next ordering.
- Continuous GPS tracking of agents. Position is captured at check-in only.
- Multi-organisation / multi-tenant.
- Native mobile apps.
- Any paid service.

## Success criteria
- An agent can complete a visit with zero network in under 60 seconds.
- A visit logged offline reaches the admin within 1 minute of the phone regaining signal.
- Monthly infrastructure bill: 0.
