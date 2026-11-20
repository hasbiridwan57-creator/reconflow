"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import type { HydratedSessionResponse } from "@/lib/session";

/** Banner Demo Audit Brief — tampilkan konteks & anomali yang harus diselesaikan. */
export function DemoAuditBrief({ data }: { data: HydratedSessionResponse }) {
  const [open, setOpen] = useState(false);
  const scenarioKey = data.session.demoScenarioKey;
  if (!scenarioKey) return null;

  const anomalies: string[] = [];
  const s = data.summary;

  if (s.pendingSuggestedCount > 0) {
    anomalies.push(`${s.pendingSuggestedCount} item saran match perlu dikonfirmasi`);
  }
  if (s.unclassifiedCount > 0) {
    anomalies.push(`${s.unclassifiedCount} transaksi belum diklasifikasi`);
  }

  const bankUnmatched = data.unmatchedBank.length;
  const bookUnmatched = data.unmatchedBook.length;
  if (bankUnmatched > 0) anomalies.push(`${bankUnmatched} transaksi hanya di rekening bank`);
  if (bookUnmatched > 0) anomalies.push(`${bookUnmatched} transaksi hanya di buku kas`);

  const balanced = s.isBalanced;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-indigo-500" />
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Demo Skenario Audit: {scenarioKey.toUpperCase()}
            </div>
            <div className="text-xs text-slate-600">
              {balanced
                ? "Seimbang (Rp 0) — Semua anomali terselesaikan"
                : `Anomali tersisa: ${anomalies.length} kelompok · Selisih ${s.variance.toLocaleString("id-ID")}`}
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2 border-t border-indigo-200 pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-indigo-600">Konteks Skenario</div>
          <p className="text-xs text-slate-600">
            Skenario <b>{scenarioKey}</b> memuat dataset bank & buku dengan anomali yang harus
            diidentifikasi dan diklasifikasikan agar jembatan saldo mencapai{" "}
            <b>BALANCED (Rp 0)</b>. Gunakan tab <b>Matching Workbench</b> untuk konfirmasi
            saran match dan klasifikasi item <i>unmatched</i>.
          </p>
          {anomalies.length > 0 && (
            <>
              <div className="mt-2 text-xs font-medium uppercase tracking-wide text-indigo-600">Anomali yang Perlu Diselesaikan</div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
                {anomalies.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
