import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { verifySessionTokenEdge } from "@/lib/authEdge";

export const WORKSPACE_COOKIE = "rf_workspace_id";

/**
 * Dua lapis:
 * 1. `rf_session` (login OPI) — jika ada & valid, identitas user disuntik ke
 *    header internal `x-rf-auth-user-id` sehingga getWorkspaceKey() memakai
 *    ownerKey `user:<id>` (data terisolasi per akun). Verifikasi memakai Web
 *    Crypto (edge-compatible) — jsonwebtoken bergantung pada modul `crypto`
 *    Node yang tidak tersedia di Edge Runtime.
 * 2. `rf_workspace_id` (cookie anonim) — tetap dibuat untuk TAMU supaya
 *    pengunjung tanpa akun tetap punya workspace sendiri dan demo "public"
 *    tetap bisa dibaca. Perilaku lama tidak rusak.
 */
export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // 1) Login OPI — verifikasi cookie sesi (edge-safe).
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await verifySessionTokenEdge(sessionToken);
  if (claims) {
    requestHeaders.set("x-rf-auth-user-id", claims.userId);
    requestHeaders.set("x-rf-auth-email", claims.email);
  }

  // 2) Cookie workspace anonim untuk tamu (tidak menimpa identitas login).
  const existing = request.cookies.get(WORKSPACE_COOKIE)?.value;
  const isNew = !existing;
  const ownerKey = existing ?? crypto.randomUUID();
  if (isNew) requestHeaders.set("x-rf-workspace-id", ownerKey);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (isNew) {
    response.cookies.set({
      name: WORKSPACE_COOKIE,
      value: ownerKey,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
