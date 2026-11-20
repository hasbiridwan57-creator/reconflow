/**
 * Smart category suggestion — usulkan kategori penyesuaian dari sifat
 * transaksi (source, direction, kata kunci deskripsi) + konteks pasangan
 * cocok (untuk deteksi debit ganda). Pure helper, mudah dites.
 */
import type { CashDirection, AdjustmentCategory } from "@/lib/schemas/reconciliation";
import { normalizeDescription, computeTextSimilarity } from "@/lib/engine/textSimilarity";
import { getAdjustmentImpactLabel } from "@/lib/engine/adjustments";

export interface SuggestInput {
  source: "BANK" | "BOOK";
  direction: CashDirection;
  description: string;
  /** Tanggal ISO (YYYY-MM-DD) — dipakai untuk deteksi debit ganda. */
  date?: string;
  /** Nominal absolut — dipakai untuk deteksi debit ganda. */
  amount?: number;
}

export interface CategorySuggestion {
  category: AdjustmentCategory;
  reason: string;
  impactLabel: string;
  isAnomaly: boolean;
}

export interface MatchedBankTxContext {
  date: string;
  amount: number;
  direction: CashDirection;
  normalizedDesc: string;
}

/**
 * Usulkan kategori penyesuaian berdasarkan sumber, arah, kata kunci deskripsi,
 * dan (opsional) konteks transaksi bank yang sudah termatch.
 * Return kategori terbaik ATAU null bila tak ada petunjuk kuat.
 */
export function suggestAdjustmentCategory(
  tx: SuggestInput,
  context?: { matchedBankTxs?: MatchedBankTxContext[] },
): CategorySuggestion | null {
  const desc = tx.description.toLowerCase();
  const has = (...keywords: string[]) => keywords.some((k) => desc.includes(k));

  if (tx.source === "BANK") {
    if (tx.direction === "OUT") {
      // 1. Deteksi debit ganda (double charge) — anomali.
      if (tx.date != null && tx.amount != null && context?.matchedBankTxs) {
        const normalizedTx = normalizeDescription(tx.description);
        const isDouble = context.matchedBankTxs.some(
          (m) =>
            m.date === tx.date &&
            m.amount === tx.amount &&
            m.direction === "OUT" &&
            computeTextSimilarity(normalizedTx, m.normalizedDesc) >= 0.7,
        );
        if (isDouble) {
          return {
            category: "BANK_ERROR_ADD",
            reason: "Indikasi Debit Ganda (Double Charge Bank)",
            impactLabel: getAdjustmentImpactLabel("BANK_ERROR_ADD"),
            isAnomaly: true,
          };
        }
      }
      // 2. Debit tak dikenal — anomali.
      if (has("unknown", "suspicious")) {
        return {
          category: "UNRECORDED_EXPENSE",
          reason: "Transaksi tak dikenal — perlu investigasi audit",
          impactLabel: getAdjustmentImpactLabel("UNRECORDED_EXPENSE"),
          isAnomaly: true,
        };
      }
      // 3. Bank OUT rutin — pajak SEBELUM biaya/admin.
      if (has("pajak jasa giro", "pajak bunga")) {
        return {
          category: "TAX_ON_INTEREST",
          reason: "Pajak atas jasa giro / bunga bank",
          impactLabel: getAdjustmentImpactLabel("TAX_ON_INTEREST"),
          isAnomaly: false,
        };
      }
      // "biaya"/"admin"/"bi-fast"/"token" dicek SEBELUM NSF/cek kosong
      // agar "DB BIAYA PENOLAKAN CEK KOSONG" → BANK_FEE (bukan NSF_CHECK).
      if (has("biaya", "admin", "bi-fast", "token")) {
        return {
          category: "BANK_FEE",
          reason: "Biaya administrasi / transaksi bank",
          impactLabel: getAdjustmentImpactLabel("BANK_FEE"),
          isAnomaly: false,
        };
      }
      if (has("nsf", "cek kosong", "retur")) {
        return {
          category: "NSF_CHECK",
          reason: "Cek kosong / penolakan NSF",
          impactLabel: getAdjustmentImpactLabel("NSF_CHECK"),
          isAnomaly: false,
        };
      }
      return null;
    }

    // Bank IN rutin.
    if (has("jasa giro", "bunga")) {
      return {
        category: "INTEREST_INCOME",
        reason: "Pendapatan bunga / jasa giro",
        impactLabel: getAdjustmentImpactLabel("INTEREST_INCOME"),
        isAnomaly: false,
      };
    }
    if (has("setoran", "transfer", "reseller", "penerimaan")) {
      return {
        category: "UNRECORDED_RECEIPT",
        reason: "Penerimaan yang belum tercatat di buku",
        impactLabel: getAdjustmentImpactLabel("UNRECORDED_RECEIPT"),
        isAnomaly: false,
      };
    }
    return null;
  }

  // source === BOOK
  if (tx.direction === "IN") {
    if (has("setoran", "deposit", "withdraw")) {
      return {
        category: "DEPOSIT_IN_TRANSIT",
        reason: "Setoran dalam perjalanan (belum masuk rekening koran)",
        impactLabel: getAdjustmentImpactLabel("DEPOSIT_IN_TRANSIT"),
        isAnomaly: false,
      };
    }
    return null;
  }
  if (has("cek", "bg-", "bg ", "bilyet")) {
    return {
      category: "OUTSTANDING_CHECK",
      reason: "Cek/BG yang belum dicairkan penerima",
      impactLabel: getAdjustmentImpactLabel("OUTSTANDING_CHECK"),
      isAnomaly: false,
    };
  }
  return null;
}