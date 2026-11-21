/**
 * Integration test — alur API/service nyata terhadap DB test (PostgreSQL/SQLite).
 *
 * Strategi CI-friendly:
 * - Suite pure-engine (tanpa DB) TETAP jalan selalu.
 * - Suite yang butuh DB dibungkus guard describe.skipIf(!TEST_DATABASE_URL),
 *   sehingga `npm run test` tetap 100% pass tanpa perlu DB (suite DB di-skip).
 * - Import modul ber-DB dilakukan DINAMIS di dalam suite ter-guard, agar
 *   PrismaClient tidak pernah diinstansiasi saat TEST_DATABASE_URL tidak diset.
 *
 * Prasyarat suite DB: TEST_DATABASE_URL menunjuk DB test terpisah
 * (di-push schema-nya di beforeAll).
 */
import { describe, it, expect } from "vitest";
import { resolveDiscrepancyAdjustment } from "@/lib/engine/discrepancy";

const HAS_TEST_DB = Boolean(process.env.TEST_DATABASE_URL);

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

/* =====================================================================
 * Pure engine (tanpa DB) — selalu jalan.
 * ===================================================================== */
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

/* =====================================================================
 * Suite ber-DB — di-skip bila TEST_DATABASE_URL tidak diset.
 * ===================================================================== */
