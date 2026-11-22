/**
 * Auth API — register, login, logout, me. (OPI: login semudah mungkin.)
 * Kontrak respons mengikuti standar aplikasi: `{ data }` / `{ error: { code, message } }`.
 * Session token (JWT HS256) disimpan di cookie httpOnly `rf_session`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db as prisma } from "@/lib/db";
import { success, failure, handleError, ApiError } from "@/lib/api";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth";

const CredentialsSchema = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(6).max(200),
});

const RegisterSchema = CredentialsSchema.extend({
  name: z.string().min(1).max(120).optional(),
});

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Set cookie sesi httpOnly pada response. */
function attachSession(res: NextResponse, token: string): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: isProduction(),
  });
  return res;
}

/** Buat token sesi untuk baris User dan kembalikan response + cookie. */
function sessionResponse(
  user: { id: string; email: string; name: string; tokenVersion: number },
  status: number,
): NextResponse {
  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  });
  const res = success({ id: user.id, email: user.email, name: user.name }, status);
  return attachSession(res, token);
}

/** POST /api/auth/register — buat akun baru. */
export async function POST(request: Request) {
  try {
    const body = RegisterSchema.parse(await request.json());
    const email = normalizeEmail(body.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError("CONFLICT", "Email sudah terdaftar. Silakan login.", 409);
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: body.name?.trim() ?? "",
        passwordHash: hashPassword(body.password),
      },
    });

    return sessionResponse(user, 201);
  } catch (error) {
    return handleError(error);
  }
}

/** PUT /api/auth — login (email + password). Pakai PUT agar 1 file bisa 2 aksi. */
export async function PUT(request: Request) {
  try {
    const body = CredentialsSchema.parse(await request.json());
    const email = normalizeEmail(body.email);

    const user = await prisma.user.findUnique({ where: { email } });
    // Pesan error sengaja sama (email salah vs password salah) agar tidak membocorkan keberadaan akun.
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return failure("UNAUTHORIZED", "Email atau password salah.", 401);
    }

    return sessionResponse(user, 200);
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE /api/auth — logout: hapus cookie sesi. */
export async function DELETE() {
  const res = success({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
