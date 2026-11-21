import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { CreateAdjustmentSchema, AdjustmentCategorySchema } from "@/lib/schemas/reconciliation";
import { buildAdjustmentFields } from "@/lib/engine/adjustments";
import { finalizeMutationResponse, requireEditableSession, notFoundResponse } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** POST /api/sessions/[id]/adjustments — klasifikasi penyesuaian (spec §7 endpoint 12). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);
    const body = await request.json();
    const parsed = CreateAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { transactionId, matchPairId, category, description, contraAccountName, auditNote, customAmount } = parsed.data;

    if (!transactionId && !matchPairId) {
      return failure("VALIDATION_ERROR", "Wajib isi transactionId ATAU matchPairId.", 422);
    }

    const categoryEnum = AdjustmentCategorySchema.parse(category);

    let amount = customAmount;
    if (transactionId) {
      const tx = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { adjustment: true } });
      if (!tx || tx.sessionId !== id) return notFoundResponse("Transaksi");
      if (tx.adjustment) return failure("CONFLICT", "Transaksi sudah diklasifikasi.", 409);
      if (!customAmount) amount = tx.amount;
    }

    const { side, signedAmount, contraAccountName: finalContra } =
      buildAdjustmentFields(categoryEnum, amount ?? 0, contraAccountName);

    const adjustment = await prisma.classifiedAdjustment.create({
      data: {
        sessionId: id,
        transactionId: transactionId ?? null,
        matchPairId: matchPairId ?? null,
        side,
        category: categoryEnum,
        signedAmount,
        description,
        contraAccountName: finalContra,
        auditNote: auditNote ?? null,
      },
    });

    const hydrated = await finalizeMutationResponse(
      id,
      "ADJUSTMENT_CREATED",
      `Penyesuaian ${categoryEnum} (${side}) sebesar Rp ${signedAmount.toLocaleString("id-ID")}.`,
      { adjustmentId: adjustment.id },
    );
    return success(hydrated, 201);
  } catch (error) {
    return handleError(error);
  }
}