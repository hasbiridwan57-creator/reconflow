/**
 * Carry-forward outstanding (OPI) — bawa item belum tuntas dari sesi sebelumnya
 * ke sesi baru sebagai kandidat penyesuaian awal.
 *
 * Definisi "belum tuntas" (konsisten dengan kalkulator):
 * - Tidak ada MatchPair (belum termatch) ATAU matchnya belum dikonfirmasi, DAN
 * - Belum punya ClassifiedAdjustment (belum diklasifikasi).
 * Hanya transaksi sisi BANK yang dibawa: konsep deposit in transit / cek
 * beredar memang milik rekening koran; buku kas dianggap sudah dicatat.
 *
 * Kategori diambil dari arah transaksi:
 * - IN  → DEPOSIT_IN_TRANSIT (setoran dalam perjalanan, dampak + ke bank)
 * - OUT → OUTSTANDING_CHECK  (cek beredar, dampak − ke bank)
 *
 * Keamanan akuntansi:
 * - Hanya sesi milik ownerKey yang sama (atau showcase public) yang boleh dipakai.
 * - Hanya sesi FINALIZED/BALANCED yang boleh jadi sumber (angka sudah sah).
 * - Idempoten: setiap carry menyimpan `sourceTransactionId` unik; jika sesi tujuan
 *   sudah memiliki penyesuaian dari sumber yang sama, item itu dilewati.
 * - Membuat penyesuaian TANPA transactionId (penyesuaian mandiri, bukan duplikat
 *   klasifikasi transaksi) sehingga engine akuntansi yang lama tidak tersentuh.
 */
import { db as prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import { canAccessSession } from "@/lib/workspace";
import { buildAdjustmentFields } from "@/lib/engine/adjustments";
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";

export interface CarryForwardItem {
  sourceTransactionId: string;
  side: "BANK" | "BOOK";
  category: AdjustmentCategory;
  signedAmount: number;
  description: string;
  date: string;
  reference: string;
}

export interface CarryForwardPlan {
  sourceSessionId: string;
  sourcePeriodLabel: string;
  items: CarryForwardItem[];
  totalSignedAmount: number;
}

/** Kandidat penyesuaian bawaan dari satu sesi sumber. */
export function buildCarryForwardItems(
  transactions: Array<{
    id: string;
    source: string;
    direction: string;
    amount: number;
    date: string;
    reference: string;
    description: string;
    adjustment: unknown | null;
    bankMatch: unknown | null;
    bookMatch: unknown | null;
  }>,
): CarryForwardItem[] {
  const items: CarryForwardItem[] = [];
  for (const tx of transactions) {
    if (tx.source !== "BANK") continue;
    // Sudah diklasifikasi → selesai, jangan dibawa.
    if (tx.adjustment) continue;
    // Belum termatch ATAU match belum dikonfirmasi → masih menggantung.
    const match = tx.bankMatch ?? tx.bookMatch;
    const hasConfirmedMatch = Boolean(match && (match as { isConfirmed?: boolean }).isConfirmed);
    if (hasConfirmedMatch) continue;

    const category: AdjustmentCategory = tx.direction === "IN" ? "DEPOSIT_IN_TRANSIT" : "OUTSTANDING_CHECK";
    const { signedAmount } = buildAdjustmentFields(category, tx.amount);
    items.push({
      sourceTransactionId: tx.id,
      side: "BANK",
      category,
      signedAmount,
      description: tx.description || tx.reference || "Transaksi belum tuntas periode sebelumnya",
      date: tx.date,
      reference: tx.reference,
    });
  }
  return items;
}

/** Susun rencana carry-forward dari sesi sumber → sesi tujuan (validasi akses & status). */
export async function buildCarryForwardPlan(
  sourceSessionId: string,
  targetSessionId: string,
  ownerKey: string,
): Promise<CarryForwardPlan> {
  const source = await prisma.reconciliationSession.findUnique({
    where: { id: sourceSessionId },
    include: {
      transactions: { include: { adjustment: true, bankMatch: true, bookMatch: true } },
    },
  });
  if (!source) notFound("Sesi sumber");
  if (!canAccessSession(source.ownerKey, ownerKey)) notFound("Sesi sumber");
  if (!["BALANCED", "FINALIZED"].includes(source.status)) {
    notFound("Sesi sumber (harus BALANCED atau FINALIZED)");
  }

  const target = await prisma.reconciliationSession.findUnique({
    where: { id: targetSessionId },
    select: { id: true, ownerKey: true },
  });
  if (!target) notFound("Sesi tujuan");
  if (!canAccessSession(target.ownerKey, ownerKey)) notFound("Sesi tujuan");

  const items = buildCarryForwardItems(source.transactions);
  return {
    sourceSessionId: source.id,
    sourcePeriodLabel: source.periodLabel,
    items,
    totalSignedAmount: items.reduce((sum, i) => sum + i.signedAmount, 0),
  };
}

export interface CarryForwardApplyResult {
  createdCount: number;
  skippedCount: number;
  totalSignedAmount: number;
}

/**
 * Terapkan rencana carry-forward: buat penyesuaian mandiri di sesi tujuan.
 * Idempoten per (sessionId, sourceTransactionId). Penyesuaian dibuat tanpa
 * transactionId agar tidak menabrak transaksi baru milik sesi tujuan.
 */
export async function applyCarryForward(
  targetSessionId: string,
  plan: CarryForwardPlan,
): Promise<CarryForwardApplyResult> {
  if (plan.items.length === 0) {
    return { createdCount: 0, skippedCount: 0, totalSignedAmount: 0 };
  }

  const existing = await prisma.classifiedAdjustment.findMany({
    where: {
      sessionId: targetSessionId,
      auditNote: { not: null },
    },
    select: { auditNote: true },
  });
  const existingSources = new Set(
    existing
      .map((a) => a.auditNote ?? "")
      .map((note) => note.match(/SRC_TX:(\S+)/)?.[1])
      .filter(Boolean) as string[],
  );

  let createdCount = 0;
  let skippedCount = 0;
  let totalSignedAmount = 0;

  for (const item of plan.items) {
    if (existingSources.has(item.sourceTransactionId)) {
      skippedCount += 1;
      continue;
    }
    await prisma.classifiedAdjustment.create({
      data: {
        sessionId: targetSessionId,
        side: item.side,
        category: item.category,
        signedAmount: item.signedAmount,
        description: `[Dibawa dari ${plan.sourcePeriodLabel}] ${item.description}`,
        auditNote: `Carry-forward dari sesi ${plan.sourceSessionId} · SRC_TX:${item.sourceTransactionId}`,
      },
    });
    existingSources.add(item.sourceTransactionId);
    createdCount += 1;
    totalSignedAmount += item.signedAmount;
  }

  return { createdCount, skippedCount, totalSignedAmount };
}
