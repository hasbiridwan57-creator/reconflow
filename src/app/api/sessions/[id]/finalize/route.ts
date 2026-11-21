import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { FinalizeSessionSchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, requireSessionAccess } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** POST /api/sessions/[id]/finalize — FINALIZE / REOPEN (spec §7 endpoint 14). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireSessionAccess(id, ownerKey);
    const body = await request.json().catch(() => ({}));
    const parsed = FinalizeSessionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { action, preparedBy, reviewedBy } = parsed.data;

    // Hydrate 1× untuk validasi FINALIZE; dipakai ulang untuk response.
    const hydrated = await getHydratedSession(id);
    if (!hydrated) return failure("NOT_FOUND", "Sesi tidak ditemukan.", 404);

    if (action === "FINALIZE") {
      const s = hydrated.summary;
      if (!s.isBalanced) {
        const details: string[] = [];
        if (s.variance !== 0) details.push(`variance belum 0 (Rp ${s.variance.toLocaleString("id-ID")})`);
        if (s.unclassifiedCount > 0) details.push(`masih ada ${s.unclassifiedCount} transaksi tak terklasifikasi`);
        if (s.pendingSuggestedCount > 0) details.push(`masih ada ${s.pendingSuggestedCount} saran match belum disetujui`);
        return failure("UNPROCESSABLE", `Tidak bisa FINALIZE: ${details.join(", ")}.`, 422);
      }

      const updateData: Record<string, string> = { status: "FINALIZED" };
      if (preparedBy) updateData.preparedBy = preparedBy;
      if (reviewedBy) updateData.reviewedBy = reviewedBy;
      await prisma.reconciliationSession.update({ where: { id }, data: updateData });
      await logAudit(id, "SESSION_FINALIZED", `Sesi difinalisasi (BALANCED Rp 0).`);
      hydrated.session.status = "FINALIZED";
      if (preparedBy) hydrated.session.preparedBy = preparedBy;
      if (reviewedBy) hydrated.session.reviewedBy = reviewedBy;
    } else {
      // REOPEN
      await prisma.reconciliationSession.update({ where: { id }, data: { status: "DRAFT" } });
      await logAudit(id, "SESSION_REOPENED", `Sesi dibuka kembali ke DRAFT.`);
      hydrated.session.status = "DRAFT";
    }

    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}