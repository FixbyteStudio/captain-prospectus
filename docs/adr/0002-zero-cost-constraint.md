# ADR-0002: Zero cost is a hard constraint

- Status: accepted
- Date: 2026-09-21

## Context
The owner requires the app to run with no recurring or usage-based cost. The workload is tiny: 1–2 admins, 2 agents, hundreds to low thousands of prospects.

## Decision
We will only use services on a free tier that does not require a paid upgrade for our workload, and no paid APIs (no LLM APIs, no Google Maps Platform, no paid geocoding). Any new external service needs an ADR that includes its free-tier limits and our expected usage ([free-tier-budget.md](../free-tier-budget.md)).

## Alternatives considered
| Option | Why not |
|---|---|
| Small paid VPS | Recurring cost, ops burden |
| LLM for PDF extraction | Per-call cost; PDF dropped ([ADR-0009](0009-no-pdf-import.md)) |
| Google Maps / Places | Billing account required, usage cost |

## Consequences
- We accept free-tier limits and vendor lock-in to Cloudflare.
- No custom domain ([ADR-0012](0012-workers-dev-hostname.md)).
