/**
 * Service layer untuk Hydrated Session.
 * Menyatukan Prisma data + calculator + journals menjadi respons API deterministik.
 * Lihat RECONFLOW_MASTER_SPEC.md §7 & §5.
 */
import { db as prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { conflict } from "@/lib/api";
import type { MatchingConfig, NormalizedTransactionInput } from "@/lib/schemas/reconciliation";
import type {
  Transaction,
  ReconciliationSession,
  MatchPair,
  ClassifiedAdjustment,
} from "@prisma/client";
import { runMatchingEngine } from "@/lib/engine/matcher";
import { normalizeDescription } from "@/lib/engine/textSimilarity";
import { calculateReconciliation } from "@/lib/engine/calculator";
import { generateAdjustingJournals } from "@/lib/engine/journals";
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";

/* ---------------- DTO interfaces (Hydrated Session) ---------------- */

export interface TransactionDTO {
  id: string;
  source: "BANK" | "BOOK";
  rowIndex: number;
  date: string;
  reference: string;
  description: string;
  normalizedDesc: string;
  direction: "IN" | "OUT";
  amount: number;
  runningBalance: number | null;
  counterAccount: string | null;
  matchStatus: string | null; // status MatchPair jika sudah termatch
  adjustmentId: string | null;
}

export interface MatchPairDTO {
  id: string;
  bankTx: TransactionDTO;
  bookTx: TransactionDTO;
  status: string;
  confidenceScore: number;
  reasons: string[];
  amountDiff: number;
  dateDiffDays: number;
  isConfirmed: boolean;
}

export interface ClassifiedAdjustmentDTO {
  id: string;
  transactionId: string | null;
  matchPairId: string | null;
  side: "BANK" | "BOOK";
  category: AdjustmentCategory;
  signedAmount: number;
  description: string;
  contraAccountName: string | null;
  auditNote: string | null;
}

export interface AuditLogDTO {
  id: string;
  action: string;
  summary: string;
  metadata: string | null;
  createdAt: string;
}

export interface SessionMeta {
  id: string;
  companyName: string;
  bankAccountName: string;
  periodLabel: string;
  periodEndDate: string;
  preparedBy: string;
  reviewedBy: string;
  status: string;
  demoScenarioKey: string | null;
  openingBalance: number;
  endingBankBalance: number;
  endingBookBalance: number;
  dateToleranceDays: number;
  amountToleranceRupiah: number;
  minFuzzyScore: number;
  detectTransposition: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HydratedSessionResponse {
  session: SessionMeta;
  bankTransactions: TransactionDTO[];
  bookTransactions: TransactionDTO[];
  matches: MatchPairDTO[];
  unmatchedBank: TransactionDTO[];
  unmatchedBook: TransactionDTO[];
  adjustments: ClassifiedAdjustmentDTO[];
  summary: ReturnType<typeof calculateReconciliation>;
  journals: ReturnType<typeof generateAdjustingJournals>;
  auditLogs: AuditLogDTO[];
}

/* ---------------- Helpers ---------------- */

function toTransactionDTO(
  tx: Transaction & { adjustment?: ClassifiedAdjustment | null; bankMatch?: MatchPair | null; bookMatch?: MatchPair | null },
): TransactionDTO {
  return {
    id: tx.id,
    source: tx.source as "BANK" | "BOOK",
    rowIndex: tx.rowIndex,
    date: tx.date,
    reference: tx.reference,
    description: tx.description,
    normalizedDesc: tx.normalizedDesc,
    direction: tx.direction as "IN" | "OUT",
    amount: tx.amount,
    runningBalance: tx.runningBalance,
    counterAccount: tx.counterAccount,
    matchStatus: tx.bankMatch?.status ?? tx.bookMatch?.status ?? null,
    adjustmentId: tx.adjustment?.id ?? null,
  };
}

function toAdjustmentDTO(adj: ClassifiedAdjustment): ClassifiedAdjustmentDTO {
  return {
    id: adj.id,
    transactionId: adj.transactionId,
    matchPairId: adj.matchPairId,
    side: adj.side as "BANK" | "BOOK",
    category: adj.category as AdjustmentCategory,
    signedAmount: adj.signedAmount,
    description: adj.description,
    contraAccountName: adj.contraAccountName,
    auditNote: adj.auditNote,
  };
}

function toSessionMeta(s: ReconciliationSession): SessionMeta {
  return {
    id: s.id,
    companyName: s.companyName,
    bankAccountName: s.bankAccountName,
    periodLabel: s.periodLabel,
    periodEndDate: s.periodEndDate,
    preparedBy: s.preparedBy,
    reviewedBy: s.reviewedBy,
    status: s.status,
    demoScenarioKey: s.demoScenarioKey,
    openingBalance: s.openingBalance,
    endingBankBalance: s.endingBankBalance,
    endingBookBalance: s.endingBookBalance,
    dateToleranceDays: s.dateToleranceDays,
    amountToleranceRupiah: s.amountToleranceRupiah,
    minFuzzyScore: s.minFuzzyScore,
    detectTransposition: s.detectTransposition,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * Buat Hydrated Session penuh dari DB.
 * Seluruh kalkulasi summary & journals dihitung di backend agar Frontend
 * dan Export PDF/Excel dijamin identik (spec §7 endpoint 5).
 */
export async function getHydratedSession(sessionId: string): Promise<HydratedSessionResponse | null> {
  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    include: {
      transactions: {
        include: { adjustment: true, bankMatch: true, bookMatch: true },
        orderBy: [{ source: "asc" }, { rowIndex: "asc" }],
      },
      matches: {
        include: { bankTx: { include: { adjustment: true } }, bookTx: { include: { adjustment: true } } },
        orderBy: { confidenceScore: "desc" },
      },
      adjustments: { orderBy: { createdAt: "asc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  if (!session) return null;

  const bankTxs = session.transactions.filter((t) => t.source === "BANK").map(toTransactionDTO);
  const bookTxs = session.transactions.filter((t) => t.source === "BOOK").map(toTransactionDTO);

  const matches: MatchPairDTO[] = session.matches.map((m) => ({
    id: m.id,
    bankTx: toTransactionDTO({ ...m.bankTx, adjustment: m.bankTx.adjustment }),
    bookTx: toTransactionDTO({ ...m.bookTx, adjustment: m.bookTx.adjustment }),
    status: m.status,
    confidenceScore: m.confidenceScore,
    reasons: safeParseReasons(m.reasonsJson),
    amountDiff: m.amountDiff,
    dateDiffDays: m.dateDiffDays,
    isConfirmed: m.isConfirmed,
  }));

  const matchedBankIds = new Set(session.matches.map((m) => m.bankTxId));
  const matchedBookIds = new Set(session.matches.map((m) => m.bookTxId));
  const unmatchedBank = bankTxs.filter((t) => !matchedBankIds.has(t.id));
  const unmatchedBook = bookTxs.filter((t) => !matchedBookIds.has(t.id));

  const adjustments = session.adjustments.map(toAdjustmentDTO);

  const summary = calculateReconciliation({
    endingBankBalance: session.endingBankBalance,
    endingBookBalance: session.endingBookBalance,
    adjustments,
    matches: session.matches.map((m) => ({
      id: m.id,
      isConfirmed: m.isConfirmed,
      bankTxId: m.bankTxId,
      bookTxId: m.bookTxId,
    })),
    bankTransactions: session.transactions.filter((t) => t.source === "BANK"),
    bookTransactions: session.transactions.filter((t) => t.source === "BOOK"),
  });

  const journals = generateAdjustingJournals(adjustments);

  return {
    session: toSessionMeta(session),
    bankTransactions: bankTxs,
    bookTransactions: bookTxs,
    matches,
    unmatchedBank,
    unmatchedBook,
    adjustments,
    summary,
    journals,
    auditLogs: session.auditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      summary: l.summary,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

function safeParseReasons(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Return respons 404 untuk entitas yang hilang. */
export function notFoundResponse(entity: string): NextResponse {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: `${entity} tidak ditemukan.` } },
    { status: 404 },
  );
}

/**
 * Guard mutasi sesi FINALIZED: lempar ApiError CONFLICT 409
 * (ditangkap handleError -> NextResponse 409).
 * Panggil SETELAH cek not-found di route. Dipakai di seluruh endpoint mutasi
 * agar sesi terkunci tak bisa diubah (spec §6 + Gemini audit #3).
 */
export async function assertNotFinalized(sessionId: string): Promise<void> {
  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (session?.status === "FINALIZED") {
    conflict("Sesi sudah FINALIZED. Buka kembali (REOPEN) terlebih dahulu.");
  }
}

/** Catat AuditLog (spec §6: setiap mutasi WAJIB audit trail). */
export async function logAudit(
  sessionId: string,
  action: string,
  summary: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      sessionId,
      action,
      summary,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

/** Hitung ulang & perbarui status sesi (BALANCED / DRAFT). */
export async function recomputeSessionStatus(sessionId: string): Promise<string> {
  const hydrated = await getHydratedSession(sessionId);
  if (!hydrated) return "DRAFT";
  const nextStatus = hydrated.summary.isBalanced ? "BALANCED" : "DRAFT";
  const current = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  // Jangan turunkan FINALIZED ke DRAFT/BALANCED di sini (hanya diubah via finalize endpoint).
  if (current?.status === "FINALIZED") return "FINALIZED";
  if (current && current.status !== nextStatus) {
    await prisma.reconciliationSession.update({ where: { id: sessionId }, data: { status: nextStatus } });
  }
  return nextStatus;
}

/** Konversi array NormalizedTransactionInput -> create input Prisma (tambah normalizedDesc). */
export function toPrismaTxInputs(
  txs: NormalizedTransactionInput[],
): Array<NormalizedTransactionInput & { normalizedDesc: string }> {
  return txs.map((t) => ({ ...t, normalizedDesc: normalizeDescription(t.description) }));
}

/** Konversi Transaction Prisma -> kandidat matcher (enum literal). */
export function toMatchCandidate(t: Transaction): {
  id: string;
  date: string;
  reference: string;
  description: string;
  normalizedDesc: string;
  direction: "IN" | "OUT";
  amount: number;
  source: "BANK" | "BOOK";
} {
  return {
    id: t.id,
    date: t.date,
    reference: t.reference,
    description: t.description,
    normalizedDesc: t.normalizedDesc,
    direction: t.direction as "IN" | "OUT",
    amount: t.amount,
    source: t.source as "BANK" | "BOOK",
  };
}

/**
 * Jalankan 3-Pass matcher pada transaksi bebas (belum termatch & belum ada penyesuaian)
 * lalu simpan hasilnya ke DB. Kembalikan jumlah pasangan baru.
 */
export async function runAndPersistAutoMatch(
  sessionId: string,
  config: MatchingConfig,
): Promise<number> {
  const [bankRows, bookRows] = await Promise.all([
    prisma.transaction.findMany({ where: { sessionId, source: "BANK", bankMatch: null, adjustment: null } }),
    prisma.transaction.findMany({ where: { sessionId, source: "BOOK", bookMatch: null, adjustment: null } }),
  ]);
  const results = runMatchingEngine(bankRows.map(toMatchCandidate), bookRows.map(toMatchCandidate), config);
  await persistMatchResults(sessionId, results);
  return results.length;
}

/** Simpan hasil MatchResult dari matching engine ke DB (hapus unconfirmed dulu). */
export async function persistMatchResults(
  sessionId: string,
  results: Array<{
    bankTxId: string;
    bookTxId: string;
    status: string;
    confidenceScore: number;
    reasons: string[];
    amountDiff: number;
    dateDiffDays: number;
    isConfirmed: boolean;
  }>,
): Promise<void> {
  if (results.length === 0) return;
  await prisma.$transaction(
    results.map((r) =>
      prisma.matchPair.create({
        data: {
          sessionId,
          bankTxId: r.bankTxId,
          bookTxId: r.bookTxId,
          status: r.status,
          confidenceScore: r.confidenceScore,
          reasonsJson: JSON.stringify(r.reasons),
          amountDiff: r.amountDiff,
          dateDiffDays: r.dateDiffDays,
          isConfirmed: r.isConfirmed,
        },
      }),
    ),
  );
}

// (End of service layer)
