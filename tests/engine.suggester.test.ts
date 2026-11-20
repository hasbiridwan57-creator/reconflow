/**
 * Unit test suggester — deteksi kategori & anomali.
 * Skenario audit: B-504/B-505/B-506/B-507/B-510.
 */
import { describe, it, expect } from "vitest";
import { suggestAdjustmentCategory } from "@/lib/engine/suggester";
import { normalizeDescription } from "@/lib/engine/textSimilarity";

describe("suggester — Bank OUT rutin (isAnomaly: false)", () => {
  it("B-505 'DB BIAYA PENOLAKAN CEK KOSONG' → BANK_FEE (bukan NSF_CHECK)", () => {
    const sug = suggestAdjustmentCategory({
      source: "BANK",
      direction: "OUT",
      description: "DB BIAYA PENOLAKAN CEK KOSONG",
      date: "2026-10-10",
      amount: 125000,
    });
    expect(sug).not.toBeNull();
    expect(sug!.category).toBe("BANK_FEE");
    expect(sug!.isAnomaly).toBe(false);
    expect(sug!.impactLabel).toBe("Beban Bank · Auto Jurnal");
  });

  it("B-504 'DB RETUR CEK KOSONG ... (NSF)' → NSF_CHECK", () => {
    const sug = suggestAdjustmentCategory({
      source: "BANK",
      direction: "OUT",
      description: "DB RETUR CEK KOSONG PT MAJU JAYA (NSF)",
      date: "2026-10-10",
      amount: 15000000,
    });
    expect(sug).not.toBeNull();
    expect(sug!.category).toBe("NSF_CHECK");
    expect(sug!.isAnomaly).toBe(false);
  });

  it("pajak jasa giro → TAX_ON_INTEREST", () => {
    const sug = suggestAdjustmentCategory({
      source: "BANK", direction: "OUT", description: "DB PAJAK JASA GIRO", date: "2026-10-01", amount: 50000,
    });
    expect(sug!.category).toBe("TAX_ON_INTEREST");
    expect(sug!.isAnomaly).toBe(false);
  });
});

describe("suggester — deteksi anomali", () => {
  it("B-507 dengan B-506 di matchedBankTxs → BANK_ERROR_ADD (double charge)", () => {
    // B-506 & B-507: tanggal sama, nominal sama, deskripsi mirip (autodebit ASURANSI ARMADA ALLIANZ).
    const sug = suggestAdjustmentCategory(
      {
        source: "BANK", direction: "OUT",
        description: "DB AUTODEBIT ASURANSI ARMADA ALLIANZ",
        date: "2026-10-14", amount: 8500000,
      },
      {
        matchedBankTxs: [
          {
            date: "2026-10-14",
            amount: 8500000,
            direction: "OUT",
            normalizedDesc: normalizeDescription("DB AUTODEBIT ASURANSI ARMADA ALLIANZ"),
          },
        ],
      },
    );
    expect(sug).not.toBeNull();
    expect(sug!.category).toBe("BANK_ERROR_ADD");
    expect(sug!.isAnomaly).toBe(true);
    expect(sug!.reason).toContain("Double Charge");
  });

  it("B-510 'DB CARD DEBIT UNKNOWN SAAS CLOUD USD' → UNRECORDED_EXPENSE", () => {
    const sug = suggestAdjustmentCategory({
      source: "BANK", direction: "OUT",
      description: "DB CARD DEBIT UNKNOWN SAAS CLOUD USD",
      date: "2026-10-23", amount: 1250000,
    });
    expect(sug).not.toBeNull();
    expect(sug!.category).toBe("UNRECORDED_EXPENSE");
    expect(sug!.isAnomaly).toBe(true);
  });
});

describe("suggester — Bank IN & BOOK rutin", () => {
  it("jasa giro masuk → INTEREST_INCOME", () => {
    const sug = suggestAdjustmentCategory({ source: "BANK", direction: "IN", description: "KRD JASA GIRO", date: "2026-10-01", amount: 350000 });
    expect(sug!.category).toBe("INTEREST_INCOME");
    expect(sug!.isAnomaly).toBe(false);
  });

  it("buku OUT cek → OUTSTANDING_CHECK", () => {
    const sug = suggestAdjustmentCategory({ source: "BOOK", direction: "OUT", description: "CEK NO 001 PT MAJU", date: "2026-10-05", amount: 1000000 });
    expect(sug!.category).toBe("OUTSTANDING_CHECK");
    expect(sug!.isAnomaly).toBe(false);
  });

  it("buku IN setoran → DEPOSIT_IN_TRANSIT", () => {
    const sug = suggestAdjustmentCategory({ source: "BOOK", direction: "IN", description: "SETORAN TUNAI", date: "2026-10-05", amount: 500000 });
    expect(sug!.category).toBe("DEPOSIT_IN_TRANSIT");
    expect(sug!.isAnomaly).toBe(false);
  });
});