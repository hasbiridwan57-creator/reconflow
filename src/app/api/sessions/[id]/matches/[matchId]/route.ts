import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { MatchActionSchema } from "@/lib/schemas/reconciliation";
import { resolveDiscrepancyAdjustment } from "@/lib/engine/discrepancy";
import type { CashDirection } from "@/lib/schemas/reconciliation";
import { finalizeMutationResponse, requireEditableSession, notFoundResponse } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** PATCH /api/sessions/[id]/matches/[matchId] — approve/reject (spec §7 endpoint 9). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  try {
    const { id, matchId } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);
    const body = await request.json();
    const parsed = MatchActionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { action, discrepancyResolution } = parsed.data;

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
      const hydrated = await finalizeMutationResponse(id, "MATCH_REJECTED", `Match ${matchId} ditolak.`);
      return success(hydrated);
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

      const hydrated = await finalizeMutationResponse(id, "MATCH_APPROVED", `Match ${matchId} disetujui.`);
      return success(hydrated);
    }
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE /api/sessions/[id]/matches/[matchId] — unmatch (spec §7 endpoint 11). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  try {
    const { id, matchId } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);

    const match = await prisma.matchPair.findUnique({ where: { id: matchId } });
    if (!match || match.sessionId !== id) return notFoundResponse("Match");

    await prisma.$transaction(async (tx) => {
      await tx.classifiedAdjustment.deleteMany({ where: { matchPairId: matchId } });
      await tx.matchPair.delete({ where: { id: matchId } });
    });
    const hydrated = await finalizeMutationResponse(id, "UNMATCHED", `Match ${matchId} dibatalkan kembali ke pool UNMATCHED.`);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}
