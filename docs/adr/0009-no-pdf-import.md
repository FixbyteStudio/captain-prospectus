# ADR-0009: No PDF import in v1

- Status: accepted
- Date: 2026-09-21

## Context
PDF lists have no reliable structure. Robust extraction needs an LLM (paid) or brittle per-layout parsing.

## Decision
We will support CSV and map import only. Users convert PDFs to CSV outside the app if needed.

## Consequences
- Zero cost preserved, simpler ingestion.
- Can be reconsidered with a new ADR if a free, reliable path appears.
