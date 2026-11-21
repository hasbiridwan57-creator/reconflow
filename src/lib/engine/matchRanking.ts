/**
 * Ranking kandidat pencocokan manual (Find & Match).
 * Pure helper — mudah dites di Vitest, tanpa I/O.
 *
 * Kandidat diurutkan berdasar kemiripan terhadap transaksi sumber:
 *  1) Arah sama & nominal persis sama (skor tertinggi).
 *  2) Arah sama & nominal terdekat (selisih nominal kecil menang).
 *  3) Tie-breaker: jarak tanggal paling dekat.
 *
 * Arah berbeda SELALU disaring (return kosong bila strict same-direction).
 */
import type { CashDirection } from "@/lib/schemas/reconciliation";

export interface RankSourceTx {
  amount: number;
  direction: CashDirection;
  /** Tanggal ISO (YYYY-MM-DD). */
  date: string;
}

export interface RankCandidateTx {
  id: string;
  amount: number;
  direction: CashDirection;
  date: string;
  description: string;
  reference?: string;
}

export interface RankedCandidate<T extends RankCandidateTx = RankCandidateTx> {
  item: T;
  score: number;
  /** Badge alasan singkat, mis. "Nominal sama", "Selisih Rp6.500", "Selisih 2 hari". */
  reason: string;
}

/** Selisih hari antar dua tanggal ISO (absolut). */
export function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(`${isoA}T00:00:00Z`).getTime();
  const b = new Date(`${isoB}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((a - b) / 86_400_000));
}

/**
 * Susun kandidat sisi lawan berperingkat untuk satu transaksi sumber.
 * @param source transaksi sumber (yang sedang dicocokkan).
 * @param candidates daftar item sisi lawan yang belum terselesaikan.
 * @param sameDirectionOnly filter arah sama (default true). false = sertakan arah beda (skor rendah).
 */
export function rankMatchCandidates<T extends RankCandidateTx>(
  source: RankSourceTx,
  candidates: readonly T[],
  sameDirectionOnly = true,
): RankedCandidate<T>[] {
  interface Aug { item: T; reason: string; same: boolean; exact: boolean; amountDiff: number; dayDiff: number }
  const aug: Aug[] = [];

  for (const item of candidates) {
    const same = item.direction === source.direction;
    if (sameDirectionOnly && !same) continue;

    const amountDiff = Math.abs(source.amount - item.amount);
    const exact = amountDiff === 0;
    const dayDiff = daysBetween(source.date, item.date);

    // Badge alasan.
    const parts: string[] = [];
    if (exact) parts.push("Nominal sama");
    else parts.push(`Selisih ${formatShortIDR(amountDiff)}`);
    if (dayDiff === 0) parts.push("Hari sama");
    else if (Number.isFinite(dayDiff)) parts.push(`Selisih ${dayDiff} hari`);

    aug.push({ item, reason: parts.join(" · "), same, exact, amountDiff, dayDiff });
  }

  // Urutan strictly monotonic:
  // 1) arah sama > arah beda, 2) nominal persis > tidak, 3) amountDiff terkecil, 4) dayDiff terkecil.
  aug.sort((a, b) => {
    if (a.same !== b.same) return a.same ? -1 : 1;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
    return a.dayDiff - b.dayDiff;
  });

  // Skor ordinal (lebih tinggi = lebih cocok) — konsumen tak wajib memakainya.
  return aug.map((a, i) => ({ item: a.item, reason: a.reason, score: aug.length - i }));
}

/** Format ringkas Rp untuk badge alasan (tanpa dependensi format utama agar helper tetap pure). */
function formatShortIDR(n: number): string {
  const rounded = Math.round(n);
  return `Rp${rounded.toLocaleString("id-ID")}`;
}
