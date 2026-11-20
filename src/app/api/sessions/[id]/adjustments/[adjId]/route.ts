import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { UpdateAdjustmentSchema, AdjustmentCategorySchema } from "@/lib/schemas/reconciliation";
import { buildAdjustmentFields } from "@/lib/engine/adjustments";
import { getHydratedSession, logAudit, recomputeSessionStatus, notFoundResponse, assertNotFinalized } from "@/lib/session";

/** PATCH & DELETE /api/sessions/[id]/adjustments/[adjId] (spec §7 endpoint 13). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; adjId: string }> }) {
  try {
    const { id, adjId } = await params;
    await assertNotFinalized(id);
    const body = await request.json();
    const parsed = UpdateAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }

    const adj = await prisma.classifiedAdjustment.findUnique({ where: { id: adjId } });
    if (!adj || adj.sessionId !== id) return notFoundResponse("Penyesuaian");

    const data: Record<string, unknown> = {};
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.contraAccountName !== undefined) data.contraAccountName = parsed.data.contraAccountName;
    if (parsed.data.auditNote !== undefined) data.auditNote = parsed.data.auditNote;

    if (parsed.data.category) {
      const categoryEnum = AdjustmentCategorySchema.parse(parsed.data.category);
      const absAmount = Math.abs(adj.signedAmount);
      const { side, signedAmount } = buildAdjustmentFields(categoryEnum, absAmount);
      data.category = categoryEnum;
      data.side = side;
      data.signedAmount = signedAmount;
    }

    await prisma.classifiedAdjustment.update({ where: { id: adjId }, data });
    await recomputeSessionStatus(id);
    await logAudit(id, "ADJUSTMENT_UPDATED", `Penyesuaian ${adjId} diperbarui.`, data);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; adjId: string }> }) {
  try {
    const { id, adjId } = await params;
    await assertNotFinalized(id);
    const adj = await prisma.classifiedAdjustment.findUnique({ where: { id: adjId } });
    if (!adj || adj.sessionId !== id) return notFoundResponse("Penyesuaian");

    await prisma.classifiedAdjustment.delete({ where: { id: adjId } });
    await recomputeSessionStatus(id);
    await logAudit(id, "ADJUSTMENT_DELETED", `Penyesuaian ${adjId} dihapus.`);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}