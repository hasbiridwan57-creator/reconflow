import { describe, it, expect } from "vitest";
import { generateAdjustingJournals, type AdjustmentForJournal } from "@/lib/engine/journals";

describe("generateAdjustingJournals", () => {
  it("HANYA penyesuaian sisi BUKU yang menghasilkan jurnal", () => {
    const adjustments: AdjustmentForJournal[] = [
      { id: "A1", side: "BANK", category: "OUTSTANDING_CHECK", signedAmount: -4600000, description: "Cek Beredar" },
      { id: "A2", side: "BOOK", category: "BANK_FEE", signedAmount: -35000, description: "Biaya Admin Bank" },
    ];
    const result = generateAdjustingJournals(adjustments);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].adjustmentId).toBe("A2");
  });

  it("kas bertambah (signedAmount > 0): Debit Kas, Kredit akun lawan", () => {
    const adjustments: AdjustmentForJournal[] = [
      { id: "A1", side: "BOOK", category: "INTEREST_INCOME", signedAmount: 145000, description: "Jasa Giro" },
    ];
    const result = generateAdjustingJournals(adjustments);
    const lines = result.entries[0].lines;
    expect(lines[0]).toEqual({ accountName: "Kas di Bank", debit: 145000, credit: 0 });
    expect(lines[1]).toEqual({ accountName: "Pendapatan Jasa Giro", debit: 0, credit: 145000 });
  });

  it("kas berkurang (signedAmount < 0): Debit akun lawan, Kredit Kas", () => {
    const adjustments: AdjustmentForJournal[] = [
      { id: "A1", side: "BOOK", category: "NSF_CHECK", signedAmount: -15000000, description: "Cek Kosong" },
    ];
    const result = generateAdjustingJournals(adjustments);
    const lines = result.entries[0].lines;
    expect(lines[0]).toEqual({ accountName: "Piutang Usaha (Cek Kosong)", debit: 15000000, credit: 0 });
    expect(lines[1]).toEqual({ accountName: "Kas di Bank", debit: 0, credit: 15000000 });
  });

  it("setiap entri double-entry seimbang (ΣDebit = ΣKredit)", () => {
    const adjustments: AdjustmentForJournal[] = [
      { id: "A1", side: "BOOK", category: "BANK_FEE", signedAmount: -35000, description: "Biaya Admin" },
      { id: "A2", side: "BOOK", category: "INTEREST_INCOME", signedAmount: 145000, description: "Jasa Giro" },
      { id: "A3", side: "BOOK", category: "BOOK_ERROR_ADD", signedAmount: 90000, description: "Koreksi BBM" },
    ];
    const result = generateAdjustingJournals(adjustments);
    expect(result.isDoubleEntryBalanced).toBe(true);
    expect(result.totalDebit).toBe(result.totalCredit);
    // Setiap baris debit/kredit positif & pasangannya nol.
    for (const entry of result.entries) {
      for (const line of entry.lines) {
        expect(line.debit >= 0).toBe(true);
        expect(line.credit >= 0).toBe(true);
        expect(line.debit === 0 || line.credit === 0).toBe(true);
      }
    }
  });

  it("signedAmount 0 tidak menghasilkan entri jurnal", () => {
    const adjustments: AdjustmentForJournal[] = [
      { id: "A1", side: "BOOK", category: "BANK_FEE", signedAmount: 0, description: "Nol" },
    ];
    const result = generateAdjustingJournals(adjustments);
    expect(result.entries).toHaveLength(0);
    expect(result.isDoubleEntryBalanced).toBe(true);
  });

  it("contraAccountName kustom meng-override default COA", () => {
    const adjustments: AdjustmentForJournal[] = [
      { id: "A1", side: "BOOK", category: "BANK_FEE", signedAmount: -35000, description: "Biaya", contraAccountName: "Beban Operasional Lain" },
    ];
    const result = generateAdjustingJournals(adjustments);
    expect(result.entries[0].lines[0].accountName).toBe("Beban Operasional Lain");
  });
});
