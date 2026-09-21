# ADR-0001: Record architecture decisions

- Status: accepted
- Date: 2026-09-21

## Context
The project is small but will be built largely with AI coding agents. Agents and future contributors need to know *why* things are the way they are, or they will "fix" deliberate choices.

## Decision
We will record every significant decision as an ADR in `docs/adr/`, using the template. A change that contradicts an accepted ADR must come with a new ADR that supersedes it.

## Consequences
- Small overhead per decision.
- `CLAUDE.md` points agents at the ADR index before architectural changes.
