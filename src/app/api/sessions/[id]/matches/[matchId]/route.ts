import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { MatchActionSchema } from "@/lib/schemas/reconciliation";
import { resolveDiscrepancyAdjustment } from "@/lib/engine/discrepancy";
import type { CashDirection } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, recomputeSessionStatus, notFoundResponse, assertNotFinalized } from "@/lib/session";

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

    const session = await prisma.reconciliationSession.findUnique({ where: { id }, select: { id: true } });
    if (!session) return notFoundResponse("Sesi");
    await assertNotFinalized(id);

    const match = await prisma.matchPair.findUnique({
      where: { id: matchId },
      include: {
        bankTx: { select: { direction: true } },
        bookTx: { select: { description: true, counterAccount: true } },
      },
    });
    if (!match || match.sessionId !== id) return notFoundResponse("Match");

    if (action === "REJECT") {
      // Guard double-approve/duplicate: hanya match belum dikonfirmasi yang boleh direject.
      if (match.isConfirmed) {
        return failure("CONFLICT", "Match sudah dikonfirmasi. Unmatch terlebih dahulu sebelum reject.", 409);
      }
      await prisma.$transaction(async (tx) => {
        await tx.classifiedAdjustment.deleteMany({ where: { matchPairId: matchId } });
        await tx.matchPair.delete({ where: { id: matchId } });
      });
      await recomputeSessionStatus(id);
      await logAudit(id, "MATCH_REJECTED", `Match ${matchId} ditolak.`);
    } else {
      // APPROVE — guard double-approve agar tidak membuat adjustment duplikat.
      if (match.isConfirmed) {
        return failure("CONFLICT", "Match sudah dikonfirmasi sebelumnya.", 409);
      }

      await prisma.$transaction(async (tx) => {
        await tx.matchPair.update({ where: { id: matchId }, data: { isConfirmed: true } });

        // Jika DISCREPANCY_MATCH dengan selisih != 0, buat ClassifiedAdjustment
        // via helper bersama (arah-aware: memakai bankTx.direction).
        if (match.status === "DISCREPANCY_MATCH" && match.amountDiff !== 0) {
          const faultSide = discrepancyResolution?.faultSide ?? "BOOK";
          const { signedAmount, category } = resolveDiscrepancyAdjustment(
            match.bankTx.direction as CashDirection,
            match.amountDiff,
            faultSide,
          );
          await tx.classifiedAdjustment.create({
            data: {
              sessionId: id,
              matchPairId: matchId,
              side: faultSide,
              category,
              signedAmount,
              description: `Koreksi selisih: ${match.bookTx.description}`,
              contraAccountName: discrepancyResolution?.contraAccountName || (faultSide === "BOOK" ? match.bookTx.counterAccount : null),
              auditNote: discrepancyResolution?.auditNote ?? null,
            },
          });
        }
      });

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
    const session = await prisma.reconciliationSession.findUnique({ where: { id }, select: { id: true } });
    if (!session) return notFoundResponse("Sesi");
    await assertNotFinalized(id);

    const match = await prisma.matchPair.findUnique({ where: { id: matchId } });
    if (!match || match.sessionId !== id) return notFoundResponse("Match");

    await prisma.$transaction(async (tx) => {
      await tx.classifiedAdjustment.deleteMany({ where: { matchPairId: matchId } });
      await tx.matchPair.delete({ where: { id: matchId } });
    });
    await recomputeSessionStatus(id);
    await logAudit(id, "UNMATCHED", `Match ${matchId} dibatalkan kembali ke pool UNMATCHED.`);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}
