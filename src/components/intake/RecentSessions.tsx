/**
 * Tabel 5 sesi terbaru dari DB (spec §10.2 Halaman 1).
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type SessionListItem } from "@/lib/api/client";
import { formatIDR } from "@/lib/format";

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  BALANCED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  FINALIZED: "bg-indigo-50 text-indigo-600 border-indigo-200",
};

export function RecentSessions() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSessions()
      .then((list) => setSessions(list.slice(0, 5)))
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat."));
  }, []);

  if (error) return <div className="text-sm text-rose-600">{error}</div>;
  if (sessions.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada sesi.</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Perusahaan</th>
            <th className="px-4 py-3 font-medium">Periode</th>
            <th className="px-4 py-3 text-right font-medium">Selisih</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{s.companyName}</div>
                <div className="text-xs text-slate-500">{s.bankAccountName}</div>
              </td>
              <td className="px-4 py-3 text-slate-600">{s.periodLabel}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                <span className={s.endingBankBalance - s.endingBookBalance === 0 ? "text-emerald-600" : "text-rose-600"}>
                  {formatIDR(s.endingBankBalance - s.endingBookBalance)}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[s.status] ?? STATUS_CLASS.DRAFT}`}>
                  {s.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/workspace/${s.id}`} className="text-sm font-medium text-indigo-600 hover:underline">
                  Lanjutkan
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
