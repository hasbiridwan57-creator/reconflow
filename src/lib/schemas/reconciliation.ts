import { z } from "zod";

export const TransactionSourceSchema = z.enum(["BANK", "BOOK"]);
export const CashDirectionSchema = z.enum(["IN", "OUT"]);
export const SessionStatusSchema = z.enum(["DRAFT", "BALANCED", "FINALIZED"]);

export const MatchStatusSchema = z.enum([
  "EXACT_MATCH",
  "SUGGESTED_MATCH",
  "MANUAL_MATCH",
  "DISCREPANCY_MATCH",
]);

export const AdjustmentSideSchema = z.enum(["BANK", "BOOK"]);

export const AdjustmentCategorySchema = z.enum([
  // Sisi Bank (Tidak dijurnal)
  "DEPOSIT_IN_TRANSIT",
  "OUTSTANDING_CHECK",
  "BANK_ERROR_ADD",
  "BANK_ERROR_DEDUCT",
  // Sisi Buku (Wajib dijurnal)
  "INTEREST_INCOME",
  "UNRECORDED_RECEIPT",
  "BANK_FEE",
  "TAX_ON_INTEREST",
  "NSF_CHECK",
  "UNRECORDED_EXPENSE",
  "BOOK_ERROR_ADD",
  "BOOK_ERROR_DEDUCT",
]);

export const MatchingConfigSchema = z.object({
  dateToleranceDays: z.number().int().min(0).max(14).default(3),
  amountToleranceRupiah: z.number().min(0).default(0),
  minFuzzyScore: z.number().min(0.1).max(0.95).default(0.35),
  detectTransposition: z.boolean().default(true),
});

export const NormalizedTransactionInputSchema = z.object({
  source: TransactionSourceSchema,
  rowIndex: z.number().int().min(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().default(""),
  description: z.string().min(1),
  direction: CashDirectionSchema,
  amount: z.number().nonnegative(),
  runningBalance: z.number().nullable().optional(),
  counterAccount: z.string().nullable().optional(),
});

export const CreateSessionSchema = z.object({
  companyName: z.string().min(2),
  bankAccountName: z.string().min(2),
  periodLabel: z.string().min(2),
  periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preparedBy: z.string().min(1).default("Tim Keuangan"),
  reviewedBy: z.string().min(1).default("Manajer Keuangan"),
  openingBalance: z.number().default(0),
  endingBankBalance: z.number(),
  endingBookBalance: z.number(),
  bankTransactions: z.array(NormalizedTransactionInputSchema).min(1),
  bookTransactions: z.array(NormalizedTransactionInputSchema).min(1),
  config: MatchingConfigSchema.optional(),
});

export const CreateDemoSessionSchema = z.object({
  scenarioKey: z.enum(["umkm", "ecommerce", "audit"]),
});

export const UpdateSessionSchema = z.object({
  companyName: z.string().min(2).optional(),
  bankAccountName: z.string().min(2).optional(),
  periodLabel: z.string().min(2).optional(),
  periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preparedBy: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).optional(),
  openingBalance: z.number().optional(),
  endingBankBalance: z.number().optional(),
  endingBookBalance: z.number().optional(),
  dateToleranceDays: z.number().int().min(0).max(14).optional(),
  amountToleranceRupiah: z.number().min(0).optional(),
  minFuzzyScore: z.number().min(0.1).max(0.95).optional(),
  detectTransposition: z.boolean().optional(),
});

export const MatchActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  // Khusus jika action === 'APPROVE' pada DISCREPANCY_MATCH:
  discrepancyResolution: z
    .object({
      faultSide: z.enum(["BOOK", "BANK"]),
      contraAccountName: z.string().optional(),
      auditNote: z.string().optional(),
    })
    .optional(),
});

export const ManualPairSchema = z.object({
  bankTxId: z.string().min(1),
  bookTxId: z.string().min(1),
  auditNote: z.string().optional(),
  // Wajib diisi jika bankTx.amount !== bookTx.amount:
  discrepancyResolution: z
    .object({
      faultSide: z.enum(["BOOK", "BANK"]),
      contraAccountName: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

export const CreateAdjustmentSchema = z.object({
  transactionId: z.string().optional(),
  matchPairId: z.string().optional(),
  category: AdjustmentCategorySchema,
  description: z.string().min(2),
  contraAccountName: z.string().optional(),
  auditNote: z.string().optional(),
  // Opsional override nominal absolut (default diambil dari transaction.amount)
  customAmount: z.number().positive().optional(),
});

/** Payload bulk klasifikasi banyak transaksi sekaligus (atomik). */
export const BulkCreateAdjustmentsSchema = z.object({
  items: z.array(
    z.object({
      transactionId: z.string().min(1),
      category: AdjustmentCategorySchema,
      description: z.string().min(2),
      contraAccountName: z.string().optional(),
    }),
  ).min(1),
});

export const UpdateAdjustmentSchema = z.object({
  category: AdjustmentCategorySchema.optional(),
  description: z.string().min(2).optional(),
  contraAccountName: z.string().nullable().optional(),
  auditNote: z.string().nullable().optional(),
});

export const FinalizeSessionSchema = z.object({
  action: z.enum(["FINALIZE", "REOPEN"]),
  preparedBy: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).optional(),
});

// ---- Inferred TypeScript types (SSOT untuk backend & frontend) ----
// Catatan Zod 4: `z.infer` = tipe OUTPUT (setelah default diterapkan).
// `z.input` = tipe INPUT (field ber-.default() menjadi opsional) — dipakai
// untuk payload request API. Keduanya disediakan agar kontrak akurat.
export type TransactionSource = z.infer<typeof TransactionSourceSchema>;
export type CashDirection = z.infer<typeof CashDirectionSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type MatchStatus = z.infer<typeof MatchStatusSchema>;
export type AdjustmentSide = z.infer<typeof AdjustmentSideSchema>;
export type AdjustmentCategory = z.infer<typeof AdjustmentCategorySchema>;
export type MatchingConfig = z.infer<typeof MatchingConfigSchema>;
export type NormalizedTransactionInput = z.infer<
  typeof NormalizedTransactionInputSchema
>;
export type CreateSessionInput = z.input<typeof CreateSessionSchema>;
export type CreateDemoSessionInput = z.input<typeof CreateDemoSessionSchema>;
export type UpdateSessionInput = z.input<typeof UpdateSessionSchema>;
export type MatchActionInput = z.input<typeof MatchActionSchema>;
export type ManualPairInput = z.input<typeof ManualPairSchema>;
export type CreateAdjustmentInput = z.input<typeof CreateAdjustmentSchema>;
export type UpdateAdjustmentInput = z.input<typeof UpdateAdjustmentSchema>;
export type FinalizeSessionInput = z.input<typeof FinalizeSessionSchema>;

// Tipe output (hasil parse, semua default sudah terisi)
export type MatchingConfigOutput = z.infer<typeof MatchingConfigSchema>;
export type CreateSessionOutput = z.infer<typeof CreateSessionSchema>;
