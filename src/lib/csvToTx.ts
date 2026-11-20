/**
 * Utilitas parsing CSV -> transaksi ter-normalisasi untuk pembuatan sesi.
 * Dipakai oleh POST /api/sessions (raw CSV) & POST /api/sessions/demo.
 */
import Papa from "papaparse";
import { parseIndonesianCurrency, inferDirection, inferAmount } from "@/lib/engine/parser";
import type { NormalizedTransactionInput } from "@/lib/schemas/reconciliation";

/** Parse CSV mentah (header Indonesia/Inggris) -> array transaksi ter-normalisasi. */
export function parseCsvToTransactions(csv: string, source: "BANK" | "BOOK"): NormalizedTransactionInput[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(`Gagal parsing CSV: ${parsed.errors[0]?.message ?? "unknown"}`);
  }

  return parsed.data.map((row, index) => {
    const date = (row["tanggal"] ?? row["date"] ?? row["tgl"] ?? row["trx_date"] ?? row["posting_date"] ?? "").toString().trim();
    const reference = (row["no_referensi"] ?? row["no_bukti"] ?? row["ref"] ?? row["reference"] ?? row["voucher"] ?? "").toString().trim();
    const description = (row["keterangan"] ?? row["deskripsi"] ?? row["uraian"] ?? row["description"] ?? row["memo"] ?? row["narrative"] ?? "").toString().trim();
    const debitRaw = row["debit"] ?? row["debit_keluar"] ?? row["debit_masuk"] ?? row["dr"] ?? row["db"] ?? "";
    const kreditRaw = row["kredit"] ?? row["kredit_masuk"] ?? row["kredit_keluar"] ?? row["cr"] ?? "";
    const saldoRaw = row["saldo"] ?? row["balance"] ?? row["running_balance"] ?? "";
    const counterAccount = (row["akun_lawan"] ?? row["account"] ?? row["contra_account"] ?? row["coa"] ?? "").toString().trim() || null;

    const debit = parseIndonesianCurrency(debitRaw);
    const kredit = parseIndonesianCurrency(kreditRaw);
    const finalAmount = inferAmount(debit, kredit);
    const direction = inferDirection(source, debit, kredit);

    const saldoNum = parseIndonesianCurrency(saldoRaw);
    const runningBalance = saldoRaw.trim() !== "" && saldoRaw.trim() !== "-" ? Math.abs(saldoNum) : null;

    return {
      source,
      rowIndex: index,
      date: normalizeDate(date),
      reference,
      description,
      direction,
      amount: finalAmount,
      runningBalance,
      counterAccount: source === "BOOK" ? counterAccount : null,
    } satisfies NormalizedTransactionInput;
  });
}

function normalizeDate(input: string): string {
  const d = input.trim();
  // Sudah ISO YYYY-MM-DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // DD/MM/YYYY atau DD-MM-YYYY.
  const dm = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dm) {
    const [, dd, mm, yyyy] = dm;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // YYYY/MM/DD.
  const ym = d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ym) {
    const [, yyyy, mm, dd] = ym;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return d;
}
