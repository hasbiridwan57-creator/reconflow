/**
 * Meja Rekonsiliasi — Inbox Zero + Cermin Saldo.
 * Layout split-screen: kolom kiri antrean kerja prioritas, kolom kanan cermin saldo.
 */
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type HydratedSessionResponse } from "@/lib/api/client";
import { formatIDR, formatDateID, formatPercent } from "@/lib/format";
import { getCategoryLabel } from "@/lib/engine/calculator";
import { suggestAdjustmentCategory } from "@/lib/engine/suggester";
import { getAdjustmentImpactLabel } from "@/lib/engine/adjustments";
import type { AdjustmentCategory, CashDirection } from "@/lib/schemas/reconciliation";
import type { TransactionDTO, MatchPairDTO } from "@/lib/session";
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Sparkles, Link2 } from "lucide-react";
import { ConfirmedMatchesTab } from "@/components/workbench/WorkbenchComponents";

/* Kategori per pane untuk dropdown manual. */
const BANK_IN_CATS = ["INTEREST_INCOME", "UNRECORDED_RECEIPT", "BANK_ERROR_DEDUCT", "BOOK_ERROR_ADD"] as const;
const BANK_OUT_CATS = ["BANK_FEE", "TAX_ON_INTEREST", "NSF_CHECK", "UNRECORDED_EXPENSE", "BANK_ERROR_ADD", "BOOK_ERROR_DEDUCT"] as const;
const BOOK_IN_CATS = ["DEPOSIT_IN_TRANSIT", "BANK_ERROR_ADD", "BOOK_ERROR_DEDUCT"] as const;
const BOOK_OUT_CATS = ["OUTSTANDING_CHECK", "BANK_ERROR_DEDUCT", "BOOK_ERROR_ADD"] as const;

function DirectionPill({ direction }: { direction: CashDirection }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
      {direction === "IN" ? "Masuk" : "Keluar"}
    </span>
  );
}

function SourceBadge({ source }: { source: "BANK" | "BOOK" }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${source === "BANK" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
      {source === "BANK" ? "BANK" : "BUKU"}
    </span>
  );
}

