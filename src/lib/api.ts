/**
 * Helper standar respons & error untuk seluruh API endpoint.
 * Lihat RECONFLOW_MASTER_SPEC.md §7: success `{ data }`, error `{ error: { code, message } }`.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function success<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function failure(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** Konversi error umum ke respons sesuai kontrak. */
export function handleError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, error.issues);
  }
  if (error instanceof ApiError) {
    return failure(error.code, error.message, error.status);
  }
  const message = error instanceof Error ? error.message : "Kesalahan internal server.";
  return failure("INTERNAL_ERROR", message, 500);
}

/** Error domain — dilempar di service, ditangkap handleError menjadi NextResponse. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Throw 404 (ditangkap handleError -> NextResponse). */
export function notFound(entity: string): never {
  throw new ApiError("NOT_FOUND", `${entity} tidak ditemukan.`, 404);
}

/** Throw 409 (ditangkap handleError -> NextResponse). */
export function conflict(message: string): never {
  throw new ApiError("CONFLICT", message, 409);
}

/** Throw 422 (ditangkap handleError -> NextResponse). */
export function unprocessable(message: string): never {
  throw new ApiError("UNPROCESSABLE", message, 422);
}
