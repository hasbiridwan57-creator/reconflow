import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { UpdateSessionSchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, notFoundResponse } from "@/lib/session";

/** GET /api/sessions/[id] — Hydrated Session (spec §7 endpoint 5). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const body = await request.json();
    const parsed = UpdateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }

    const session = await prisma.reconciliationSession.findUnique({ where: { id } });
    if (!session) return notFoundResponse("Sesi");
    if (session.status === "FINALIZED") {
      return failure("CONFLICT", "Sesi sudah FINALIZED dan tidak bisa diubah. Buka kembali (REOPEN) terlebih dahulu.", 409);
    }

    await prisma.reconciliationSession.update({ where: { id }, data: parsed.data });
    await logAudit(id, "SESSION_UPDATED", `Metadata sesi diperbarui.`, parsed.data as Record<string, unknown>);

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}

/** DELETE /api/sessions/[id] — hapus sesi (cascade). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await prisma.reconciliationSession.findUnique({ where: { id } });
    if (!session) return notFoundResponse("Sesi");

    await prisma.reconciliationSession.delete({ where: { id } });
    return success({ id, deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
