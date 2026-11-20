/**
 * Auto Adjusting Journal Entries (AJE) generator.
 * Hanya penyesuaian Sisi Buku yang menghasilkan jurnal.
 * Lihat RECONFLOW_MASTER_SPEC.md §8.5 & §3.3.
 */
import type { AdjustmentCategory } from "@/lib/schemas/reconciliation";

export interface AdjustmentForJournal {
  id: string;
  side: "BANK" | "BOOK";
  category: AdjustmentCategory;
  signedAmount: number;
  description: string;
  contraAccountName?: string | null;
}

export interface JournalLine {
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  adjustmentId: string;
  description: string;
  lines: JournalLine[];
}

export interface JournalResult {
  entries: JournalEntry[];
  totalDebit: number;
  totalCredit: number;
  isDoubleEntryBalanced: boolean;
}

/** Akun lawan default per kategori (Sisi Buku). Spec §3.3 kolom terakhir. */
export const DEFAULT_COA_BY_CATEGORY: Partial<Record<AdjustmentCategory, string>> = {
  INTEREST_INCOME: "Pendapatan Jasa Giro",
  UNRECORDED_RECEIPT: "Piutang Usaha",
  BANK_FEE: "Beban Administrasi Bank",
  TAX_ON_INTEREST: "Beban Pajak Jasa Giro",
  NSF_CHECK: "Piutang Usaha (Cek Kosong)",
  UNRECORDED_EXPENSE: "Beban Lain-lain",
  BOOK_ERROR_ADD: "Koreksi Beban / Selisih Pembukuan",
  BOOK_ERROR_DEDUCT: "Koreksi Beban / Selisih Pembukuan",
};

const KAS_DI_BANK = "Kas di Bank";

export function generateAdjustingJournals(adjustments: AdjustmentForJournal[]): JournalResult {
  // HANYA Sisi Buku, signedAmount !== 0.
  const bookAdjustments = adjustments.filter(
    (a) => a.side === "BOOK" && a.signedAmount !== 0,
  );

  const entries: JournalEntry[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const adj of bookAdjustments) {
    const absAmount = Math.abs(adj.signedAmount);
    const contra = adj.contraAccountName || DEFAULT_COA_BY_CATEGORY[adj.category] || "Koreksi Beban / Selisih Pembukuan";

    const lines: JournalLine[] = [];
    if (adj.signedAmount > 0) {
      // Kas bertambah: Debit Kas, Kredit contra.
      lines.push({ accountName: KAS_DI_BANK, debit: absAmount, credit: 0 });
      lines.push({ accountName: contra, debit: 0, credit: absAmount });
    } else {
      // Kas berkurang: Debit contra, Kredit Kas.
      lines.push({ accountName: contra, debit: absAmount, credit: 0 });
      lines.push({ accountName: KAS_DI_BANK, debit: 0, credit: absAmount });
    }

    entries.push({
      adjustmentId: adj.id,
      description: adj.description,
      lines,
    });

    totalDebit += absAmount;
    totalCredit += absAmount;
  }

  return {
    entries,
    totalDebit,
    totalCredit,
    isDoubleEntryBalanced: totalDebit === totalCredit,
  };
}
