import { db as prisma } from "@/lib/db";
import { success, failure, handleError } from "@/lib/api";
import { CreateAdjustmentSchema, AdjustmentCategorySchema } from "@/lib/schemas/reconciliation";
import { getHydratedSession, logAudit, recomputeSessionStatus, notFoundResponse } from "@/lib/session";

// Tabel 3.3: side diturunkan dari category (BANK vs BOOK).
const BANK_CATEGORIES = new Set(["DEPOSIT_IN_TRANSIT", "OUTSTANDING_CHECK", "BANK_ERROR_ADD", "BANK_ERROR_DEDUCT"]);
// Tanda: positif menambah, negatif mengurangi saldo sisi tsb.
const POSITIVE_CATEGORIES = new Set(["DEPOSIT_IN_TRANSIT", "BANK_ERROR_ADD", "INTEREST_INCOME", "UNRECORDED_RECEIPT", "BOOK_ERROR_ADD"]);

/** POST /api/sessions/[id]/adjustments — klasifikasi penyesuaian (spec §7 endpoint 12). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = CreateAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return failure("VALIDATION_ERROR", "Payload tidak valid.", 422, parsed.error.issues);
    }
    const { transactionId, matchPairId, category, description, contraAccountName, auditNote, customAmount } = parsed.data;

    if (!transactionId && !matchPairId) {
      return failure("VALIDATION_ERROR", "Wajib isi transactionId ATAU matchPairId.", 422);
    }

    const session = await prisma.reconciliationSession.findUnique({ where: { id } });
    if (!session) return notFoundResponse("Sesi");

    const categoryEnum = AdjustmentCategorySchema.parse(category);
    const side = BANK_CATEGORIES.has(categoryEnum) ? "BANK" : "BOOK";

    let amount = customAmount;
    if (transactionId) {
      const tx = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { adjustment: true } });
      if (!tx || tx.sessionId !== id) return notFoundResponse("Transaksi");
      if (tx.adjustment) return failure("CONFLICT", "Transaksi sudah diklasifikasi.", 409);
      if (!customAmount) amount = tx.amount;
    }

    const absAmount = Math.abs(Math.round(amount ?? 0));
    const signedAmount = POSITIVE_CATEGORIES.has(categoryEnum) ? absAmount : -absAmount;

    // COA default untuk sisi BOOK jika user tidak isi.
    const finalContra = side === "BOOK" && !contraAccountName ? defaultContra(categoryEnum) : contraAccountName;

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

    await recomputeSessionStatus(id);
    await logAudit(id, "ADJUSTMENT_CREATED", `Penyesuaian ${categoryEnum} (${side}) sebesar Rp ${signedAmount.toLocaleString("id-ID")}.`, { adjustmentId: adjustment.id });

    const hydrated = await getHydratedSession(id);
    return success(hydrated, 201);
  } catch (error) {
    return handleError(error);
  }
}

function defaultContra(category: string): string {
  const map: Record<string, string> = {
    INTEREST_INCOME: "Pendapatan Jasa Giro",
    UNRECORDED_RECEIPT: "Piutang Usaha",
    BANK_FEE: "Beban Administrasi Bank",
    TAX_ON_INTEREST: "Beban Pajak Jasa Giro",
    NSF_CHECK: "Piutang Usaha (Cek Kosong)",
    UNRECORDED_EXPENSE: "Beban Lain-lain",
    BOOK_ERROR_ADD: "Koreksi Beban / Selisih Pembukuan",
    BOOK_ERROR_DEDUCT: "Koreksi Beban / Selisih Pembukuan",
  };
  return map[category] ?? "Koreksi Beban / Selisih Pembukuan";
}
