/**
 * AppShell — Bright Modern Treasury sidebar layout.
 * Desktop: sidebar kiri putih bersih (w-64) + konten alabaster.
 * Mobile/Tablet (<lg): topbar putih + sidebar sebagai slide-over drawer.
 * Seksi "REKENING AKTIF" mendengarkan event `reconflow:sessions-changed`.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, History, LayoutDashboard, X, Plus } from "lucide-react";
import { api, type SessionListItem } from "@/lib/api/client";

const NAV = [
  { href: "/", label: "Beranda", icon: LayoutDashboard },
  { href: "/history", label: "Arsip & Riwayat", icon: History },
];

function statusDot(status: string): string {
  if (status === "BALANCED" || status === "FINALIZED") return "bg-emerald-500";
  return "bg-amber-400";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.listSessions();
      setSessions(list.slice(0, 10));
    } catch {
      /* Sesi gagal dimuat — biarkan kosong. */
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    const onSessionsChanged = (e: Event) => {
      // Optimasi: jika event membawa HydratedSessionResponse, perbarui baris
      // sesi yang sudah ada DI MEMORI tanpa GET /api/sessions.
      const detail = (e as CustomEvent).detail as
        | { id?: string; session?: { id: string; status: string; demoScenarioKey: string | null; endingBankBalance: number; endingBookBalance: number }; summary?: { variance: number; unclassifiedCount: number; matchRate?: number } }
        | { id: string }
        | undefined;
      const sid = detail && "session" in detail ? detail.session?.id : (detail as { id: string } | undefined)?.id;
      if (detail && "session" in detail && detail.session && sid) {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === sid);
          if (idx === -1) return prev; // sesi baru → biarkan fetch berikutnya yang menambahkan
          const s = detail.session!;
          const updated = {
            ...prev[idx],
            status: s.status,
            demoScenarioKey: s.demoScenarioKey,
            endingBankBalance: s.endingBankBalance,
            endingBookBalance: s.endingBookBalance,
            variance: detail.summary?.variance ?? prev[idx].variance,
            unclassifiedCount: detail.summary?.unclassifiedCount ?? prev[idx].unclassifiedCount,
            matchRate: detail.summary?.matchRate ?? prev[idx].matchRate,
          };
          const next = [...prev];
          next[idx] = updated;
          return next;
        });
        return;
      }
      // Sesi baru dihapus (delete) / tanpa detail → refetch daftar.
      void loadSessions();
    };
    window.addEventListener("reconflow:sessions-changed", onSessionsChanged);
    return () => window.removeEventListener("reconflow:sessions-changed", onSessionsChanged);
  }, [loadSessions]);

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar desktop — sticky: tetap diam saat konten kanan di-scroll.
          lg:h-screen + lg:self-start agar tidak ikut "stretch" setinggi flex row
          (wrapper luar tetap `flex min-h-screen` supaya sticky BalanceMirror &
          scroll native browser tidak rusak). */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start">
        <SidebarContent pathname={pathname} sessions={sessions} />
      </aside>

      {/* Sidebar mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200 bg-white shadow-xl">
            <div className="flex justify-end border-b border-slate-200 p-3">
              <button onClick={() => setDrawerOpen(false)} aria-label="Tutup menu" className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent pathname={pathname} sessions={sessions} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Konten utama */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight text-slate-900">ReconFlow</span>
          </Link>
        </header>

        <main className="mx-auto w-full flex-1 max-w-7xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

/* ---------- Isi sidebar (dipakai desktop & drawer mobile) ---------- */
function SidebarContent({
  pathname,
  sessions,
  onNavigate,
}: {
  pathname: string;
  sessions: SessionListItem[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Brand header */}
      <div className="border-b border-slate-200 p-5">
        <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight text-slate-900">ReconFlow</div>
            <div className="text-[11px] text-slate-400">Treasury Workspace</div>
          </div>
        </Link>
        {/* Primary CTA */}
        <Link
          href="/new"
          onClick={onNavigate}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-xs hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Rekonsiliasi Baru
        </Link>
      </div>

      {/* Menu utama */}
      <nav className="p-3">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-teal-50 font-semibold text-teal-800 ring-1 ring-inset ring-teal-200/70"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Seksi REKENING AKTIF — min-h-0 + overflow-y-auto agar daftar bisa
          di-scroll independen (Safari) tanpa mendorong footer keluar layar. */}
      <div className="flex min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Rekening Aktif
        </div>
        {sessions.length === 0 ? (
          <div className="px-2 text-xs text-slate-400">Belum ada rekening.</div>
        ) : (
          sessions.map((s) => {
            const active = pathname === `/workspace/${s.id}`;
            return (
              <Link
                key={s.id}
                href={`/workspace/${s.id}`}
                onClick={onNavigate}
                title={`${s.companyName} — ${s.bankAccountName} (${s.periodLabel})`}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                  active
                    ? "bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(s.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">{s.companyName}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {s.bankAccountName} · {s.periodLabel}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                  {Math.round(s.matchRate * 100)}%
                </span>
              </Link>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 p-3">
        <span className="inline-block rounded border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
          Double-Entry · Audit-Ready
        </span>
      </div>
    </>
  );
}
