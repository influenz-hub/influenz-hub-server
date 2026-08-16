import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const api = "/api/v1";

/**
 * Smoke coverage over the behaviors most likely to break silently: the auth
 * lifecycle, the authorization boundary, and the public read surface. These run
 * against the seeded development database.
 */
describe("health", () => {
  it("reports ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("public discovery", () => {
  it("lists creators with engagement counts and a cursor", async () => {
    const res = await request(app).get(`${api}/creators?limit=3`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty("slug");
    expect(first).toHaveProperty("followerCount");
    expect(first).toHaveProperty("growthLevel");
    expect(res.body.meta).toHaveProperty("nextCursor");
  });

  it("404s an unknown profile slug", async () => {
    const res = await request(app).get(`${api}/profiles/definitely-not-a-real-slug`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("auth", () => {
  const email = `vitest-${Date.now()}@example.com`;
  let refreshToken = "";
  let accessToken = "";

  it("registers a new account", async () => {
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({ name: "Vitest User", email, password: "supersecret123" });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    // Credentials must never come back to the client.
    expect(res.body.data.user).not.toHaveProperty("passwordHash");

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it("rejects a duplicate registration", async () => {
    const res = await request(app)
      .post(`${api}/auth/register`)
      .send({ name: "Vitest User", email, password: "supersecret123" });
    expect(res.status).toBe(409);
  });

  it("rejects a wrong password", async () => {
    const res = await request(app)
      .post(`${api}/auth/login`)
      .send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    const res = await request(app)
      .get(`${api}/auth/me`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
  });

  it("rotates the refresh token and detects reuse", async () => {
    const rotated = await request(app).post(`${api}/auth/refresh`).send({ refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(refreshToken);

    // Presenting the now-consumed token must fail and kill the family.
    const replay = await request(app).post(`${api}/auth/refresh`).send({ refreshToken });
    expect(replay.status).toBe(401);

    const afterRevoke = await request(app)
      .post(`${api}/auth/refresh`)
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(afterRevoke.status).toBe(401);
  });
});

describe("authorization", () => {
  let businessToken = "";

  beforeAll(async () => {
    const res = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: "luna@influenzhub.com", password: "influenz123" });
    businessToken = res.body.data.accessToken;
  });

  it("401s an owner route with no token", async () => {
    const res = await request(app).get(`${api}/me/profile`);
    expect(res.status).toBe(401);
  });

  it("403s an admin route for a non-admin", async () => {
    const res = await request(app)
      .get(`${api}/admin/overview`)
      .set("Authorization", `Bearer ${businessToken}`);
    expect(res.status).toBe(403);
  });

  it("403s a mutation on another business's store", async () => {
    const other = await prisma.store.findFirst({
      where: { profile: { user: { email: "kenji@influenzhub.com" } } },
    });
    expect(other).toBeTruthy();

    const res = await request(app)
      .delete(`${api}/me/stores/${other!.id}`)
      .set("Authorization", `Bearer ${businessToken}`);
    expect(res.status).toBe(403);
  });

  it("rejects invalid input before it reaches the database", async () => {
    const res = await request(app)
      .post(`${api}/me/stores`)
      .set("Authorization", `Bearer ${businessToken}`)
      .send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
