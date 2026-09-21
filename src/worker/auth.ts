/**
 * Identity from Cloudflare Access — ADR-0006, docs/domains/identity-access.md.
 *
 * INVARIANT 10: identity comes from the verified JWT only. The
 * Cf-Access-Authenticated-User-Email header is never trusted as proof: it is
 * spoofable if the Worker is ever reachable without Access in front of it.
 *
 * `ctx.access` is deliberately NOT used. A Worker serving Static Assets runs
 * behind an internal router Worker that does not forward it, so it would always
 * be undefined here. See ADR-0006.
 */
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Role } from "../shared/constants";
import type { AppEnv } from "./types";

export type { Identity, AppEnv } from "./types";

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_COOKIE = "CF_Authorization";

/**
 * JWKS is cached in module scope and so lives for the isolate's lifetime.
 * INVARIANT 13: Workers Free allows 10 ms CPU per request; refetching and
 * reparsing the key set on every request would spend a chunk of that budget
 * (and a subrequest) for nothing. jose refreshes the keys itself when it sees
 * an unknown `kid`.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function readToken(req: Request): string | null {
  const header = req.headers.get(ACCESS_JWT_HEADER);
  if (header) return header;

  // Browsers navigating the SPA send the Access session as a cookie.
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACCESS_COOKIE) return rest.join("=") || null;
  }
  return null;
}

export function roleFor(email: string, adminEmails: string | undefined): Role {
  const admins = (adminEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase()) ? "admin" : "agent";
}

function unauthorized(message: string): HTTPException {
  return new HTTPException(401, {
    res: Response.json({ error: "unauthorized", message }, { status: 401 }),
  });
}

/** Verifies Access on every /api request and puts the identity on the context. */
export const requireIdentity = createMiddleware<AppEnv>(async (c, next) => {
  const url = new URL(c.req.url);

  // Local development only. Honoured solely on localhost, so a production
  // request can never reach this branch even if the variable were set.
  if (isLocalHost(url.hostname) && c.env.DEV_USER_EMAIL) {
    const email = c.env.DEV_USER_EMAIL.toLowerCase();
    c.set("identity", { email, role: roleFor(email, c.env.ADMIN_EMAILS) });
    return next();
  }

  const teamDomain = c.env.ACCESS_TEAM_DOMAIN;
  const aud = c.env.ACCESS_AUD;
  if (!teamDomain || !aud) {
    // Misconfiguration must fail closed, never fall through to open access.
    throw new HTTPException(500, {
      res: Response.json(
        { error: "misconfigured", message: "Access is not configured on this Worker." },
        { status: 500 },
      ),
    });
  }

  const token = readToken(c.req.raw);
  if (!token) throw unauthorized("Sign in again to continue.");

  let email: string;
  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience: aud,
    });
    const claim = payload.email;
    if (typeof claim !== "string" || !claim) throw new Error("no email claim");
    email = claim.toLowerCase();
  } catch {
    throw unauthorized("Your session has expired. Sign in again to sync.");
  }

  c.set("identity", { email, role: roleFor(email, c.env.ADMIN_EMAILS) });
  return next();
});

/** Admin-only routes. Runs after requireIdentity. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("identity").role !== "admin") {
    throw new HTTPException(403, {
      res: Response.json(
        { error: "forbidden", message: "This page is for admins." },
        { status: 403 },
      ),
    });
  }
  return next();
});
