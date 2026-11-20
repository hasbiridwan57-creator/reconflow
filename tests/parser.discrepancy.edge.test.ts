/**
 * Unit test — helper resolveDiscrepancyAdjustment + edge-case parser.
 * Kunci rumus arah IN/OUT × faultSide BOOK/BANK agar tidak regresi.
 */
import { describe, it, expect } from "vitest";
import { resolveDiscrepancyAdjustment } from "@/lib/engine/discrepancy";
import { parseIndonesianCurrency, parseFlexibleDate } from "@/lib/engine/parser";

describe("resolveDiscrepancyAdjustment — 4 kombinasi (Gemini audit D.10)", () => {
  it("IN + BOOK: signedAmount=+amountDiff, kategori mengikuti tanda", () => {
    // netDiff=+1000, signed=+1000 -> BOOK_ERROR_ADD
    expect(resolveDiscrepancyAdjustment("IN", 1000, "BOOK")).toEqual({ signedAmount: 1000, category: "BOOK_ERROR_ADD" });
    // netDiff=+1000, signed=-1000 -> BANK_ERROR_DEDUCT
    expect(resolveDiscrepancyAdjustment("IN", 1000, "BANK")).toEqual({ signedAmount: -1000, category: "BANK_ERROR_DEDUCT" });
  });

  it("BBM Skenario 3: OUT + BOOK -> BOOK_ERROR_ADD +90.000 (BUKAN DEDUCT)", () => {
    // bank=12.450.000, book=12.540.000 -> amountDiff=-90.000
    const r = resolveDiscrepancyAdjustment("OUT", -90_000, "BOOK");
    expect(r.signedAmount).toBe(90_000);
    expect(r.category).toBe("BOOK_ERROR_ADD");
  });

  it("OUT + BANK: signedAmount=-amountDiff pada netDiff", () => {
    // netDiff=-amountDiff; signed=-netDiff=+amountDiff
    const r = resolveDiscrepancyAdjustment("OUT", -90_000, "BANK");
    expect(r.signedAmount).toBe(-90_000);
    expect(r.category).toBe("BANK_ERROR_DEDUCT");
  });

  it("IN + BOOK amountDiff negatif -> BOOK_ERROR_DEDUCT", () => {
    const r = resolveDiscrepancyAdjustment("IN", -500, "BOOK");
    expect(r.signedAmount).toBe(-500);
    expect(r.category).toBe("BOOK_ERROR_DEDUCT");
  });

  it("IN + BANK amountDiff negatif -> BANK_ERROR_ADD", () => {
    const r = resolveDiscrepancyAdjustment("IN", -500, "BANK");
    expect(r.signedAmount).toBe(500);
    expect(r.category).toBe("BANK_ERROR_ADD");
  });

  it("OUT + BOOK amountDiff positif -> BOOK_ERROR_DEDUCT", () => {
    // netDiff=-amountDiff; signed=netDiff<0
    const r = resolveDiscrepancyAdjustment("OUT", 500, "BOOK");
    expect(r.signedAmount).toBe(-500);
    expect(r.category).toBe("BOOK_ERROR_DEDUCT");
  });

  it("OUT + BANK amountDiff positif -> BANK_ERROR_ADD", () => {
    const r = resolveDiscrepancyAdjustment("OUT", 500, "BANK");
    expect(r.signedAmount).toBe(500);
    expect(r.category).toBe("BANK_ERROR_ADD");
  });
});

describe("Parser edge-case", () => {
  it("parseIndonesianCurrency('Rp .') -> 0 (bukan NaN)", () => {
    expect(parseIndonesianCurrency("Rp .")).toBe(0);
  });

  it("parseIndonesianCurrency('') -> 0", () => {
    expect(parseIndonesianCurrency("")).toBe(0);
  });

  it("parseFlexibleDate('2026-02-31') -> null (tanggal kalender invalid)", () => {
    expect(parseFlexibleDate("2026-02-31")).toBeNull();
  });

  it("parseFlexibleDate('2026-02-28') -> '2026-02-28' (valid)", () => {
    expect(parseFlexibleDate("2026-02-28")).toBe("2026-02-28");
  });

  it("parseFlexibleDate('31/12/2026') -> '2026-12-31' (DD/MM/YYYY)", () => {
    expect(parseFlexibleDate("31/12/2026")).toBe("2026-12-31");
  });
});
