/**
 * 3-Pass Priority Greedy Bipartite Matching engine.
 * Lihat RECONFLOW_MASTER_SPEC.md §8.3.
 */
import type { MatchingConfig, MatchStatus, CashDirection } from "@/lib/schemas/reconciliation";
import { computeTextSimilarity, findSharedRef } from "./textSimilarity";
import { dateDiffDays } from "./parser";

export interface MatchCandidateTx {
  id: string;
  date: string;
  reference: string;
  description: string;
  normalizedDesc: string;
  direction: CashDirection;
  amount: number;
  source: "BANK" | "BOOK";
}

export interface MatchResult {
  bankTxId: string;
  bookTxId: string;
  status: MatchStatus;
  confidenceScore: number;
  reasons: string[];
  amountDiff: number;
  dateDiffDays: number;
  isConfirmed: boolean;
}

function hasSharedRef(b: MatchCandidateTx, k: MatchCandidateTx): boolean {
  return findSharedRef(b.reference, b.description, k.reference, k.description).length > 0;
}

function getSharedRefLabel(b: MatchCandidateTx, k: MatchCandidateTx): string {
  const shared = findSharedRef(b.reference, b.description, k.reference, k.description);
  return shared.length > 0 ? shared[0] : "";
}

/**
 * Run full 3-Pass matching engine.
 * Returns list of MatchResult pairs (greedy bipartite — no double matching).
 */
