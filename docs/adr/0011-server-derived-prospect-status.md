# ADR-0011: Prospect status derived by the server

- Status: accepted
- Date: 2026-09-21

## Context
Visits change prospect status. If phones wrote status directly, two devices and offline delays would produce conflicts.

## Decision
When the server accepts a new visit it updates the prospect's `status`, `last_visit_at` and `next_visit_at`, **only if** the visit's `visited_at` is not older than the current `last_visit_at`. The mapping is defined once in `src/shared/constants.ts` and documented in [prospecting.md](../domains/prospecting.md).

## Consequences
- A visit synced late never overwrites a newer outcome.
- Admin manual status changes remain possible (rare, last write wins).
