/**
 * Calculator engine: hitung Adjusted Balance, KPI, & Waterfall data.
 * Semua kalkulasi deterministik. Lihat RECONFLOW_MASTER_SPEC.md §8.4 & §3.2.
 */
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";

export interface AdjustmentLike {
  id: string;
  side: "BANK" | "BOOK";
  category: AdjustmentCategory;
  signedAmount: number;
  description: string;
}

export interface MatchLike {
  id: string;
  isConfirmed: boolean;
  /** ID transaksi bank & buku yang dipasangkan (untuk deteksi "sudah terekonsiliasi"). */
  bankTxId?: string;
  bookTxId?: string;
}

export interface TransactionLike {
  id: string;
  adjustment?: { id: string } | null;
}

export interface CalculatorInput {
  endingBankBalance: number;
  endingBookBalance: number;
  adjustments: AdjustmentLike[];
  matches: MatchLike[];
  bankTransactions: TransactionLike[];
  bookTransactions: TransactionLike[];
}

export interface WaterfallStep {
  label: string;
  value: number;
  base: number;
  kind: "total" | "delta";
  color: "indigo" | "emerald" | "rose" | "amber";
}

export interface ReconciliationSummary {
  totalBankAdjustments: number;
  totalBookAdjustments: number;
  adjustedBankBalance: number;
  adjustedBookBalance: number;
  rawDifference: number;
  variance: number;
  pendingSuggestedCount: number;
  unclassifiedBankCount: number;
  unclassifiedBookCount: number;
  unclassifiedCount: number;
  isBalanced: boolean;
  matchRate: number;
  waterfallSteps: WaterfallStep[];
}

const CATEGORY_LABEL: Record<AdjustmentCategory, string> = {
  DEPOSIT_IN_TRANSIT: "Setoran dalam Perjalanan",
  OUTSTANDING_CHECK: "Cek Beredar",
  BANK_ERROR_ADD: "Koreksi Bank (+)",
  BANK_ERROR_DEDUCT: "Koreksi Bank (-)",
  INTEREST_INCOME: "Jasa Giro / Bunga",
  UNRECORDED_RECEIPT: "Penerimaan Belum Dicatat",
  BANK_FEE: "Biaya Admin Bank",
  TAX_ON_INTEREST: "Pajak Jasa Giro",
  NSF_CHECK: "Cek Kosong (NSF)",
  UNRECORDED_EXPENSE: "Beban Belum Dicatat",
  BOOK_ERROR_ADD: "Koreksi Buku (+)",
  BOOK_ERROR_DEDUCT: "Koreksi Buku (-)",
};

export function calculateReconciliation(input: CalculatorInput): ReconciliationSummary {
  const bankAdj = input.adjustments.filter((a) => a.side === "BANK");
  const bookAdj = input.adjustments.filter((a) => a.side === "BOOK");

  const totalBankAdjustments = bankAdj.reduce((sum, a) => sum + a.signedAmount, 0);
  const totalBookAdjustments = bookAdj.reduce((sum, a) => sum + a.signedAmount, 0);

  const adjustedBankBalance = input.endingBankBalance + totalBankAdjustments;
  const adjustedBookBalance = input.endingBookBalance + totalBookAdjustments;

  const rawDifference = input.endingBankBalance - input.endingBookBalance;
  const variance = adjustedBankBalance - adjustedBookBalance;

  const pendingSuggestedCount = input.matches.filter((m) => !m.isConfirmed).length;
  // Transaksi sudah terekonsiliasi jika punya penyesuaian ATAU termasuk dalam
  // pasangan match yang sudah dikonfirmasi (EXACT/SUGGESTED-approved/MANUAL/DISCREPANCY).
  const matchedBankTxIds = new Set(
    input.matches.filter((m) => m.isConfirmed && m.bankTxId).map((m) => m.bankTxId!),
  );
  const matchedBookTxIds = new Set(
    input.matches.filter((m) => m.isConfirmed && m.bookTxId).map((m) => m.bookTxId!),
  );
  const unclassifiedBankCount = input.bankTransactions.filter(
    (tx) => !tx.adjustment && !matchedBankTxIds.has(tx.id),
  ).length;
  const unclassifiedBookCount = input.bookTransactions.filter(
    (tx) => !tx.adjustment && !matchedBookTxIds.has(tx.id),
  ).length;
  const unclassifiedCount = unclassifiedBankCount + unclassifiedBookCount;

  const isBalanced = variance === 0 && unclassifiedCount === 0 && pendingSuggestedCount === 0;

  // matchRate = 2 × confirmedMatches / (totalBank + totalBook) × 100
  const confirmedCount = input.matches.filter((m) => m.isConfirmed).length;
  const totalTx = input.bankTransactions.length + input.bookTransactions.length;
  const matchRate = totalTx > 0 ? (2 * confirmedCount) / totalTx : 0;

  // === Waterfall: Jembatan Bank ===
  const waterfallSteps: WaterfallStep[] = [];
  let running = input.endingBankBalance;

  waterfallSteps.push({
    label: "Saldo Akhir Bank",
    value: input.endingBankBalance,
    base: 0,
    kind: "total",
    color: "indigo",
  });

  // Agregasi per kategori sisi BANK.
  const bankByCategory = new Map<AdjustmentCategory, number>();
  for (const a of bankAdj) {
    bankByCategory.set(a.category, (bankByCategory.get(a.category) ?? 0) + a.signedAmount);
  }
  for (const [category, amount] of bankByCategory) {
    if (amount === 0) continue;
    const next = running + amount;
    waterfallSteps.push({
      label: CATEGORY_LABEL[category],
      value: amount,
      base: Math.min(running, next),
      kind: "delta",
      color: amount > 0 ? "emerald" : "rose",
    });
    running = next;
  }

  waterfallSteps.push({
    label: "Saldo Bank Disesuaikan",
    value: adjustedBankBalance,
    base: 0,
    kind: "total",
    color: variance === 0 ? "emerald" : "amber",
  });

  return {
    totalBankAdjustments,
    totalBookAdjustments,
    adjustedBankBalance,
    adjustedBookBalance,
    rawDifference,
    variance,
    pendingSuggestedCount,
    unclassifiedBankCount,
    unclassifiedBookCount,
    unclassifiedCount,
    isBalanced,
    matchRate,
    waterfallSteps,
  };
}

/** Label kategori untuk UI. */
export function getCategoryLabel(category: AdjustmentCategory): string {
  return CATEGORY_LABEL[category];
}
