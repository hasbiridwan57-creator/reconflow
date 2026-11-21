import { db as prisma } from "@/lib/db";
import { success, handleError } from "@/lib/api";
import { finalizeMutationResponse, requireEditableSession } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/**
 * POST /api/sessions/[id]/matches/approve-all
 * Setujui SEMUA saran pasangan (SUGGESTED_MATCH) yang belum dikonfirmasi
 * dalam 1 transaksi atomik. DISCREPANCY_MATCH TIDAK disentuh (butuh keputusan
 * faultSide manual dari pengguna).
 *
 * Isolasi workspace: hanya pemilik sesi (atau showcase "public") boleh.
 * Optimasi: 1× cek editable + 1× hydrate untuk response.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);

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

    const hydrated = await finalizeMutationResponse(
      id,
      "BULK_APPROVE_SUGGESTED",
      `Menyetujui ${result.approved} saran pasangan cocok sekaligus.`,
    );
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}