import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DemoScenarioCards } from "@/components/intake/DemoScenarioCards";
import { RecentSessions } from "@/components/intake/RecentSessions";
import { Upload, History } from "lucide-react";

export default function HomePage() {
  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">ReconFlow</h1>
          <p className="mt-1 text-sm text-slate-600">
            End-to-End Bank Reconciliation, Automated Matching &amp; Audit-Ready Reporting Workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/new"
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <Upload className="h-4 w-4" />
            Mulai Rekonsiliasi Baru (Upload CSV)
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History className="h-4 w-4" />
            Lihat Riwayat Arsip
          </Link>
        </div>
      </div>

      {/* Alur 3 langkah ringkas — strip horizontal cerah antara header & demo */}
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-1">
        <div className="grid gap-1 md:grid-cols-3 md:divide-x md:divide-slate-100">
          <div className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600">01 · Unggah atau Pilih Demo</div>
            <p className="mt-1 text-sm text-slate-600">Muat mutasi <b>.csv</b> / <b>.xlsx</b> atau coba 3 kasus nyata 1-klik.</p>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600">02 · Bereskan Antrean Inbox Zero</div>
            <p className="mt-1 text-sm text-slate-600">Tinjau anomali, cocokkan pasangan, dan pantau Cermin Saldo sampai Rp 0.</p>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-teal-600">03 · Kunci &amp; Ekspor Siap Audit</div>
            <p className="mt-1 text-sm text-slate-600">Hasilkan jurnal penyesuaian otomatis, PDF formal, &amp; Excel 4-sheet.</p>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Coba Skenario Demo Realistis (1-Klik)
        </h2>
        <DemoScenarioCards />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Sesi Terbaru</h2>
        <RecentSessions />
      </section>
    </AppShell>
  );
}
