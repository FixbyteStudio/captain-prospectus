import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "./index";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { prospects, scripts, visits } from "./db/schema";
import { MAX_REQUEST_BYTES } from "../shared/constants";
import type { DevSeed } from "../shared/schemas";

/**
 * The one route mounted before auth (src/worker/index.ts), and until this file
 * it had no test at all. What is pinned here is the gate, not the seeding.
 */

async function callAt(origin: string, path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`${origin}${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  return callAt("http://localhost", path, init);
}

function seedBody(overrides?: Partial<DevSeed>): unknown {
  return {
    prospects: [
      {
        name: "Le Bistrot",
        type: "restaurant",
        lat: 50.85,
        lng: 4.35,
        address: "Rue Neuve 1",
        assignedTo: "agent@example.com",
      },
    ],
    script: {
      name: "Questionnaire",
      questions: [{ key: "has_pos", label: "Caisse en place ?", type: "yes_no" }],
    },
    ...overrides,
  };
}

async function postSeed(body: unknown): Promise<Response> {
  return call("/api/dev/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  const db = getDb(env.DB);
  // Order matters: visits reference both of the others by foreign key.
  await db.delete(visits);
  await db.delete(prospects);
  await db.delete(scripts);
});

describe("POST /api/dev/seed", () => {
  it("seeds prospects and one active script", async () => {
    const response = await postSeed(seedBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ seeded: 1 });

    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    expect(row?.name).toBe("Le Bistrot");
    // assignedTo drives the derived status, exactly as the real insert path does.
    expect(row?.status).toBe("assigned");
    expect(row?.createdBy).toBe("seed@localhost");

    const [script] = await db.select().from(scripts).where(eq(scripts.isActive, true));
    expect(script?.version).toBe(1);
  });

  it("derives status new when nothing is assigned", async () => {
    await postSeed(
      seedBody({
        prospects: [
          {
            name: "Chez Nous",
            type: "cafe",
            lat: null,
            lng: null,
            address: null,
            assignedTo: null,
          },
        ],
      }),
    );
    const db = getDb(env.DB);
    const [row] = await db.select().from(prospects);
    expect(row?.status).toBe("new");
  });

  /** INVARIANT 6: the body used to be cast to a type and inserted unchecked. */
  it("rejects a body that does not match devSeedSchema", async () => {
    const response = await postSeed(
      seedBody({
        prospects: [
          { name: "x", type: "bakery", lat: null, lng: null, address: null, assignedTo: null },
        ] as never,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "validation" });

    const db = getDb(env.DB);
    expect(await db.select().from(prospects)).toHaveLength(0);
  });

  /**
   * The script goes through scriptCreateSchema, so a seed can only contain a
   * questionnaire POST /api/admin/scripts would also have accepted.
   */
  it("rejects a script the admin API would reject", async () => {
    const response = await postSeed(
      seedBody({
        script: {
          name: "Questionnaire",
          // `single` with no options is the cross-field rule in questionSchema.
          questions: [{ key: "pos", label: "Caisse ?", type: "single" }],
        } as never,
      }),
    );
    expect(response.status).toBe(400);
  });

  it("answers 404 off localhost, without writing anything", async () => {
    const response = await callAt("https://captain-prospectus.example.com", "/api/dev/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seedBody()),
    });
    expect(response.status).toBe(404);
    // Nothing about the gate leaks off localhost.
    expect(await response.json()).toEqual({ error: "not_found" });

    const db = getDb(env.DB);
    expect(await db.select().from(prospects)).toHaveLength(0);
  });

  it("answers 404 when DEV_USER_EMAIL is not set", async () => {
    const saved = env.DEV_USER_EMAIL;
    try {
      delete (env as { DEV_USER_EMAIL?: string }).DEV_USER_EMAIL;
      const response = await postSeed(seedBody());
      expect(response.status).toBe(404);
      // On localhost the reason is spelled out; a fresh clone has no .dev.vars.
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining("DEV_USER_EMAIL"),
      });
    } finally {
      env.DEV_USER_EMAIL = saved;
    }
  });

  /**
   * The regression test for the middleware ORDER in src/worker/index.ts.
   *
   * /api/dev/* is mounted before auth, and Hono composes handlers in
   * registration order — so a bodyLimit registered below that mount would never
   * run for this route. If someone moves it, this is the test that fails.
   */
  it("refuses an oversized body", async () => {
    const response = await call("/api/dev/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(MAX_REQUEST_BYTES + 1),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "too_large" });
  });
});
