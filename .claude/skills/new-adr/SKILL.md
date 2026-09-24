---
name: new-adr
description: Write an Architecture Decision Record for Captain Prospectus. Use only for a decision that is hard to reverse (ADR-0024) — it changes or deletes stored data, changes the sync wire contract, changes hosting / database / auth / the stack, adds a cost — or when a change contradicts an existing ADR.
---

# New ADR

0. Check the bar in [ADR-0024](../../../docs/adr/0024-adrs-only-for-hard-to-reverse-decisions.md). If the decision is cheap to undo, stop: record it in the PR description, plus one line in the doc that owns the rule.
1. List `docs/adr/`; next number = highest + 1, zero-padded to 4 digits.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-kebab-title.md`.
3. Fill it:
   - **Context**: facts and constraints only. Mention ADR-0002 (zero cost) if any service or dependency is involved.
   - **Decision**: "We will …". One decision.
   - **Alternatives**: at least two, each with a concrete reason.
   - **Consequences**: include what gets harder.
4. Status `proposed` while the PR is open. Merging accepts it, so set `accepted` in the same PR once the owner approves; never merge an ADR that still says `proposed`.
5. If it supersedes an ADR: set the old one's status to `superseded by ADR-NNNN` (the only allowed edit to an accepted ADR).
6. Add the row to `docs/adr/README.md`.
7. Update `CLAUDE.md` invariants or stack line if the decision changes them — one line, linking to the ADR, not a copy of its reasoning.
