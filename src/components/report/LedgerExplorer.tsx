/**
 * LedgerExplorer — inspeksi ledger padat & cerah.
 * Sub-tab: Belum Cocok / Terkonfirmasi / Semua Bank / Semua Buku,
 * dengan search real-time & pill status semantik.
 */
"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { HydratedSessionResponse } from "@/lib/session";
import type { TransactionDTO } from "@/lib/session";
import { formatIDR, formatDateID } from "@/lib/format";
import { getCategoryLabel } from "@/lib/engine/calculator";
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";

type Tab = "UNMATCHED" | "CONFIRMED" | "ALL_BANK" | "ALL_BOOK";

const MATCH_STATUS_LABEL: Record<string, string> = {
  EXACT_MATCH: "Cocok Persis",
  SUGGESTED_MATCH: "Saran",
  DISCREPANCY_MATCH: "Selisih",
  MANUAL_MATCH: "Manual",
};

function statusPill(tx: TransactionDTO, adjMap: Map<string, AdjustmentCategory>) {
  if (tx.adjustmentId) {
    const cat = adjMap.get(tx.adjustmentId);
    return (
      <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-medium text-teal-700">
        Penyesuaian{cat ? `: ${getCategoryLabel(cat)}` : ""}
      </span>
    );
  }
  if (tx.matchStatus && MATCH_STATUS_LABEL[tx.matchStatus]) {
    const colorByStatus: Record<string, string> = {
      EXACT_MATCH: "bg-emerald-50 text-emerald-700 border-emerald-200",
      MANUAL_MATCH: "bg-emerald-50 text-emerald-700 border-emerald-200",
      SUGGESTED_MATCH: "bg-amber-50 text-amber-700 border-amber-200",
      DISCREPANCY_MATCH: "bg-rose-50 text-rose-700 border-rose-200",
    };
    return (
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorByStatus[tx.matchStatus] ?? "bg-slate-50 text-slate-600 border-slate-200"}`}>
        {MATCH_STATUS_LABEL[tx.matchStatus]}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
      Belum Cocok
    </span>
  );
}

export function LedgerExplorer({ data }: { data: HydratedSessionResponse }) {
  const [tab, setTab] = useState<Tab>("UNMATCHED");
  const [query, setQuery] = useState("");

  const adjMap = useMemo(() => {
    const map = new Map<string, AdjustmentCategory>();
    for (const a of data.adjustments) {
      map.set(a.id, a.category as AdjustmentCategory);
    }
    return map;
  }, [data.adjustments]);

  const confirmedMatches = data.matches.filter((m) => m.isConfirmed);
  const unclassifiedCount = data.unmatchedBank.filter((t) => !t.adjustmentId).length
    + data.unmatchedBook.filter((t) => !t.adjustmentId).length;

  const rows: TransactionDTO[] = useMemo(() => {
    switch (tab) {
      case "UNMATCHED":
        return [
          ...data.unmatchedBank.filter((t) => !t.adjustmentId),
          ...data.unmatchedBook.filter((t) => !t.adjustmentId),
        ];
      case "ALL_BANK":
        return data.bankTransactions;
      case "ALL_BOOK":
        return data.bookTransactions;
      case "CONFIRMED":
        return confirmedMatches.flatMap((m) => [m.bankTx, m.bookTx]);
    }
  }, [tab, data, confirmedMatches]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    return rows.filter((tx) =>
      tx.date.includes(q)
      || (tx.reference ?? "").toLowerCase().includes(q)
      || tx.description.toLowerCase().includes(q)
      || (digits.length > 0 && String(tx.amount).includes(digits)),
    );
  }, [rows, query]);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "UNMATCHED", label: "Belum Cocok", count: unclassifiedCount },
    { key: "CONFIRMED", label: "Terkonfirmasi", count: confirmedMatches.length },
    { key: "ALL_BANK", label: "Semua Bank", count: data.bankTransactions.length },
    { key: "ALL_BOOK", label: "Semua Buku", count: data.bookTransactions.length },
  ];

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-slate-900">Ledger Explorer</h4>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari tanggal, referensi, deskripsi, nominal..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-teal-500"
            />
          </div>
        </div>
        {/* Sub-tabs underline */}
        <div className="mt-3 flex gap-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-0.5 pb-1.5 text-xs transition-colors ${
                tab === t.key
                  ? "border-teal-600 font-semibold text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label} {t.count !== undefined && `(${t.count})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tabel */}
      {tab === "CONFIRMED" ? (
        <ConfirmedTable data={data} query={query} />
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">Tidak ada baris.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-y border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Sumber</th>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-left">Referensi</th>
                <th className="px-3 py-2 text-left">Keterangan</th>
                <th className="px-3 py-2 text-left">Arah</th>
                <th className="px-3 py-2 text-right">Nominal (Rp)</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/40">
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${tx.source === "BANK" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                      {tx.source === "BANK" ? "BANK" : "BUKU"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{formatDateID(tx.date)}</td>
                  <td className="px-3 py-1.5 text-slate-500">{tx.reference || "—"}</td>
                  <td className="max-w-xs truncate px-3 py-1.5 text-slate-800">{tx.description}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tx.direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                      {tx.direction === "IN" ? "Masuk" : "Keluar"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-900">{formatIDR(tx.amount)}</td>
                  <td className="px-3 py-1.5">{statusPill(tx, adjMap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- Tabel terkonfirmasi (pasangan Bank↔Buku) ---------- */
function ConfirmedTable({ data, query }: { data: HydratedSessionResponse; query: string }) {
  const confirmed = data.matches.filter((m) => m.isConfirmed);
  const filtered = useMemo(() => {
    if (!query.trim()) return confirmed;
    const q = query.toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    return confirmed.filter((m) =>
      m.bankTx.description.toLowerCase().includes(q)
      || m.bookTx.description.toLowerCase().includes(q)
      || (m.bankTx.reference ?? "").toLowerCase().includes(q)
      || (m.bookTx.reference ?? "").toLowerCase().includes(q)
      || m.bankTx.date.includes(q)
      || m.bookTx.date.includes(q)
      || (digits.length > 0 && (String(m.bankTx.amount).includes(digits) || String(m.bookTx.amount).includes(digits))),
    );
  }, [confirmed, query]);

  if (filtered.length === 0) return <div className="p-6 text-center text-sm text-slate-500">Tidak ada pasangan terkonfirmasi.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-y border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Tanggal</th>
            <th className="px-3 py-2 text-left">Bank (Rekening Koran)</th>
            <th className="px-3 py-2 text-right">Nominal Bank</th>
            <th className="px-3 py-2 text-left">Buku (Kas/GL)</th>
            <th className="px-3 py-2 text-right">Nominal Buku</th>
            <th className="px-3 py-2 text-right">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50/40">
              <td className="px-3 py-1.5 text-slate-600">{formatDateID(m.bankTx.date)}</td>
              <td className="max-w-xs truncate px-3 py-1.5 text-slate-800">{m.bankTx.description}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-900">{formatIDR(m.bankTx.amount)}</td>
              <td className="max-w-xs truncate px-3 py-1.5 text-slate-800">{m.bookTx.description}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-900">{formatIDR(m.bookTx.amount)}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-600">{m.confidenceScore}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
