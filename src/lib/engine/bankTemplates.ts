/**
 * Template bank Indonesia — deteksi otomatis format rekening koran / buku kas
 * dari header + data sampel, lalu isi metadata default (nama bank, nama
 * rekening, label periode, tanggal akhir periode, saldo akhir).
 *
 * Tujuan (UX): pengguna cukup mengunggah file, kolom lain terisi sendiri.
 * Deteksi dibuat PURE (tanpa DOM) agar bisa dites di Vitest.
 *
 * Aturan penting: hasil deteksi adalah TEBAAKAN. Semua nilai yang bisa
 * diturunkan dari data (saldo akhir, tanggal akhir) dihitung dengan logika
 * sama seperti halaman /new (baris valid terakhir, bukan baris footer TOTAL).
 */
import { parseFlexibleDate, parseIndonesianCurrency, type ColumnRole } from "@/lib/engine/parser";

export interface BankTemplate {
  key: string;
  label: string;
  /** Nama bank / entitas sumber untuk kolom "Nama Rekening Bank". */
  bankName: string;
  /** Alias header (dinormalisasi: lowercase, tanpa spasi/underscore). */
  aliases: Partial<Record<ColumnRole, string[]>>;
  /** Nama field metadata yang disarankan, mis. "Saldo Akhir Bank". */
  balanceNote?: string;
}

/** Tanda kolom numerik gaya Indonesia: titik ribuan, koma desimal. */
const ID_NUMERIC = /^\(?-?[\d.]+(,\d+)?\)?$/;

const TEMPLATES: BankTemplate[] = [
  {
    key: "bca",
    label: "BCA",
    bankName: "Bank BCA",
    aliases: {
      date: ["tanggal", "tgl_trans", "posting_date", "trx_date"],
      reference: ["no_referensi", "noreferensi", "nobukti", "no_bukti", "ref"],
      description: ["keterangan", "transaksi", "deskripsi", "uraian"],
      debit: ["debit", "mutasi_debit", "keluar", "pengeluaran"],
      credit: ["kredit", "mutasi_kredit", "masuk", "pemasukan"],
      balance: ["saldo", "saldo_akhir", "balance"],
    },
  },
  {
    key: "mandiri",
    label: "Mandiri",
    bankName: "Bank Mandiri",
    aliases: {
      date: ["tanggal_trans", "tanggal transaksi", "tanggal", "tgl", "posting_date"],
      reference: ["no_trans", "no transaksi", "notrans", "no_referensi", "ref", "nobukti"],
      description: ["keterangan", "deskripsi", "uraian"],
      debit: ["debit", "nominal_debit", "keluar"],
      credit: ["kredit", "nominal_kredit", "masuk"],
      balance: ["saldo", "saldo_akhir", "balance"],
    },
  },
  {
    key: "bni",
    label: "BNI",
    bankName: "Bank BNI",
    aliases: {
      date: ["tanggal", "tgl_transaksi", "trx_date", "posting_date"],
      reference: ["no_ref", "noref", "no_referensi", "ref"],
      description: ["keterangan", "deskripsi", "uraian"],
      debit: ["debit", "mutasi_debet", "keluar"],
      credit: ["kredit", "mutasi_kredit", "masuk"],
      balance: ["saldo", "balance", "saldo_akhir"],
    },
  },
  {
    key: "bri",
    label: "BRI",
    bankName: "Bank BRI",
    aliases: {
      date: ["tanggal", "tgl", "posting_date"],
      reference: ["no_referensi", "noreferensi", "ref", "nobukti"],
      description: ["keterangan", "uraian", "deskripsi"],
      debit: ["debit", "mutasi_debit", "keluar"],
      credit: ["kredit", "mutasi_kredit", "masuk"],
      balance: ["saldo", "balance"],
    },
  },
  {
    key: "bukukas",
    label: "Buku Kas Perusahaan",
    bankName: "Buku Kas Perusahaan",
    aliases: {
      date: ["tanggal", "tgl", "date"],
      reference: ["no_bukti", "nobukti", "no_referensi", "voucher"],
      description: ["deskripsi", "keterangan", "uraian"],
      debit: ["debit_masuk", "debit", "penerimaan"],
      credit: ["kredit_keluar", "kredit", "pengeluaran"],
      balance: ["saldo", "balance"],
      counterAccount: ["akun_lawan", "coa", "account"],
    },
  },
];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]/g, "");
}

/** Skor kecocokan header file vs template (0–1). */
function scoreHeaders(headers: string[], template: BankTemplate): number {
  if (headers.length === 0) return 0;
  const normalized = headers.map(normalizeHeader);
  let hits = 0;
  let considered = 0;
  (Object.keys(template.aliases) as ColumnRole[]).forEach((role) => {
    const aliases = template.aliases[role] ?? [];
    if (aliases.length === 0) return;
    considered += 1;
    const found = aliases.some((alias) => normalized.includes(normalizeHeader(alias)));
    if (found) hits += 1;
  });
  return considered === 0 ? 0 : hits / considered;
}

export interface DetectionInput {
  headers: string[];
  /** Baris data sampel (maks ~30 baris pertama cukup). */
  rows: Record<string, string>[];
  /** Sumber file: BANK (rekening koran) atau BOOK (buku kas). */
  source: "BANK" | "BOOK";
}

