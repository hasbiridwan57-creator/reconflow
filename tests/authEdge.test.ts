/**
 * Test verifikasi token sesi versi Edge (authEdge.ts) — Web Crypto HS256.
 * Memastikan token yang dibuat api auth (jsonwebtoken HS256) diverifikasi
 * sama benar oleh middleware Edge: valid → claims; palsu/kedaluwarsa → null.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createSessionToken, SESSION_MAX_AGE_SECONDS, type SessionClaims } from "@/lib/auth";
import { createSessionTokenEdge, verifySessionTokenEdge } from "@/lib/authEdge";

const claims: SessionClaims = {
  userId: "11111111-2222-4333-8444-555555555555",
  email: "edge@test.id",
  tokenVersion: 3,
};

describe("verifySessionTokenEdge (Web Crypto HS256)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-panjang-minimal-16-karakter";
  });

  it("token dari jsonwebtoken (lib/auth) diverifikasi benar oleh edge verifier", async () => {
    const token = createSessionToken(claims);
    const result = await verifySessionTokenEdge(token);
    expect(result).toEqual(claims);
  });

  it("token dibuat edge & diverifikasi edge konsisten", async () => {
    const token = await createSessionTokenEdge(claims, SESSION_MAX_AGE_SECONDS);
    const result = await verifySessionTokenEdge(token);
    expect(result).toEqual(claims);
  });

  it("token dengan signature palsu → null", async () => {
    const token = createSessionToken(claims);
    const [h, p] = token.split(".");
    const forged = `${h}.${p}.c2lnbmF0dXJlLXBhbHN1`; // base64url dari "signature-palsu"
    expect(await verifySessionTokenEdge(forged)).toBeNull();
  });

  it("token kedaluwarsa → null", async () => {
    const expired = await createSessionTokenEdge(claims, -10);
    expect(await verifySessionTokenEdge(expired)).toBeNull();
  });

  it("token bukan HS256 (alg none) → null", async () => {
    const payload = Buffer.from(JSON.stringify({ ...claims, iat: 1, exp: 9999999999 })).toString("base64url");
    const none = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${payload}.`;
    expect(await verifySessionTokenEdge(none)).toBeNull();
  });

  it("token rusak / kosong → null", async () => {
    expect(await verifySessionTokenEdge(null)).toBeNull();
    expect(await verifySessionTokenEdge("bukan-token")).toBeNull();
    expect(await verifySessionTokenEdge("a.b")).toBeNull();
  });
});
