/**
 * Halaman /workspace/[id] — 2-Tab Workspace (Meja Rekonsiliasi + Laporan & Ekspor)
 * + Settings Drawer (Metadata + Matching Controls).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api/client";
import type { HydratedSessionResponse } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { MatchingControlsBar, ReconMatrixCard, ReconWaterfallChart } from "@/components/workbench/WorkbenchComponents";
import { ReconciliationDesk } from "@/components/workbench/ReconciliationDesk";
import { AdjustingJournalTable, AuditLogTimeline, ExportActionBar } from "@/components/report/ReportComponents";
import { Settings, X } from "lucide-react";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<HydratedSessionResponse | null>(null);
  const [tab, setTab] = useState<0 | 1>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api.getSession(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat sesi.");
    }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (error) return <AppShell><div className="text-sm text-rose-600">{error}</div></AppShell>;
  if (!data) return <AppShell><div className="text-sm text-slate-500">Memuat sesi...</div></AppShell>;

  const session = data.session;

  return (
    <AppShell>
      {/* Header sesi + 2 tab + tombol pengaturan */}
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{session.companyName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{session.bankAccountName}</span>
              <span>·</span>
              <span>{session.periodLabel}</span>
              {session.demoScenarioKey && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                  Mode Demo: {session.demoScenarioKey}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setTab(0)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === 0 ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                1. Meja Rekonsiliasi
              </button>
              <button
                onClick={() => setTab(1)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === 1 ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                2. Laporan &amp; Ekspor
              </button>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Pengaturan"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Konten tab */}
      {tab === 0 && (
        <ReconciliationDesk data={data} onRefresh={refresh} onGoReport={() => setTab(1)} />
      )}

      {tab === 1 && (
        <div className="space-y-6">
          <ReconMatrixCard data={data} />
          <ReconWaterfallChart data={data} />
          <AdjustingJournalTable data={data} onRefresh={refresh} />
          <AuditLogTimeline data={data} />
          <ExportActionBar data={data} onRefresh={refresh} />
        </div>
      )}

      {/* Drawer Pengaturan */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Pengaturan Sesi</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 p-5">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Metadata Sesi</h3>
                <div className="space-y-2 text-sm">
                  {([
                    ["Nama Perusahaan", session.companyName],
                    ["Rekening Bank", session.bankAccountName],
                    ["Periode", session.periodLabel],
                    ["Tanggal Akhir", session.periodEndDate],
                    ["Prepared By", session.preparedBy],
                    ["Reviewed By", session.reviewedBy],
                    ["Status", session.status],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-medium text-slate-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <MatchingControlsBar data={data} onRefresh={refresh} />
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}