---
name: night-shift
description: Autonomously implement ONE task from docs/backlog/ and leave it as a pull request. Use when running as the scheduled night-shift routine, or when the owner asks to pick up the next backlog task the same way.
---

# Night shift

One task. One branch. One pull request. Nothing merged, nothing deployed.
The rules below are the decision in [ADR-0016](../../../docs/adr/0016-autonomous-overnight-agent-runs.md);
read it if one of them seems wrong.

## 1. Orient

Read, in this order: `CLAUDE.md`, `docs/glossary.md`, `docs/backlog/README.md`,
`docs/roadmap.md`, `docs/adr/README.md`. Then every file in `docs/backlog/`.

## 2. See what is already in flight

```sh
git ls-remote --heads origin 'claude/*'
```

A task whose status change is sitting in an unmerged PR still reads `ready` on
`main`. This command is the only thing that stops you rebuilding it.

## 3. Pick the task

The **lowest `id`** that satisfies all three:

- `status: ready`
- every id in `depends_on` has `status: done`
- no `claude/<id>-*` branch in the output of step 2

**If none qualifies, stop.** Report `nothing to do`, list the ids you skipped and
why, one line each, and open no PR. This is a successful run.

Never pick two. Never pick a task because it looks easier than the lowest one.

## 4. Branch

```sh
git switch -c claude/<id>-<slug>     # slug = the filename's slug
```

You are on a fresh clone of the default branch. If `main` looks behind what the
task assumes, say so in the PR body — do not try to find the other branch.

## 5. Implement — only this task

The acceptance criteria are the specification. Work through them in order and do
not add a criterion of your own.

Everything in `CLAUDE.md` applies, in particular:

- **One concern.** A bug, drift or inconsistency you find that does not block the
  task does not get fixed here. Add a `docs/backlog/` file for it in this same
  PR **only** as a new task file with `status: needs-decision`, or note it under
  "Found in passing" in the PR body. Never an extra commit of unrelated code.
- **Use the skill the change calls for**: `add-api-route` for an endpoint,
  `d1-migration` for a schema change, `sync-contract-change` for anything
  touching sync, `new-adr` if the task's own criteria call for one.
- **Use the reviewers** before you open the PR, where they apply:
  `architect` (anything cross-cutting), `migration-guard` (any change under
  `drizzle/` or `src/worker/db/schema.ts`), `security-reviewer` (auth,
  authorization, validation, personal data), `docs-keeper` (at the end).
- **French UI strings only in `src/client/copy.ts`**; enum values stay English.
- Conventional Commits, scoped to a domain: `feat(field-ops): …`.

## 6. Verify

```sh
pnpm install --frozen-lockfile   # only if it has not already run
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The network here reaches package registries and little else: **no D1, no Access,
no Overpass, no `--remote` anything.** A test that needs one of those means the
task was wrong, not that the verification should be skipped.

**Three fix attempts, then stop.** If it is still red, go to step 8 with the
failing output — a draft PR with a real error is worth more than a fourth guess.

## 7. Land it as a pull request

In the same branch, before opening the PR:

1. Set the task file's frontmatter to `status: done`.
2. Update its row in `docs/backlog/README.md`.

Then:

```sh
gh pr create --title "[night] #<id> <title>" --body-file <file>
```

The body, in this order — it is read at breakfast in ten minutes:

- **Task** — the backlog file, linked, and its goal in one line.
- **Implements** — the ADR, domain doc or roadmap item from `implements`.
- **What changed** — one bullet per file group, in plain words.
- **Acceptance criteria** — the task's checklist, ticked, each with where it is
  satisfied (`file:line` or the test name). An unticked box needs a sentence.
- **Verification** — the actual tail of `pnpm lint && pnpm typecheck && pnpm test && pnpm build`,
  in a code block. Never paraphrase a test result.
- **Open questions** — what you guessed, and what you would ask. "None" is an
  answer, but only if it is true.
- **Found in passing** — per `CLAUDE.md`, or "None".

Fill the repository's PR template checklist honestly. An unchecked box with a
reason is fine; a checked box that is not true is the one unrecoverable failure
of a night run.

## 8. If you are blocked

Blocked means: the task needs an architectural choice no ADR contains, a business
rule no domain doc contains, the acceptance criteria contradict each other or the
docs, or verification is still red after three attempts.

Open a **draft** PR that changes only documentation:

- the task file's `status` set to `needs-decision`
- a `## Why this is not ready` section, and a `## Options` table of **two or
  three** options with their trade-offs — the shape
  `docs/backlog/003-orphan-visit-rejected-ids.md` already uses
- any code you wrote, committed but clearly described as unfinished

Do not choose the option. Do not implement one "to show what it would look like".

## Never

- `git push` to `main`, or merge any PR — including your own, including green.
- `wrangler deploy`, anything with `--remote`, `wrangler secret`, or any
  Cloudflare, Notion, Vercel or Netlify connector tool.
- Edit an accepted ADR in place. A reversal is a new ADR (`new-adr`).
- Add a dependency the task's criteria did not name.
- Work on more than one backlog task, or open more than one PR.
- Rewrite history on a branch someone may have already pulled.
