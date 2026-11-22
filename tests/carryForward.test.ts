/**
 * Test unit carry-forward outstanding (pure, tanpa DB).
 * - buildCarryForwardItems: hanya BANK, hanya belum tuntas, kategori dari arah.
 * - Tanda nominal dari kategori (POSITIF untuk deposit, NEGATIF untuk cek beredar).
 */
import { describe, it, expect } from "vitest";
import { buildCarryForwardItems } from "../src/lib/engine/carryForward";
import type { CarryForwardItem } from "../src/lib/engine/carryForward";

type Tx = Parameters<typeof buildCarryForwardItems>[0][number];

function tx(overrides: Partial<Tx> & { id: string }): Tx {
  return {
    source: "BANK",
    direction: "IN",
    amount: 100000,
    date: "2026-10-05",
    reference: "REF-1",
    description: "Setoran pelanggan",
    adjustment: null,
    bankMatch: null,
    bookMatch: null,
    ...overrides,
  };
}

describe("buildCarryForwardItems", () => {
  it("membawa transaksi BANK belum termatch & belum diklasifikasi (IN → DEPOSIT_IN_TRANSIT)", () => {
    const items = buildCarryForwardItems([tx({ id: "t1" })]);
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe("DEPOSIT_IN_TRANSIT");
    expect(items[0].signedAmount).toBe(100000); // positif
    expect(items[0].side).toBe("BANK");
  });

  it("arah OUT → OUTSTANDING_CHECK dengan tanda negatif", () => {
    const items = buildCarryForwardItems([tx({ id: "t2", direction: "OUT", amount: 75000, description: "Cek supplier" })]);
    expect(items[0].category).toBe("OUTSTANDING_CHECK");
    expect(items[0].signedAmount).toBe(-75000);
  });

  it("transaksi BOOK tidak dibawa", () => {
    const items = buildCarryForwardItems([tx({ id: "t3", source: "BOOK" })]);
    expect(items).toHaveLength(0);
  });

  it("transaksi yang sudah diklasifikasi (adjustment) tidak dibawa", () => {
    const items = buildCarryForwardItems([tx({ id: "t4", adjustment: { id: "adj1" } })]);
    expect(items).toHaveLength(0);
  });

  it("transaksi dengan match terkonfirmasi tidak dibawa", () => {
    const items = buildCarryForwardItems([tx({ id: "t5", bankMatch: { isConfirmed: true } })]);
    expect(items).toHaveLength(0);
  });

  it("transaksi dengan match BELUM dikonfirmasi tetap dibawa (masih menggantung)", () => {
    const items = buildCarryForwardItems([tx({ id: "t6", bankMatch: { isConfirmed: false } })]);
    expect(items).toHaveLength(1);
  });

  it("menghitung total gabungan deposit positif & cek beredar negatif", () => {
    const items = buildCarryForwardItems([
      tx({ id: "a", direction: "IN", amount: 500000 }),
      tx({ id: "b", direction: "OUT", amount: 200000 }),
      tx({ id: "c", direction: "OUT", amount: 100000 }),
    ]);
    expect(items).toHaveLength(3);
    const total = items.reduce((s, i) => s + i.signedAmount, 0);
    expect(total).toBe(200000);
  });

  it("deskripsi jatuh ke reference bila deskripsi kosong", () => {
    const items = buildCarryForwardItems([tx({ id: "d", description: "", reference: "CK-009" })]);
    expect(items[0].description).toBe("CK-009");
  });

  it("tipe CarryForwardItem punya field wajib", () => {
    const items: CarryForwardItem[] = buildCarryForwardItems([tx({ id: "e" })]);
    expect(Object.keys(items[0])).toEqual(
      expect.arrayContaining(["sourceTransactionId", "side", "category", "signedAmount", "description", "date", "reference"]),
    );
  });
});