describe.skipIf(!HAS_TEST_DB)("Alur 3 demo + FINALIZE guard + routes + bulk + pdf", () => {
  it("menjalankan seluruh alur integrasi", async () => {
    // Import dinamis (ber-DB) hanya dievaluasi saat suite ini jalan.
    const { db: prisma } = await import("@/lib/db");
    const { DEMO_SCENARIOS, DEFAULT_MATCHING_CONFIG } = await import("@/lib/demo/scenarios");
    const { parseCsvToTransactions } = await import("@/lib/csvToTx");
    const {
      getHydratedSession, runAndPersistAutoMatch, toPrismaTxInputs,
      logAudit, assertNotFinalized,
    } = await import("@/lib/session");
    type CashDirection = import("@/lib/schemas/reconciliation").CashDirection;

    /** Bangun sesi demo lengkap di DB (mirip POST /api/sessions/demo). */
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
      const sessionRow = await prisma.reconciliationSession.findUnique({ where: { id: sessionId } });
      const classification = CLASSIFICATION[sessionRow!.demoScenarioKey as "umkm" | "ecommerce" | "audit"];
      for (let i = 0; i < 80; i++) {
        const data = (await getHydratedSession(sessionId))!;
        const pending = data.matches.filter((m) => !m.isConfirmed && (m.status === "SUGGESTED_MATCH" || m.status === "DISCREPANCY_MATCH"));
        if (pending.length > 0) {
          const m = pending[0];
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
      await prisma.reconciliationSession.update({ where: { id: sessionId }, data: { status: "BALANCED" } });
    }

    // --- Prasyarat: siapkan schema di DB test ---
    const { execSync } = await import("node:child_process");
    execSync(`npx prisma db push --skip-generate`, { env: { ...process.env }, stdio: "pipe" });

    // 1) FINALIZE guard
    for (const key of ["umkm", "ecommerce", "audit"] as const) {
      const sid = await createDemoSession(key);
      await solveSession(sid);
      const data = (await getHydratedSession(sid))!;
      expect(data.summary.variance).toBe(0);
      expect(data.summary.isBalanced).toBe(true);
      expect(data.journals.isDoubleEntryBalanced).toBe(true);
      await prisma.reconciliationSession.update({ where: { id: sid }, data: { status: "FINALIZED" } });
      await expect(assertNotFinalized(sid)).rejects.toThrow();
      await prisma.reconciliationSession.update({ where: { id: sid }, data: { status: "DRAFT" } });
      await expect(assertNotFinalized(sid)).resolves.toBeUndefined();
    }

    // 2) BBM BOOK_ERROR_ADD
    {
      const sid = await createDemoSession("audit");
      await solveSession(sid);
      const data = (await getHydratedSession(sid))!;
      const bbm = data.adjustments.filter((a) => a.category === "BOOK_ERROR_ADD" && a.signedAmount === 90000);
      expect(bbm.length).toBeGreaterThanOrEqual(1);
    }

    // 3) Route handlers
    {
      const sid = await createDemoSession("umkm");
      await solveSession(sid);
      const { GET } = await import("@/app/api/sessions/route");
      const res = await GET(new Request("http://localhost/api/sessions"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string; variance: number; unclassifiedCount: number }> };
      const row = body.data.find((r) => r.id === sid)!;
      expect(row.variance).toBe(0);
      expect(row.unclassifiedCount).toBe(0);
    }
    {
      const sid = await createDemoSession("audit");
      const bbmMatch = await prisma.matchPair.findFirst({
        where: { sessionId: sid, status: "DISCREPANCY_MATCH", amountDiff: -90000 },
        include: { bookTx: { select: { description: true } } },
      });
      expect(bbmMatch).toBeTruthy();
      if (bbmMatch) {
        const { PATCH } = await import("@/app/api/sessions/[id]/matches/[matchId]/route");
        const req = new Request(`http://localhost/api/sessions/${sid}/matches/${bbmMatch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "APPROVE", discrepancyResolution: { faultSide: "BOOK" } }),
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: sid, matchId: bbmMatch.id }) });
        expect(res.status).toBe(200);
        const data = (await getHydratedSession(sid))!;
        const bbm = data.adjustments.find((a) => a.category === "BOOK_ERROR_ADD" && a.signedAmount === 90000);
        expect(bbm).toBeTruthy();
        expect(bbm!.contraAccountName).toBe("Beban BBM & Tol");
      }
    }
    {
      const sid = await createDemoSession("ecommerce");
      await solveSession(sid);
      await prisma.reconciliationSession.update({ where: { id: sid }, data: { status: "FINALIZED" } });
      const { GET: getPdf } = await import("@/app/api/sessions/[id]/export/pdf/route");
      const { GET: getExcel } = await import("@/app/api/sessions/[id]/export/excel/route");
      const pdfRes = await getPdf(new Request("http://localhost/x"), { params: Promise.resolve({ id: sid }) });
      expect(pdfRes.status).toBe(200);
      const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
      expect(pdfBytes.length).toBeGreaterThan(0);
      expect(String.fromCharCode(pdfBytes[0], pdfBytes[1], pdfBytes[2], pdfBytes[3])).toBe("%PDF");
      const xlsRes = await getExcel(new Request("http://localhost/x"), { params: Promise.resolve({ id: sid }) });
      expect(xlsRes.status).toBe(200);
      const xlsBytes = new Uint8Array(await xlsRes.arrayBuffer());
      expect(xlsBytes[0]).toBe(0x50);
      expect(xlsBytes[1]).toBe(0x4b);
      const ExcelJSMod = (await import("exceljs")).default;
      const wb = new ExcelJSMod.Workbook();
      type WorkbookInst = InstanceType<typeof ExcelJSMod.Workbook>;
      type XlsxBuffer = Parameters<WorkbookInst["xlsx"]["load"]>[0];
      await wb.xlsx.load(Buffer.from(xlsBytes) as unknown as XlsxBuffer);
      const summary = wb.getWorksheet("Ringkasan")!;
      let matchRateNumFmt: string | null = null;
      summary.eachRow((row) => {
        const label = String(row.getCell(1).value ?? "");
        if (label.includes("Match Rate")) matchRateNumFmt = row.getCell(2).numFmt ?? null;
      });
      expect(matchRateNumFmt).toBe("0.0%");
    }

    // 4) Bulk endpoints
    {
      const sid = await createDemoSession("audit");
      const { POST } = await import("@/app/api/sessions/[id]/matches/approve-all/route");
      const res = await POST(new Request("http://localhost/x"), { params: Promise.resolve({ id: sid }) });
      expect(res.status).toBe(200);
      const data = (await getHydratedSession(sid))!;
      const suggested = data.matches.filter((m) => m.status === "SUGGESTED_MATCH");
      expect(suggested.every((m) => m.isConfirmed)).toBe(true);
      const discrepancy = data.matches.filter((m) => m.status === "DISCREPANCY_MATCH");
      expect(discrepancy.every((m) => !m.isConfirmed)).toBe(true);
    }
    {
      const sid = await createDemoSession("umkm");
      const data0 = (await getHydratedSession(sid))!;
      const bankUnmatched = data0.unmatchedBank.slice(0, 2);
      expect(bankUnmatched.length).toBeGreaterThanOrEqual(1);
      const { POST } = await import("@/app/api/sessions/[id]/adjustments/bulk/route");
      const items = bankUnmatched.map((tx) => ({
        transactionId: tx.id,
        category: tx.direction === "IN" ? "UNRECORDED_RECEIPT" : "BANK_FEE",
        description: tx.description,
      }));
      if (items.length === 0) {
        const bookUnmatched = data0.unmatchedBook.slice(0, 1);
        items.push({ transactionId: bookUnmatched[0].id, category: "OUTSTANDING_CHECK", description: bookUnmatched[0].description });
      }
      const req = new Request(`http://localhost/api/sessions/${sid}/adjustments/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: sid }) });
      expect(res.status).toBe(201);
      await prisma.reconciliationSession.update({ where: { id: sid }, data: { status: "FINALIZED" } });
      const reqFinal = new Request(`http://localhost/api/sessions/${sid}/adjustments/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ transactionId: items[0].transactionId, category: "BANK_FEE", description: "Coba lagi" }] }),
      });
      const resFinal = await POST(reqFinal, { params: Promise.resolve({ id: sid }) });
      expect(resFinal.status).toBe(409);
    }

    // 5) PDF generator skenario audit
    {
      const sid = await createDemoSession("audit");
      await solveSession(sid);
      const data = (await getHydratedSession(sid))!;
      expect(data.journals.entries.length).toBeGreaterThanOrEqual(1);
      const { generatePdf } = await import("@/lib/export/pdfGenerator");
      const pdfBytes = generatePdf(data);
      expect(pdfBytes.length).toBeGreaterThan(0);
      expect(String.fromCharCode(pdfBytes[0], pdfBytes[1], pdfBytes[2], pdfBytes[3])).toBe("%PDF");
    }

    await prisma.$disconnect();
  }, 120000);
});
