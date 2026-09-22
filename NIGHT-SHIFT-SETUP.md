# Night shift — setup trace

**Temporary file. Delete it when the last box is ticked** (see
[Teardown](#teardown)). It is the trace of setting up autonomous overnight runs
for this repo; everything meant to survive is already committed elsewhere and
linked below.

The decision itself is [ADR-0016](docs/adr/0016-autonomous-overnight-agent-runs.md).
The behaviour is [`.claude/skills/night-shift/SKILL.md`](.claude/skills/night-shift/SKILL.md).
Nothing in this file is a rule — the rules are in the repo, on purpose.

---

## 1. In the repo — done

| What | Where | Why it is there and not in the routine's prompt |
|---|---|---|
| The decision | [docs/adr/0016](docs/adr/0016-autonomous-overnight-agent-runs.md) (status `proposed`) | Accept it in the PR, like any ADR |
| The behaviour | [.claude/skills/night-shift/SKILL.md](.claude/skills/night-shift/SKILL.md) | Changing what the night shift does is a reviewable diff, not an edit to a web form |
| The queue | [docs/backlog/](docs/backlog/) — [README](docs/backlog/README.md), [template](docs/backlog/000-template.md) | A file is in the clone. No connector, no `gh` auth, reviewable beside the code that implements it |
| First tasks | [001 prospect CSV export](docs/backlog/001-prospect-csv-export.md) `ready` · [002 visit CSV export](docs/backlog/002-visit-csv-export.md) `ready`, needs 001 · [003 orphan visits](docs/backlog/003-orphan-visit-rejected-ids.md) `needs-decision` | 001 is the loop validator: one route, one pure function, two tests, two doc lines, no client code, no migration |
| Pointers | `CLAUDE.md` skills section · `docs/roadmap.md` M6 branch-protection line · `docs/adr/README.md` row | So the next reader finds it without this file |

**Why 001 is not "add Vitest".** The usual advice is to validate the loop with
the task that scaffolds the test runner. Vitest, `@cloudflare/vitest-plugin` and
fourteen test files are already here, so the smallest real, isolated,
fully-specified task takes that job instead.

- [ ] Read the ADR and either accept it or say what is wrong with it
- [ ] Read 001's acceptance criteria as if you were the one implementing it at
      01:00 with nobody to ask. Every vague line is a vague PR

## 2. Land `main` first — blocking

A run clones **the default branch**. Right now `main` is 47 files and ~2,200
lines behind `feat/m2-field-pwa`, and that branch is not even pushed. A night
shift starting tonight would build on an app without the field screens, the
sync wiring or the vendored field controls.

- [ ] Push and merge `feat/m2-field-pwa` (or at least push it, so it is visible)
- [ ] Commit this setup work and merge it too — the skill and the backlog have to
      be *on `main`* for a run to see them
- [ ] From then on: **landing the branch is part of stopping work for the day**
      (ADR-0016, first consequence)

## 3. Branch protection — blocking

This is the structural reason a run cannot land its own work. It is a roadmap M6
item; the night shift needs it now.

- [ ] GitHub → Settings → Branches → protect `main`: require a pull request,
      require one approval, require the CI status check, squash-merge only
- [ ] Confirm `claude/*` is not covered by any auto-merge rule

## 4. Cloud environment

At claude.ai/code, create the environment the routine runs in.

- [ ] Network: **Trusted** (the default). It reaches package registries and
      common dev domains — enough for `pnpm install`, and deliberately not enough
      to reach D1, Access or Overpass
- [ ] Setup script: `corepack enable && pnpm install --frozen-lockfile`
      (this repo pins `pnpm@11.15.1` in `package.json`, and `.nvmrc` sets Node)
- [ ] Verify the script's result is cached, so a run does not reinstall nightly
- [ ] Variables: **none.** In particular no `CLOUDFLARE_API_TOKEN` and no
      `ANTHROPIC_API_KEY` — environment variables are visible to anyone with
      access to the environment, and a run has no business holding either

## 5. The routine

claude.ai/code/routines → New routine.

| Field | Value |
|---|---|
| Name | `night-shift-builder` |
| Prompt | `Run the night-shift skill in this repo. Success = exactly one PR opened, or a clear "nothing to do" / blocker report.` |
| Model | pick one; every run uses it |
| Repos | `captain-prospectus` only |
| Environment | the one from step 4 |
| Trigger | daily at 01:00, entered in your local zone |
| Connectors | **remove all of them** |

- [ ] Created with exactly those values
- [ ] **Connectors removed.** Every connector is attached by default and Claude
      can use all of its tools, writes included, without asking. This account has
      Cloudflare, Notion, Vercel and Netlify connected — a run with the Cloudflare
      one attached can deploy the Worker and query production D1, against
      `CLAUDE.md` and ADR-0003
- [ ] Usage credits **off**, so a run past the daily cap is skipped rather than
      billed. That is [ADR-0002](docs/adr/0002-zero-cost-constraint.md) applied to
      our own tooling
- [ ] Custom cadence instead of daily? `/schedule update` with a cron expression;
      minimum interval is one hour

## 6. First run, while you are awake

- [ ] **Run now**, and watch it
- [ ] It picks 001 — not 002 (depends on 001), not 003 (`needs-decision`)
- [ ] It creates `claude/001-prospect-csv-export` and pushes nothing to `main`
- [ ] It opens exactly one PR titled `[night] #001 CSV export of the prospect ledger`
- [ ] The PR body has: task, implements, what changed, ticked criteria with
      `file:line`, the real tail of `pnpm lint && pnpm typecheck && pnpm test && pnpm build`,
      open questions, found in passing
- [ ] The diff touches `src/worker/routes/admin.ts`, `src/shared/`, two test
      files, `docs/api.md`, `docs/domains/prospecting.md`, and the backlog file's
      status — **and nothing else**
- [ ] Run it a **second** time without merging. It must report `nothing to do`
      because `claude/001-*` exists on `origin`. If it rebuilds 001, the
      `git ls-remote` check in step 2 of the skill is broken and every night will
      redo the same task

## 7. Optional — a reviewer routine

- [ ] Trigger: GitHub event `pull_request.opened`, head branch starts with
      `claude/`. Needs the Claude GitHub App installed on the repo
- [ ] Prompt: `Review this PR against docs/adr/ and the task's acceptance criteria. Comment only; don't push.`
- [ ] Remember it consumes runs from the same daily cap

## 8. Your morning, about ten minutes

- [ ] Open the transcript. **A green status only means the session exited without
      an infrastructure error** — not that the task succeeded
- [ ] Review the PR against the task's criteria, not against the diff's
      plausibility. The checked boxes are the thing to distrust
- [ ] Merge, or send it back
- [ ] A `needs-decision` PR is answered with a **new ADR**, then the task goes
      back to `ready`
- [ ] Deploy by hand, when you want to. Never the run

## Known sharp edges

- **Commits and PRs carry your GitHub identity** (`m0hss`). The `[night]` title
  prefix and the `claude/*` branch namespace are the only markers that a change
  was unattended, which is why both are in the skill rather than left to habit.
- **A task with vague criteria produces vague code at 01:00.** Writing the task
  well is the work that used to happen while implementing it.
- **Design passes are poor night work.** ADR-0014 wants the `frontend-design`
  skill run before a screen exists; that is judgement. 001 and 002 ship endpoints
  and explicitly leave the download button out for this reason.
- **Sync contract changes are poor night work** — 003 is parked as
  `needs-decision` for exactly that.
- **If the GitHub connection expires**, the routine skips runs for up to 72 hours,
  then turns itself off. Worth knowing before you conclude the backlog is empty.

## Teardown

Once every box above is ticked:

```sh
git rm --cached NIGHT-SHIFT-SETUP.md 2>/dev/null; rm NIGHT-SHIFT-SETUP.md
```

What stays, and is the whole of the setup from then on:
`docs/adr/0016-autonomous-overnight-agent-runs.md`,
`.claude/skills/night-shift/SKILL.md`, `docs/backlog/`, and the three pointers in
`CLAUDE.md`, `docs/roadmap.md` and `docs/adr/README.md`.
