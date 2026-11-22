/**
 * Helper ownership berbasis cookie — pure (tidak bergantung next/headers)
 * agar mudah dites di Vitest. Middleware menyuntikkan header internal
 * `x-rf-workspace-id`; route handler membaca lewat getWorkspaceKey().
 */
import type { NextResponse } from "next/server";

export const WORKSPACE_COOKIE = "rf_workspace_id";
const WORKSPACE_HEADER = "x-rf-workspace-id";
/** Header internal identitas user (disuntik middleware setelah verifikasi cookie sesi). */
export const AUTH_USER_HEADER = "x-rf-auth-user-id";
/** ownerKey untuk sesi showcase yang bisa dibaca siapa pun. */
export const PUBLIC_OWNER_KEY = "public";

/** Validasi id workspace/user: UUID v4 ATAU cuid (Prisma `@default(cuid())`, mis. `cmws1...`). */
function isValidWorkspaceId(value: string | undefined | null): value is string {
  if (!value) return false;
  // UUID v4 (8-4-4-4-12 hex) ATAU cuid Prisma (diawali huruf, min. 24 karakter alfanumerik).
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    || /^[a-z][a-z0-9]{23,}$/i.test(value);
}

function generateWorkspaceKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback untuk lingkungan tanpa crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Ambil ownerKey dari header internal ATAU cookie. Murni dari argumen `request`,
 * tanpa next/headers → aman dipanggil di route handler Vitest.
 *
 * Prioritas:
 * 1. `x-rf-auth-user-id` — disuntik middleware setelah cookie sesi diverifikasi
 *    (login OPI). ownerKey menjadi `user:<id>` sehingga data terisolasi per user.
 * 2. `x-rf-workspace-id` — cookie anonim (tamu, kompatibel dengan perilaku lama).
 */
export function getWorkspaceKey(request: Request): { ownerKey: string; isNew: boolean } {
  const authUser = request.headers.get(AUTH_USER_HEADER);
  if (authUser && isValidWorkspaceId(authUser)) {
    return { ownerKey: `user:${authUser}`, isNew: false };
  }

  const fromHeader = request.headers.get(WORKSPACE_HEADER);
  if (isValidWorkspaceId(fromHeader)) {
    return { ownerKey: fromHeader, isNew: false };
  }
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${WORKSPACE_COOKIE}=`));
    if (match) {
      const value = decodeURIComponent(match.slice(WORKSPACE_COOKIE.length + 1));
      if (isValidWorkspaceId(value)) {
        return { ownerKey: value, isNew: false };
      }
    }
  }
  return { ownerKey: generateWorkspaceKey(), isNew: true };
}

/**
 * Pasang cookie workspace pada response jika ownerKey baru (mis. API dipanggil
 * tanpa cookie). Middleware sudah menangani halaman; helper ini untuk jalur API.
 */
export function attachWorkspaceCookie(res: NextResponse, ownerKey: string): NextResponse {
  res.cookies.set({
    name: WORKSPACE_COOKIE,
    value: ownerKey,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

/**
 * Cek akses sesi: pemilik sah (ownerKey sama) ATAU showcase "public".
 * Kembalikan true jika boleh diakses; false → route mengembalikan 404.
 */
export function canAccessSession(sessionOwnerKey: string | null | undefined, ownerKey: string): boolean {
  return sessionOwnerKey === ownerKey || sessionOwnerKey === PUBLIC_OWNER_KEY;
}

/**
 * Ambil userId yang sedang login dari header internal (disuntik middleware).
 * Return null bila tamu (belum login) — route memakai ini untuk membatasi aksi.
 */
export function getAuthUserId(request: Request): string | null {
  const authUser = request.headers.get(AUTH_USER_HEADER);
  return authUser && isValidWorkspaceId(authUser) ? authUser : null;
}