import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { CreateSessionSchema } from "@/lib/schemas/reconciliation";
import { logAudit, runAndPersistAutoMatch, toPrismaTxInputs } from "@/lib/session";

/** GET /api/sessions — daftar semua sesi (ringkasan). */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const status = url.searchParams.get("status") ?? "";

    const where: { OR?: Array<{ companyName: { contains: string } } | { bankAccountName: { contains: string } }>; status?: string } = {};
    if (q) {
      where.OR = [{ companyName: { contains: q } }, { bankAccountName: { contains: q } }];
    }
    if (status) where.status = status;

    const sessions = await prisma.reconciliationSession.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        transactions: { select: { id: true } },
        matches: { select: { isConfirmed: true, status: true } },
        adjustments: { select: { id: true } },
      },
    });

    const list = sessions.map((s) => ({
      id: s.id,
      companyName: s.companyName,
      bankAccountName: s.bankAccountName,
      periodLabel: s.periodLabel,
      periodEndDate: s.periodEndDate,
      status: s.status,
      demoScenarioKey: s.demoScenarioKey,
      endingBankBalance: s.endingBankBalance,
      endingBookBalance: s.endingBookBalance,
      transactionCount: s.transactions.length,
      matchRate: s.transactions.length > 0 ? Math.round((s.matches.filter((m) => m.isConfirmed).length * 2 / s.transactions.length) * 100) : 0,
      unclassifiedCount: s.transactions.length - s.adjustments.length,
      updatedAt: s.updatedAt.toISOString(),
    }));

    return success(list);
  } catch (error) {
    return handleError(error);
  }
}

/** POST /api/sessions — buat sesi dari CSV mentah + auto-match awal. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const input = parsed.data;

    const config = {
      dateToleranceDays: input.config?.dateToleranceDays ?? 3,
      amountToleranceRupiah: input.config?.amountToleranceRupiah ?? 0,
      minFuzzyScore: input.config?.minFuzzyScore ?? 0.35,
      detectTransposition: input.config?.detectTransposition ?? true,
    };

    const session = await prisma.reconciliationSession.create({
      data: {
        companyName: input.companyName,
        bankAccountName: input.bankAccountName,
        periodLabel: input.periodLabel,
        periodEndDate: input.periodEndDate,
        preparedBy: input.preparedBy ?? "Tim Keuangan",
        reviewedBy: input.reviewedBy ?? "Manajer Keuangan",
        openingBalance: input.openingBalance ?? 0,
        endingBankBalance: input.endingBankBalance,
        endingBookBalance: input.endingBookBalance,
        dateToleranceDays: config.dateToleranceDays,
        amountToleranceRupiah: config.amountToleranceRupiah,
        minFuzzyScore: config.minFuzzyScore,
        detectTransposition: config.detectTransposition,
        transactions: {
          create: [...toPrismaTxInputs(input.bankTransactions), ...toPrismaTxInputs(input.bookTransactions)],
        },
      },
      include: { transactions: true },
    });

    await logAudit(session.id, "SESSION_CREATED", `Sesi "${session.companyName}" dibuat.`);

    // Auto-match awal (3-Pass).
    const count = await runAndPersistAutoMatch(session.id, config);
    await logAudit(session.id, "AUTO_MATCH_RUN", `Auto-match awal: ${count} pasangan ditemukan.`);

    return success({ id: session.id }, 201);
  } catch (error) {
    return handleError(error);
  }
}
