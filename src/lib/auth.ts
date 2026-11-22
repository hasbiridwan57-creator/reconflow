/**
 * Auth — login email + password (OPI).
 *
 * Pilihan implementasi:
 * - bcryptjs (pure JS, tanpa native build) untuk hash password.
 * - jsonwebtoken (HS256) untuk session token yang disimpan di cookie httpOnly.
 *
 * Kenapa bukan library auth berat (NextAuth/Clerk): aplikasi ini hanya butuh
 * satu form login + isolasi data per user. Session JWT stateless + kolom
 * `tokenVersion` di User untuk mencabut sesi lama saat password diganti.
 */
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";

export const SESSION_COOKIE = "rf_session";
/** Masa berlaku cookie sesi: 7 hari. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const BCRYPT_ROUNDS = 10;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    // Jangan biarkan secret lemah/absen menyebabkan token mudah dipalsukan.
    throw new Error("AUTH_SECRET belum diset (minimal 16 karakter).");
  }
  return secret;
}

export interface SessionClaims {
  userId: string;
  email: string;
  tokenVersion: number;
}

/** Hash password plaintext → bcrypt hash (dipakai saat register/ganti password). */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

/** Verifikasi password plaintext terhadap hash bcrypt di DB. */
export function verifyPassword(plain: string, passwordHash: string): boolean {
  try {
    return bcrypt.compareSync(plain, passwordHash);
  } catch {
    return false;
  }
}

/** Buat session token JWT (HS256) untuk user. */
export function createSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS });
}

/**
 * Verifikasi token sesi → claims, atau null jika tidak valid/kedaluwarsa.
 * Murni menerima string token (tanpa cookies() Next) agar mudah dites di Vitest.
 */
export function verifySessionToken(token: string | undefined | null): SessionClaims | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret()) as JwtPayload;
    const { userId, email, tokenVersion } = payload as Partial<SessionClaims> & JwtPayload;
    if (typeof userId !== "string" || typeof email !== "string" || typeof tokenVersion !== "number") {
      return null;
    }
    return { userId, email, tokenVersion };
  } catch {
    return null;
  }
}

/** Normalisasi email login: lowercase + trim, agar "A@X.com" == "a@x.com". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
