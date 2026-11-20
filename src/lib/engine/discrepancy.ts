import type { CashDirection, AdjustmentCategory } from "@/lib/schemas/reconciliation";

/**
 * Helper bersama untuk menghitung penyesuaian discrepancy (selisih nominal)
 * dengan mempertimbangkan arah arus kas (IN/OUT).
 *
 * Semantik (Gemini audit):
 *   amountDiff = bankTx.amount - bookTx.amount
 *   - direction IN: selisih efek kas (Bank - Buku) = +amountDiff
 *   - direction OUT: selisih efek kas (Bank - Buku) = -amountDiff
 *
 *   signedAmount = faultSide === "BOOK" ? selisihEfekKas : -selisihEfekKas
 *   Kategori mengikuti tanda signedAmount pada sisi yang bersangkutan.
 *
 * Contoh BBM Skenario 3:
 *   OUT, bank=12.450.000, book=12.540.000 -> amountDiff = -90.000
 *   netDiff = -amountDiff = +90.000 (OUT membalik)
 *   faultSide BOOK -> signedAmount = +90.000 -> BOOK_ERROR_ADD (BENAR)
 *
 * Dipakai oleh PATCH /matches/[matchId] dan POST /matches/manual
 * agar rumus tidak pernah divergen di dua tempat.
 */
export function resolveDiscrepancyAdjustment(
  direction: CashDirection,
  amountDiff: number,
  faultSide: "BOOK" | "BANK",
): { signedAmount: number; category: AdjustmentCategory } {
  const netDiff = direction === "IN" ? amountDiff : -amountDiff;
  const signedAmount = faultSide === "BOOK" ? netDiff : -netDiff;
  const category: AdjustmentCategory =
    faultSide === "BOOK"
      ? signedAmount > 0
        ? "BOOK_ERROR_ADD"
        : "BOOK_ERROR_DEDUCT"
      : signedAmount > 0
        ? "BANK_ERROR_ADD"
        : "BANK_ERROR_DEDUCT";

  return { signedAmount, category };
}
