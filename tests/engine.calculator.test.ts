import { describe, it, expect } from "vitest";
import { calculateReconciliation, type AdjustmentLike } from "@/lib/engine/calculator";

const baseInput = {
  endingBankBalance: 68181000,
  endingBookBalance: 73300000,
  matches: [],
  bankTransactions: [{ id: "B1" }, { id: "B2", adjustment: { id: "ADJ1" } }],
  bookTransactions: [{ id: "K1" }, { id: "K2", adjustment: { id: "ADJ1" } }],
};

describe("calculateReconciliation", () => {
  it("menghitung adjusted balance dua sisi & variance", () => {
    const adjustments: AdjustmentLike[] = [
      { id: "ADJ1", side: "BANK", category: "DEPOSIT_IN_TRANSIT", signedAmount: 9800000, description: "Deposit in Transit" },
      { id: "ADJ2", side: "BOOK", category: "INTEREST_INCOME", signedAmount: 145000, description: "Jasa Giro" },
    ];
    const result = calculateReconciliation({ ...baseInput, adjustments });
    expect(result.adjustedBankBalance).toBe(68181000 + 9800000);
    expect(result.adjustedBookBalance).toBe(73300000 + 145000);
    expect(result.variance).toBe(result.adjustedBankBalance - result.adjustedBookBalance);
  });

  it("isBalanced butuh variance 0, tanpa unclassified, tanpa pending suggested", () => {
    const adjustments: AdjustmentLike[] = [
      { id: "ADJ1", side: "BANK", category: "DEPOSIT_IN_TRANSIT", signedAmount: 5119000, description: "DIT" },
      { id: "ADJ2", side: "BOOK", category: "BANK_FEE", signedAmount: 0, description: "nol" },
    ];
    // variance 0: bank +5119000 => 73300000; book +0 => 73300000.
    const confirmedMatches = [{ id: "M1", isConfirmed: true, bankTxId: "B1", bookTxId: "K1" }];
    const result = calculateReconciliation({
      ...baseInput,
      adjustments,
      matches: confirmedMatches,
    });
    expect(result.variance).toBe(0);
    expect(result.isBalanced).toBe(true);
  });

  it("isBalanced false jika ada transaksi belum diklasifikasi", () => {
    const result = calculateReconciliation({ ...baseInput, adjustments: [] });
    expect(result.unclassifiedCount).toBeGreaterThan(0);
    expect(result.isBalanced).toBe(false);
  });

  it("isBalanced false jika masih ada suggested match belum di-approve", () => {
    const adjustments: AdjustmentLike[] = [
      { id: "ADJ1", side: "BANK", category: "DEPOSIT_IN_TRANSIT", signedAmount: 5119000, description: "DIT" },
    ];
    const pendingMatches = [{ id: "M1", isConfirmed: false, bankTxId: "B1", bookTxId: "K1" }];
    const result = calculateReconciliation({ ...baseInput, adjustments, matches: pendingMatches });
    expect(result.pendingSuggestedCount).toBe(1);
    expect(result.isBalanced).toBe(false);
  });

  it("transaksi yang termatch (confirmed) dianggap sudah terekonsiliasi", () => {
    const result = calculateReconciliation({
      ...baseInput,
      adjustments: [],
      matches: [{ id: "M1", isConfirmed: true, bankTxId: "B1", bookTxId: "K1" }],
    });
    // Hanya B2 (punya adjustment) & K2 (punya adjustment) yang dianggap classified;
    // B1 & K1 terekonsiliasi via match pair. Sisa = 0 unclassified.
    expect(result.unclassifiedCount).toBe(0);
  });

  it("matchRate = 2 × confirmed / total transaksi", () => {
    const result = calculateReconciliation({
      ...baseInput,
      adjustments: [],
      matches: [
        { id: "M1", isConfirmed: true, bankTxId: "B1", bookTxId: "K1" },
        { id: "M2", isConfirmed: false, bankTxId: "B2", bookTxId: "K2" },
      ],
    });
    // 1 confirmed / (2 bank + 2 book = 4) × 2 = 0.5
    expect(result.matchRate).toBeCloseTo(0.5, 5);
  });

  it("waterfall dimulai dari saldo akhir bank", () => {
    const result = calculateReconciliation({ ...baseInput, adjustments: [] });
    expect(result.waterfallSteps[0].label).toBe("Saldo Akhir Bank");
    expect(result.waterfallSteps[0].value).toBe(68181000);
  });
});
