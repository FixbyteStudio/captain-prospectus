# Domains

Five bounded contexts. Each owns its rules; code is organised to match (`src/worker/routes/<domain>`, `src/client/<domain>`).

| Domain | Owns | Main actor |
|---|---|---|
| [Prospecting](prospecting.md) | Prospect lifecycle, dedupe, assignment | Admin |
| [Ingestion](ingestion.md) | CSV and map imports | Admin |
| [Field operations](field-operations.md) | Visits, today list, offline sync, field prospects | Agent |
| [Scripts](scripts.md) | Questionnaires, versions, answers | Admin defines, agent answers |
| [Identity & access](identity-access.md) | Login, roles, permissions | Both |

Dependencies point one way: Ingestion → Prospecting ← Field operations → Scripts. Identity is cross-cutting.