export function runMatchingEngine(
  bankTxs: MatchCandidateTx[],
  bookTxs: MatchCandidateTx[],
  config: MatchingConfig,
): MatchResult[] {
  const usedBank = new Set<string>();
  const usedBook = new Set<string>();
  const results: MatchResult[] = [];

  // === PASS 1: EXACT_MATCH ===
  const pass1Candidates: Array<{ b: MatchCandidateTx; k: MatchCandidateTx; score: number; hasRef: boolean }> = [];
  for (const b of bankTxs) {
    for (const k of bookTxs) {
      if (b.direction !== k.direction) continue;
      if (b.amount !== k.amount) continue;
      if (dateDiffDays(b.date, k.date) !== 0) continue;
      const hasRef = hasSharedRef(b, k);
      const score = computeTextSimilarity(b.normalizedDesc, k.normalizedDesc) + (hasRef ? 0.5 : 0);
      pass1Candidates.push({ b, k, score, hasRef });
    }
  }
  // Sort tieBreakerScore DESC
  pass1Candidates.sort((a, b) => b.score - a.score);

  for (const { b, k, hasRef } of pass1Candidates) {
    if (usedBank.has(b.id) || usedBook.has(k.id)) continue;
    usedBank.add(b.id);
    usedBook.add(k.id);
    results.push({
      bankTxId: b.id,
      bookTxId: k.id,
      status: "EXACT_MATCH",
      confidenceScore: 100,
      reasons: [
        "Tanggal identik",
        "Nominal identik",
        ...(hasRef ? ["Nomor referensi cocok"] : []),
      ],
      amountDiff: 0,
      dateDiffDays: 0,
      isConfirmed: true,
    });
  }

  // === PASS 2: SUGGESTED_MATCH ===
  const pass2Candidates: Array<{ b: MatchCandidateTx; k: MatchCandidateTx; score: number; dateDiff: number; reasons: string[] }> = [];
  const remainingBank = bankTxs.filter((b) => !usedBank.has(b.id));
  const remainingBook = bookTxs.filter((k) => !usedBook.has(k.id));

  for (const b of remainingBank) {
    for (const k of remainingBook) {
      if (b.direction !== k.direction) continue;

      const absDiff = Math.abs(b.amount - k.amount);
      if (absDiff > config.amountToleranceRupiah) continue;

      const dd = Math.abs(dateDiffDays(b.date, k.date));
      if (dd > config.dateToleranceDays) continue;

      const hasRef = hasSharedRef(b, k);
      const textSim = computeTextSimilarity(b.normalizedDesc, k.normalizedDesc);

      const sAmount = config.amountToleranceRupiah === 0 ? 1 : 1 - absDiff / (config.amountToleranceRupiah + 1);
      const sDate = 1 - dd / (config.dateToleranceDays + 1);
      const bRef = hasRef ? 15 : 0;
      const rawScore = Math.round(50 * sAmount + 25 * sDate + 25 * textSim + bRef);
      const confidenceScore = Math.min(94, rawScore);

      const exactAmount = b.amount === k.amount;
      // Filter: confidence >= 60 OR (exact amount + within date tol + textSim>=0.15/ref)
      const passes = confidenceScore >= 60 || (exactAmount && dd <= config.dateToleranceDays && (textSim >= 0.15 || hasRef));
      if (!passes) continue;

      // Build reasons
      const reasons: string[] = [];
      if (exactAmount) reasons.push("Nominal identik");
      else reasons.push(`Nominal mendekati (selisih Rp ${absDiff.toLocaleString("id-ID")})`);
      if (dd === 0) reasons.push("Tanggal identik");
      else reasons.push(`Selisih tanggal ${dd} hari (Timing Difference)`);
      if (hasRef) reasons.push(`Referensi ${getSharedRefLabel(b, k)} cocok`);
      if (textSim > 0) reasons.push(`Kemiripan teks ${Math.round(textSim * 100)}%`);

      pass2Candidates.push({ b, k, score: confidenceScore, dateDiff: dd, reasons });
    }
  }

  // Sort: confidenceScore DESC, dateDiff ASC
  pass2Candidates.sort((a, b) => b.score - a.score || a.dateDiff - b.dateDiff);

  for (const { b, k, score, dateDiff, reasons } of pass2Candidates) {
    if (usedBank.has(b.id) || usedBook.has(k.id)) continue;
    usedBank.add(b.id);
    usedBook.add(k.id);
    results.push({
      bankTxId: b.id,
      bookTxId: k.id,
      status: "SUGGESTED_MATCH",
      confidenceScore: score,
      reasons,
      amountDiff: b.amount - k.amount,
      dateDiffDays: dateDiff,
      isConfirmed: false,
    });
  }

  // === PASS 3: DISCREPANCY_MATCH (Transposition Error detection) ===
  if (!config.detectTransposition) return results;

  const remainingBank2 = bankTxs.filter((b) => !usedBank.has(b.id));
  const remainingBook2 = bookTxs.filter((k) => !usedBook.has(k.id));
  const pass3Candidates: Array<{ b: MatchCandidateTx; k: MatchCandidateTx; score: number; reasons: string[] }> = [];

  for (const b of remainingBank2) {
    for (const k of remainingBook2) {
      if (b.direction !== k.direction) continue;

      const dd = Math.abs(dateDiffDays(b.date, k.date));
      if (dd > 1) continue;

      const absDiff = Math.abs(b.amount - k.amount);
      if (absDiff === 0) continue; // sudah EXACT
      if (absDiff / Math.max(b.amount, k.amount) > 0.10) continue; // >10% skip

      const textSim = computeTextSimilarity(b.normalizedDesc, k.normalizedDesc);
      const hasRef = hasSharedRef(b, k);
      if (textSim < 0.35 && !hasRef) continue;

      const isTransposition = absDiff % 9 === 0;
      let confidenceScore: number;
      const reasons: string[] = [];

      if (isTransposition) {
        confidenceScore = Math.min(92, Math.round(70 + textSim * 22));
        reasons.push(`Indikasi Transposition Error (selisih Rp ${absDiff.toLocaleString("id-ID")} habis dibagi 9)`);
      } else if (dd === 0 && textSim >= 0.50) {
        confidenceScore = Math.min(85, Math.round(60 + textSim * 25));
        reasons.push(`Tanggal & vendor cocok namun terdapat selisih nominal Rp ${absDiff.toLocaleString("id-ID")}`);
      } else {
        continue;
      }

      if (hasRef) reasons.push(`Referensi ${getSharedRefLabel(b, k)} cocok`);
      reasons.push(`Kemiripan teks ${Math.round(textSim * 100)}%`);

      pass3Candidates.push({ b, k, score: confidenceScore, reasons });
    }
  }

  pass3Candidates.sort((a, b) => b.score - a.score);

  for (const { b, k, score, reasons } of pass3Candidates) {
    if (usedBank.has(b.id) || usedBook.has(k.id)) continue;
    usedBank.add(b.id);
    usedBook.add(k.id);
    results.push({
      bankTxId: b.id,
      bookTxId: k.id,
      status: "DISCREPANCY_MATCH",
      confidenceScore: score,
      reasons,
      amountDiff: b.amount - k.amount,
      dateDiffDays: Math.abs(dateDiffDays(b.date, k.date)),
      isConfirmed: false,
    });
  }

  return results;
}
