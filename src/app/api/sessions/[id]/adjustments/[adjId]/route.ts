import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { UpdateAdjustmentSchema, AdjustmentCategorySchema } from "@/lib/schemas/reconciliation";
import { buildAdjustmentFields, getAdjustmentSide } from "@/lib/engine/adjustments";
import { finalizeMutationResponse, requireEditableSession, notFoundResponse } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** PATCH & DELETE /api/sessions/[id]/adjustments/[adjId] (spec §7 endpoint 13). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; adjId: string }> }) {
  try {
    const { id, adjId } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);
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
      const newSide = getAdjustmentSide(categoryEnum);
      // Pindah sisi BANK↔BOOK selalu setel contraAccountName: null utk BANK, COA default utk BOOK.
      const { side, signedAmount, contraAccountName: finalContra } = buildAdjustmentFields(
        categoryEnum,
        absAmount,
        parsed.data.contraAccountName ?? (newSide === adj.side ? adj.contraAccountName : null),
      );
      data.category = categoryEnum;
      data.side = side;
      data.signedAmount = signedAmount;
      data.contraAccountName = finalContra;
    }

    await prisma.classifiedAdjustment.update({ where: { id: adjId }, data });
    const hydrated = await finalizeMutationResponse(id, "ADJUSTMENT_UPDATED", `Penyesuaian ${adjId} diperbarui.`, data);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; adjId: string }> }) {
  try {
    const { id, adjId } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);
    const adj = await prisma.classifiedAdjustment.findUnique({ where: { id: adjId } });
    if (!adj || adj.sessionId !== id) return notFoundResponse("Penyesuaian");
    if (adj.matchPairId !== null) {
      return failure("CONFLICT", "Penyesuaian ini terikat pada pasangan selisih. Batalkan (Unmatch) pasangan tersebut terlebih dahulu.", 409);
    }

    await prisma.classifiedAdjustment.delete({ where: { id: adjId } });
    const hydrated = await finalizeMutationResponse(id, "ADJUSTMENT_DELETED", `Penyesuaian ${adjId} dihapus.`);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}