import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { UpdateSessionSchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, requireEditableSession, requireSessionAccess, notFoundResponse } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";

/** GET /api/sessions/[id] — Hydrated Session (spec §7 endpoint 5). Isolasi: pemilik atau "public". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireSessionAccess(id, ownerKey);
    const hydrated = await getHydratedSession(id);
    if (!hydrated) return notFoundResponse("Sesi");
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}

/** PATCH /api/sessions/[id] — update metadata/saldo/config (spec §7 endpoint 6). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    await requireEditableSession(id, ownerKey);
    const body = await request.json();
    const parsed = UpdateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }

    await prisma.reconciliationSession.update({ where: { id }, data: parsed.data });
    await logAudit(id, "SESSION_UPDATED", `Metadata sesi diperbarui.`, parsed.data as Record<string, unknown>);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/sessions/[id] — hapus sesi (cascade).
 * Isolasi ketat: HANYA pemilik sesi boleh menghapus (showcase "public"
 * tidak boleh dihapus oleh pengunjung lain agar demo tetap hidup).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ownerKey } = getWorkspaceKey(request);
    const session = await requireSessionAccess(id, ownerKey);
    if (session.ownerKey !== ownerKey) {
      return failure("FORBIDDEN", "Sesi showcase tidak bisa dihapus.", 403);
    }

    await prisma.reconciliationSession.delete({ where: { id } });
    return success({ id, deleted: true });
  } catch (error) {
    return handleError(error);
  }
}