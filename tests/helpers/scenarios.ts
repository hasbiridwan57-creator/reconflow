/**
 * Test helpers: membangun sesi rekonsiliasi penuh dari dataset demo
 * menggunakan kunci jawaban resmi dari RECONFLOW_MASTER_SPEC.md §11.
 * Dipakai oleh tests/scenarios.e2e.test.ts.
 */
import { getScenario } from "@/lib/demo/scenarios";
import { parseIndonesianCurrency, parseFlexibleDate, inferDirection, inferAmount } from "@/lib/engine/parser";
import { normalizeDescription } from "@/lib/engine/textSimilarity";
import type { MatchCandidateTx, MatchResult } from "@/lib/engine/matcher";
import { calculateReconciliation, type AdjustmentLike } from "@/lib/engine/calculator";
import { generateAdjustingJournals, type AdjustmentForJournal } from "@/lib/engine/journals";
import Papa from "papaparse";

export function parseCsv(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv.trim(), { header: true, skipEmptyLines: true }).data;
}

export interface ParsedTx extends MatchCandidateTx {
  raw: Record<string, string>;
}

export function buildBankCandidates(csv: string): ParsedTx[] {
  return parseCsv(csv).map((row, idx) => {
    const debit = parseIndonesianCurrency(row["debit_keluar"]);
    const credit = parseIndonesianCurrency(row["kredit_masuk"]);
    const desc = row["keterangan"] ?? "";
    return {
      id: row["no_referensi"] ?? `BANK-${idx}`,
      raw: row,
      date: parseFlexibleDate(row["tanggal"])!,
      reference: row["no_referensi"] ?? "",
      description: desc,
      normalizedDesc: normalizeDescription(desc),
      direction: inferDirection("BANK", debit, credit),
      amount: inferAmount(debit, credit),
      source: "BANK" as const,
    };
  });
}

export function buildBookCandidates(csv: string): ParsedTx[] {
  return parseCsv(csv).map((row, idx) => {
    const debit = parseIndonesianCurrency(row["debit_masuk"]);
    const credit = parseIndonesianCurrency(row["kredit_keluar"]);
    const desc = row["deskripsi"] ?? "";
    return {
      id: row["no_bukti"] ?? `BOOK-${idx}`,
      raw: row,
      date: parseFlexibleDate(row["tanggal"])!,
      reference: row["no_bukti"] ?? "",
      description: desc,
      normalizedDesc: normalizeDescription(desc),
      direction: inferDirection("BOOK", debit, credit),
      amount: inferAmount(debit, credit),
      source: "BOOK" as const,
    };
  });
}

type AdjSpec = { category: AdjustmentLike["category"]; signedAmount: number; side?: "BANK" | "BOOK" };

/**
 * Kunci jawaban klasifikasi penyesuaian per referensi (spec §11).
 * Aturan arah akuntansi (default):
 *   Unmatched BANK → penyesuaian Sisi BUKU (menghasilkan jurnal).
 *   Unmatched BOOK → penyesuaian Sisi BANK (timing difference, tanpa jurnal).
 * B-507 Double Charge Allianz = kesalahan bank (terbayar 2x, buku catat 1x)
 *   → override side: "BANK", BANK_ERROR_ADD +8.500.000 (tidak menghasilkan jurnal).
 */
const CLASSIFICATION: Record<string, Record<string, AdjSpec>> = {
  umkm: {
    "BNK-1008": { category: "INTEREST_INCOME", signedAmount: 145000 },
    "BNK-1009": { category: "TAX_ON_INTEREST", signedAmount: -29000 },
    "BNK-1010": { category: "BANK_FEE", signedAmount: -35000 },
    "BKK-005": { category: "OUTSTANDING_CHECK", signedAmount: -4600000 },
    "BKM-004": { category: "DEPOSIT_IN_TRANSIT", signedAmount: 9800000 },
  },
  ecommerce: {
    "TRF-907": { category: "UNRECORDED_EXPENSE", signedAmount: -2500 },
    "TRF-908": { category: "UNRECORDED_RECEIPT", signedAmount: 16500000 },
    "TRF-911": { category: "BANK_FEE", signedAmount: -50000 },
    "TRF-912": { category: "INTEREST_INCOME", signedAmount: 285000 },
    "TRF-913": { category: "TAX_ON_INTEREST", signedAmount: -57000 },
    "KK-205": { category: "OUTSTANDING_CHECK", signedAmount: -11400000 },
    "KM-205": { category: "DEPOSIT_IN_TRANSIT", signedAmount: 19300000 },
    "KM-206": { category: "DEPOSIT_IN_TRANSIT", signedAmount: 15750000 },
  },
  audit: {
    "B-504": { category: "NSF_CHECK", signedAmount: -15000000 },
    "B-505": { category: "BANK_FEE", signedAmount: -125000 },
    "B-510": { category: "UNRECORDED_EXPENSE", signedAmount: -1250000 },
    "B-512": { category: "INTEREST_INCOME", signedAmount: 620000 },
    "B-513": { category: "TAX_ON_INTEREST", signedAmount: -124000 },
    "B-514": { category: "BANK_FEE", signedAmount: -75000 },
    "B-507": { category: "BANK_ERROR_ADD", signedAmount: 8500000, side: "BANK" },
    "JKK-305": { category: "OUTSTANDING_CHECK", signedAmount: -22500000 },
    "JKM-304": { category: "DEPOSIT_IN_TRANSIT", signedAmount: 34000000 },
  },
};

