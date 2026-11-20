import { describe, it, expect } from "vitest";
import { DEMO_SCENARIOS, getScenario, DEFAULT_MATCHING_CONFIG } from "@/lib/demo/scenarios";
import { runMatchingEngine } from "@/lib/engine/matcher";
import { buildBankCandidates, buildBookCandidates, buildSession } from "./helpers/scenarios";

describe("DEMO_SCENARIOS", () => {
  it("memiliki 3 skenario dengan kunci metadata", () => {
    expect(DEMO_SCENARIOS.length).toBe(3);
    expect(getScenario("umkm")!.companyName).toBe("PT Kopi Nusantara Sejahtera");
    expect(getScenario("ecommerce")!.companyName).toBe("CV Gaya Minimalis Indonesia");
    expect(getScenario("audit")!.companyName).toBe("PT Sinar Logistik Mandiri");
  });
});

describe("Skenario 1 — UMKM PT Kopi Nusantara", () => {
  const scenario = getScenario("umkm")!;
  const bankTxs = buildBankCandidates(scenario.bankCsv);
  const bookTxs = buildBookCandidates(scenario.bookCsv);
  const matches = runMatchingEngine(bankTxs, bookTxs, DEFAULT_MATCHING_CONFIG);
  const { summary, journals } = buildSession("umkm", matches);

  it("jumlah baris CSV benar (10 bank, 9 buku)", () => {
    expect(bankTxs.length).toBe(10);
    expect(bookTxs.length).toBe(9);
  });

  it("hasil matching awal: 6 EXACT + 1 SUGGESTED + 0 DISCREPANCY", () => {
    expect(matches.filter((m) => m.status === "EXACT_MATCH").length).toBe(6);
    expect(matches.filter((m) => m.status === "SUGGESTED_MATCH").length).toBe(1);
    expect(matches.filter((m) => m.status === "DISCREPANCY_MATCH").length).toBe(0);
  });

  it("SUGGESTED_MATCH = BNK-1004 <-> BKM-002 (selisih 1 hari, timing difference)", () => {
    const sug = matches.find((m) => m.status === "SUGGESTED_MATCH");
    expect(sug).toBeDefined();
    expect(sug!.bankTxId).toBe("BNK-1004");
    expect(sug!.bookTxId).toBe("BKM-002");
    expect(sug!.dateDiffDays).toBe(1);
  });

  it("Adjusted Balance dua sisi = Rp 73.381.000 & selisih = Rp 0", () => {
    expect(summary.adjustedBankBalance).toBe(73381000);
    expect(summary.adjustedBookBalance).toBe(73381000);
    expect(summary.variance).toBe(0);
  });

  it("isBalanced = true setelah seluruh item diklasifikasi", () => {
    expect(summary.isBalanced).toBe(true);
  });

  it("jurnal penyesuaian: 3 entri, seimbang Rp 209.000", () => {
    expect(journals.entries.length).toBe(3);
    expect(journals.totalDebit).toBe(209000);
    expect(journals.totalCredit).toBe(209000);
    expect(journals.isDoubleEntryBalanced).toBe(true);
  });
});