/* ---------- Anomali & discrepancy card ---------- */
function AnomalyCard({ data, onRefresh, match }: { data: HydratedSessionResponse; onRefresh: () => void; match?: MatchPairDTO }) {
  const finalized = data.session.status === "FINALIZED";
  const [loading, setLoading] = useState(false);
  const [faultSide, setFaultSide] = useState<"BOOK" | "BANK">("BOOK");

  async function approve() {
    if (!match) return;
    setLoading(true);
    try {
      await api.approveMatch(data.session.id, match.id, {
        action: "APPROVE",
        discrepancyResolution: { faultSide },
      });
      toast.success("Anomali diselesaikan.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          {match ? (
            <>
              <div className="text-sm font-semibold text-slate-900">Selisih Nominal Terdeteksi</div>
              <div className="mt-1 text-xs text-slate-600">
                Bank: <b>{match.bankTx.description}</b> ({formatIDR(match.bankTx.amount)}) ↔ Buku:{" "}
                <b>{match.bookTx.description}</b> ({formatIDR(match.bookTx.amount)}) · Selisih{" "}
                <span className="font-mono tabular-nums">{formatIDR(match.amountDiff)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1 text-slate-700">
                  <input type="radio" checked={faultSide === "BOOK"} onChange={() => setFaultSide("BOOK")} disabled={loading || finalized} />
                  Kesalahan Buku (Buat Jurnal)
                </label>
                <label className="flex items-center gap-1 text-slate-700">
                  <input type="radio" checked={faultSide === "BANK"} onChange={() => setFaultSide("BANK")} disabled={loading || finalized} />
                  Kesalahan Bank (Tanpa Jurnal)
                </label>
              </div>
              <button
                onClick={approve}
                disabled={finalized || loading}
                className="mt-3 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {loading ? "Memproses..." : "Selesaikan Anomali"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------- Suggestion pill card untuk rutin ---------- */
function RoutineCard({
  tx, data, onRefresh, onPair,
}: {
  tx: TransactionDTO;
  data: HydratedSessionResponse;
  onRefresh: () => void;
  onPair: () => void;
}) {
  const finalized = data.session.status === "FINALIZED";
  const [loading, setLoading] = useState(false);
  const side = tx.source;
  const suggestion = suggestAdjustmentCategory({
    source: side, direction: tx.direction, description: tx.description, date: tx.date, amount: tx.amount,
  });
  const cats = side === "BANK"
    ? (tx.direction === "IN" ? BANK_IN_CATS : BANK_OUT_CATS)
    : (tx.direction === "IN" ? BOOK_IN_CATS : BOOK_OUT_CATS);

  async function classify(category: AdjustmentCategory) {
    setLoading(true);
    try {
      await api.createAdjustment(data.session.id, { transactionId: tx.id, category, description: tx.description });
      toast.success("Diklasifikasi.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <SourceBadge source={side} />
            <DirectionPill direction={tx.direction} />
          </div>
          <div className="mt-1 truncate text-sm font-medium text-slate-900">{tx.description}</div>
          <div className="text-xs text-slate-500">{tx.reference || "—"} · {formatDateID(tx.date)}</div>
        </div>
        <div className="font-mono text-sm tabular-nums text-right text-slate-900">{formatIDR(tx.amount)}</div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {suggestion && (
          <button
            onClick={() => classify(suggestion.category)}
            disabled={finalized || loading}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            ✓ Catat: {getCategoryLabel(suggestion.category)} · {suggestion.isAnomaly ? "Anomali" : "Auto"}
          </button>
        )}
        <select
          defaultValue=""
          onChange={(e) => e.target.value && classify(e.target.value as AdjustmentCategory)}
          disabled={finalized || loading}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 disabled:bg-slate-50"
        >
          <option value="">Kategori Lain ▾</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {getCategoryLabel(c)} — {getAdjustmentImpactLabel(c as AdjustmentCategory)}
            </option>
          ))}
        </select>
        <button onClick={onPair} disabled={finalized} className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 disabled:opacity-50">
          <Link2 className="h-3 w-3" /> Pasangkan manual
        </button>
      </div>
    </div>
  );
}

/* ---------- Panel Cermin Saldo ---------- */
function BalanceMirror({ data, onGoReport }: { data: HydratedSessionResponse; onGoReport: () => void }) {
  const s = data.summary;
  const bankAdj = data.adjustments.filter((a) => a.side === "BANK").reduce((sum, a) => sum + a.signedAmount, 0);
  const bookAdj = data.adjustments.filter((a) => a.side === "BOOK").reduce((sum, a) => sum + a.signedAmount, 0);
  const journalCount = data.journals.entries.length;
  const remaining = s.unclassifiedCount + s.pendingSuggestedCount;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20">
      <div className="text-center">
        <span className={`inline-block rounded-full px-4 py-1.5 text-sm font-bold ${s.isBalanced ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {s.isBalanced ? "✓ BALANCED (Rp 0)" : "BELUM SEIMBANG"}
        </span>
        <div className={`mt-2 font-mono text-2xl tabular-nums font-bold ${s.variance === 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {formatIDR(s.variance)}
        </div>
      </div>
      <div className="space-y-3 border-t border-slate-100 pt-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Sisi Bank</div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-slate-600">Saldo Akhir</span>
            <span className="font-mono tabular-nums">{formatIDR(data.session.endingBankBalance)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Penyesuaian Bank</span>
            <span className="font-mono tabular-nums">{formatIDRAccountingShort(bankAdj)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-semibold">
            <span className="text-slate-900">Bank Disesuaikan</span>
            <span className="font-mono tabular-nums">{formatIDR(s.adjustedBankBalance)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Sisi Buku</div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-slate-600">Saldo Akhir</span>
            <span className="font-mono tabular-nums">{formatIDR(data.session.endingBookBalance)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Penyesuaian Buku</span>
            <span className="font-mono tabular-nums">{formatIDRAccountingShort(bookAdj)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-semibold">
            <span className="text-slate-900">Buku Disesuaikan</span>
            <span className="font-mono tabular-nums">{formatIDR(s.adjustedBookBalance)}</span>
          </div>
        </div>
      </div>
      <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <div className="flex justify-between">
          <span>Match Rate</span>
          <span className="font-mono tabular-nums">{formatPercent(s.matchRate)}</span>
        </div>
        <div className="flex justify-between">
          <span>Jurnal Penyesuaian</span>
          <span className="font-mono tabular-nums">
            {journalCount} entri · {s.isBalanced ? "Seimbang" : "Belum"}
          </span>
        </div>
      </div>
      {s.isBalanced ? (
        <button
          onClick={onGoReport}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Lihat Laporan &amp; Ekspor →
        </button>
      ) : (
        <div className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-600">
          {remaining > 0 ? `${remaining} item tersisa untuk diselesaikan.` : "Semua item terselesaikan — cek apakah selisih masih ada."}
        </div>
      )}
    </div>
  );
}

function formatIDRAccountingShort(n: number): string {
  if (n === 0) return "Rp 0";
  return n > 0 ? `+${formatIDR(n)}` : `-${formatIDR(Math.abs(n))}`;
}

/* ---------- Accordion ---------- */
function Accordion({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
          {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          {title} ({count})
        </div>
      </button>
      {open && <div className="border-t border-slate-100 p-4">{children}</div>}
    </div>
  );
}

/* ---------- Komponen utama ---------- */
export function ReconciliationDesk({ data, onRefresh, onGoReport }: { data: HydratedSessionResponse; onRefresh: () => void; onGoReport: () => void }) {
  const finalized = data.session.status === "FINALIZED";
  const s = data.summary;
  const [filter, setFilter] = useState<"ALL" | "BANK" | "BOOK">("ALL");
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  // Suggested yang belum dikonfirmasi.
  const suggestedPending = data.matches.filter((m) => !m.isConfirmed && m.status === "SUGGESTED_MATCH");
  // Discrepancy yang belum dikonfirmasi.
  const discrepancyPending = data.matches.filter((m) => !m.isConfirmed && m.status === "DISCREPANCY_MATCH");

  // Konteks matchedBankTxs untuk deteksi double charge.
  const matchedBankTxs = useMemo(() => {
    return data.matches
      .filter((m) => m.isConfirmed || m.status === "MANUAL_MATCH" || m.status === "EXACT_MATCH")
      .map((m) => ({
        date: m.bankTx.date,
        amount: m.bankTx.amount,
        direction: m.bankTx.direction as CashDirection,
        normalizedDesc: m.bankTx.normalizedDesc,
      }));
  }, [data.matches]);

  // Unmatched rutin (bukan anomaly, belum punya adjId).
  const adjTxIds = useMemo(
    () => new Set(data.adjustments.map((a) => a.transactionId).filter(Boolean) as string[]),
    [data.adjustments],
  );
  const unmatchedRoutine = useMemo(() => {
    const bank = data.unmatchedBank.filter((tx) => {
      if (adjTxIds.has(tx.id)) return false;
      const sug = suggestAdjustmentCategory({ source: tx.source, direction: tx.direction as CashDirection, description: tx.description, date: tx.date, amount: tx.amount }, { matchedBankTxs });
      return !sug?.isAnomaly;
    });
    const book = data.unmatchedBook.filter((tx) => {
      if (adjTxIds.has(tx.id)) return false;
      const sug = suggestAdjustmentCategory({ source: tx.source, direction: tx.direction as CashDirection, description: tx.description, date: tx.date, amount: tx.amount }, { matchedBankTxs });
      return !sug?.isAnomaly;
    });
    return { bank, book };
  }, [data, adjTxIds, matchedBankTxs]);

  // Anomali unmatched (double charge / unknown charge).
  const anomalyUnmatched = useMemo(() => {
    const find = (list: TransactionDTO[], source: "BANK" | "BOOK") =>
      list.filter((tx) => {
        if (adjTxIds.has(tx.id)) return false;
        const sug = suggestAdjustmentCategory({ source, direction: tx.direction as CashDirection, description: tx.description, date: tx.date, amount: tx.amount }, { matchedBankTxs });
        return sug?.isAnomaly ?? false;
      });
    return { bank: find(data.unmatchedBank, "BANK"), book: find(data.unmatchedBook, "BOOK") };
  }, [data, adjTxIds, matchedBankTxs]);

  // Filter untuk seksi rutin.
  const filteredRoutine = {
    bank: filter === "BOOK" ? [] : unmatchedRoutine.bank,
    book: filter === "BANK" ? [] : unmatchedRoutine.book,
  };

  const totalTx = data.bankTransactions.length + data.bookTransactions.length;
  const resolvedTx = data.matches.filter((m) => m.isConfirmed).length * 2
    + data.adjustments.filter((a) => a.transactionId).length;
  const resolvedPct = Math.round((Math.min(resolvedTx, totalTx) / totalTx) * 100);

  const confirmedMatches = data.matches.filter((m) => m.isConfirmed);
  const suggestionsWithRoutine = unmatchedRoutine.bank.length + unmatchedRoutine.book.length;

  async function approveAll() {
    if (finalized) { toast.error("Sesi sudah FINALIZED."); return; }
    try {
      await api.approveAllSuggested(data.session.id);
      toast.success("Semua saran disetujui.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    }
  }

  async function applyAllSmart() {
    if (finalized) { toast.error("Sesi sudah FINALIZED."); return; }
    // Buat saran untuk semua item rutin (bank + book) yang belum diklasifikasi.
    const items: Array<Record<string, unknown>> = [];
    for (const tx of [...unmatchedRoutine.bank, ...unmatchedRoutine.book]) {
      const sug = suggestAdjustmentCategory({ source: tx.source, direction: tx.direction as CashDirection, description: tx.description, date: tx.date, amount: tx.amount });
      if (sug && !sug.isAnomaly) {
        items.push({ transactionId: tx.id, category: sug.category, description: tx.description });
      }
    }
    if (items.length === 0) {
      toast.info("Tidak ada saran cerdas untuk diterapkan.");
      return;
    }
    try {
      await api.createBulkAdjustments(data.session.id, items);
      toast.success(`${items.length} penyesuaian diterapkan.`);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    }
  }

  // Manual pair bar.
  const selBank = data.unmatchedBank.find((t) => t.id === selectedBank);
  const selBook = data.unmatchedBook.find((t) => t.id === selectedBook);
  const manualDiff = selBank && selBook ? selBank.amount - selBook.amount : 0;

  async function doManualPair() {
    if (!selectedBank || !selectedBook) return;
    try {
      await api.manualPair(data.session.id, {
        bankTxId: selectedBank, bookTxId: selectedBook,
        ...(manualDiff !== 0 ? { discrepancyResolution: { faultSide: "BOOK" } } : {}),
      });
      toast.success("Manual pair dibuat.");
      setSelectedBank(null); setSelectedBook(null); onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    }
  }

  const inboxZero = suggestedPending.length === 0
    && discrepancyPending.length === 0
    && anomalyUnmatched.bank.length === 0
    && anomalyUnmatched.book.length === 0
    && unmatchedRoutine.bank.length === 0
    && unmatchedRoutine.book.length === 0
    && s.isBalanced;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Kolom kiri — Antrean Kerja */}
      <div className="space-y-6 lg:col-span-8">
        {/* Progress bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900">
              {Math.min(resolvedTx, totalTx)} dari {totalTx} transaksi beres
            </span>
            <span className="text-xs text-slate-500">
              {totalTx - Math.min(resolvedTx, totalTx)} tersisa
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${resolvedPct}%` }} />
          </div>
        </div>

        {inboxZero && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <div className="mt-2 text-lg font-semibold text-emerald-700">Inbox Zero Tercapai!</div>
            <div className="mt-1 text-sm text-emerald-600">Semua transaksi beres & saldo seimbang.</div>
            <button
              onClick={onGoReport}
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Buka Laporan &amp; Ekspor →
            </button>
          </div>
        )}

        {/* Seksi 1: Anomali */}
        {(discrepancyPending.length > 0 || anomalyUnmatched.bank.length > 0 || anomalyUnmatched.book.length > 0) && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Perlu Perhatian Audit</h3>
            {discrepancyPending.map((m) => (
              <AnomalyCard key={m.id} data={data} onRefresh={onRefresh} match={m} />
            ))}
            {anomalyUnmatched.bank.map((tx) => (
              <RoutineCard key={tx.id} tx={tx} data={data} onRefresh={onRefresh} onPair={() => setSelectedBank(tx.id)} />
            ))}
            {anomalyUnmatched.book.map((tx) => (
              <RoutineCard key={tx.id} tx={tx} data={data} onRefresh={onRefresh} onPair={() => setSelectedBook(tx.id)} />
            ))}
          </div>
        )}

        {/* Seksi 2: Saran Pasangan Cocok */}
        {suggestedPending.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Saran Pasangan Cocok ({suggestedPending.length})</h3>
              <button
                onClick={approveAll}
                disabled={finalized}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Setujui Semua Saran ({suggestedPending.length})
              </button>
            </div>
            <SuggestedCardList data={data} onRefresh={onRefresh} suggestedPending={suggestedPending} />
          </div>
        )}

        {/* Seksi 3: Sisa Transaksi Rutin */}
        {(filteredRoutine.bank.length > 0 || filteredRoutine.book.length > 0) && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Sisa Transaksi Rutin</h3>
              <div className="flex items-center gap-2">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as "ALL" | "BANK" | "BOOK")}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Semua</option>
                  <option value="BANK">Hanya di Bank</option>
                  <option value="BOOK">Hanya di Buku</option>
                </select>
                {suggestionsWithRoutine >= 2 && (
                  <button
                    onClick={applyAllSmart}
                    disabled={finalized}
                    className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    <Sparkles className="h-3 w-3" /> Terapkan Semua Saran Cerdas ({suggestionsWithRoutine})
                  </button>
                )}
              </div>
            </div>
            {filteredRoutine.bank.map((tx) => (
              <RoutineCard key={tx.id} tx={tx} data={data} onRefresh={onRefresh} onPair={() => setSelectedBank(tx.id)} />
            ))}
            {filteredRoutine.book.map((tx) => (
              <RoutineCard key={tx.id} tx={tx} data={data} onRefresh={onRefresh} onPair={() => setSelectedBook(tx.id)} />
            ))}
          </div>
        )}

        {/* Accordion: Penyesuaian Tercatat */}
        {data.adjustments.length > 0 && (
          <Accordion title="Penyesuaian Tercatat" count={data.adjustments.length}>
            <AdjustmentList data={data} onRefresh={onRefresh} />
          </Accordion>
        )}

        {/* Accordion: Transaksi Sudah Cocok */}
        {confirmedMatches.length > 0 && (
          <Accordion title="Transaksi Sudah Cocok" count={confirmedMatches.length}>
            <ConfirmedMatchesTab data={data} onRefresh={onRefresh} />
          </Accordion>
        )}
      </div>

      {/* Kolom kanan — Cermin Saldo */}
      <div className="lg:col-span-4">
        <BalanceMirror data={data} onGoReport={onGoReport} />
      </div>

      {/* Modal manual pair */}
      {selectedBank && selectedBook && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="mb-2 text-sm text-slate-700">2 transaksi terpilih. Pasangkan manual?</div>
          {manualDiff !== 0 && (
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
              Nominal beda {formatIDR(manualDiff)}. Sisi kesalahan: <b>Buku</b> (default).
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={doManualPair}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >Pasangkan Manual</button>
            <button
              onClick={() => { setSelectedBank(null); setSelectedBook(null); }}
              className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600"
            >Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Kartu saran pasangan ---------- */
function SuggestedCardList({ data, onRefresh, suggestedPending }: { data: HydratedSessionResponse; onRefresh: () => void; suggestedPending: MatchPairDTO[] }) {
  const finalized = data.session.status === "FINALIZED";
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function act(m: MatchPairDTO, action: "APPROVE" | "REJECT") {
    setLoadingId(m.id);
    try {
      await api.approveMatch(data.session.id, m.id, { action });
      toast.success(action === "APPROVE" ? "Cocokkan." : "Ditolak.");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {suggestedPending.map((m) => (
        <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-sky-50/50 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-sky-600">Data Bank</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{m.bankTx.description}</div>
              <div className="text-xs text-slate-500">{m.bankTx.reference} · {formatDateID(m.bankTx.date)}</div>
              <div className="mt-1 font-mono text-sm tabular-nums text-right text-slate-900">{formatIDR(m.bankTx.amount)}</div>
            </div>
            <div className="rounded-lg bg-violet-50/50 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-violet-600">Data Buku</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{m.bookTx.description}</div>
              <div className="text-xs text-slate-500">{m.bookTx.reference} · {formatDateID(m.bookTx.date)}</div>
              <div className="mt-1 font-mono text-sm tabular-nums text-right text-slate-900">{formatIDR(m.bookTx.amount)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Confidence {m.confidenceScore}%</span>
            {m.reasons.slice(0, 2).map((r, i) => <span key={i} className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-500">{r}</span>)}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => act(m, "APPROVE")}
                disabled={finalized || loadingId === m.id}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >Cocokkan</button>
              <button
                onClick={() => act(m, "REJECT")}
                disabled={finalized || loadingId === m.id}
                className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60"
              >Tolak</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Daftar penyesuaian tercatat ---------- */
function AdjustmentList({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const finalized = data.session.status === "FINALIZED";
  return (
    <div className="space-y-2">
      {data.adjustments.map((a) => (
        <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{getCategoryLabel(a.category)}</span>
            </div>
            <div className="mt-0.5 truncate text-sm text-slate-900">{a.description}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm tabular-nums text-slate-900">{formatIDRAccountingShort(a.signedAmount)}</span>
            {!finalized && (
              <button
                onClick={async () => {
                  try { await api.deleteAdjustment(data.session.id, a.id); toast.success("Dibatalkan."); onRefresh(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
                }}
                className="text-xs text-slate-400 hover:text-rose-600"
              >Batalkan</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}