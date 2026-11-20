/**
 * Helper penyesuaian terpusat (Zero Drift).
 * Dipakai bersama oleh POST /adjustments, PATCH /adjustments/[adjId],
 * dan endpoint baru POST /adjustments/bulk.
 */
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";

/** Kategori yang memengaruhi SALDO BANK (tidak dijurnal). */
export const BANK_CATEGORIES: ReadonlySet<string> = new Set([
  "DEPOSIT_IN_TRANSIT",
  "OUTSTANDING_CHECK",
  "BANK_ERROR_ADD",
  "BANK_ERROR_DEDUCT",
]);

/** Kategori yang MENAMBAH saldo sisi terkait (positif). */
export const POSITIVE_CATEGORIES: ReadonlySet<string> = new Set([
  "DEPOSIT_IN_TRANSIT",
  "BANK_ERROR_ADD",
  "INTEREST_INCOME",
  "UNRECORDED_RECEIPT",
  "BOOK_ERROR_ADD",
]);

/** Sisi dari kategori. */
export function getAdjustmentSide(category: AdjustmentCategory): "BANK" | "BOOK" {
  return BANK_CATEGORIES.has(category) ? "BANK" : "BOOK";
}

/** Tanda dari kategori untuk nominal absolut tertentu. */
export function getSignedAmount(category: AdjustmentCategory, absAmount: number): number {
  return POSITIVE_CATEGORIES.has(category) ? absAmount : -absAmount;
}

/** COA default sisi BOOK bila user tak mengisi akun lawan. */
export function defaultContraAccount(category: AdjustmentCategory): string {
  const map: Partial<Record<AdjustmentCategory, string>> = {
    INTEREST_INCOME: "Pendapatan Jasa Giro",
    UNRECORDED_RECEIPT: "Piutang Usaha",
    BANK_FEE: "Beban Administrasi Bank",
    TAX_ON_INTEREST: "Beban Pajak Jasa Giro",
    NSF_CHECK: "Piutang Usaha (Cek Kosong)",
    UNRECORDED_EXPENSE: "Beban Lain-lain",
    BOOK_ERROR_ADD: "Koreksi Beban / Selisih Pembukuan",
    BOOK_ERROR_DEDUCT: "Koreksi Beban / Selisih Pembukuan",
  };
  return map[category] ?? "Koreksi Beban / Selisih Pembukuan";
}

/** Hitung side + signedAmount + contraAccountName final dari kategori & nominal. */
export function buildAdjustmentFields(
  category: AdjustmentCategory,
  rawAmount: number,
  contraAccountName?: string | null,
): { side: "BANK" | "BOOK"; signedAmount: number; contraAccountName: string | null } {
  const side = getAdjustmentSide(category);
  const absAmount = Math.abs(Math.round(rawAmount));
  const signedAmount = getSignedAmount(category, absAmount);
  const finalContra = side === "BOOK" && !contraAccountName
    ? defaultContraAccount(category)
    : (contraAccountName ?? null);
  return { side, signedAmount, contraAccountName: finalContra };
}

/** Label dampak manusiawi untuk UI. */
export function getAdjustmentImpactLabel(category: AdjustmentCategory): string {
  const side = getAdjustmentSide(category);
  if (side === "BOOK") {
    // Beban/pendapatan bank yang dicatat ke buku (diakui di jurnal), bedakan dari koreksi buku murni.
    if (category === "BANK_FEE" || category === "TAX_ON_INTEREST") {
      return "Beban Bank · Auto Jurnal";
    }
    if (category === "NSF_CHECK" || category === "UNRECORDED_EXPENSE") {
      return "Beban Belum Tercatat · Auto Jurnal";
    }
    return category.startsWith("BOOK_ERROR_")
      ? "Koreksi Buku · Auto Jurnal"
      : "Catat ke Buku · Auto Jurnal";
  }
  if (category === "DEPOSIT_IN_TRANSIT" || category === "OUTSTANDING_CHECK") {
    return "Pending di Bank · Tanpa Jurnal";
  }
  return "Koreksi Bank · Tanpa Jurnal";
}