import { NextResponse, type NextRequest } from "next/server";

export const WORKSPACE_COOKIE = "rf_workspace_id";

/**
 * Isolasi workspace per pengunjung (Opsi A — cookie, tanpa login).
 * Middleware memastikan setiap pengunjung punya UUID sendiri; UUID itu
 * diteruskan ke route handler via header internal `x-rf-workspace-id`
 * agar getWorkspaceKey() di src/lib/workspace.ts bisa membacanya murni
 * dari argumen `request` (tanpa next/headers → mudah dites di Vitest).
 */
export function middleware(request: NextRequest) {
  const existing = request.cookies.get(WORKSPACE_COOKIE)?.value;
  const isNew = !existing;
  const ownerKey = existing ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
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