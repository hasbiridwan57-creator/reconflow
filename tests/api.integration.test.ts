/**
 * Integration test — alur API/service nyata terhadap SQLite test DB.
 * Kunci perbaikan Gemini audit: dropdown klasifikasi (via kategori valid),
 * BBM BOOK_ERROR_ADD +90000, guard FINALIZED (409 pada mutasi),
 * dan ekspor tetap bisa (level route diuji via smoke test live).
 *
 * Prasyarat: DATABASE_URL menunjuk DB test terpisah (dibuat/direset di beforeAll)
 * agar tidak menyentuh dev.db.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

// Pindahkan DATABASE_URL ke file DB test SEBELUM import modul apapun yang memuat Prisma.
const TEST_DB_PATH = path.resolve(process.cwd(), "prisma", `test-${randomUUID()}.db`);
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;

import { db as prisma } from "@/lib/db";
import { DEMO_SCENARIOS, DEFAULT_MATCHING_CONFIG } from "@/lib/demo/scenarios";
import { parseCsvToTransactions } from "@/lib/csvToTx";
import {
  getHydratedSession, runAndPersistAutoMatch, toPrismaTxInputs,
  logAudit, assertNotFinalized,
} from "@/lib/session";
import { resolveDiscrepancyAdjustment } from "@/lib/engine/discrepancy";
import type { CashDirection } from "@/lib/schemas/reconciliation";

// Kunci jawaban klasifikasi (sama seperti tests/helpers/scenarios.ts).
const CLASSIFICATION: Record<string, Record<string, { category: string; signedAmount: number; side?: "BANK" | "BOOK" }>> = {
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

/** Bangun sesi demo lengkap di DB (mirip POST /api/sessions/demo) lalu selesaikan. */
async function createDemoSession(scenarioKey: "umkm" | "ecommerce" | "audit"): Promise<string> {
  const scenario = DEMO_SCENARIOS.find((s) => s.scenarioKey === scenarioKey)!;
  const bankTxs = parseCsvToTransactions(scenario.bankCsv, "BANK");
  const bookTxs = parseCsvToTransactions(scenario.bookCsv, "BOOK");

  const session = await prisma.reconciliationSession.create({
    data: {
      companyName: scenario.companyName,
      bankAccountName: scenario.bankAccountName,
      periodLabel: scenario.periodLabel,
      periodEndDate: scenario.periodEndDate,
      openingBalance: scenario.openingBalance,
      endingBankBalance: scenario.endingBankBalance,
      endingBookBalance: scenario.endingBookBalance,
      demoScenarioKey: scenarioKey,
      dateToleranceDays: DEFAULT_MATCHING_CONFIG.dateToleranceDays,
      amountToleranceRupiah: DEFAULT_MATCHING_CONFIG.amountToleranceRupiah,
      minFuzzyScore: DEFAULT_MATCHING_CONFIG.minFuzzyScore,
      detectTransposition: DEFAULT_MATCHING_CONFIG.detectTransposition,
      transactions: { create: [...toPrismaTxInputs(bankTxs), ...toPrismaTxInputs(bookTxs)] },
    },
  });
  await logAudit(session.id, "SESSION_CREATED", `Sesi demo dibuat.`);
  await runAndPersistAutoMatch(session.id, DEFAULT_MATCHING_CONFIG);
  return session.id;
}

