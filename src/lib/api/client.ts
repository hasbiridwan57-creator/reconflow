/**
 * Typed frontend fetch wrapper untuk ReconFlow API.
 * Lihat RECONFLOW_MASTER_SPEC.md §1 (Zero Drift) & §4.2.
 */
import type { HydratedSessionResponse, SessionMeta } from "@/lib/session";

/** Identitas user yang sedang login (dari GET /api/auth/me). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}


export interface SessionListItem {
  id: string;
  companyName: string;
  bankAccountName: string;
  periodLabel: string;
  periodEndDate: string;
  status: string;
  demoScenarioKey: string | null;
  endingBankBalance: number;
  endingBookBalance: number;
  transactionCount: number;
  matchRate: number;
  unclassifiedCount: number;
  variance: number;
  updatedAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (!res.ok) {
    const err = json?.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Request gagal (${res.status}).`);
  }
  return (json as { data: T }).data;
}

/**
 * Notifikasi ringan agar sidebar multi-account memperbarui daftar rekening
 * secara real-time tanpa full refresh. Dipicu setelah tiap mutasi sesi.
 * Jika `detail` berisi HydratedSessionResponse, sidebar memperbarui baris
 * sesi yang sudah ada LANGSUNG DI MEMORI (tanpa GET /api/sessions).
 */
export function notifySessionsChanged(detail?: HydratedSessionResponse | { id: string }): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("reconflow:sessions-changed", { detail }));
  }
}

/** Wrapper: jalankan mutasi lalu beri tahu sidebar multi-account. */
async function mutate<T>(fn: () => Promise<T>): Promise<T> {
  const result = await fn();
  if (result && typeof result === "object" && "id" in result) {
    notifySessionsChanged(result as HydratedSessionResponse | { id: string });
  } else {
    notifySessionsChanged();
  }
  return result;
}

export const api = {
  health: () => request<{ status: string; timestamp: string }>("/api/health"),
  // ── Auth (OPI) ──
  me: () => request<{ user: AuthUser | null }>("/api/auth/me"),
  register: (body: { name?: string; email: string; password: string }) =>
    mutate(() => request<AuthUser>("/api/auth", { method: "POST", body: JSON.stringify(body) })),
  login: (body: { email: string; password: string }) =>
    mutate(() => request<AuthUser>("/api/auth", { method: "PUT", body: JSON.stringify(body) })),
  logout: () => mutate(() => request<{ ok: boolean }>("/api/auth", { method: "DELETE" })),
  listSessions: (params?: { q?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<SessionListItem[]>(`/api/sessions${suffix}`);
  },
  createDemo: (scenarioKey: "umkm" | "ecommerce" | "audit") =>
    mutate(() =>
      request<{ id: string }>("/api/sessions/demo", {
        method: "POST",
        body: JSON.stringify({ scenarioKey }),
      }),
    ),
  createSession: (body: Record<string, unknown>) =>
    mutate(() =>
      request<{ id: string }>("/api/sessions", { method: "POST", body: JSON.stringify(body) }),
    ),
  getSession: (id: string) => request<HydratedSessionResponse>(`/api/sessions/${id}`),
  updateSession: (id: string, body: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    ),
  deleteSession: (id: string) =>
    mutate(() =>
      request<{ deleted: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
    ),
  reRunMatch: (id: string, config?: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/match`, {
        method: "POST",
        body: config ? JSON.stringify(config) : undefined,
      }),
    ),
  approveMatch: (id: string, matchId: string, body: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/matches/${matchId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    ),
  approveAllSuggested: (id: string) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/matches/approve-all`, { method: "POST" }),
    ),
  createBulkAdjustments: (id: string, items: Array<Record<string, unknown>>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments/bulk`, {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    ),
  deleteMatch: (id: string, matchId: string) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/matches/${matchId}`, { method: "DELETE" }),
    ),
  manualPair: (id: string, body: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/matches/manual`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),
  createAdjustment: (id: string, body: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),
  updateAdjustment: (id: string, adjId: string, body: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments/${adjId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    ),
  deleteAdjustment: (id: string, adjId: string) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments/${adjId}`, { method: "DELETE" }),
    ),
  finalize: (id: string, body: Record<string, unknown>) =>
    mutate(() =>
      request<HydratedSessionResponse>(`/api/sessions/${id}/finalize`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ),
};

export type { HydratedSessionResponse, SessionMeta };
