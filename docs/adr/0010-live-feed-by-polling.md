# ADR-0010: Live admin feed by polling

- Status: accepted
- Date: 2026-09-21

## Context
The admin wants to see visits as they arrive. Visits already reach the server within a minute of connectivity.

## Decision
The admin page polls `GET /api/admin/visits?since=<received_at ms>` every 15 s while visible (paused when the tab is hidden).

## Alternatives considered
| Option | Why not |
|---|---|
| WebSockets via Durable Objects | More moving parts; latency is dominated by agent connectivity anyway |
| Server-Sent Events | Long-lived Worker requests, same benefit |

## Consequences
- ~240 requests/hour per open admin tab: negligible against the free tier.
- Worst-case display delay = agent sync delay + 15 s.