export interface SessionResult {
  summary: ReturnType<typeof calculateReconciliation>;
  journals: ReturnType<typeof generateAdjustingJournals>;
  adjustments: AdjustmentLike[];
}

/**
 * Approve semua suggested/discrepancy, klasifikasikan seluruh unmatched
 * sesuai kunci jawaban, buat penyesuaian discrepancy (faultSide BOOK),
 * lalu hitung jembatan saldo & jurnal penyesuaian.
 */
export function buildSession(
  scenarioKey: "umkm" | "ecommerce" | "audit",
  matches: MatchResult[],
): SessionResult {
  const scenario = getScenario(scenarioKey)!;
  const bankTxs = buildBankCandidates(scenario.bankCsv);
  const bookTxs = buildBookCandidates(scenario.bookCsv);
  const classification = CLASSIFICATION[scenarioKey];

  // Approve semua SUGGESTED & DISCREPANCY sebelum menghitung unmatched.
  for (const m of matches) {
    if (!m.isConfirmed && (m.status === "SUGGESTED_MATCH" || m.status === "DISCREPANCY_MATCH")) {
      m.isConfirmed = true;
    }
  }

  const matchedBankIds = new Set(matches.filter((m) => m.isConfirmed).map((m) => m.bankTxId));
  const matchedBookIds = new Set(matches.filter((m) => m.isConfirmed).map((m) => m.bookTxId));

  const adjustments: AdjustmentLike[] = [];
  const bankAdjMap = new Map<string, { id: string }>();
  const bookAdjMap = new Map<string, { id: string }>();

  // Unmatched BANK → penyesuaian sisi BUKU (default), kecuali ada override side.
  for (const tx of bankTxs.filter((t) => !matchedBankIds.has(t.id))) {
    const spec = classification[tx.reference];
    if (!spec) continue;
    const side = spec.side ?? "BOOK";
    const adjId = `ADJ-BANK-${tx.id}`;
    adjustments.push({ id: adjId, side, category: spec.category, signedAmount: spec.signedAmount, description: tx.description });
    // Tautkan penyesuaian ke transaksi asalnya (selalu sisi BANK untuk TX bank).
    bankAdjMap.set(tx.id, { id: adjId });
  }

  // Unmatched BOOK → penyesuaian sisi BANK.
  for (const tx of bookTxs.filter((t) => !matchedBookIds.has(t.id))) {
    const spec = classification[tx.reference];
    if (!spec) continue;
    const adjId = `ADJ-BOOK-${tx.id}`;
    adjustments.push({ id: adjId, side: "BANK", category: spec.category, signedAmount: spec.signedAmount, description: tx.description });
    bookAdjMap.set(tx.id, { id: adjId });
  }

  // Penyesuaian discrepancy match (faultSide BOOK) — mis. transposition BBM.
  // amountDiff = bank - book; negatif → buku lebih besar → kurangi buku.
  for (const m of matches.filter((x) => x.status === "DISCREPANCY_MATCH" && x.amountDiff !== 0)) {
    const adjId = `ADJ-DISC-${m.bankTxId}`;
    adjustments.push({
      id: adjId,
      side: "BOOK",
      category: m.amountDiff < 0 ? "BOOK_ERROR_DEDUCT" : "BOOK_ERROR_ADD",
      signedAmount: -m.amountDiff,
      description: `Perbaikan transposition error: selisih Rp ${Math.abs(m.amountDiff).toLocaleString("id-ID")}`,
    });
    bankAdjMap.set(m.bankTxId, { id: adjId });
    bookAdjMap.set(m.bookTxId, { id: adjId });
  }

  const bankTransactions = bankTxs.map((tx) => ({ id: tx.id, adjustment: bankAdjMap.get(tx.id) ?? null }));
  const bookTransactions = bookTxs.map((tx) => ({ id: tx.id, adjustment: bookAdjMap.get(tx.id) ?? null }));

  const summary = calculateReconciliation({
    endingBankBalance: scenario.endingBankBalance,
    endingBookBalance: scenario.endingBookBalance,
    adjustments,
    matches: matches.map((m, i) => ({ ...m, id: `M${i}` })),
    bankTransactions,
    bookTransactions,
  });

  // Jurnal HANYA dari penyesuaian sisi BUKU.
  const bookAdjustments = adjustments.filter((a) => a.side === "BOOK");
  const journals = generateAdjustingJournals(bookAdjustments as AdjustmentForJournal[]);

  return { summary, journals, adjustments };
}
