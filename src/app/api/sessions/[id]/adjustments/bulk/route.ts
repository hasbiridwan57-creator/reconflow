import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { BulkCreateAdjustmentsSchema } from "@/lib/schemas/reconciliation";
import { buildAdjustmentFields } from "@/lib/engine/adjustments";
import { finalizeMutationResponse, requireEditableSession } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/**
 * POST /api/sessions/[id]/adjustments/bulk
 * Klasifikasi banyak transaksi unmatched sekaligus dalam 1 transaksi atomik.
 * Melewati item yang sudah punya adjustment/match (skip); 409 bila SEMUA sudah terpakai.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);

    const body = await request.json();
    const parsed = BulkCreateAdjustmentsSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { items } = parsed.data;

    // Validasi seluruh transactionId milik sesi ini.
    const txIds = items.map((i) => i.transactionId);
    const owned = await prisma.transaction.findMany({
      where: { id: { in: txIds }, sessionId: id },
      include: { adjustment: true, bankMatch: true, bookMatch: true },
    });
    const ownedMap = new Map(owned.map((t) => [t.id, t]));

    // 422 validation error dicek dulu sebelum 409 eligibility.
    const missing = items.filter((i) => !ownedMap.has(i.transactionId));
    if (missing.length > 0) {
      return failure("VALIDATION_ERROR", `${missing.length} transactionId bukan milik sesi ini.`, 422);
    }

    // Filter hanya yang belum punya adjustment/match; skip yang sudah.
    const eligible = items.filter((i) => {
      const t = ownedMap.get(i.transactionId);
      if (!t) return false; // bukan milik sesi — skip
      return !t.adjustment && !t.bankMatch && !t.bookMatch;
    });

    if (eligible.length === 0) {
      return failure("CONFLICT", "Semua transaksi sudah memiliki penyesuaian atau pasangan.", 409);
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = eligible.map((i) => {
        const t = ownedMap.get(i.transactionId)!;
        const { side, signedAmount, contraAccountName } = buildAdjustmentFields(
          i.category,
          t.amount,
          i.contraAccountName,
        );
        return {
          sessionId: id,
          transactionId: i.transactionId,
          matchPairId: null,
          side,
          category: i.category,
          signedAmount,
          description: i.description,
          contraAccountName,
          auditNote: null,
        };
      });
      // createMany tak mengembalikan baris; cukup jumlah untuk audit.
      await tx.classifiedAdjustment.createMany({ data: rows });
      return rows.length;
    });

    const hydrated = await finalizeMutationResponse(
      id,
      "BULK_ADJUSTMENTS_CREATED",
      `Membuat ${created} penyesuaian sekaligus.`,
    );
    return success(hydrated, 201);
  } catch (error) {
    return handleError(error);
  }
}