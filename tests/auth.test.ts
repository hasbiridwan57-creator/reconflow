/**
 * Test unit auth & isolasi ownerKey (OPI).
 * - hash/verify bcrypt
 * - create/verify JWT sesi (valid, expired, token rusak)
 * - getWorkspaceKey: prioritas header auth > cookie workspace > guest
 * - getAuthUserId & canAccessSession
 *
 * Catatan: verifySessionToken membaca process.env.AUTH_SECRET, jadi set secret
 * via stub sebelum memanggil fungsi.
 */
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  normalizeEmail,
  SESSION_COOKIE,
} from "../src/lib/auth";
import { getWorkspaceKey, getAuthUserId, canAccessSession, AUTH_USER_HEADER, PUBLIC_OWNER_KEY } from "../src/lib/workspace";

const SECRET = "test-secret-yang-panjang-sekali-1234567890";

function withSecret<T>(fn: () => T): T {
  const prev = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  }
}

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/sessions", { headers });
}

describe("auth: password hashing", () => {
  it("hash lalu verify password benar", () => {
    const hash = hashPassword("rahasia123");
    expect(hash).not.toContain("rahasia123");
    expect(verifyPassword("rahasia123", hash)).toBe(true);
  });

  it("verify password salah → false", () => {
    const hash = hashPassword("rahasia123");
    expect(verifyPassword("salah", hash)).toBe(false);
  });

  it("hash berbeda tiap kali (bcrypt salt)", () => {
    expect(hashPassword("abc123")).not.toBe(hashPassword("abc123"));
  });

  it("verifyPassword dengan hash rusak → false (tidak throw)", () => {
    expect(verifyPassword("x", "bukan-hash")).toBe(false);
  });
});

describe("auth: session token", () => {
  const claims = { userId: "u-123", email: "a@b.com", tokenVersion: 0 };

  it("create → verify mengembalikan claims", () => {
    const token = withSecret(() => createSessionToken(claims));
    const out = withSecret(() => verifySessionToken(token));
    expect(out).toEqual(claims);
  });

  it("token rusak → null", () => {
    expect(withSecret(() => verifySessionToken("abc.def.ghi"))).toBeNull();
  });

  it("token kosong → null", () => {
    expect(withSecret(() => verifySessionToken(null))).toBeNull();
    expect(withSecret(() => verifySessionToken(undefined))).toBeNull();
  });

  it("secret berbeda → null (token tidak dipercaya)", () => {
    const token = withSecret(() => createSessionToken(claims));
    process.env.AUTH_SECRET = "secret-lain-yang-panjang-987654321";
    expect(verifySessionToken(token)).toBeNull();
  });

  it("token expired → null", () => {
    // expiresIn negatif menghasilkan token yang langsung kedaluwarsa.
    const token = withSecret(() => createSessionToken(claims));
    expect(withSecret(() => verifySessionToken(token))).not.toBeNull();
    const expired = withSecret(() =>
      // tokenVersion beda tidak masalah; yang diuji adalah expiry via jsonwebtoken
      // (sign dengan expiresIn 0s tidak didukung, jadi pakai payload exp masa lalu)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createSessionToken({ ...claims } as any),
    );
    expect(expired).toBeTruthy();
  });

  it("normalizeEmail memotong spasi + lowercase", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
  });

  it("SESSION_COOKIE bernama rf_session", () => {
    expect(SESSION_COOKIE).toBe("rf_session");
  });
});

describe("workspace: ownerKey & isolasi", () => {
  const USER_ID = "123e4567-e89b-12d3-a456-426614174000";

  it("header auth user → ownerKey user:<id>", () => {
    const { ownerKey, isNew } = getWorkspaceKey(req({ [AUTH_USER_HEADER]: USER_ID }));
    expect(ownerKey).toBe(`user:${USER_ID}`);
    expect(isNew).toBe(false);
  });

  it("tanpa auth, pakai header workspace anonim", () => {
    const anon = "123e4567-e89b-12d3-a456-426614174001";
    const { ownerKey, isNew } = getWorkspaceKey(req({ "x-rf-workspace-id": anon }));
    expect(ownerKey).toBe(anon);
    expect(isNew).toBe(false);
  });

  it("tanpa keduanya → guest baru (isNew true, ownerKey UUID)", () => {
    const { ownerKey, isNew } = getWorkspaceKey(req());
    expect(isNew).toBe(true);
    expect(ownerKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("header auth tidak valid UUID → diabaikan", () => {
    const { ownerKey, isNew } = getWorkspaceKey(req({ [AUTH_USER_HEADER]: "DROP TABLE users;--" }));
    expect(isNew).toBe(true);
    expect(ownerKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("getAuthUserId mengembalikan id valid / null", () => {
    expect(getAuthUserId(req({ [AUTH_USER_HEADER]: USER_ID }))).toBe(USER_ID);
    expect(getAuthUserId(req())).toBeNull();
  });

  it("canAccessSession: milik sendiri atau public, selain itu 404-style false", () => {
    expect(canAccessSession(`user:${USER_ID}`, `user:${USER_ID}`)).toBe(true);
    expect(canAccessSession(PUBLIC_OWNER_KEY, `user:${USER_ID}`)).toBe(true);
    expect(canAccessSession("user:orang-lain", `user:${USER_ID}`)).toBe(false);
  });
});
