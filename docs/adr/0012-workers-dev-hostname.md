# ADR-0012: Use the workers.dev hostname

- Status: accepted
- Date: 2026-09-21

## Context
A custom domain requires buying and renewing a domain, which breaks [ADR-0002](0002-zero-cost-constraint.md).

## Decision
We will serve the app on `captain-prospectus.<account>.workers.dev`, protected by Access. Preview URLs are disabled or also protected.

## Consequences
- Less branded URL; agents install the PWA once and don't see it.
- Moving to a custom domain later is a config change plus an Access application update.
