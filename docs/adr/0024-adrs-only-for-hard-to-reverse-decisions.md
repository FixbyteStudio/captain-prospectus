# ADR-0024: ADRs only for decisions that are hard to reverse; one home per rule

- Status: accepted
- Date: 2026-09-24
- Deciders: mohss, Claude
- Amends: [ADR-0001](0001-record-architecture-decisions.md)

## Context
ADR-0001 asked for an ADR for "every significant decision". By September 2026 there were 23 ADRs
for about 12.6k lines of source. Many of them record choices that one PR could undo, such as which
component library, which zod API or which form library to use. Most rules were also written three or
four times: in `CLAUDE.md`, in an ADR, in a domain doc, and again in `architecture.md`, `api.md`,
`data-model.md` or `security.md`.

The copies had started to disagree. `security.md` and `field-operations.md` still described
ADR-0021's behaviour after ADR-0022 superseded it. Eight merged ADRs still said `proposed`. The
roadmap and ADR-0016 asked for a required review on `main` that GitHub did not enforce.

## Decision
1. **We will write an ADR only when a decision is hard to reverse.** That means a change that:
   - changes or deletes data already stored, or needs a migration that cannot be undone;
   - changes the sync wire contract that installed phones depend on;
   - changes hosting, the database, auth, or the stack line in `CLAUDE.md`;
   - adds a cost (ADR-0002, as amended by ADR-0020);
   - reverses or amends an existing ADR.

   Any other choice is recorded in the PR description, plus one line in the doc that owns the rule.
2. **Every rule has one home, and every other doc links to it:**
   | Kind of rule | Home |
   |---|---|
   | Business behaviour | `docs/domains/<domain>.md` |
   | Endpoint shape | `docs/api.md` |
   | Table or column meaning | `docs/data-model.md` |
   | Why a hard-to-reverse choice was made | its ADR |
   | Agent guardrail | `CLAUDE.md`, one line that links to the home above |
3. **Merging an ADR's PR is what accepts it.** The ADR is set to `accepted` in that PR.

Existing ADRs stay as they are. They are history, and code comments cite them.

## Alternatives considered
| Option | Why not |
|---|---|
| Keep an ADR for every significant decision | This is what produced the drift above. Each extra copy of a rule is one more place to forget to update |
| Fold the easy-to-reverse ADRs into a `conventions.md` | Rewrites history and means repointing about 50 code comments that cite ADR numbers, for no change in behaviour |
| Drop ADRs entirely | The decisions that are hard to reverse (cost, sync contract, data retention) are exactly the ones an agent would "fix" if nothing recorded the reasoning |

## Consequences
- Fewer ADRs. A reviewer can reject an ADR for a decision that does not meet the bar.
- A rule changes in one file. Other docs link to it, so they cannot drift from it.
- Harder: the reasoning behind a small choice now lives in a PR description, which is less
  discoverable than a numbered file. That is acceptable only because such a choice is cheap to undo.
