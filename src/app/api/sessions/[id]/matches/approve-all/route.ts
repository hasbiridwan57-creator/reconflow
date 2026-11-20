import { db as prisma } from "@/lib/db";
import { success, handleError } from "@/lib/api";
import { getHydratedSession, logAudit, recomputeSessionStatus, notFoundResponse, assertNotFinalized } from "@/lib/session";

/**
 * POST /api/sessions/[id]/matches/approve-all
 * Setujui SEMUA saran pasangan (SUGGESTED_MATCH) yang belum dikonfirmasi
 * dalam 1 transaksi atomik. DISCREPANCY_MATCH TIDAK disentuh (butuh keputusan
 * faultSide manual dari pengguna).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await prisma.reconciliationSession.findUnique({ where: { id }, select: { id: true } });
    if (!session) return notFoundResponse("Sesi");
    await assertNotFinalized(id);

    const result = await prisma.$transaction(async (tx) => {
      // Hanya SUGGESTED_MATCH yang belum dikonfirmasi — JANGAN sentuh DISCREPANCY_MATCH.
      const pending = await tx.matchPair.findMany({
        where: { sessionId: id, status: "SUGGESTED_MATCH", isConfirmed: false },
        select: { id: true },
      });
      if (pending.length === 0) return { approved: 0 };
      await tx.matchPair.updateMany({
        where: { sessionId: id, status: "SUGGESTED_MATCH", isConfirmed: false },
        data: { isConfirmed: true },
      });
      return { approved: pending.length };
    });

    await recomputeSessionStatus(id);
    await logAudit(id, "BULK_APPROVE_SUGGESTED", `Menyetujui ${result.approved} saran pasangan cocok sekaligus.`);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}