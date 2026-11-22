/**
 * GET /api/auth/me — identitas user yang sedang login (dari cookie sesi).
 * Return `{ data: { user: {...} | null } }` — null berarti tamu (belum login).
 * Sengaja TIDAK memakai middleware auth: harus tetap 200 untuk tamu agar UI
 * bisa menentukan tombol "Login" vs "Keluar" tanpa error di console.
 */
import { cookies } from "next/headers";
import { db as prisma } from "@/lib/db";
import { success, handleError } from "@/lib/api";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const claims = verifySessionToken(token);
    if (!claims) return success({ user: null });

    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, email: true, name: true, tokenVersion: true },
    });

    // User terhapus / token dicabut (tokenVersion naik) → anggap tamu.
    if (!user || user.tokenVersion !== claims.tokenVersion) return success({ user: null });

    return success({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    return handleError(error);
  }
}
