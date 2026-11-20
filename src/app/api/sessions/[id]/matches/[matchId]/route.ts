import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { MatchActionSchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, recomputeSessionStatus, notFoundResponse } from "@/lib/session";

/** PATCH /api/sessions/[id]/matches/[matchId] — approve/reject (spec §7 endpoint 9). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  try {
    const { id, matchId } = await params;
    const body = await request.json();
    const parsed = MatchActionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { action, discrepancyResolution } = parsed.data;

    const match = await prisma.matchPair.findUnique({ where: { id: matchId } });
    if (!match || match.sessionId !== id) return notFoundResponse("Match");

    if (action === "REJECT") {
      // Hapus penyesuaian terikat matchPairId (jika ada), lalu hapus match.
      await prisma.classifiedAdjustment.deleteMany({ where: { matchPairId: matchId } });
      await prisma.matchPair.delete({ where: { id: matchId } });
      await logAudit(id, "MATCH_REJECTED", `Match ${matchId} ditolak.`);
    } else {
      // APPROVE
      await prisma.matchPair.update({ where: { id: matchId }, data: { isConfirmed: true } });

      // Jika DISCREPANCY_MATCH dengan selisih != 0, buat ClassifiedAdjustment.
      // Konsisten dengan ground truth tests/helpers/scenarios.ts:
      //   faultSide BOOK  → side=BOOK, signedAmount = -amountDiff
      //   faultSide BANK  → side=BANK, signedAmount = +amountDiff (mirror)
      if (match.status === "DISCREPANCY_MATCH" && match.amountDiff !== 0) {
        const faultSide = discrepancyResolution?.faultSide ?? "BOOK";
        const isBook = faultSide === "BOOK";
        const signedAmount = isBook ? -match.amountDiff : match.amountDiff;
        const category =
          (isBook ? match.amountDiff < 0 : match.amountDiff > 0)
            ? (isBook ? "BOOK_ERROR_DEDUCT" : "BANK_ERROR_ADD")
            : (isBook ? "BOOK_ERROR_ADD" : "BANK_ERROR_DEDUCT");

        await prisma.classifiedAdjustment.create({
          data: {
            sessionId: id,
            matchPairId: matchId,
            side: faultSide,
            category,
            signedAmount,
            description: `Koreksi selisih transposisi (${faultSide})`,
            contraAccountName: discrepancyResolution?.contraAccountName ?? null,
            auditNote: discrepancyResolution?.auditNote ?? null,
          },
        });
      }

      await recomputeSessionStatus(id);
      await logAudit(id, "MATCH_APPROVED", `Match ${matchId} disetujui.`);
    }

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE /api/sessions/[id]/matches/[matchId] — unmatch (spec §7 endpoint 11). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  try {
    const { id, matchId } = await params;
    const match = await prisma.matchPair.findUnique({ where: { id: matchId } });
    if (!match || match.sessionId !== id) return notFoundResponse("Match");

    await prisma.classifiedAdjustment.deleteMany({ where: { matchPairId: matchId } });
    await prisma.matchPair.delete({ where: { id: matchId } });
    await recomputeSessionStatus(id);
    await logAudit(id, "UNMATCHED", `Match ${matchId} dibatalkan kembali ke pool UNMATCHED.`);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}
