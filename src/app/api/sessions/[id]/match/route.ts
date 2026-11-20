import { db as prisma } from "@/lib/db";
import { success, handleError } from "@/lib/api";
import { MatchingConfigSchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, runAndPersistAutoMatch, notFoundResponse, assertNotFinalized } from "@/lib/session";

/** POST /api/sessions/[id]/match — re-run 3-Pass matcher (spec §7 endpoint 8). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await prisma.reconciliationSession.findUnique({ where: { id } });
    if (!session) return notFoundResponse("Sesi");
    await assertNotFinalized(id);

    // Baca body opsional (config). Jika kosong, pakai config tersimpan.
    let config = {
      dateToleranceDays: session.dateToleranceDays,
      amountToleranceRupiah: session.amountToleranceRupiah,
      minFuzzyScore: session.minFuzzyScore,
      detectTransposition: session.detectTransposition,
    };

    const raw = await request.text();
    if (raw.trim()) {
      const parsed = MatchingConfigSchema.partial().safeParse(JSON.parse(raw));
      if (parsed.success) {
        config = { ...config, ...parsed.data };
        await prisma.reconciliationSession.update({ where: { id }, data: config });
      }
    }

    // Hapus hanya MatchPair yang belum dikonfirmasi (SUGGESTED/DISCREPANCY).
    await prisma.matchPair.deleteMany({ where: { sessionId: id, isConfirmed: false } });

    const count = await runAndPersistAutoMatch(id, config);
    await logAudit(id, "AUTO_MATCH_RUN", `Auto-match dijalankan ulang: ${count} pasangan baru.`, { config });

    const hydrated = await getHydratedSession(id);
    return success(hydrated);
  } catch (error) {
    return handleError(error);
  }
}
