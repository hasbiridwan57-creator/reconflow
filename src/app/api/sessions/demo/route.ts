import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { CreateDemoSessionSchema } from "@/lib/schemas/reconciliation";
import { DEMO_SCENARIOS, DEFAULT_MATCHING_CONFIG } from "@/lib/demo/scenarios";
import { parseCsvToTransactions } from "@/lib/csvToTx";
import { logAudit, runAndPersistAutoMatch, toPrismaTxInputs } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** POST /api/sessions/demo — buat sesi demo dari dataset bawaan (spec §7 endpoint 4). */
export async function POST(request: Request) {
  try {
    const { ownerKey } = getWorkspaceKey(request);
    const body = await request.json();
    const parsed = CreateDemoSessionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "scenarioKey tidak valid.", 422, parsed.error.issues);
    }
    const { scenarioKey } = parsed.data;
    const scenario = DEMO_SCENARIOS.find((s) => s.scenarioKey === scenarioKey);
    if (!scenario) {
      return failure("NOT_FOUND", `Skenario "${scenarioKey}" tidak ditemukan.`, 404);
    }

    const bankTxs = parseCsvToTransactions(scenario.bankCsv, "BANK");
    const bookTxs = parseCsvToTransactions(scenario.bookCsv, "BOOK");

    const session = await prisma.reconciliationSession.create({
      data: {
        ownerKey,
        companyName: scenario.companyName,
        bankAccountName: scenario.bankAccountName,
        periodLabel: scenario.periodLabel,
        periodEndDate: scenario.periodEndDate,
        openingBalance: scenario.openingBalance,
        endingBankBalance: scenario.endingBankBalance,
        endingBookBalance: scenario.endingBookBalance,
        demoScenarioKey: scenario.scenarioKey,
        dateToleranceDays: DEFAULT_MATCHING_CONFIG.dateToleranceDays,
        amountToleranceRupiah: DEFAULT_MATCHING_CONFIG.amountToleranceRupiah,
        minFuzzyScore: DEFAULT_MATCHING_CONFIG.minFuzzyScore,
        detectTransposition: DEFAULT_MATCHING_CONFIG.detectTransposition,
        transactions: { create: [...toPrismaTxInputs(bankTxs), ...toPrismaTxInputs(bookTxs)] },
      },
    });

    await logAudit(session.id, "SESSION_CREATED", `Sesi demo "${scenario.companyName}" (${scenarioKey}) dibuat.`);

    const count = await runAndPersistAutoMatch(session.id, DEFAULT_MATCHING_CONFIG);
    await logAudit(session.id, "AUTO_MATCH_RUN", `Auto-match awal: ${count} pasangan ditemukan.`);

    return success({ id: session.id }, 201);
  } catch (error) {
    return handleError(error);
  }
}
