/**
 * Workbench & Report components untuk workspace 4-step.
 * Upgrade sesuai Gemini audit: dropdown kategori lengkap, sub-tabs,
 * discrepancy faultSide selector, true floating waterfall, badge IN/OUT.
 */
"use client";

import { useMemo, useState } from "react";
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, flexRender, createColumnHelper,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { api, type HydratedSessionResponse } from "@/lib/api/client";
import { formatIDR, formatIDRAccounting, formatDateID, formatPercent } from "@/lib/format";
import { getCategoryLabel } from "@/lib/engine/calculator";
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";
import type { TransactionDTO, MatchPairDTO } from "@/lib/session";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

/* ---------- Kategori per pane (Gemini #1) ---------- */
const BANK_IN_CATS = ["INTEREST_INCOME", "UNRECORDED_RECEIPT", "BANK_ERROR_DEDUCT", "BOOK_ERROR_ADD"] as const;
const BANK_OUT_CATS = ["BANK_FEE", "TAX_ON_INTEREST", "NSF_CHECK", "UNRECORDED_EXPENSE", "BANK_ERROR_ADD", "BOOK_ERROR_DEDUCT"] as const;
const BOOK_IN_CATS = ["DEPOSIT_IN_TRANSIT", "BANK_ERROR_ADD", "BOOK_ERROR_DEDUCT"] as const;
const BOOK_OUT_CATS = ["OUTSTANDING_CHECK", "BANK_ERROR_DEDUCT", "BOOK_ERROR_ADD"] as const;

function DirectionPill({ direction }: { direction: "IN" | "OUT" }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
      {direction === "IN" ? "Masuk" : "Keluar"}
    </span>
  );
}

