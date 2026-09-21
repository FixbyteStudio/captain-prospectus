import type { Role } from "../shared/constants";

/**
 * Worker bindings.
 *
 * `wrangler types` infers the *literal* value of each var in wrangler.jsonc
 * (the placeholders there are empty strings), so the generated Env types them
 * as `""`. We widen them to `string` here, and add DEV_USER_EMAIL, which lives
 * in .dev.vars and so never appears in the generated file.
 */
export type Bindings = Omit<Env, "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "ADMIN_EMAILS"> & {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  /** Local development only; honoured only on localhost. See ADR-0006. */
  DEV_USER_EMAIL?: string;
};

export type Identity = { email: string; role: Role };

export type AppEnv = {
  Bindings: Bindings;
  Variables: { identity: Identity };
};
