# Deployment

## Environments
| Env | Where | Database | Auth |
|---|---|---|---|
| Local | `pnpm dev` (Vite + workerd via `@cloudflare/vite-plugin`) | Local D1 (in `.wrangler/`) | `DEV_USER_EMAIL` in `.dev.vars` |
| Production | `captain-prospectus.<account>.workers.dev` | D1 `captain-prospectus` | Cloudflare Access |

A staging environment is not planned for v1 (two agents, low risk). If added: a wrangler `env.staging` with its own Worker name and D1 database, and its own Access application.

## One-time setup (production)

1. **Cloudflare account** (free). `npx wrangler login`.
2. **Database**: `npx wrangler d1 create captain-prospectus`, paste the returned `database_id` into `wrangler.jsonc`.
3. **First deploy**: `pnpm build && npx wrangler deploy` to create the Worker. There is deliberately no `deploy` npm script: routine deploys go through CI (see the release process below).
4. **Access** — protect the Worker (one click, no zone or custom domain needed):
   - Cloudflare dashboard → **Workers & Pages** → `captain-prospectus` → **Settings** → **Domains & Routes**.
   - Next to `workers.dev`, select **Enable Cloudflare Access**, scope **All traffic**.
     This creates a reusable policy named `captain-prospectus - Production`.
   - **Manage Cloudflare Access** → set the policy to *Allow* → the emails of the admins and agents,
     and enable the **One-time PIN** login method. First use also creates the team domain
     `<team>.cloudflareaccess.com`.
   - In **Zero Trust** → **Access** → **Applications**, open the application and copy its **AUD tag**.
     The Worker needs it to verify the JWT — the identity still comes from the verified token, never
     from `ctx.access`, which Static Assets do not forward ([ADR-0006](adr/0006-cloudflare-access-auth.md)).
5. **Worker variables** in `wrangler.jsonc`: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS`. Redeploy.
6. **Verify**: open the URL in a private window → Access login → app loads → `GET /api/me` shows the right role. Call `/api/me` with `curl` and no cookie → must be 401/redirect.
7. **Check nothing bypasses Access.** Preview URLs have their own toggle in the same
   **Domains & Routes** panel (they share one account-wide "Cloudflare Workers Preview URLs"
   policy); enable it, or disable preview URLs. Verify no other route reaches the Worker unprotected.
8. **GitHub secrets** for CI deploys: `CLOUDFLARE_API_TOKEN` (scoped: Workers Scripts Edit, D1 Edit, on this account only) and `CLOUDFLARE_ACCOUNT_ID`.
9. **The backup bucket** ([ADR-0023](adr/0023-retention-by-redaction.md), closing
   [#34](https://github.com/FixbyteStudio/captain-prospectus/issues/34)):
   `npx wrangler r2 bucket create captain-prospectus-backups`. Backups used to land in a
   GitHub artifact, which put a full copy of every visit note and agent position on a
   third party for 90 days; they go to R2 so `docs/security.md`'s "data stays in the
   Cloudflare account" is true. R2's free tier is 10 GB against a database measured in
   megabytes ([ADR-0002](adr/0002-zero-cost-constraint.md)).
   - Add **R2 Storage: Edit** to `CLOUDFLARE_API_TOKEN`, or `backup.yml` fails at the
     upload step with the export already taken.
   - Set a lifecycle rule on the bucket to expire objects after 90 days, matching
     `RETENTION_DAYS` — a backup that outlives the retention window puts the data back.
   - The workflow runs in the `production` environment, so create it in GitHub with the
     same reviewers as the deploy.
10. **The retention sweep** runs from a Cron Trigger declared in `wrangler.jsonc`
    (`40 3 * * *`); it needs no setup beyond deploying. It fails quietly by nature, so
    after the first night check the Workers log for the `retention: redacted N visit(s)`
    line. No line means the cron is not firing.
11. **Optional — the Google map provider** ([ADR-0020](adr/0020-google-places-as-a-second-map-provider.md)):
   `npx wrangler secret put GOOGLE_PLACES_KEY` with a key that has the Places API (New) enabled.
   A secret, never a var in `wrangler.jsonc`. Skip this and the map import still works on
   OpenStreetMap; the Google option answers 503 and the screen says it is not configured.

## Release process

Trunk-based. `main` is always deployable.

1. PR → CI green (typecheck, tests, build) → review → squash-merge.
2. The `Deploy` workflow on `main`:
   1. `wrangler d1 migrations apply captain-prospectus --remote`
   2. `wrangler deploy`
3. Smoke test: load the app, run a sync from a phone.

Migrations run **before** the new code, so each migration must work with the currently deployed Worker (expand → deploy → contract across two releases).

## Rollback
- **Code**: `npx wrangler rollback` to the previous version (Workers keep version history).
- **Data**: D1 Time Travel: `npx wrangler d1 time-travel restore captain-prospectus --timestamp=<unix>`. Retention window depends on the plan; check the D1 docs. Restore overwrites the database; export first.
- A destructive migration (drop/rename column) is never rolled back by code rollback alone. That is why contract steps ship separately.

## Backups
Weekly `npx wrangler d1 export captain-prospectus --remote --output=backup.sql`, stored outside Cloudflare. Automate later as a scheduled GitHub Action (roadmap).

## Mobile install
Agents open the URL in the phone browser, sign in with Access, then "Add to Home Screen". On iOS, install from Safari.
