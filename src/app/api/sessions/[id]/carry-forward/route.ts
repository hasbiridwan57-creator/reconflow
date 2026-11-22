/**
 * Carry-forward outstanding (OPI).
 *
 * GET  /api/sessions/[id]/carry-forward?source=<sessionId>
 *      → rencana bawaan (daftar item belum tuntas dari sesi sumber), TANPA menulis.
 * POST /api/sessions/[id]/carry-forward  body: { sourceSessionId }
 *      → terapkan: buat penyesuaian BANK (DEPOSIT_IN_TRANSIT / OUTSTANDING_CHECK)
 *        di sesi target. Idempoten per transaksi sumber.
 */
import { success, failure, handleError } from "@/lib/api";
import { z } from "zod";
import { requireSessionAccess } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";
import { buildCarryForwardPlan, applyCarryForward } from "@/lib/engine/carryForward";
import { logAudit } from "@/lib/session";

const CarryForwardSchema = z.object({
  sourceSessionId: z.string().min(1),
});

/** GET — lihat rencana carry-forward (read-only, tanpa efek samping). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireSessionAccess(id, ownerKey);

    const sourceSessionId = new URL(request.url).searchParams.get("source");
    if (!sourceSessionId) {
      return failure("VALIDATION_ERROR", "Query param `source` wajib diisi (id sesi sumber).", 422);
    }

    const plan = await buildCarryForwardPlan(sourceSessionId, id, ownerKey);
    return success(plan);
  } catch (error) {
    return handleError(error);
  }
}

/** POST — terapkan carry-forward ke sesi target. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireSessionAccess(id, ownerKey);

    const body = await request.json();
    const parsed = CarryForwardSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    if (parsed.data.sourceSessionId === id) {
      return failure("VALIDATION_ERROR", "Sesi sumber dan tujuan tidak boleh sama.", 422);
    }

    const plan = await buildCarryForwardPlan(parsed.data.sourceSessionId, id, ownerKey);
    const result = await applyCarryForward(id, plan);

    await logAudit(
      id,
      "ADJUSTMENT_CREATED",
      `Carry-forward dari "${plan.sourcePeriodLabel}": ${result.createdCount} item dibawa (total Rp ${result.totalSignedAmount.toLocaleString("id-ID")}), ${result.skippedCount} dilewati (sudah ada).`,
      { sourceSessionId: plan.sourceSessionId, ...result },
    );

    return success({
      sourceSessionId: plan.sourceSessionId,
      sourcePeriodLabel: plan.sourcePeriodLabel,
      ...result,
    });
  } catch (error) {
    return handleError(error);
  }
}
