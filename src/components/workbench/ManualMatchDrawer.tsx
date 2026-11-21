/**
 * Slide-Over Drawer "Cari & Pasangkan" (ala Xero + Odoo).
 * Fokus pencocokan satu transaksi sumber terhadap kandidat sisi lawan
 * berperingkat. 1-to-1 sesuai kontrak api.manualPair.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X, Search, ArrowRightLeft } from "lucide-react";
import { api, type HydratedSessionResponse } from "@/lib/api/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { rankMatchCandidates, type RankCandidateTx, type RankedCandidate } from "@/lib/engine/matchRanking";
import type { TransactionDTO } from "@/lib/session";
import type { CashDirection } from "@/lib/schemas/reconciliation";

interface Props {
  source: TransactionDTO;
  data: HydratedSessionResponse;
  onRefresh: (updated?: HydratedSessionResponse) => void;
  onClose: () => void;
  /** Buka panel auto-jurnal (untuk empty state). */
  onGoJournal: () => void;
}

function SourcePill({ source }: { source: "BANK" | "BOOK" }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${source === "BANK" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
      {source === "BANK" ? "BANK" : "BUKU"}
    </span>
  );
}

export function ManualMatchDrawer({ source, data, onRefresh, onClose, onGoJournal }: Props) {
  const finalized = data.session.status === "FINALIZED";
  const opposite = source.source === "BANK" ? "Buku" : "Bank";
  const [query, setQuery] = useState("");
  const [sameDir, setSameDir] = useState(true);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [faultSide, setFaultSide] = useState<"BOOK" | "BANK">("BOOK");
  const [loading, setLoading] = useState(false);

  // Kandidat sisi lawan yang belum terselesaikan (tanpa penyesuaian).
  const oppositeUnmatched = useMemo(
    () =>
      (source.source === "BANK" ? data.unmatchedBook : data.unmatchedBank).filter(
        (t) => !t.adjustmentId,
      ),
    [source.source, data],
  );

  const ranked = useMemo(() => {
    const list = rankMatchCandidates(
      { amount: source.amount, direction: source.direction as CashDirection, date: source.date },
      oppositeUnmatched as readonly RankCandidateTx[],
      sameDir,
    );
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const digits = q.replace(/\D/g, "");
    return list.filter(({ item }) =>
      item.description.toLowerCase().includes(q)
      || (item.reference || "").toLowerCase().includes(q)
      || (digits.length > 0 && String(item.amount).includes(digits)),
    );
  }, [source, oppositeUnmatched, sameDir, query]);

  // Reset pilihan saat daftar berubah.
  useEffect(() => { setCandidateId(null); }, [sameDir, query]);

  // Esc tutup drawer + lock scroll.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !loading) onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, loading]);

  const selected = ranked.find((r) => r.item.id === candidateId);
  const oppositeDir = selected && selected.item.direction !== source.direction;
  const totalBank = source.source === "BANK" ? source.amount : (selected?.item.amount ?? 0);
  const totalBook = source.source === "BOOK" ? source.amount : (selected?.item.amount ?? 0);
  const diff = totalBank - totalBook;

  async function pair() {
    if (!candidateId || oppositeDir) return;
    setLoading(true);
    try {
      const bankTxId = source.source === "BANK" ? source.id : candidateId;
      const bookTxId = source.source === "BOOK" ? source.id : candidateId;
      const body: Record<string, unknown> = { bankTxId, bookTxId };
      if (diff !== 0) body.discrepancyResolution = { faultSide };
      const updated = await api.manualPair(data.session.id, body);
      toast.success("Pasangan manual dibuat.");
      onRefresh(updated);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Cari pasangan untuk ${source.description}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => { if (!loading) onClose(); }} />
      {/* Panel */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl focus:outline-none">
        {/* Header sticky */}
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <SourcePill source={source.source} />
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${source.direction === "IN" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                  {source.direction === "IN" ? "Masuk" : "Keluar"}
                </span>
                <span className="text-[10px] text-slate-400">Sisi {source.source === "BANK" ? "Bank" : "Buku"}</span>
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{source.description}</div>
              <div className="text-xs text-slate-500">{source.reference || "—"} · {formatDateID(source.date)}</div>
              <div className="mt-0.5 font-mono text-sm tabular-nums text-slate-900">{formatIDR(source.amount)}</div>
            </div>
            <button type="button" onClick={() => { if (!loading) onClose(); }} disabled={loading} aria-label="Tutup" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Pencarian & filter */}
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari deskripsi, nomor referensi, atau nominal…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={sameDir} onChange={(e) => setSameDir(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              Hanya arah sama ({source.direction === "IN" ? "Masuk" : "Keluar"})
            </label>
          </div>
        </div>

        {/* Daftar kandidat */}
        <div className="flex-1 overflow-y-auto p-4">
          {ranked.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-sm font-medium text-slate-700">Tidak ditemukan transaksi pasangan di sisi {opposite}.</div>
              <p className="mt-1 text-xs text-slate-500">
                Jika ini adalah biaya bank / bunga / transaksi belum tercatat, gunakan opsi Catat Jurnal Penyesuaian.
              </p>
              <button type="button" onClick={onGoJournal} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Lihat Rekomendasi Auto-Jurnal
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {ranked.map(({ item, reason }: RankedCandidate) => (
                <li key={item.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${candidateId === item.id ? "border-teal-400 ring-2 ring-teal-500 bg-teal-50/40" : "border-slate-200 hover:border-slate-300"}`}>
                    <input
                      type="radio"
                      name="candidate"
                      checked={candidateId === item.id}
                      onChange={() => setCandidateId(item.id)}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{item.description}</div>
                      <div className="text-xs text-slate-500">{item.reference || "—"} · {formatDateID(item.date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm tabular-nums text-slate-900">{formatIDR(item.amount)}</div>
                      <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{reason}</span>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer sticky — kalkulator selisih */}
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Total Bank: <b className="font-mono tabular-nums text-slate-900">{formatIDR(totalBank)}</b></span>
            <span>Total Buku: <b className="font-mono tabular-nums text-slate-900">{formatIDR(totalBook)}</b></span>
            <span>Selisih: <b className={`font-mono tabular-nums ${oppositeDir ? "text-amber-600" : diff === 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatIDR(diff)}</b>{oppositeDir && <span className="ml-1 text-amber-600">(Arah berlawanan)</span>}</span>
          </div>
          {oppositeDir && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-700">
              Tidak dapat dipasangkan: arah arus kas berlawanan (Masuk vs Keluar). Pilih kandidat berarah sama.
            </div>
          )}
          {diff !== 0 && selected && (
            <div className="mt-2">
              <label className="block text-[10px] text-slate-500">Sisi kesalahan atas selisih {formatIDR(diff)}:</label>
              <select
                value={faultSide}
                onChange={(e) => setFaultSide(e.target.value as "BOOK" | "BANK")}
                disabled={finalized}
                className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-teal-500 disabled:bg-slate-50"
              >
                <option value="BOOK">Kesalahan Buku — Buat Jurnal Penyesuaian</option>
                <option value="BANK">Kesalahan Bank — Tanpa Jurnal</option>
              </select>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={pair}
              disabled={finalized || !candidateId || loading || !!oppositeDir}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {loading ? "Memproses…" : "Pasangkan Sekarang"}
            </button>
            <button type="button" onClick={() => { if (!loading) onClose(); }} disabled={loading} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50">
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
