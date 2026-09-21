---
name: new-adr
description: Write an Architecture Decision Record for Captain Prospectus. Use when a change introduces or reverses an architectural choice (hosting, data model shape, sync, auth, dependencies, external services) or contradicts an existing ADR.
---

# New ADR

1. List `docs/adr/`; next number = highest + 1, zero-padded to 4 digits.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-kebab-title.md`.
3. Fill it:
   - **Context**: facts and constraints only. Mention ADR-0002 (zero cost) if any service or dependency is involved.
   - **Decision**: "We will …". One decision.
   - **Alternatives**: at least two, each with a concrete reason.
   - **Consequences**: include what gets harder.
4. Status `proposed` until the owner accepts it in the PR.
5. If it supersedes an ADR: set the old one's status to `superseded by ADR-NNNN` (the only allowed edit to an accepted ADR).
6. Add the row to `docs/adr/README.md`.
7. Update `CLAUDE.md` invariants or stack line if the decision changes them.
