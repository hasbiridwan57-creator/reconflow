import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { ManualPairSchema } from "@/lib/schemas/reconciliation";
import { resolveDiscrepancyAdjustment } from "@/lib/engine/discrepancy";
import { defaultContraAccount } from "@/lib/engine/adjustments";
import type { CashDirection } from "@/lib/schemas/reconciliation";
import { dateDiffDays } from "@/lib/engine/parser";
import { finalizeMutationResponse, requireEditableSession, notFoundResponse } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** POST /api/sessions/[id]/matches/manual — pasangkan manual (spec §7 endpoint 10). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);

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
    // Validasi discrepancyResolution SEBELUM membuat MatchPair di DB (Gemini #6).
    if (amountDiff !== 0 && !discrepancyResolution) {
      return failure("VALIDATION_ERROR", "Nominal berbeda: wajib isi discrepancyResolution.", 422);
    }

    await prisma.$transaction(async (tx) => {
      const createdMatch = await tx.matchPair.create({
        data: {
          sessionId: id,
          bankTxId,
          bookTxId,
          status: "MANUAL_MATCH",
          confidenceScore: 100,
          reasonsJson: JSON.stringify(["Dipasangkan manual oleh pengguna"]),
          amountDiff,
          dateDiffDays: Math.abs(dateDiffDays(bankTx.date, bookTx.date)),
          isConfirmed: true,
        },
      });

      // Jika selisih != 0, buat penyesuaian via helper bersama (arah-aware).
      if (amountDiff !== 0 && discrepancyResolution) {
        const faultSide = discrepancyResolution.faultSide;
        const { signedAmount, category } = resolveDiscrepancyAdjustment(
          bankTx.direction as CashDirection,
          amountDiff,
          faultSide,
        );
        await tx.classifiedAdjustment.create({
          data: {
            sessionId: id,
            matchPairId: createdMatch.id,
            side: faultSide,
            category,
            signedAmount,
            description: discrepancyResolution.description || `Koreksi selisih: ${bookTx.description}`,
            contraAccountName: discrepancyResolution.contraAccountName || (faultSide === "BOOK" ? (bookTx.counterAccount || defaultContraAccount(category)) : null),
            auditNote: auditNote ?? null,
          },
        });
      }

      return createdMatch;
    });

    const hydrated = await finalizeMutationResponse(
      id,
      "MANUAL_PAIRED",
      `Manual match: ${bankTxId} <-> ${bookTxId}.`,
      { bankTxId, bookTxId, auditNote },
    );
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}
