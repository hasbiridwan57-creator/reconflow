/**
 * Parser & normalizer untuk format angka/tanggal Indonesia.
 * Lihat RECONFLOW_MASTER_SPEC.md §8.1.
 */
import type { CashDirection } from "@/lib/schemas/reconciliation";

/**
 * Parsing angka gaya akuntansi Indonesia.
 * - Koma = DESIMAL, titik = RIBUAN (konvensi Indonesia).
 * - `"12.450.000"` -> 12450000; `"12,450,000.00"` -> 12450000;
 *   `"Rp 12.450.000"` -> 12450000; `"12.450.000,50"` -> 12450001 (rounded).
 * - Tanda kurung akuntansi `(500.000)` = negatif -> return -500000.
 * - Kosong / "-" / undefined -> 0.
 * Selalu `Math.round` hasil akhir (uang integer Rupiah).
 */
export function parseIndonesianCurrency(input: string | number | null | undefined): number {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input) : 0;
  }
  if (input === null || input === undefined) return 0;

  let s = String(input).trim();
  if (s === "" || s === "-") return 0;

  // Tanda kurung akuntansi = negatif. Strip kurung, ingat tandanya.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Hapus prefix mata uang & spasi.
  s = s.replace(/rp/gi, "").trim();

  // Pisahkan digit + separator (abaikan simbol lain).
  s = s.replace(/[^\d.,-]/g, "");
  if (s === "" || s === "-") return 0;

  // Tentukan pemisah desimal: kemunculan TERAKHIR dari "." atau "," yang
  // diikuti 1-2 digit di ujung string dianggap desimal.
  let decimals = "";
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);
  if (lastSep !== -1) {
    const after = s.slice(lastSep + 1);
    if (after.length <= 2 && /^\d+$/.test(after) && s.length - 1 !== lastSep) {
      decimals = after;
      s = s.slice(0, lastSep);
    }
  }

  // Hapus semua pemisah ribuan yang tersisa.
  const integerPart = s.replace(/[.,]/g, "");
  const digits = integerPart.replace(/-/g, "");

  // Guard NaN: tidak ada digit sama sekali (mis. "Rp .", "Rp -") -> 0.
  if (digits === "") return 0;

  let value = parseInt(digits, 10);
  if (decimals !== "") {
    // Ambil 1 digit desimal pertama (Rupiah tanpa sen, dibulatkan).
    value = parseInt(digits + decimals[0], 10) / 10;
  }
  value = Math.round(value);

  // Tanda minus eksplisit.
  if (s.includes("-") && value !== 0) negative = true;

  return negative ? -value : value;
}

/**
 * Parsing tanggal fleksibel -> ISO `YYYY-MM-DD`.
 * Mendukung: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`.
 * Return null jika tidak dikenali.
 */
export function parseFlexibleDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (s === "") return null;

  // YYYY-MM-DD atau YYYY/MM/DD
  let m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return toIso(y, mo, d);
  }
  // DD/MM/YYYY atau DD-MM-YYYY
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) {
    const [, d, mo, y] = m;
    return toIso(y, mo, d);
  }
  return null;
}

function toIso(y: string, mo: string, d: string): string | null {
  const year = parseInt(y, 10);
  const month = parseInt(mo, 10);
  const day = parseInt(d, 10);
  if (month < 1 || month > 12 || day < 1) return null;
  // Validasi kalender nyata (mis. 2026-02-31 tidak valid).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Selisih hari antar dua tanggal ISO (b - k). */
export function dateDiffDays(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((da - db) / 86_400_000);
}

/** Deteksi arah arus kas dari kolom debit/kredit sesuai sumber. */
export function inferDirection(
  source: "BANK" | "BOOK",
  debit: number,
  credit: number,
): CashDirection {
  if (source === "BANK") {
    // Bank: kredit_masuk = kas perusahaan bertambah (IN); debit_keluar = OUT.
    return credit > 0 ? "IN" : "OUT";
  }
  // Book: debit_masuk = IN; kredit_keluar = OUT.
  return debit > 0 ? "IN" : "OUT";
}

/** Deteksi nominal dari kolom debit/kredit sesuai sumber (selalu positif). */
export function inferAmount(debit: number, credit: number): number {
  return Math.abs(debit) > 0 ? Math.abs(Math.round(debit)) : Math.abs(Math.round(credit));
}

/** Header aliases untuk auto-detection column mapper. */
export const COLUMN_ALIASES = {
  date: ["tanggal", "tgl", "date", "trx_date", "posting_date"],
  reference: ["no_referensi", "no_bukti", "ref", "reference", "voucher"],
  description: ["keterangan", "deskripsi", "uraian", "description", "memo", "narrative"],
  debit: ["debit", "debit_keluar", "debit_masuk", "dr", "db"],
  credit: ["kredit", "kredit_masuk", "kredit_keluar", "cr"],
  balance: ["saldo", "balance", "running_balance"],
  counterAccount: ["akun_lawan", "account", "contra_account", "coa"],
} as const;

export type ColumnRole = keyof typeof COLUMN_ALIASES;

/**
 * Auto-deteksi pemetaan kolom CSV -> role, berdasarkan header.
 * Normalisasi header: lowercase, trim, hapus spasi/underscore.
 */
export function detectColumnMapping(headers: string[]): Record<ColumnRole, string | null> {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[\s_]/g, ""));
  const mapping: Record<ColumnRole, string | null> = {
    date: null,
    reference: null,
    description: null,
    debit: null,
    credit: null,
    balance: null,
    counterAccount: null,
  };

  (Object.keys(COLUMN_ALIASES) as ColumnRole[]).forEach((role) => {
    for (const alias of COLUMN_ALIASES[role]) {
      const normAlias = alias.replace(/[\s_]/g, "");
      const idx = normalized.indexOf(normAlias);
      if (idx !== -1) {
        mapping[role] = headers[idx];
        return;
      }
    }
  });

  return mapping;
}
