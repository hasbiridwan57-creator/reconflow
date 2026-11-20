/**
 * Smart category suggestion — usulkan kategori penyesuaian dari sifat
 * transaksi (source, direction, kata kunci deskripsi). Pure helper, mudah dites.
 */
import type { CashDirection, AdjustmentCategory } from "@/lib/schemas/reconciliation";

export interface SuggestInput {
  source: "BANK" | "BOOK";
  direction: CashDirection;
  description: string;
}

/**
 * Usulkan kategori penyesuaian berdasarkan sumber, arah, & kata kunci deskripsi.
 * Return kategori terbaik ATAU null bila tak ada petunjuk kuat.
 */
export function suggestAdjustmentCategory(tx: SuggestInput): AdjustmentCategory | null {
  const desc = tx.description.toLowerCase();
  const has = (...keywords: string[]) => keywords.some((k) => desc.includes(k));

  if (tx.source === "BANK") {
    // Pendapatan bunga / jasa giro di sisi bank.
    if (tx.direction === "IN") {
      if (has("jasa giro", "bunga")) return "INTEREST_INCOME";
      if (has("setoran", "transfer masuk", "penerimaan", "reseller")) return "UNRECORDED_RECEIPT";
      return null;
    }
    // Pengeluaran di sisi bank.
    if (has("pajak jasa giro", "pajak bunga")) return "TAX_ON_INTEREST";
    if (has("nsf", "cek kosong", "penolakan", "bila diperlukan")) return "NSF_CHECK";
    if (has("biaya admin", "admin", "bi-fast", "biaya transfer", "penolakan")) return "BANK_FEE";
    return null;
  }

  // source === BOOK
  if (tx.direction === "IN") {
    if (has("setoran", "deposit", "withdraw")) return "DEPOSIT_IN_TRANSIT";
    return null;
  }
  if (has("cek", "bg-", "bg ", "bilyet")) return "OUTSTANDING_CHECK";
  return null;
}
