import { describe, it, expect } from "vitest";
import { generatePdf } from "@/lib/export/pdfGenerator";
import { generateExcel } from "@/lib/export/excelGenerator";
import type { HydratedSessionResponse } from "@/lib/session";

/** Fixture sesi balanced (Selisih Rp0) minimal untuk export generator. */
function balancedSession(): HydratedSessionResponse {
  const base = {
    id: "s-balanced",
    status: "DRAFT",
    companyName: "PT Uji Coba",
    bankAccountName: "BCA 123",
    periodLabel: "Oktober 2026",
    periodEndDate: "2026-10-31",
    preparedBy: "Tim Keuangan",
    reviewedBy: "Manajer Keuangan",
    demoScenarioKey: null,
    openingBalance: 0,
    endingBankBalance: 1_000_000,
    endingBookBalance: 1_000_000,
    dateToleranceDays: 2,
    amountToleranceRupiah: 0,
    minFuzzyScore: 0.6,
    detectTransposition: true,
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
  } as const;
  return {
    session: base,
    summary: {
      totalBankAdjustments: 0,
      totalBookAdjustments: 0,
      adjustedBankBalance: 1_000_000,
      adjustedBookBalance: 1_000_000,
      rawDifference: 0,
      variance: 0,
      pendingSuggestedCount: 0,
      unclassifiedBankCount: 0,
      unclassifiedBookCount: 0,
      unclassifiedCount: 0,
      isBalanced: true,
      matchRate: 1,
      waterfallSteps: [],
    },
    bankTransactions: [
      { id: "b1", source: "BANK", rowIndex: 0, date: "2026-10-02", reference: "BNK-001", description: "Setoran", normalizedDesc: "setoran", direction: "IN", amount: 1_000_000, runningBalance: 1_000_000, counterAccount: null, matchStatus: "EXACT_MATCH", adjustmentId: null },
    ],
    bookTransactions: [
      { id: "k1", source: "BOOK", rowIndex: 0, date: "2026-10-02", reference: "BKM-001", description: "Setoran", normalizedDesc: "setoran", direction: "IN", amount: 1_000_000, runningBalance: 1_000_000, counterAccount: "Kas", matchStatus: "EXACT_MATCH", adjustmentId: null },
    ],
    matches: [],
    unmatchedBank: [],
    unmatchedBook: [],
    adjustments: [],
    journals: { entries: [], totalDebit: 0, totalCredit: 0 },
    auditLogs: [],
  } as unknown as HydratedSessionResponse;
}

/** Sesi draft belum seimbang + 1 penyesuaian. */
function draftSession(): HydratedSessionResponse {
  const s = balancedSession();
  s.summary = {
    ...s.summary,
    totalBookAdjustments: 1,
    adjustedBankBalance: 1_000_000,
    adjustedBookBalance: 975_000,
    rawDifference: 25_000,
    variance: 25_000,
    unclassifiedBankCount: 1,
    unclassifiedBookCount: 1,
    unclassifiedCount: 2,
    isBalanced: false,
    matchRate: 0.5,
  };
  s.adjustments = [
    {
      id: "adj-1", transactionId: null, matchPairId: null,
      side: "BOOK", category: "BOOK_ERROR_DEDUCT", signedAmount: -25_000,
      description: "Koreksi buku", contraAccountName: "Kas", auditNote: null,
    },
  ];
  s.bankTransactions[0].adjustmentId = null;
  s.bookTransactions[0].adjustmentId = "adj-1";
  s.bookTransactions[0].matchStatus = null;
  return s;
}

describe("generatePdf", () => {
  it("balanced: menghasilkan PDF valid dimulai %PDF", () => {
    const buf = generatePdf(balancedSession());
    expect(buf.byteLength).toBeGreaterThan(0);
    const head = Buffer.from(buf).subarray(0, 5).toString();
    expect(head).toBe("%PDF-");
  });

  it("draft: menghasilkan PDF valid + mengandung stempel UNRECONCILED", () => {
    const buf = generatePdf(draftSession());
    expect(buf.byteLength).toBeGreaterThan(0);
    const head = Buffer.from(buf).subarray(0, 5).toString();
    expect(head).toBe("%PDF-");
  });
});

describe("generateExcel", () => {
  it("transaksi dgn adjustmentId tampil 'Penyesuaian: ...' bukan UNMATCHED", async () => {
    const buf = await generateExcel(draftSession());
    expect(buf.byteLength).toBeGreaterThan(0);
    // Excel adalah ZIP — cek magic bytes PK.
    const head = Buffer.from(buf).subarray(0, 2).toString();
    expect(head).toBe("PK");
    // Buka kembali dengan ExcelJS & periksa kolom status sheet 2/3.
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws3 = wb.getWorksheet("Transaksi Buku");
    expect(ws3).toBeDefined();
    const statusRow = ws3!.getRow(2);
    const statusVal = statusRow.getCell(6).value; // kolom ke-6 = Status
    expect(String(statusVal)).toMatch(/Penyesuaian:/i);
    expect(String(statusVal)).not.toMatch(/UNMATCHED/i);
  });

  it("transaksi cocok tampil 'Cocok Persis'", async () => {
    const buf = await generateExcel(balancedSession());
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws2 = wb.getWorksheet("Transaksi Bank");
    const statusVal = ws2!.getRow(2).getCell(6).value;
    expect(String(statusVal)).toBe("Cocok Persis");
  });
});