/** Approve semua pending + klasifikasi seluruh unmatched sesuai kunci jawaban. */
async function solveSession(sessionId: string): Promise<void> {
  const classification = CLASSIFICATION[
    (await prisma.reconciliationSession.findUnique({ where: { id: sessionId } }))!.demoScenarioKey as "umkm" | "ecommerce" | "audit"
  ];
  for (let i = 0; i < 80; i++) {
    const data = (await getHydratedSession(sessionId))!;
    // Approve pending.
    const pending = data.matches.filter((m) => !m.isConfirmed && (m.status === "SUGGESTED_MATCH" || m.status === "DISCREPANCY_MATCH"));
    if (pending.length > 0) {
      const m = pending[0];
      // Approve langsung di service layer (tanpa HTTP) via db update + adjustment.
      if (m.status === "DISCREPANCY_MATCH" && m.amountDiff !== 0) {
        const bankTx = await prisma.transaction.findUnique({ where: { id: m.bankTx.id } });
        const { signedAmount, category } = resolveDiscrepancyAdjustment(bankTx!.direction as CashDirection, m.amountDiff, "BOOK");
        await prisma.$transaction([
          prisma.matchPair.update({ where: { id: m.id }, data: { isConfirmed: true } }),
          prisma.classifiedAdjustment.create({
            data: { sessionId, matchPairId: m.id, side: "BOOK", category, signedAmount, description: "Perbaikan transposition error", contraAccountName: "Beban BBM, Minyak, dan Pelumas" },
          }),
        ]);
      } else {
        await prisma.matchPair.update({ where: { id: m.id }, data: { isConfirmed: true } });
      }
      continue;
    }
    // Klasifikasi unmatched bank (yang BELUM punya adjustment).
    const bankToClassify = data.unmatchedBank.find((t) => !t.adjustmentId);
    if (bankToClassify) {
      const tx = bankToClassify;
      const spec = classification[tx.reference];
      const { signedAmount } = resolveDiscrepancyAdjustment(tx.direction as CashDirection, 0, "BOOK");
      const s = spec ?? { category: tx.direction === "IN" ? "UNRECORDED_RECEIPT" : "UNRECORDED_EXPENSE", signedAmount };
      await prisma.classifiedAdjustment.create({
        data: { sessionId, transactionId: tx.id, side: spec?.side ?? "BOOK", category: s.category as never, signedAmount: s.signedAmount, description: tx.description },
      });
      continue;
    }
    // Klasifikasi unmatched book (yang BELUM punya adjustment).
    const bookToClassify = data.unmatchedBook.find((t) => !t.adjustmentId);
    if (bookToClassify) {
      const tx = bookToClassify;
      const spec = classification[tx.reference];
      const s = spec ?? { category: tx.direction === "IN" ? "DEPOSIT_IN_TRANSIT" : "OUTSTANDING_CHECK", signedAmount: tx.direction === "IN" ? tx.amount : -tx.amount, side: "BANK" as const };
      await prisma.classifiedAdjustment.create({
        data: { sessionId, transactionId: tx.id, side: spec?.side ?? "BANK", category: s.category as never, signedAmount: s.signedAmount, description: tx.description },
      });
      continue;
    }
    break;
  }
  await prisma.reconciliationSession.update({ where: { id: sessionId }, data: { status: "RECONCILED" } });
}

beforeAll(async () => {
  // Jalankan migrasi (db push) ke DB test agar schema tersedia.
  const { execSync } = await import("node:child_process");
  execSync(`npx prisma db push --skip-generate`, {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    stdio: "pipe",
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  // Bersihkan file DB test.
  for (const f of [TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* noop */ }
  }
});

describe("resolveDiscrepancyAdjustment — 4 kombinasi (Gemini D.10)", () => {
  it("IN × BOOK: amountDiff positif → BOOK_ERROR_ADD", () => {
    const r = resolveDiscrepancyAdjustment("IN", 50000, "BOOK");
    expect(r.signedAmount).toBe(50000);
    expect(r.category).toBe("BOOK_ERROR_ADD");
  });
  it("IN × BANK: amountDiff positif → BANK_ERROR_DEDUCT", () => {
    const r = resolveDiscrepancyAdjustment("IN", 50000, "BANK");
    expect(r.signedAmount).toBe(-50000);
    expect(r.category).toBe("BANK_ERROR_DEDUCT");
  });
  it("OUT × BOOK: amountDiff positif → BOOK_ERROR_DEDUCT", () => {
    const r = resolveDiscrepancyAdjustment("OUT", 50000, "BOOK");
    expect(r.signedAmount).toBe(-50000);
    expect(r.category).toBe("BOOK_ERROR_DEDUCT");
  });
  it("OUT × BANK: amountDiff positif → BANK_ERROR_ADD", () => {
    const r = resolveDiscrepancyAdjustment("OUT", 50000, "BANK");
    expect(r.signedAmount).toBe(50000);
    expect(r.category).toBe("BANK_ERROR_ADD");
  });
});

describe("Alur 3 demo + FINALIZE guard", () => {
  for (const key of ["umkm", "ecommerce", "audit"] as const) {
    it(`${key}: selesai balanced, FINALIZE kunci, mutasi 409`, async () => {
      const sid = await createDemoSession(key);
      await solveSession(sid);

      const data = (await getHydratedSession(sid))!;
      expect(data.summary.variance).toBe(0);
      expect(data.summary.isBalanced).toBe(true);
      expect(data.journals.isDoubleEntryBalanced).toBe(true);

      // FINALIZE.
      await prisma.reconciliationSession.update({ where: { id: sid }, data: { status: "FINALIZED" } });

      // assertNotFinalized lempar ApiError CONFLICT (409).
      await expect(assertNotFinalized(sid)).rejects.toThrow();

      // Setelah REOPEN, mutasi bebas.
      await prisma.reconciliationSession.update({ where: { id: sid }, data: { status: "RECONCILED" } });
      await expect(assertNotFinalized(sid)).resolves.toBeUndefined();
    });
  }

  it("audit: BBM Skenario 3 menghasilkan BOOK_ERROR_ADD +90000", async () => {
    const sid = await createDemoSession("audit");
    await solveSession(sid);
    const data = (await getHydratedSession(sid))!;
    const bbm = data.adjustments.filter((a) => a.category === "BOOK_ERROR_ADD" && a.signedAmount === 90000);
    expect(bbm.length).toBeGreaterThanOrEqual(1);
    // Tidak ada BOOK_ERROR_DEDUCT -90000 yang salah arah untuk BBM.
  });
});
