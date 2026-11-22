import { describe, it, expect } from "vitest";
import { getWorkspaceKey, canAccessSession, WORKSPACE_COOKIE } from "@/lib/workspace";

describe("workspace helper (pure, tanpa next/headers)", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it("membaca ownerKey dari header internal x-rf-workspace-id", () => {
    const req = new Request("http://localhost/api/sessions", {
      headers: { "x-rf-workspace-id": "11111111-2222-4333-8444-555555555555" },
    });
    const r = getWorkspaceKey(req);
    expect(r.ownerKey).toBe("11111111-2222-4333-8444-555555555555");
    expect(r.isNew).toBe(false);
  });

  it("fallback ke cookie rf_workspace_id bila header tak ada", () => {
    const req = new Request("http://localhost/api/sessions", {
      headers: { cookie: `other=1; ${WORKSPACE_COOKIE}=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` },
    });
    const r = getWorkspaceKey(req);
    expect(r.ownerKey).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(r.isNew).toBe(false);
  });

  it("membuat UUID baru (isNew=true) bila header & cookie kosong", () => {
    const req = new Request("http://localhost/api/sessions");
    const r = getWorkspaceKey(req);
    expect(UUID_RE.test(r.ownerKey)).toBe(true);
    expect(r.isNew).toBe(true);
  });

  it("header invalid (bukan UUID) diabaikan → buat UUID baru", () => {
    const req = new Request("http://localhost/api/sessions", {
      headers: { "x-rf-workspace-id": "not-a-uuid" },
    });
    const r = getWorkspaceKey(req);
    expect(UUID_RE.test(r.ownerKey)).toBe(true);
    expect(r.isNew).toBe(true);
  });

  it("cookie invalid diabaikan → buat UUID baru", () => {
    const req = new Request("http://localhost/api/sessions", {
      headers: { cookie: `${WORKSPACE_COOKIE}=bogus` },
    });
    const r = getWorkspaceKey(req);
    expect(r.isNew).toBe(true);
  });

  it("canAccessSession: pemilik sah ATAU showcase public", () => {
    expect(canAccessSession("user-A", "user-A")).toBe(true);
    expect(canAccessSession("public", "user-B")).toBe(true);
    expect(canAccessSession("user-A", "user-B")).toBe(false);
  });

  it("x-rf-auth-user-id berisi cuid Prisma (mis. cmws1...) diterima → ownerKey user:<cuid>", () => {
    // User ID Prisma memakai @default(cuid()) — bukan UUID. Validasi lama (UUID saja)
    // membuat login OPI gagal terdeteksi dan semua request diperlakukan sebagai tamu.
    const cuid = "cmws1bu1h0000jz08igbdr932";
    const req = new Request("http://localhost/api/sessions", {
      headers: { "x-rf-auth-user-id": cuid },
    });
    const r = getWorkspaceKey(req);
    expect(r.ownerKey).toBe(`user:${cuid}`);
    expect(r.isNew).toBe(false);
  });

  it("x-rf-auth-user-id UUID juga tetap diterima", () => {
    const req = new Request("http://localhost/api/sessions", {
      headers: { "x-rf-auth-user-id": "11111111-2222-4333-8444-555555555555" },
    });
    const r = getWorkspaceKey(req);
    expect(r.ownerKey).toBe("user:11111111-2222-4333-8444-555555555555");
  });

  it("header auth pendek/salah format diabaikan (fallback cookie)", () => {
    const req = new Request("http://localhost/api/sessions", {
      headers: {
        "x-rf-auth-user-id": "x1",
        cookie: `${WORKSPACE_COOKIE}=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`,
      },
    });
    const r = getWorkspaceKey(req);
    expect(r.ownerKey).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });
});