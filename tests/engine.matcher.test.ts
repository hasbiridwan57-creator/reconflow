import { describe, it, expect } from "vitest";
import { runMatchingEngine, type MatchCandidateTx } from "@/lib/engine/matcher";
import { DEFAULT_MATCHING_CONFIG } from "@/lib/demo/scenarios";

function tx(
  id: string,
  date: string,
  desc: string,
  amount: number,
  direction: "IN" | "OUT",
  reference = "",
): MatchCandidateTx {
  return {
    id,
    date,
    reference,
    description: desc,
    normalizedDesc: desc.toLowerCase(),
    direction,
    amount,
    source: "BANK",
  };
}

describe("runMatchingEngine — Pass 1 EXACT_MATCH", () => {
  it("mencocokkan tanggal+nominal+arah identik dengan confidence 100", () => {
    const bank = [tx("B1", "2026-10-05", "QRIS Settlement", 14500000, "IN")];
    const book = [tx("K1", "2026-10-05", "Penjualan QRIS", 14500000, "IN")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("EXACT_MATCH");
    expect(result[0].confidenceScore).toBe(100);
    expect(result[0].isConfirmed).toBe(true);
  });

  it("tidak mencocokkan jika arah berbeda (IN vs OUT)", () => {
    const bank = [tx("B1", "2026-10-05", "Setoran", 5000000, "IN")];
    const book = [tx("K1", "2026-10-05", "Penarikan", 5000000, "OUT")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    expect(result).toHaveLength(0);
  });

  it("tidak mencocokkan jika nominal berbeda di Pass 1", () => {
    const bank = [tx("B1", "2026-10-05", "Setoran", 5000000, "IN")];
    const book = [tx("K1", "2026-10-05", "Setoran", 5000001, "IN")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    expect(result.find((r) => r.status === "EXACT_MATCH")).toBeUndefined();
  });
});

describe("runMatchingEngine — Pass 2 SUGGESTED_MATCH", () => {
  it("menyarankan pasangan dengan selisih tanggal dalam toleransi", () => {
    const bank = [tx("B1", "2026-10-16", "Kliring Catering BUMN", 18750000, "IN")];
    const book = [tx("K1", "2026-10-15", "Pembayaran Catering Event BUMN", 18750000, "IN")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("SUGGESTED_MATCH");
    expect(result[0].isConfirmed).toBe(false);
    expect(result[0].dateDiffDays).toBe(1);
  });

  it("tolak pasangan dengan selisih tanggal melebihi toleransi", () => {
    const config = { ...DEFAULT_MATCHING_CONFIG, dateToleranceDays: 3 };
    const bank = [tx("B1", "2026-10-20", "Setoran Tunai", 9000000, "IN")];
    const book = [tx("K1", "2026-10-10", "Setoran Tunai", 9000000, "IN")];
    const result = runMatchingEngine(bank, book, config);
    expect(result).toHaveLength(0);
  });
});

describe("runMatchingEngine — Pass 3 Transposition Error", () => {
  it("mendeteksi transposition error (selisih habis dibagi 9)", () => {
    const bank = [tx("B1", "2026-10-05", "Fleet Card BBM", 12450000, "OUT")];
    const book = [tx("K1", "2026-10-05", "Tagihan BBM Fleet Card", 12540000, "OUT")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("DISCREPANCY_MATCH");
    expect(result[0].isConfirmed).toBe(false);
    expect(Math.abs(result[0].amountDiff)).toBe(90000);
    expect(result[0].reasons.some((r) => r.toLowerCase().includes("transposition"))).toBe(true);
  });

  it("tidak mendeteksi transposition jika teks sangat berbeda & tanpa ref", () => {
    const bank = [tx("B1", "2026-10-05", "Alpha Beta Gamma", 12450000, "OUT")];
    const book = [tx("K1", "2026-10-05", "Zulu Yankee Xray", 12540000, "OUT")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    expect(result.find((r) => r.status === "DISCREPANCY_MATCH")).toBeUndefined();
  });

  it("cabang non-kelipatan-9: tanggal & vendor cocok namun selisih nominal (confidence <= 85)", () => {
    // Selisih 100.000 (bukan kelipatan 9? 100000 % 9 = 1) — teks mirip, tanggal sama.
    const bank = [tx("B1", "2026-10-05", "Pembayaran Vendor Jaya Makmur", 5000000, "OUT")];
    const book = [tx("K1", "2026-10-05", "Pembayaran Vendor Jaya Makmur Sejahtera", 5100000, "OUT")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    const disc = result.find((r) => r.status === "DISCREPANCY_MATCH");
    expect(disc).toBeDefined();
    expect(disc!.confidenceScore).toBeLessThanOrEqual(85);
    expect(disc!.reasons.some((r) => r.includes("selisih nominal"))).toBe(true);
  });
});

describe("runMatchingEngine — Anti Double-Matching (greedy bipartite)", () => {
  it("tidak mencocokkan dua transaksi bank identik ke satu transaksi buku", () => {
    // Dua transaksi bank duplikat (double charge) hanya boleh termatch sekali.
    const bank = [
      tx("B1", "2026-10-14", "Autodebit Asuransi Allianz", 8500000, "OUT"),
      tx("B2", "2026-10-14", "Autodebit Asuransi Allianz", 8500000, "OUT"),
    ];
    const book = [tx("K1", "2026-10-14", "Premi Asuransi Armada Allianz", 8500000, "OUT")];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    const confirmed = result.filter((r) => r.isConfirmed);
    expect(confirmed).toHaveLength(1);
    // Salah satu dari B1/B2 termatch, satu lainnya tetap unmatched.
    const matchedBankIds = new Set(confirmed.map((r) => r.bankTxId));
    expect(matchedBankIds.size).toBe(1);
  });

  it("tidak ada transaksi yang termatch dua kali (greedy konsisten)", () => {
    const bank = [
      tx("B1", "2026-10-05", "QRIS Settlement", 10000000, "IN"),
      tx("B2", "2026-10-05", "QRIS Settlement", 10000000, "IN"),
    ];
    const book = [
      tx("K1", "2026-10-05", "Penjualan QRIS", 10000000, "IN"),
      tx("K2", "2026-10-05", "Penjualan QRIS", 10000000, "IN"),
    ];
    const result = runMatchingEngine(bank, book, DEFAULT_MATCHING_CONFIG);
    const bankIds = result.map((r) => r.bankTxId);
    const bookIds = result.map((r) => r.bookTxId);
    expect(new Set(bankIds).size).toBe(bankIds.length);
    expect(new Set(bookIds).size).toBe(bookIds.length);
  });
});
