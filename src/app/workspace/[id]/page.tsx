/**
 * Halaman /workspace/[id] — Executive Workspace (Bright Modern Treasury).
 * Header ringkas + 6-Metric KPI Strip + 2 underline tabs (Meja Rekonsiliasi /
 * Laporan & Ledger Audit) + Settings Drawer (Metadata + Matching Controls).
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
import { LedgerExplorer } from "@/components/report/LedgerExplorer";
import { Settings, X, FileText, FileSpreadsheet, CheckCircle2, ListChecks } from "lucide-react";
import { formatIDR, formatPercent } from "@/lib/format";

/** Shimmer skeleton menyerupai layout workspace: header + 6-KPI strip + 2 kolom. */
function WorkspaceSkeleton() {
  const block = "animate-pulse rounded bg-slate-200/80";
  return (
    <AppShell>
      <div className="space-y-5" aria-busy="true" aria-label="Memuat sesi">
        {/* Header */}
        <div className="space-y-2">
          <div className={`${block} h-7 w-1/3`} />
          <div className={`${block} h-4 w-1/4`} />
        </div>
        {/* 6-Metric KPI Strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-slate-200/70 bg-white p-3">
              <div className={`${block} h-3 w-2/3`} />
              <div className={`${block} mt-2 h-5 w-1/2`} />
            </div>
          ))}
        </div>
        {/* 2 kolom: Meja Rekonsiliasi + Cermin Saldo */}
        <div className="grid gap-4 lg:grid-cols-8">
          <div className="space-y-3 lg:col-span-5">
            <div className={`${block} h-5 w-1/4`} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-slate-200/70 bg-white p-4">
                <div className={`${block} h-4 w-3/5`} />
                <div className={`${block} mt-2 h-3 w-2/5`} />
                <div className={`${block} mt-3 h-5 w-1/3`} />
              </div>
            ))}
          </div>
          <div className="lg:col-span-3">
            <div className="rounded-lg border border-slate-200/70 bg-white p-4">
              <div className={`${block} h-4 w-1/3`} />
              <div className={`${block} mt-4 h-24 w-full`} />
              <div className={`${block} mt-3 h-3 w-2/3`} />
              <div className={`${block} mt-2 h-3 w-1/2`} />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<HydratedSessionResponse | null>(null);
  const [tab, setTab] = useState<0 | 1>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (updated?: HydratedSessionResponse) => {
      // Optimasi: jika mutasi mengembalikan HydratedSessionResponse yang sudah
      // lengkap, langsung pakai — jangan menembak GET /api/sessions/[id] lagi.
      if (updated) {
        setData(updated);
        return;
      }
      try {
        setData(await api.getSession(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat sesi.");
      }
    },
    [id],
  );

  useEffect(() => { void refresh(); }, [refresh]);

  if (error) return <AppShell><div className="text-sm text-rose-600">{error}</div></AppShell>;
  if (!data) return <WorkspaceSkeleton />;

  const session = data.session;
  const s = data.summary;
  const confirmedCount = data.matches.filter((m) => m.isConfirmed).length;
  const actionableRemaining =
    data.matches.filter((m) => !m.isConfirmed).length +
    data.unmatchedBank.filter((t) => !t.adjustmentId).length +
    data.unmatchedBook.filter((t) => !t.adjustmentId).length;
  const journalBalanced = data.journals.isDoubleEntryBalanced;

  const statusBadge = {
    DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
    BALANCED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FINALIZED: "bg-teal-50 text-teal-700 border-teal-200",
  }[session.status] ?? "bg-slate-50 text-slate-600 border-slate-200";

  const metrics = [
    { label: "Mutasi Bank", value: `${data.bankTransactions.length}`, sub: "rekening koran", cls: "text-slate-900" },
    { label: "Mutasi Buku", value: `${data.bookTransactions.length}`, sub: "buku kas / GL", cls: "text-slate-900" },
    { label: "Match Rate", value: formatPercent(s.matchRate), sub: `${confirmedCount} pasang cocok`, cls: "text-slate-900" },
    { label: "Perlu Tindakan", value: `${actionableRemaining}`, sub: "item tersisa", cls: actionableRemaining > 0 ? "text-amber-600" : "text-emerald-600" },
    { label: "Jurnal Penyesuaian", value: `${data.journals.entries.length} entri`, sub: journalBalanced ? "Debit = Kredit" : "Tidak Seimbang", cls: journalBalanced ? "text-emerald-600" : "text-rose-600" },
    { label: "Check (Selisih)", value: formatIDR(s.variance), sub: s.isBalanced ? "Balanced" : "Belum seimbang", cls: s.variance === 0 ? "text-emerald-600" : "text-rose-600" },
  ];

  return (
    <AppShell>
      {/* Header eksekutif */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">Rekening / {session.companyName}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{session.bankAccountName}</h1>
            <span className="text-slate-300">·</span>
            <span className="text-sm text-slate-500">{session.periodLabel}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge}`}>
              {session.status}
            </span>
            {session.demoScenarioKey && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                Demo: {session.demoScenarioKey}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/sessions/${session.id}/export/pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
          >
            <FileText className="h-3.5 w-3.5" /> Ekspor PDF
          </a>
          <a
            href={`/api/sessions/${session.id}/export/excel`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </a>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Pengaturan"
          >
            <Settings className="h-3.5 w-3.5" /> Pengaturan
          </button>
        </div>
      </div>

      {/* 6-Metric KPI Strip */}
      <div className="mb-5 grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white md:grid-cols-3 md:divide-y-0 md:divide-x lg:grid-cols-6">
        {metrics.map((m) => (
          <div key={m.label} className="p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{m.label}</div>
            <div className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${m.cls}`}>{m.value}</div>
            <div className="text-[11px] text-slate-400">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Underline Tabs */}
      <div className="mb-5 border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setTab(0)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm transition-colors ${
              tab === 0
                ? "border-teal-600 font-semibold text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <ListChecks className="h-4 w-4" /> 1. Meja Rekonsiliasi
            {actionableRemaining > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700">
                {actionableRemaining}
              </span>
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setTab(1)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm transition-colors ${
              tab === 1
                ? "border-teal-600 font-semibold text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            2. Laporan &amp; Ledger Audit
          </button>
        </div>
      </div>

      {/* Konten tab */}
      {tab === 0 && (
        <ReconciliationDesk data={data} onRefresh={refresh} onGoReport={() => setTab(1)} />
      )}

      {tab === 1 && (
        <div className="space-y-5">
          {/* Baris 1 — Statement + Waterfall */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <ReconMatrixCard data={data} />
            </div>
            <div className="xl:col-span-5">
              <ReconWaterfallChart data={data} />
            </div>
          </div>
          {/* Baris 2 — Ledger Explorer */}
          <LedgerExplorer data={data} />
          {/* Baris 3 — Jurnal + Ekspor/Audit */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <AdjustingJournalTable data={data} onRefresh={refresh} />
            </div>
            <div className="space-y-5 xl:col-span-4">
              <ExportActionBar data={data} onRefresh={refresh} />
              <div className="max-h-96 overflow-y-auto">
                <AuditLogTimeline data={data} />
              </div>
            </div>
          </div>
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
