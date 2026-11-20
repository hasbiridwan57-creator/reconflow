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
        transactions: { select: { id: true, direction: true } },
        matches: { select: { bankTxId: true, bookTxId: true, isConfirmed: true } },
        adjustments: { select: { transactionId: true, side: true, signedAmount: true } },
      },
    });

    const list = sessions.map((s) => {
      const transactionCount = s.transactions.length;
      const confirmedMatches = s.matches.filter((m) => m.isConfirmed).length;
      const matchRate = transactionCount > 0 ? (confirmedMatches * 2) / transactionCount : 0;
      // Transaksi belum diklasifikasi = belum termatch & belum punya adjustment.
      const matchedTxIds = new Set(s.matches.filter((m) => m.isConfirmed).flatMap((m) => [m.bankTxId, m.bookTxId]));
      const unclassifiedCount = transactionCount - matchedTxIds.size - s.adjustments.length;
      // Adjusted variance = adjustedBank - adjustedBook (arah IN/OUT-aware).
      const dirOf = (txId: string | null) =>
        txId ? s.transactions.find((t) => t.id === txId)?.direction ?? "OUT" : "OUT";
      const sumWithSign = (adjList: typeof s.adjustments) =>
        adjList.reduce((sum, a) => sum + (dirOf(a.transactionId) === "IN" ? -a.signedAmount : a.signedAmount), 0);
      const adjustedBank = s.endingBankBalance + sumWithSign(s.adjustments.filter((a) => a.side === "BANK"));
      const adjustedBook = s.endingBookBalance + sumWithSign(s.adjustments.filter((a) => a.side === "BOOK"));
      return {
        id: s.id,
        companyName: s.companyName,
        bankAccountName: s.bankAccountName,
        periodLabel: s.periodLabel,
        periodEndDate: s.periodEndDate,
        status: s.status,
        demoScenarioKey: s.demoScenarioKey,
        endingBankBalance: s.endingBankBalance,
        endingBookBalance: s.endingBookBalance,
        transactionCount,
        matchRate,
        unclassifiedCount,
        variance: adjustedBank - adjustedBook,
        updatedAt: s.updatedAt.toISOString(),
      };
    });

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
