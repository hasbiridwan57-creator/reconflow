/**
 * Halaman /workspace/[id] — 4-Step Guided Reconciliation Workspace.
 * Gemini audit: tab default = Matching Workbench; urutan step intuitif.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api/client";
import type { HydratedSessionResponse } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { LiveReconStickyBar } from "@/components/layout/LiveReconStickyBar";
import { MatchingControlsBar, KpiSummaryGrid, MatchingWorkbench, ReconMatrixCard, ReconWaterfallChart } from "@/components/workbench/WorkbenchComponents";
import { AdjustingJournalTable, AuditLogTimeline, ExportActionBar } from "@/components/report/ReportComponents";

// Urutan step (Gemini #8): 1=Matching Workbench (default), 2=Matriks & Waterfall,
// 3=Jurnal, Audit & Ekspor, 4=Konfigurasi & Info Sesi.
const STEPS = ["Matching Workbench", "Matriks & Waterfall", "Jurnal, Audit & Ekspor", "Konfigurasi & Info Sesi"] as const;

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<HydratedSessionResponse | null>(null);
  const [step, setStep] = useState(0); // default = Matching Workbench
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

  const s = data.summary;
  const progressLabel = s.pendingSuggestedCount > 0
    ? `${s.pendingSuggestedCount} item perlu tinjauan`
    : s.unclassifiedCount > 0
      ? `${s.unclassifiedCount} item belum diklasifikasi`
      : "Semua item terselesaikan";

  return (
    <AppShell>
      <LiveReconStickyBar
        companyName={data.session.companyName}
        periodLabel={data.session.periodLabel}
        status={data.session.status}
        adjustedBank={s.adjustedBankBalance}
        adjustedBook={s.adjustedBookBalance}
        variance={s.variance}
        isBalanced={s.isBalanced}
        progressLabel={progressLabel}
      />

      {/* Horizontal Stepper Tabs */}
      <div className="mb-6 flex flex-wrap gap-1">
        {STEPS.map((label, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              step === i ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <div className="space-y-6">
          <KpiSummaryGrid data={data} />
          <MatchingWorkbench data={data} onRefresh={refresh} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <ReconMatrixCard data={data} />
          <ReconWaterfallChart data={data} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <AdjustingJournalTable data={data} onRefresh={refresh} />
          <AuditLogTimeline data={data} />
          <ExportActionBar data={data} onRefresh={refresh} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Metadata Sesi</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {([
                ["Nama Perusahaan", data.session.companyName],
                ["Rekening Bank", data.session.bankAccountName],
                ["Periode", data.session.periodLabel],
                ["Tanggal Akhir", data.session.periodEndDate],
                ["Prepared By", data.session.preparedBy],
                ["Reviewed By", data.session.reviewedBy],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-medium text-slate-900">{value}</div>
                </div>
              ))}
            </div>
          </div>
          <MatchingControlsBar data={data} onRefresh={refresh} />
        </div>
      )}
    </AppShell>
  );
}
