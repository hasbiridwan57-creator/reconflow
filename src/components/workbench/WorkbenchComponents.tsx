/**
 * Workbench & Report components untuk workspace 4-step.
 */
"use client";

import { useMemo, useState } from "react";
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, flexRender, createColumnHelper,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { api, type HydratedSessionResponse } from "@/lib/api/client";
import { formatIDR, formatDateID } from "@/lib/format";
import type { TransactionDTO, MatchPairDTO } from "@/lib/session";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

/* ---------- KpiSummaryGrid ---------- */
export function KpiSummaryGrid({ data }: { data: HydratedSessionResponse }) {
  const s = data.summary;
  const cards = [
    { label: "Match Rate", value: `${Math.round(s.matchRate)}%`, tone: "text-slate-900" },
    { label: "Perlu Konfirmasi", value: String(s.pendingSuggestedCount), tone: s.pendingSuggestedCount > 0 ? "text-amber-600" : "text-emerald-600" },
    { label: "Belum Diklasifikasi", value: String(s.unclassifiedCount), tone: s.unclassifiedCount > 0 ? "text-rose-600" : "text-emerald-600" },
    { label: "Selisih (Variance)", value: formatIDR(s.variance), tone: s.variance === 0 ? "text-emerald-600" : "text-rose-600" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-400">{c.label}</div>
          <div className={`mt-1 font-mono text-xl tabular-nums font-semibold ${c.tone}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- MatchingControlsBar ---------- */
export function MatchingControlsBar({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const [days, setDays] = useState(data.session.dateToleranceDays);
  const [amount, setAmount] = useState(data.session.amountToleranceRupiah);
  const [transposition, setTransposition] = useState(data.session.detectTransposition);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      await api.updateSession(data.session.id, {
        dateToleranceDays: days, amountToleranceRupiah: amount, detectTransposition: transposition,
      });
      await api.reRunMatch(data.session.id);
      toast.success("Auto-match dijalankan ulang.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally { setRunning(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Konfigurasi Matching Engine</h3>
      <div className="flex flex-wrap items-end gap-6">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Toleransi Tanggal: <b>{days} hari</b></span>
          <input type="range" min={0} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-48" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Toleransi Nominal (Rp)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-right font-mono tabular-nums text-sm outline-none focus:border-indigo-500" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={transposition} onChange={(e) => setTransposition(e.target.checked)} />
          Deteksi Transposition Error
        </label>
        <button onClick={run} disabled={running} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {running ? "Menjalankan..." : "Jalankan Ulang Auto-Match"}
        </button>
      </div>
    </div>
  );
}

/* ---------- SuggestedReviewTab ---------- */
export function SuggestedReviewTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const pending = data.matches.filter((m) => !m.isConfirmed && (m.status === "SUGGESTED_MATCH" || m.status === "DISCREPANCY_MATCH"));
  if (pending.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Tidak ada item perlu konfirmasi.</div>;

  return (
    <div className="space-y-4">
      {pending.map((m) => (
        <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-indigo-500">Data Bank</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{m.bankTx.description}</div>
              <div className="text-xs text-slate-500">{m.bankTx.reference} · {formatDateID(m.bankTx.date)}</div>
              <div className="mt-1 font-mono tabular-nums text-right text-sm text-slate-900">{formatIDR(m.bankTx.amount)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-indigo-500">Data Buku</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{m.bookTx.description}</div>
              <div className="text-xs text-slate-500">{m.bookTx.reference} · {formatDateID(m.bookTx.date)}</div>
              <div className="mt-1 font-mono tabular-nums text-right text-sm text-slate-900">{formatIDR(m.bookTx.amount)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">Confidence {m.confidenceScore}%</span>
            {m.reasons.map((r, i) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{r}</span>)}
          </div>
          {m.status === "DISCREPANCY_MATCH" && m.amountDiff !== 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              Selisih {formatIDR(m.amountDiff)} — Indikasi Transposition Error.
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={async () => { await api.approveMatch(data.session.id, m.id, { action: "APPROVE", discrepancyResolution: { faultSide: "BOOK" } }); toast.success("Disetujui."); onRefresh(); }} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Approve</button>
            <button onClick={async () => { await api.approveMatch(data.session.id, m.id, { action: "REJECT" }); toast.success("Ditolak."); onRefresh(); }} className="rounded-lg border border-rose-300 px-4 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- UnmatchedSplitTab ---------- */
const BANK_OUT_CATS = ["BANK_FEE", "TAX_ON_INTEREST", "NSF_CHECK", "UNRECORDED_EXPENSE", "BANK_ERROR_ADD", "BOOK_ERROR_ADD", "BOOK_ERROR_DEDUCT"] as const;
const BOOK_IN_CATS = ["DEPOSIT_IN_TRANSIT", "BANK_ERROR_DEDUCT"] as const;
const BOOK_OUT_CATS = ["OUTSTANDING_CHECK", "BANK_ERROR_ADD"] as const;

export function UnmatchedSplitTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  function adjIdFor(txId: string): string | null {
    return data.adjustments.find((a) => a.transactionId === txId)?.id ?? null;
  }

  async function classify(txId: string, category: string) {
    try {
      await api.createAdjustment(data.session.id, { transactionId: txId, category, description: `Klasifikasi manual (${category})` });
      toast.success("Diklasifikasi.");
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
  }

  async function unclassify(adjId: string) {
    try { await api.deleteAdjustment(data.session.id, adjId); toast.success("Klasifikasi dihapus."); onRefresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
  }

  function renderPane(txs: TransactionDTO[], side: "BANK" | "BOOK") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-900">{side === "BANK" ? "Hanya di Rekening Koran Bank" : "Hanya di Buku Kas Perusahaan"}</h4>
        {txs.length === 0 ? <div className="text-sm text-slate-500">Tidak ada.</div> : (
          <div className="space-y-2">
            {txs.map((tx) => {
              const adjId = adjIdFor(tx.id);
              return (
                <div key={tx.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{tx.description}</div>
                      <div className="text-xs text-slate-500">{tx.reference} · {formatDateID(tx.date)}</div>
                    </div>
                    <div className="font-mono tabular-nums text-sm text-slate-900">{formatIDR(tx.amount)}</div>
                  </div>
                  {adjId ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">
                        {data.adjustments.find((a) => a.id === adjId)?.category}
                      </span>
                      <button onClick={() => unclassify(adjId)} className="text-xs text-slate-400 hover:text-rose-600">hapus</button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && classify(tx.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                      >
                        <option value="">Klasifikasikan sebagai...</option>
                        {(side === "BANK"
                          ? (tx.direction === "OUT" ? BANK_OUT_CATS : ["BANK_ERROR_DEDUCT"])
                          : (tx.direction === "IN" ? BOOK_IN_CATS : BOOK_OUT_CATS)
                        ).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => side === "BANK" ? setSelectedBank(tx.id) : setSelectedBook(tx.id)}
                    className="mt-1 text-[11px] text-indigo-600 hover:underline"
                  >
                    pilih untuk manual pair
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {renderPane(data.unmatchedBank, "BANK")}
        {renderPane(data.unmatchedBook, "BOOK")}
      </div>
      {selectedBank && selectedBook && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="mb-2 text-sm text-slate-700">2 transaksi terpilih. Pasangkan manual?</div>
          <div className="flex gap-2">
            <button onClick={async () => {
              try { await api.manualPair(data.session.id, { bankTxId: selectedBank, bookTxId: selectedBook }); toast.success("Manual pair dibuat."); setSelectedBank(null); setSelectedBook(null); onRefresh(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Gagal (nominal beda butuh discrepancyResolution)."); }
            }} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Pasangkan Manual</button>
            <button onClick={() => { setSelectedBank(null); setSelectedBook(null); }} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600">Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- ConfirmedMatchesTab ---------- */
export function ConfirmedMatchesTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const confirmed = data.matches.filter((m) => m.isConfirmed);
  const helper = createColumnHelper<MatchPairDTO>();
  const columns = useMemo(() => [
    helper.accessor("bankTx", { header: "Bank", cell: (i) => <div className="text-sm text-slate-900">{i.getValue().description}</div> }),
    helper.accessor("bookTx", { header: "Buku", cell: (i) => <div className="text-sm text-slate-900">{i.getValue().description}</div> }),
    helper.accessor("status", { header: "Status", cell: (i) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{i.getValue()}</span> }),
    helper.accessor("confidenceScore", { header: "Confidence", cell: (i) => <span className="font-mono tabular-nums text-sm">{i.getValue()}%</span> }),
    helper.display({ id: "actions", header: "", cell: (i) => (
      <button onClick={async () => { await api.deleteMatch(data.session.id, i.row.original.id); toast.success("Unmatched."); onRefresh(); }} className="text-xs text-rose-600 hover:underline">Unmatch</button>
    )}),
  ], [data, onRefresh, helper]);
  const table = useReactTable({ data: confirmed, columns, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel() });

  if (confirmed.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada pasangan terkonfirmasi.</div>;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="px-4 py-3 font-medium">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-3">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- ReconMatrixCard ---------- */
export function ReconMatrixCard({ data }: { data: HydratedSessionResponse }) {
  const s = data.summary;
  const bankAdj = data.adjustments.filter((a) => a.side === "BANK");
  const bookAdj = data.adjustments.filter((a) => a.side === "BOOK");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[{ title: "Sisi Bank", start: data.session.endingBankBalance, adj: bankAdj, end: s.adjustedBankBalance },
        { title: "Sisi Buku", start: data.session.endingBookBalance, adj: bookAdj, end: s.adjustedBookBalance }].map((side) => (
        <div key={side.title} className="rounded-xl border border-slate-200 bg-white p-5">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">{side.title}</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Saldo akhir</span><span className="font-mono tabular-nums text-right">{formatIDR(side.start)}</span></div>
            {side.adj.map((a) => (
              <div key={a.id} className="flex justify-between"><span className="text-xs text-slate-500">{a.category}</span><span className="font-mono tabular-nums text-right">{formatIDRAccounting(a.signedAmount)}</span></div>
            ))}
            <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between font-semibold"><span>Saldo Disesuaikan</span><span className="font-mono tabular-nums text-right">{formatIDR(side.end)}</span></div>
          </div>
        </div>
      ))}
      <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5 text-center">
        <span className="text-sm text-slate-600">Selisih (Variance): </span>
        <span className={`font-mono text-lg tabular-nums font-bold ${s.variance === 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatIDR(s.variance)}</span>
      </div>
    </div>
  );
}

function formatIDRAccounting(v: number): string {
  return v < 0 ? `(Rp ${Math.abs(v).toLocaleString("id-ID")})` : `Rp ${v.toLocaleString("id-ID")}`;
}

/* ---------- ReconWaterfallChart ---------- */
export function ReconWaterfallChart({ data }: { data: HydratedSessionResponse }) {
  const bankData = useMemo(() => {
    const steps: { name: string; value: number; base: number }[] = [];
    let running = data.session.endingBankBalance;
    steps.push({ name: "Saldo Bank", value: running, base: 0 });
    data.adjustments.filter((a) => a.side === "BANK").forEach((a) => {
      steps.push({ name: a.category, value: a.signedAmount, base: running });
      running += a.signedAmount;
    });
    steps.push({ name: "Disesuaikan", value: running, base: 0 });
    return steps;
  }, [data]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="mb-4 text-sm font-semibold text-slate-900">Jembatan Saldo Bank → Buku</h4>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={bankData} margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis tickFormatter={(v: number) => formatIDR(v)} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => formatIDR(Number(v))} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Bar dataKey="value" stackId="a">
            {bankData.map((_, i) => <Cell key={i} fill={i === 0 || i === bankData.length - 1 ? "#4f46e5" : "#10b981"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
