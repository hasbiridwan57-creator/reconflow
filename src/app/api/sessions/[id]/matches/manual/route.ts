import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { ManualPairSchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, recomputeSessionStatus, notFoundResponse } from "@/lib/session";

/** POST /api/sessions/[id]/matches/manual — pasangkan manual (spec §7 endpoint 10). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = ManualPairSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { bankTxId, bookTxId, discrepancyResolution, auditNote } = parsed.data;

    const [bankTx, bookTx] = await Promise.all([
      prisma.transaction.findUnique({ where: { id: bankTxId }, include: { bankMatch: true, adjustment: true } }),
      prisma.transaction.findUnique({ where: { id: bookTxId }, include: { bookMatch: true, adjustment: true } }),
    ]);

    if (!bankTx || bankTx.sessionId !== id) return notFoundResponse("Transaksi bank");
    if (!bookTx || bookTx.sessionId !== id) return notFoundResponse("Transaksi buku");
    if (bankTx.source !== "BANK") return failure("VALIDATION_ERROR", "bankTxId bukan transaksi bank.", 400);
    if (bookTx.source !== "BOOK") return failure("VALIDATION_ERROR", "bookTxId bukan transaksi buku.", 400);
    if (bankTx.direction !== bookTx.direction) {
      return failure("VALIDATION_ERROR", "Arah arus kas bank & buku harus sama (IN/IN atau OUT/OUT).", 400);
    }
    if (bankTx.bankMatch || bankTx.adjustment || bookTx.bookMatch || bookTx.adjustment) {
      return failure("CONFLICT", "Salah satu transaksi sudah termatch atau sudah diklasifikasi.", 409);
    }

    const amountDiff = bankTx.amount - bookTx.amount;
    const match = await prisma.matchPair.create({
      data: {
        sessionId: id,
        bankTxId,
        bookTxId,
        status: "MANUAL_MATCH",
        confidenceScore: 100,
        reasonsJson: JSON.stringify(["Dipasangkan manual oleh pengguna"]),
        amountDiff,
        dateDiffDays: 0,
        isConfirmed: true,
      },
    });

    // Jika selisih != 0, buat penyesuaian dari discrepancyResolution.
    if (amountDiff !== 0) {
      if (!discrepancyResolution) {
        return failure("VALIDATION_ERROR", "Nominal berbeda: wajib isi discrepancyResolution.", 422);
      }
      const faultSide = discrepancyResolution.faultSide;
      const absDiff = Math.abs(amountDiff);
      let category: string;
      let signedAmount: number;
      if (amountDiff > 0) {
        category = faultSide === "BOOK" ? "BOOK_ERROR_ADD" : "BANK_ERROR_DEDUCT";
        signedAmount = faultSide === "BOOK" ? absDiff : -absDiff;
      } else {
        category = faultSide === "BOOK" ? "BOOK_ERROR_DEDUCT" : "BANK_ERROR_ADD";
        signedAmount = faultSide === "BOOK" ? -absDiff : absDiff;
      }
      await prisma.classifiedAdjustment.create({
        data: {
          sessionId: id,
          matchPairId: match.id,
          side: faultSide,
          category,
          signedAmount,
          description: discrepancyResolution.description ?? "Koreksi selisih manual match",
          contraAccountName: discrepancyResolution.contraAccountName ?? null,
          auditNote: auditNote ?? null,
        },
      });
    }

    await recomputeSessionStatus(id);
    await logAudit(id, "MANUAL_PAIRED", `Manual match: ${bankTxId} <-> ${bookTxId}.`, { bankTxId, bookTxId, auditNote });

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}
