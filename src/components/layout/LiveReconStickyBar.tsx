/**
 * Sticky bar saldo disesuaikan + badge BALANCED (spec §10.2 Halaman 3).
 */
"use client";

import { formatIDR } from "@/lib/format";

interface Props {
  companyName: string;
  periodLabel: string;
  status: string;
  adjustedBank: number;
  adjustedBook: number;
  variance: number;
  isBalanced: boolean;
  progressLabel: string;
}

export function LiveReconStickyBar({
  companyName,
  periodLabel,
  status,
  adjustedBank,
  adjustedBook,
  variance,
  isBalanced,
  progressLabel,
}: Props) {
  return (
    <div className="sticky top-14 z-30 -mx-6 mb-6 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{companyName}</div>
          <div className="text-xs text-slate-500">{periodLabel} · {status}</div>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-right">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Bank Disesuaikan</div>
            <div className="font-mono text-sm tabular-nums font-semibold text-slate-900">{formatIDR(adjustedBank)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Buku Disesuaikan</div>
            <div className="font-mono text-sm tabular-nums font-semibold text-slate-900">{formatIDR(adjustedBook)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Selisih</div>
            <div className={`font-mono text-sm tabular-nums font-semibold ${variance === 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatIDR(variance)}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isBalanced ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200"
            }`}
          >
            {isBalanced ? "BALANCED (Rp 0)" : "UNRECONCILED"}
          </span>
          <span className="mt-1 text-[11px] text-slate-400">{progressLabel}</span>
        </div>
      </div>
    </div>
  );
}
