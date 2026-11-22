/**
 * Verifikasi token sesi untuk MIDDLEWARE (Edge Runtime).
 *
 * Kenapa tidak pakai `jsonwebtoken` di sini: library itu bergantung pada
 * modul `crypto` Node.js yang tidak tersedia di Edge Runtime — hasil bundel
 * middleware bisa gagal saat modul dimuat, sehingga verifikasi selalu gagal
 * diam-diam dan semua request diperlakukan sebagai tamu. Solusinya: verifikasi
 * HS256 memakai Web Crypto API (`crypto.subtle`) yang tersedia di Edge.
 *
 * Format token identik dengan `createSessionToken` di `@/lib/auth`:
 * header `{alg: HS256, typ: JWT}` + payload claims + signature HMAC-SHA256.
 */

import type { SessionClaims } from "@/lib/auth";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET belum diset (minimal 16 karakter).");
  }
  return secret;
}

function base64UrlToBytes(segment: string): Uint8Array<ArrayBuffer> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Verifikasi token sesi (HS256) versi Edge → claims, atau null jika tidak valid. */
export async function verifySessionTokenEdge(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  try {
    // 1. Header harus HS256.
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerSegment))) as { alg?: string };
    if (header.alg !== "HS256") return null;

    // 2. Verifikasi signature HMAC-SHA256.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(getSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = base64UrlToBytes(signatureSegment);
    const data = encoder.encode(`${headerSegment}.${payloadSegment}`);
    const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, data);
    if (!valid) return null;

    // 3. Payload → claims.
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadSegment))) as Record<string, unknown>;
    const { userId, email, tokenVersion, exp } = payload;
    if (typeof userId !== "string" || typeof email !== "string" || typeof tokenVersion !== "number") return null;
    if (typeof exp === "number" && Date.now() / 1000 >= exp) return null;

    return { userId, email, tokenVersion };
  } catch {
    return null;
  }
}

/** Buat token sesi (HS256) versi Edge — dipakai test untuk membuat token palsu/valid. */
export async function createSessionTokenEdge(claims: SessionClaims, maxAgeSeconds: number): Promise<string> {
  const encoder = new TextEncoder();
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({ ...claims, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + maxAgeSeconds })),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${payload}`));
  const sigBytes = new Uint8Array(signature.byteLength);
  sigBytes.set(new Uint8Array(signature));
  return `${header}.${payload}.${bytesToBase64Url(sigBytes)}`;
}
