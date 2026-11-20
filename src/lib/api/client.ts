/**
 * Typed frontend fetch wrapper untuk ReconFlow API.
 * Lihat RECONFLOW_MASTER_SPEC.md §1 (Zero Drift) & §4.2.
 */
import type { HydratedSessionResponse, SessionMeta } from "@/lib/session";

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

export const api = {
  health: () => request<{ status: string; timestamp: string }>("/api/health"),
  listSessions: (params?: { q?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<SessionListItem[]>(`/api/sessions${suffix}`);
  },
  createDemo: (scenarioKey: "umkm" | "ecommerce" | "audit") =>
    request<{ id: string }>("/api/sessions/demo", {
      method: "POST",
      body: JSON.stringify({ scenarioKey }),
    }),
  createSession: (body: Record<string, unknown>) =>
    request<{ id: string }>("/api/sessions", { method: "POST", body: JSON.stringify(body) }),
  getSession: (id: string) => request<HydratedSessionResponse>(`/api/sessions/${id}`),
  updateSession: (id: string, body: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSession: (id: string) => request<{ deleted: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),
  reRunMatch: (id: string, config?: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/match`, {
      method: "POST",
      body: config ? JSON.stringify(config) : undefined,
    }),
  approveMatch: (id: string, matchId: string, body: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/matches/${matchId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteMatch: (id: string, matchId: string) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/matches/${matchId}`, { method: "DELETE" }),
  manualPair: (id: string, body: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/matches/manual`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createAdjustment: (id: string, body: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateAdjustment: (id: string, adjId: string, body: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments/${adjId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteAdjustment: (id: string, adjId: string) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/adjustments/${adjId}`, { method: "DELETE" }),
  finalize: (id: string, body: Record<string, unknown>) =>
    request<HydratedSessionResponse>(`/api/sessions/${id}/finalize`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export type { HydratedSessionResponse, SessionMeta };
