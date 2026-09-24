# ADR-0016: Autonomous overnight agent runs, bounded by the repo

- Status: accepted
- Date: 2026-09-22
- Deciders: owner

## Context

This is a one-person project with two field agents as its users. The work is
specified in `docs/` before it is built — a roadmap, fifteen ADRs, five domain
docs, a glossary, and a `CLAUDE.md` of invariants. That is already more
specification than most of the code needs, which makes the project a candidate
for unattended implementation: the rules an agent would have to be told are
written down.

A scheduled cloud routine (claude.ai/code/routines) fires on a cron, clones the
repository fresh, starts from the default branch, and can use skills committed
to that repository. Four properties of that runtime shape this decision:

- **Each run starts cold.** There is no memory between runs other than git, and
  nothing a run learns survives except what it commits or writes in a PR.
- **State that is not on `main` is invisible.** A run clones the default branch,
  so a task whose status was flipped in an unmerged PR still reads `ready`.
  Without a second signal, every night rebuilds the same task.
- **Connectors are included by default and are not read-only.** This account has
  Cloudflare, Notion, Vercel and Netlify connectors. A run with them attached can
  write to production infrastructure without asking, which collides with
  [ADR-0003](0003-single-cloudflare-worker.md), [ADR-0012](0012-workers-dev-hostname.md)
  and the rule in `CLAUDE.md` that deploys go through CI only.
- **Runs draw from the subscription and have a daily cap.** With usage credits
  enabled, runs past the cap continue on metered overage, which is money —
  [ADR-0002](0002-zero-cost-constraint.md) forbids it.

The network available to a run allows a package-registry allowlist plus common
dev domains. It cannot reach D1, Access, or Overpass. So anything the run needs
to verify must be verifiable offline: `pnpm lint`, `pnpm typecheck`, `pnpm test`
(workerd-local D1 via `@cloudflare/vitest-plugin`) and `pnpm build`.

Branch protection on `main` is a roadmap M6 item. Unattended runs need it
earlier: it is the structural reason a run cannot land its own work.

## Decision

We will run **one scheduled routine that implements exactly one backlog task per
run and whose only output is a branch and a pull request.** Seven rules make
that bounded by structure rather than by prompt wording:

1. **The backlog lives in git, as files under `docs/backlog/`** — one file per
   task, with `id`, `status` (`ready` | `needs-decision` | `done`),
   `implements`, `depends_on`, a goal, acceptance criteria and an out-of-scope
   list. Not GitHub issues: a file is in the clone, is reviewable in the same
   diff as the code, and needs no connector to read.

2. **The behaviour lives in a committed skill**, `.claude/skills/night-shift/SKILL.md`.
   The routine's prompt is one line that names the skill. Changing what the night
   shift does is a PR, not an edit to a form in a web UI.

3. **Task selection is deterministic**: the lowest `id` whose `status` is
   `ready`, whose `depends_on` are all `done`, and for which no `claude/<id>-*`
   branch exists on `origin`. The branch check is what stops a run from
   redoing a task whose status change is still sitting in an unmerged PR. If
   nothing qualifies, the run exits and says so.

4. **One task per run, one task per PR.** The branch is `claude/<id>-<slug>`,
   the PR is titled `[night] #<id> <title>`, and its body names the ADR
   implemented, what changed, the test output, and open questions. The
   "one concern per change" rule in `CLAUDE.md` applies unchanged: a bug found
   in passing becomes a backlog file or a GitHub issue, never an extra commit.

5. **A run never merges, never deploys, and never touches a remote resource.**
   No `wrangler deploy`, no `--remote`, no `wrangler secret`, no D1 outside the
   local one, no edit to an accepted ADR in place.

6. **The routine carries no connectors and no environment variables.** In
   particular no `CLOUDFLARE_API_TOKEN` and no `ANTHROPIC_API_KEY`: environment
   variables are visible to anyone with access to the environment, and a run has
   no business holding either.

7. **Usage credits stay off**, so a run that would exceed the daily cap is
   skipped instead of billed. This is ADR-0002 applied to our own tooling.

**A decision the docs do not already contain stops the run.** If the task needs
an architectural choice not covered by an ADR, or a business rule not in a domain
doc, the run opens a **draft** PR that sets the task's status to
`needs-decision` and lists two or three options with trade-offs. It does not
choose. Answering it is a new ADR, written by the owner, after which the task
goes back to `ready`.

## Alternatives considered

| Option | Why not |
|---|---|
| GitHub issues as the backlog | Needs a connector or `gh` auth inside the run, returns prose rather than a schema, and cannot be reviewed in the same diff as the code that implements it. Issues stay what they are today: things found in passing, not the queue a machine reads |
| Put the rules in the routine's prompt | The prompt is edited in a web form, is not versioned, is not reviewable, and cannot be tested. A skill in the repo is all four. It also means the same rules apply when the owner runs the skill by hand |
| Let the run merge its own green PR | CI green means lint, types, tests and build passed — not that the change is the one the task asked for, matches the domain doc, or uses the glossary's words. Those are exactly the failures a machine cannot see in its own work. Branch protection makes the question moot |
| Let the run deploy to a preview | There is one Worker and one D1 ([ADR-0003](0003-single-cloudflare-worker.md), [ADR-0005](0005-d1-with-drizzle.md)); a preview is a second environment we decided not to have, and it would need a Cloudflare token in the environment |
| Several tasks per run | Multiplies the review surface per morning and couples unrelated changes in one branch. A bounded run that finishes one thing is reviewable in ten minutes; a run that did four is not revertible in pieces |
| Skip the branch check, rely on task status | Status lives on a branch until the PR merges. Without the `git ls-remote` check the routine rebuilds the same task every night until the owner merges — which is precisely the night it is least likely to happen |

## Consequences

- **`main` must be current before a night runs.** A run clones the default
  branch, so unmerged local work is invisible to it and a task touching the same
  files will conflict. Landing the branch is now part of stopping work for the
  day.
- **The backlog is a second document beside the roadmap**, and they can drift.
  The rule: `docs/roadmap.md` stays the milestone view for humans;
  `docs/backlog/` is the executable slice of it, and a backlog file must name
  the roadmap item or ADR it implements. A task that implements nothing written
  down is not `ready`.
- **Acceptance criteria become load-bearing prose.** A vague criterion produces a
  vague PR at 01:00 with nobody to ask. Writing a task well is the work that
  used to happen while implementing it.
- **Branch protection on `main` moves from M6 to a prerequisite.** Require a PR
  and a review; `claude/*` branches then cannot land unreviewed even by mistake.
- **Tests must keep running offline.** Any test that reaches for a remote
  Cloudflare resource turns a night into a failure report. This was already true
  of CI; it is now also true of the only place the work gets verified before a
  human sees it.
- **PRs carry the owner's GitHub identity.** The `[night]` title prefix and the
  `claude/*` branch namespace are the only markers that a change was unattended,
  so both are part of the contract rather than a convention.
- **Harder: anything needing judgement.** Design passes (`frontend-design`,
  [ADR-0014](0014-tailwind-and-shadcn-ui.md)), sync contract changes
  ([ADR-0007](0007-offline-first-insert-only-sync.md)) and migrations on deployed
  data are poor night work. They are not forbidden, but a task that needs one
  should say so and will usually come back as `needs-decision`.
- **Harder: knowing a run succeeded.** A green routine status means the session
  exited without an infrastructure error. The morning review reads the transcript
  and the PR, not the badge.