describe("Skenario 2 — E-Commerce CV Gaya Minimalis", () => {
  const scenario = getScenario("ecommerce")!;
  const bankTxs = buildBankCandidates(scenario.bankCsv);
  const bookTxs = buildBookCandidates(scenario.bookCsv);
  const matches = runMatchingEngine(bankTxs, bookTxs, DEFAULT_MATCHING_CONFIG);
  const { summary, journals } = buildSession("ecommerce", matches);

  it("jumlah baris CSV benar (13 bank, 11 buku)", () => {
    expect(bankTxs.length).toBe(13);
    expect(bookTxs.length).toBe(11);
  });

  it("hasil matching awal: 4 EXACT + 4 SUGGESTED + 0 DISCREPANCY", () => {
    expect(matches.filter((m) => m.status === "EXACT_MATCH").length).toBe(4);
    expect(matches.filter((m) => m.status === "SUGGESTED_MATCH").length).toBe(4);
    expect(matches.filter((m) => m.status === "DISCREPANCY_MATCH").length).toBe(0);
  });

  it("Adjusted Balance dua sisi = Rp 232.575.500 & selisih = Rp 0", () => {
    expect(summary.adjustedBankBalance).toBe(232575500);
    expect(summary.adjustedBookBalance).toBe(232575500);
    expect(summary.variance).toBe(0);
  });

  it("isBalanced = true setelah seluruh item diklasifikasi", () => {
    expect(summary.isBalanced).toBe(true);
  });

  it("jurnal penyesuaian: 5 entri, seimbang Rp 16.894.500", () => {
    expect(journals.entries.length).toBe(5);
    expect(journals.totalDebit).toBe(16894500);
    expect(journals.totalCredit).toBe(16894500);
    expect(journals.isDoubleEntryBalanced).toBe(true);
  });
});

describe("Skenario 3 — Audit PT Sinar Logistik Mandiri", () => {
  const scenario = getScenario("audit")!;
  const bankTxs = buildBankCandidates(scenario.bankCsv);
  const bookTxs = buildBookCandidates(scenario.bookCsv);
  const matches = runMatchingEngine(bankTxs, bookTxs, DEFAULT_MATCHING_CONFIG);
  const { summary, journals, adjustments } = buildSession("audit", matches);

  it("jumlah baris CSV benar (14 bank, 9 buku)", () => {
    expect(bankTxs.length).toBe(14);
    expect(bookTxs.length).toBe(9);
  });

  it("hasil matching awal: 5 EXACT + 1 SUGGESTED + 1 DISCREPANCY", () => {
    expect(matches.filter((m) => m.status === "EXACT_MATCH").length).toBe(5);
    expect(matches.filter((m) => m.status === "SUGGESTED_MATCH").length).toBe(1);
    expect(matches.filter((m) => m.status === "DISCREPANCY_MATCH").length).toBe(1);
  });

  it("anti double-matching: hanya SATU Allianz (B-506 ATAU B-507) termatch", () => {
    const allianzMatched = matches.filter((m) => m.bankTxId === "B-506" || m.bankTxId === "B-507");
    expect(allianzMatched.length).toBe(1);
  });

  it("DISCREPANCY_MATCH = B-502 <-> JKK-301 (transposition error, selisih Rp 90.000)", () => {
    const disc = matches.find((m) => m.status === "DISCREPANCY_MATCH");
    expect(disc).toBeDefined();
    expect(disc!.bankTxId).toBe("B-502");
    expect(disc!.bookTxId).toBe("JKK-301");
    expect(Math.abs(disc!.amountDiff)).toBe(90000);
    expect(disc!.reasons.some((r) => r.toLowerCase().includes("transposition"))).toBe(true);
  });

  it("Adjusted Balance dua sisi = Rp 389.296.000 & selisih = Rp 0", () => {
    expect(summary.adjustedBankBalance).toBe(389296000);
    expect(summary.adjustedBookBalance).toBe(389296000);
    expect(summary.variance).toBe(0);
  });

  it("isBalanced = true setelah seluruh item diklasifikasi", () => {
    expect(summary.isBalanced).toBe(true);
  });

  it("jurnal penyesuaian: 7 entri, seimbang Rp 17.284.000", () => {
    expect(journals.entries.length).toBe(7);
    expect(journals.totalDebit).toBe(17284000);
    expect(journals.totalCredit).toBe(17284000);
    expect(journals.isDoubleEntryBalanced).toBe(true);
  });

  it("Double Charge Allianz (B-507) TIDAK menghasilkan jurnal (sisi bank)", () => {
    const allianzJournal = journals.entries.find((e) => e.adjustmentId.includes("B-507"));
    expect(allianzJournal).toBeUndefined();
    // Tapi tetap tercatat sebagai penyesuaian sisi bank.
    expect(adjustments.some((a) => a.id.includes("B-507") && a.side === "BANK")).toBe(true);
  });
});