export interface DetectionResult {
  templateKey: string;
  label: string;
  /** Skor 0–1; di bawah 0.5 dianggap "generic" (tidak yakin). */
  score: number;
  /** Mapping kolom hasil deteksi (bisa dipakai langsung ke autoMap). */
  mapping: Partial<Record<ColumnRole, string>>;
  /** Nilai metadata default yang bisa diisi otomatis. */
  defaults: {
    bankAccountName?: string;
    periodLabel?: string;
    periodEndDate?: string;
    endingBalance?: number;
  };
  /** Teks ringkas untuk ditampilkan di UI. */
  summary: string;
}

/** Ambil baris transaksi valid terakhir (tolak baris footer "TOTAL"/"JUMLAH"). */
export function lastValidDataRow(
  rows: Record<string, string>[],
  mapping: Partial<Record<ColumnRole, string>>,
): Record<string, string> | null {
  const dateKey = mapping.date;
  const debitKey = mapping.debit;
  const creditKey = mapping.credit;

  const looksLikeFooter = (row: Record<string, string>): boolean => {
    const joined = Object.values(row).join(" ").toLowerCase();
    return /(^|\s)(total|jumlah|subtotal|balance c|saldo akhir)(\s|$|:)/.test(joined);
  };

  const isTxRow = (row: Record<string, string>): boolean => {
    if (dateKey) {
      const iso = parseFlexibleDate(row[dateKey] ?? "");
      if (!iso) return false;
    }
    const debit = debitKey ? parseIndonesianCurrency(row[debitKey] ?? 0) : 0;
    const credit = creditKey ? parseIndonesianCurrency(row[creditKey] ?? 0) : 0;
    return Math.abs(debit) > 0 || Math.abs(credit) > 0;
  };

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (looksLikeFooter(row)) continue;
    if (isTxRow(row)) return row;
  }
  return null;
}

/** Hitung tanggal maksimum dari kolom tanggal (mengabaikan baris tanpa tanggal). */
export function latestDateFrom(rows: Record<string, string>[], dateKey?: string | null): string {
  if (!dateKey) return "";
  return rows.reduce<string>((max, row) => {
    const iso = parseFlexibleDate(row[dateKey] ?? "") ?? "";
    return iso > max ? iso : max;
  }, "");
}

/** Ubah ISO (YYYY-MM-DD) → label periode Indonesia ("Oktober 2026"). */
export function isoToPeriodLabel(iso: string): string {
  if (!iso) return "";
  const MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const [y, m] = iso.split("-");
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return "";
  return `${MONTHS[idx]} ${y}`;
}

/** Deteksi format file berdasarkan header + data sampel. */
export function detectBankTemplate(input: DetectionInput): DetectionResult | null {
  const { headers, rows, source } = input;
  if (headers.length === 0) return null;

  let best: { template: BankTemplate; score: number } | null = null;
  for (const template of TEMPLATES) {
    const score = scoreHeaders(headers, template);
    if (!best || score > best.score) best = { template, score };
  }
  if (!best) return null;

  const { template, score } = best;
  const isBook = source === "BOOK" || template.key === "bukukas";
  const threshold = isBook ? 0.5 : 0.6;

  // Mapping kolom: pilih header pertama yang cocok alias template; fallback ke
  // alias umum agar file "hampir cocok" tetap terpetakan.
  const normalized = headers.map(normalizeHeader);
  const mapping: Partial<Record<ColumnRole, string>> = {};
  (Object.keys(template.aliases) as ColumnRole[]).forEach((role) => {
    const aliases = template.aliases[role] ?? [];
    for (const alias of aliases) {
      const idx = normalized.indexOf(normalizeHeader(alias));
      if (idx !== -1) {
        mapping[role] = headers[idx];
        break;
      }
    }
  });

  const confident = score >= threshold;
  if (!confident) {
    return {
      templateKey: "generic",
      label: "Format umum",
      score,
      mapping,
      defaults: {},
      summary: "Format tidak dikenali pasti — gunakan pemetaan kolom manual bila perlu.",
    };
  }

  const last = lastValidDataRow(rows, mapping);
  const lastDate = latestDateFrom(rows, mapping.date);
  const balanceKey = mapping.balance;
  const rawBalance = last && balanceKey ? parseIndonesianCurrency(last[balanceKey] ?? "") : 0;
  const endingBalance = Number.isFinite(rawBalance) ? Math.abs(rawBalance) : undefined;

  const periodLabel = isoToPeriodLabel(lastDate);
  const bankAccountName = isBook
    ? `${template.bankName}`
    : `${template.bankName}${periodLabel ? ` — ${periodLabel}` : ""}`;

  return {
    templateKey: template.key,
    label: template.label,
    score,
    mapping,
    defaults: {
      bankAccountName,
      periodLabel: periodLabel || undefined,
      periodEndDate: lastDate || undefined,
      endingBalance,
    },
    summary: `Format ${template.label} terdeteksi (${Math.round(score * 100)}% cocok).`,
  };
}

/** Cek cepat apakah string terlihat seperti angka Indonesia (untuk skor data). */
export function looksLikeIndonesianNumber(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return ID_NUMERIC.test(v) || /^-?\d+$/.test(v);
}

export const BANK_TEMPLATE_LIST = TEMPLATES.map(({ key, label, bankName }) => ({ key, label, bankName }));
