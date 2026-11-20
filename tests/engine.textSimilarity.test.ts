import { describe, it, expect } from "vitest";
import { normalizeDescription, extractReferenceTokens, computeTextSimilarity } from "@/lib/engine/textSimilarity";

describe("normalizeDescription", () => {
  it("hapus stop-words & normalisasi", () => {
    const norm = normalizeDescription("CR QRIS SETTLEMENT 01-02 OKT");
    expect(norm).not.toContain("cr");
    expect(norm).toContain("qris");
    expect(norm).toContain("settlement");
  });

  it("string kosong aman", () => {
    expect(normalizeDescription("")).toBe("");
  });
});

describe("extractReferenceTokens", () => {
  it("ekstrak INV-091", () => {
    const tokens = extractReferenceTokens("B-501", "CR PELUNASAN INV-091 PT GARUDA FOOD");
    expect(tokens.some((t) => t.includes("inv091"))).toBe(true);
  });

  it("ekstrak batch #8821", () => {
    const tokens = extractReferenceTokens("TRF-901", "CR SHOPEE INTL ID PAYOUT #8821");
    expect(tokens.some((t) => t.includes("8821"))).toBe(true);
  });

  it("kosong jika tak ada", () => {
    const tokens = extractReferenceTokens("", "Tanpa referensi khusus");
    expect(tokens.length).toBe(0);
  });
});

describe("computeTextSimilarity", () => {
  it("identik = 1", () => {
    const n = normalizeDescription("Penjualan Kopi QRIS 01-02 Okt");
    expect(computeTextSimilarity(n, n)).toBeCloseTo(1, 2);
  });

  it("sangat berbeda = rendah", () => {
    const a = normalizeDescription("Penjualan Kopi QRIS");
    const b = normalizeDescription("Pembayaran Iklan Meta");
    expect(computeTextSimilarity(a, b)).toBeLessThan(0.3);
  });

  it("rentang [0, 1]", () => {
    const a = normalizeDescription("CR QRIS SETTLEMENT");
    const b = normalizeDescription("Penjualan Kopi QRIS");
    const sim = computeTextSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});