/* ---------- KpiSummaryGrid ---------- */
export function KpiSummaryGrid({ data }: { data: HydratedSessionResponse }) {
  const s = data.summary;
  const cards = [
    { label: "Match Rate", value: formatPercent(s.matchRate), tone: "text-slate-900" },
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
  const finalized = data.session.status === "FINALIZED";

  async function run() {
    if (finalized) { toast.error("Sesi sudah FINALIZED. Buka kembali (REOPEN) terlebih dahulu."); return; }
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
          <input type="range" min={0} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={finalized} className="w-48" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Toleransi Nominal (Rp)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={finalized} className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-right font-mono tabular-nums text-sm outline-none focus:border-indigo-500 disabled:bg-slate-50" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={transposition} onChange={(e) => setTransposition(e.target.checked)} disabled={finalized} />
          Deteksi Transposition Error
        </label>
        <button onClick={run} disabled={running || finalized} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {running ? "Menjalankan..." : "Jalankan Ulang Auto-Match"}
        </button>
      </div>
    </div>
  );
}

/* ---------- SuggestedReviewTab ---------- */
export function SuggestedReviewTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const pending = data.matches.filter((m) => !m.isConfirmed && (m.status === "SUGGESTED_MATCH" || m.status === "DISCREPANCY_MATCH"));
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // faultSide per kartu (hanya untuk DISCREPANCY_MATCH) + akun lawan opsional.
  const [faultSides, setFaultSides] = useState<Record<string, "BOOK" | "BANK">>({});
  const [contraNames, setContraNames] = useState<Record<string, string>>({});
  const finalized = data.session.status === "FINALIZED";

  async function act(m: MatchPairDTO, action: "APPROVE" | "REJECT") {
    if (finalized) { toast.error("Sesi sudah FINALIZED."); return; }
    setLoadingId(m.id);
    try {
      const isDisc = action === "APPROVE" && m.status === "DISCREPANCY_MATCH" && m.amountDiff !== 0;
      const faultSide = isDisc ? (faultSides[m.id] ?? "BOOK") : undefined;
      const contraAccountName = isDisc && faultSides[m.id] === "BOOK" ? (contraNames[m.id] || undefined) : undefined;
      await api.approveMatch(data.session.id, m.id, {
        action,
        discrepancyResolution: faultSide ? { faultSide, contraAccountName } : undefined,
      });
      toast.success(action === "APPROVE" ? "Disetujui." : "Ditolak.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setLoadingId(null);
    }
  }

  if (pending.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Tidak ada item perlu konfirmasi.</div>;

  return (
    <div className="space-y-4">
      {pending.map((m) => {
        const isDisc = m.status === "DISCREPANCY_MATCH" && m.amountDiff !== 0;
        const loading = loadingId === m.id;
        const fs = faultSides[m.id] ?? "BOOK";
        return (
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
            {isDisc && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <div>Selisih {formatIDR(m.amountDiff)} — Indikasi Transposition Error. Tentukan sisi kesalahan:</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 text-slate-700">
                    <input type="radio" name={`fs-${m.id}`} checked={fs === "BOOK"} onChange={() => setFaultSides((p) => ({ ...p, [m.id]: "BOOK" }))} disabled={loading || finalized} />
                    Kesalahan Buku (Buat Jurnal)
                  </label>
                  <label className="flex items-center gap-1 text-slate-700">
                    <input type="radio" name={`fs-${m.id}`} checked={fs === "BANK"} onChange={() => setFaultSides((p) => ({ ...p, [m.id]: "BANK" }))} disabled={loading || finalized} />
                    Kesalahan Bank (Tanpa Jurnal)
                  </label>
                  {fs === "BOOK" && (
                    <input
                      placeholder="Akun lawan (opsional)"
                      value={contraNames[m.id] ?? ""}
                      onChange={(e) => setContraNames((p) => ({ ...p, [m.id]: e.target.value }))}
                      disabled={loading || finalized}
                      className="rounded border border-amber-300 px-2 py-0.5 text-xs outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => act(m, "APPROVE")} disabled={finalized || loading} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">Approve</button>
              <button onClick={() => act(m, "REJECT")} disabled={finalized || loading} className="rounded-lg border border-rose-300 px-4 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60">Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- UnmatchedSplitTab ---------- */
export function UnmatchedSplitTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  // faultSide untuk bar Manual Pair (jika nominal beda).
  const [manualFault, setManualFault] = useState<"BOOK" | "BANK">("BOOK");
  const finalized = data.session.status === "FINALIZED";

  function adjIdFor(txId: string): string | null {
    return data.adjustments.find((a) => a.transactionId === txId)?.id ?? null;
  }

  async function classify(txId: string, category: string, desc: string) {
    if (finalized) { toast.error("Sesi sudah FINALIZED."); return; }
    try {
      await api.createAdjustment(data.session.id, { transactionId: txId, category, description: desc });
      toast.success("Diklasifikasi.");
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
  }

  async function unclassify(adjId: string) {
    if (finalized) { toast.error("Sesi sudah FINALIZED."); return; }
    try { await api.deleteAdjustment(data.session.id, adjId); toast.success("Klasifikasi dihapus."); onRefresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
  }

  const selBankTx = data.unmatchedBank.find((t) => t.id === selectedBank);
  const selBookTx = data.unmatchedBook.find((t) => t.id === selectedBook);
  const manualDiff = selBankTx && selBookTx ? selBankTx.amount - selBookTx.amount : 0;

  function renderPane(txs: TransactionDTO[], side: "BANK" | "BOOK") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-900">{side === "BANK" ? "Hanya di Rekening Koran Bank" : "Hanya di Buku Kas Perusahaan"}</h4>
        {txs.length === 0 ? <div className="text-sm text-slate-500">Tidak ada.</div> : (
          <div className="space-y-2">
            {txs.map((tx) => {
              const adjId = adjIdFor(tx.id);
              const adj = adjId ? data.adjustments.find((a) => a.id === adjId) : null;
              const selected = side === "BANK" ? selectedBank === tx.id : selectedBook === tx.id;
              return (
                <div key={tx.id} className={`rounded-lg border p-3 transition ${selected ? "border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50/40" : "border-slate-100"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <DirectionPill direction={tx.direction} />
                        <div className="truncate text-sm font-medium text-slate-900">{tx.description}</div>
                      </div>
                      <div className="text-xs text-slate-500">{tx.reference} · {formatDateID(tx.date)}</div>
                    </div>
                    <div className="font-mono tabular-nums text-right text-sm text-slate-900">{formatIDR(tx.amount)}</div>
                  </div>
                  {adjId && adj ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">
                        {getCategoryLabel(adj.category)}
                      </span>
                      <button onClick={() => unclassify(adjId)} disabled={finalized} className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50">hapus</button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && classify(tx.id, e.target.value, tx.description)}
                        disabled={finalized}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 disabled:bg-slate-50"
                      >
                        <option value="">Klasifikasikan sebagai...</option>
                        {(side === "BANK"
                          ? (tx.direction === "IN" ? BANK_IN_CATS : BANK_OUT_CATS)
                          : (tx.direction === "IN" ? BOOK_IN_CATS : BOOK_OUT_CATS)
                        ).map((c) => <option key={c} value={c}>{getCategoryLabel(c as AdjustmentCategory)}</option>)}
                      </select>
                    </div>
                  )}
                  <button
                    onClick={() => side === "BANK" ? setSelectedBank(tx.id) : setSelectedBook(tx.id)}
                    disabled={finalized}
                    className="mt-1 text-[11px] text-indigo-600 hover:underline disabled:opacity-50"
                  >
                    {selected ? "terpilih ✓" : "pilih untuk manual pair"}
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
        <div className="fixed bottom-6 left-1/2 z-30 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="mb-1 text-sm text-slate-700">2 transaksi terpilih. Pasangkan manual?</div>
          {manualDiff !== 0 && (
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              Nominal beda {formatIDR(manualDiff)}. Sisi kesalahan:
              <select
                value={manualFault}
                onChange={(e) => setManualFault(e.target.value as "BOOK" | "BANK")}
                className="ml-2 rounded border border-amber-300 px-1.5 py-0.5 text-xs"
              >
                <option value="BOOK">Buku</option>
                <option value="BANK">Bank</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await api.manualPair(data.session.id, {
                    bankTxId: selectedBank, bookTxId: selectedBook,
                    ...(manualDiff !== 0 ? { discrepancyResolution: { faultSide: manualFault } } : {}),
                  });
                  toast.success("Manual pair dibuat.");
                  setSelectedBank(null); setSelectedBook(null); onRefresh();
                } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
              }}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >Pasangkan Manual</button>
            <button onClick={() => { setSelectedBank(null); setSelectedBook(null); }} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600">Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- ConfirmedMatchesTab ---------- */
const confirmedColumnHelper = createColumnHelper<MatchPairDTO>();

export function ConfirmedMatchesTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const finalized = data.session.status === "FINALIZED";
  const confirmed = data.matches.filter((m) => m.isConfirmed);
  const [search, setSearch] = useState("");
  const helper = confirmedColumnHelper;
  const columns = useMemo(() => [
    helper.accessor("bankTx", { header: "Tanggal", cell: (i) => <span className="text-xs text-slate-600">{formatDateID(i.getValue().date)}</span> }),
    helper.accessor("bankTx", { id: "bank", header: "Bank", cell: (i) => <div className="text-sm text-slate-900">{i.getValue().description}</div> }),
    helper.accessor("bookTx", { header: "Buku", cell: (i) => <div className="text-sm text-slate-900">{i.getValue().description}</div> }),
    helper.accessor("status", { header: "Status", cell: (i) => {
      const map: Record<string, string> = { EXACT_MATCH: "Cocok Persis", SUGGESTED_MATCH: "Saran", DISCREPANCY_MATCH: "Selisih", MANUAL_MATCH: "Manual" };
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{map[i.getValue()] ?? i.getValue()}</span>;
    }}),
    helper.accessor("confidenceScore", { header: "Confidence", cell: (i) => <span className="font-mono tabular-nums text-sm">{i.getValue()}%</span> }),
    helper.accessor("bankTx", { id: "amount", header: "Nominal", cell: (i) => <span className="font-mono tabular-nums text-right text-sm">{formatIDR(i.getValue().amount)}</span> }),
    helper.display({ id: "actions", header: "", cell: (i) => (
      <button
        onClick={async () => {
          try { await api.deleteMatch(data.session.id, i.row.original.id); toast.success("Unmatched."); onRefresh(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
        }}
        disabled={finalized}
        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
      >Unmatch</button>
    )}),
  ], [data, onRefresh, helper, finalized]);
  const table = useReactTable({
    data: confirmed, columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
  });

  if (confirmed.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada pasangan terkonfirmasi.</div>;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari cepat..."
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="px-4 py-3 font-medium">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-3">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- MatchingWorkbench (sub-tabs dengan badge) ---------- */
export function MatchingWorkbench({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const [tab, setTab] = useState<"pending" | "unmatched" | "confirmed">("pending");
  const pendingCount = data.matches.filter((m) => !m.isConfirmed && (m.status === "SUGGESTED_MATCH" || m.status === "DISCREPANCY_MATCH")).length;
  const unmatchedCount = data.unmatchedBank.length + data.unmatchedBook.length;
  const confirmedCount = data.matches.filter((m) => m.isConfirmed).length;

  const tabs = [
    { key: "pending" as const, label: "Perlu Konfirmasi", count: pendingCount },
    { key: "unmatched" as const, label: "Belum Cocok", count: unmatchedCount },
    { key: "confirmed" as const, label: "Terkonfirmasi", count: confirmedCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === t.key ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {t.label} <span className={`ml-1 rounded-full px-1.5 text-xs ${tab === t.key ? "bg-white/20" : "bg-slate-100"}`}>{t.count}</span>
          </button>
        ))}
      </div>
      {tab === "pending" && <SuggestedReviewTab data={data} onRefresh={onRefresh} />}
      {tab === "unmatched" && <UnmatchedSplitTab data={data} onRefresh={onRefresh} />}
      {tab === "confirmed" && <ConfirmedMatchesTab data={data} onRefresh={onRefresh} />}
    </div>
  );
}

/* ---------- ReconMatrixCard ---------- */
export function ReconMatrixCard({ data }: { data: HydratedSessionResponse }) {
  const s = data.summary;
  const bankAdj = data.adjustments.filter((a) => a.side === "BANK");
  const bookAdj = data.adjustments.filter((a) => a.side === "BOOK");

  function renderSide(title: string, start: number, adj: typeof bankAdj, end: number) {
    const additions = adj.filter((a) => a.signedAmount > 0);
    const deductions = adj.filter((a) => a.signedAmount < 0);
    return (
      <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
        <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Saldo akhir</span><span className="font-mono tabular-nums text-right">{formatIDR(start)}</span></div>
          {additions.length > 0 && <div className="mt-1 text-xs font-medium text-slate-400">Penambahan (+)</div>}
          {additions.map((a) => (
            <div key={a.id} className="flex justify-between"><span className="text-xs text-slate-500">{getCategoryLabel(a.category)}</span><span className="font-mono tabular-nums text-right text-emerald-600">{formatIDRAccounting(a.signedAmount)}</span></div>
          ))}
          {deductions.length > 0 && <div className="mt-1 text-xs font-medium text-slate-400">Pengurangan (−)</div>}
          {deductions.map((a) => (
            <div key={a.id} className="flex justify-between"><span className="text-xs text-slate-500">{getCategoryLabel(a.category)}</span><span className="font-mono tabular-nums text-right text-rose-600">{formatIDRAccounting(a.signedAmount)}</span></div>
          ))}
          <div className="double-underline mt-2 border-t border-slate-300 pt-2 flex justify-between font-semibold">
            <span>Saldo Kas yang Benar (Disesuaikan)</span>
            <span className="font-mono tabular-nums text-right">{formatIDR(end)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {renderSide("Sisi Bank", data.session.endingBankBalance, bankAdj, s.adjustedBankBalance)}
      {renderSide("Sisi Buku", data.session.endingBookBalance, bookAdj, s.adjustedBookBalance)}
      <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5 text-center">
        <span className="text-sm text-slate-600">Selisih (Variance): </span>
        <span className={`font-mono text-lg tabular-nums font-bold ${s.variance === 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatIDR(s.variance)}</span>
      </div>
    </div>
  );
}

/* ---------- ReconWaterfallChart (true floating) ---------- */
const COLOR_HEX: Record<string, string> = {
  indigo: "#4f46e5",
  emerald: "#10b981",
  rose: "#e11d48",
  amber: "#d97706",
};

export function ReconWaterfallChart({ data }: { data: HydratedSessionResponse }) {
  // Gunakan waterfallSteps dari backend langsung (sudah arah-aware).
  const steps = data.summary.waterfallSteps;
  const chartData = steps.map((s) => ({
    label: s.label,
    base: Math.min(0, s.value),
    displayValue: Math.abs(s.value),
    signed: s.value,
    color: COLOR_HEX[s.color] ?? "#4f46e5",
  }));
  const all = steps.map((s) => s.value).concat(0);
  const yMin = Math.floor((Math.min(...all) * 0.98) / 1_000_000) * 1_000_000;
  const yMax = Math.ceil((Math.max(...all) * 1.02) / 1_000_000) * 1_000_000;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="mb-4 text-sm font-semibold text-slate-900">Jembatan Saldo Bank → Buku</h4>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis domain={[yMin, yMax]} tickFormatter={(v: number) => formatIDR(v)} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(value, name) => {
              if (name === "displayValue") {
                const c = chartData.find((x) => x.displayValue === Number(value));
                return [formatIDR(c?.signed ?? 0), "Nilai"];
              }
              return [String(value), String(name)];
            }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          {/* base transparan menempatkan posisi floating; displayValue menggambar tinggi nyata. */}
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="displayValue" stackId="wf" isAnimationActive={false}>
            {chartData.map((c, i) => <Cell key={i} fill={c.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
