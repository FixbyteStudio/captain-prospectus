import type { Role } from "../shared/constants";

/**
 * Worker bindings.
 *
 * `wrangler types` infers the *literal* value of each var in wrangler.jsonc
 * (the placeholders there are empty strings), so the generated Env types them
 * as `""`. We widen them to `string` here, and add DEV_USER_EMAIL, which lives
 * in .dev.vars and so never appears in the generated file.
 */
export type Bindings = Omit<
  Env,
  "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "ADMIN_EMAILS" | "AGENT_EMAILS"
> & {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  /**
   * Comma-separated. Not a permission — Access decides who gets in, and
   * ADMIN_EMAILS decides who is an admin. This is only who the assign menu
   * offers, because ADR-0006 leaves us without a users table to query.
   */
  AGENT_EMAILS?: string;
  /** Local development only; honoured only on localhost. See ADR-0006. */
  DEV_USER_EMAIL?: string;
  /**
   * Google Places API key — a **secret**, set with `wrangler secret put`, never
   * in wrangler.jsonc and never sent to the browser (ADR-0020).
   *
   * Optional on purpose: absent means the Google map provider is simply not
   * configured, the route answers 503, and the app works exactly as it did
   * before. A deployment with no billing account loses nothing.
   */
  GOOGLE_PLACES_KEY?: string;
};

export type Identity = { email: string; role: Role };

export type AppEnv = {
  Bindings: Bindings;
  Variables: { identity: Identity };
};
