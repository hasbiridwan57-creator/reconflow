/**
 * Halaman /new — Dual CSV Intake 2 Langkah Ringkas.
 * Step 1: 2 dropzone CSV + status auto-deteksi.
 * Step 2: Metadata ringkas + collapsible accordion untuk column mapper.
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api/client";
import { parseIndonesianCurrency, parseFlexibleDate, COLUMN_ALIASES, type ColumnRole } from "@/lib/engine/parser";
import { parseXlsx } from "@/lib/engine/spreadsheet";
import { Upload, FileDown, ChevronDown, ChevronRight } from "lucide-react";

interface ParsedFile {
  fileName: string;
  rows: Record<string, string>[];
  headers: string[];
  mapping: Record<ColumnRole, string | null>;
}

/** Baris transaksi hasil buildTransactions — tipe sama dgn createSession input. */
interface TxRow {
  source: "BANK" | "BOOK";
  rowIndex: number;
  date: string;
  reference: string;
  description: string;
  direction: "IN" | "OUT";
  amount: number;
  runningBalance: number;
  counterAccount: string | null;
}

const BANK_TEMPLATE = "tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo\n2026-10-02,BNK-001,\"Keterangan\",0,1000000,1000000\n";
const BOOK_TEMPLATE = "tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo\n2026-10-02,BKM-001,\"Keterangan\",\"Kas\",1000000,0,1000000\n";

const REQUIRED_ROLES: ColumnRole[] = ["date", "description", "debit", "credit"];

function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function autoMap(headers: string[]): Record<ColumnRole, string | null> {
  const mapping = {} as Record<ColumnRole, string | null>;
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[\s_]/g, ""));
  (Object.keys(COLUMN_ALIASES) as ColumnRole[]).forEach((role) => {
    mapping[role] = null;
    for (const alias of COLUMN_ALIASES[role]) {
      const idx = normalized.indexOf(alias.replace(/[\s_]/g, ""));
      if (idx !== -1) { mapping[role] = headers[idx]; break; }
    }
  });
  return mapping;
}

/** Cek apakah 1 baris = transaksi valid (tanggal valid + nominal > 0). Pure, tanpa toast. */
function isTxRowValid(row: Record<string, string>, mapping: Record<ColumnRole, string | null>): boolean {
  const date = parseFlexibleDate(mapping.date ? row[mapping.date] : "") ?? "";
  if (!date) return false;
  const debit = parseIndonesianCurrency(mapping.debit ? row[mapping.debit] : 0);
  const kredit = parseIndonesianCurrency(mapping.credit ? row[mapping.credit] : 0);
  const amount = Math.abs(debit) > 0 ? Math.abs(debit) : Math.abs(kredit);
  return amount > 0;
}

/** Preview kesehatan file: hitung valid vs dilewati dari mapping aktif. */
function fileHealth(rows: Record<string, string>[], mapping: Record<ColumnRole, string | null>): { validCount: number; skippedCount: number } {
  let validCount = 0, skippedCount = 0;
  rows.forEach((row) => (isTxRowValid(row, mapping) ? validCount++ : skippedCount++));
  return { validCount, skippedCount };
}

/** Cari baris transaksi valid TERAKHIR (dari belakang) — hindari baris footer "TOTAL". */
function lastValidRow(rows: Record<string, string>[], mapping: Record<ColumnRole, string | null>): Record<string, string> | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (isTxRowValid(rows[i], mapping)) return rows[i];
  }
  return null;
}

function Dropzone({ label, parsed, onFile, template, templateName }: {
  label: string;
  parsed: ParsedFile | null;
  onFile: (file: File) => void;
  template: string;
  templateName: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const missingRoles = parsed
    ? REQUIRED_ROLES.filter((r) => !parsed.mapping[r])
    : [];
  const health = parsed ? fileHealth(parsed.rows, parsed.mapping) : null;

  function validateExt(file: File): boolean {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".xlsx")) return true;
    toast.error(`Format ${file.name} tidak didukung. Gunakan .csv atau .xlsx.`);
    return false;
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && validateExt(f)) onFile(f);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
        <button onClick={() => downloadTemplate(template, templateName)} className="flex items-center gap-1 text-xs text-teal-600 hover:underline">
          <FileDown className="h-3.5 w-3.5" /> Template
        </button>
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition ${isDragging ? "border-teal-500 bg-teal-50/50" : "border-slate-300 hover:border-teal-400 hover:bg-slate-50"}`}
      >
        <Upload className={`mb-2 h-6 w-6 ${isDragging ? "text-teal-500" : "text-slate-400"}`} />
        <span className="text-sm text-slate-600">{parsed ? parsed.fileName : "Klik atau tarik file .csv atau .xlsx di sini"}</span>
        <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && validateExt(f)) onFile(f); }} />
      </label>
      {parsed && health && (
        <div className="mt-3 space-y-1 text-xs">
          <div className="text-emerald-600">
            ✓ {health.validCount} transaksi valid siap diproses
            {health.skippedCount > 0 && <span className="text-slate-500"> · {health.skippedCount} baris footer/kosong akan dilewati</span>}
          </div>
          <div className="text-slate-500">{parsed.rows.length} baris · {parsed.headers.length} kolom terdeteksi.</div>
          {missingRoles.length > 0 ? (
            <div className="text-amber-600">⚠ Kolom wajib belum terdeteksi: {missingRoles.join(", ")}</div>
          ) : (
            <div className="text-slate-500">Semua kolom wajib terdeteksi otomatis.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NewSessionPage() {
  const router = useRouter();
  const [bank, setBank] = useState<ParsedFile | null>(null);
  const [book, setBook] = useState<ParsedFile | null>(null);
  const [meta, setMeta] = useState({
    companyName: "", bankAccountName: "", periodLabel: "", periodEndDate: "",
    preparedBy: "Tim Keuangan", reviewedBy: "Manajer Keuangan",
    openingBalance: 0, endingBankBalance: 0, endingBookBalance: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Auto buka accordion jika ada kolom wajib yang gagal terdeteksi.
  const mapperAutoOpen = useMemo(() => {
    if (!bank && !book) return false;
    const check = (p: ParsedFile | null) => p ? REQUIRED_ROLES.some((r) => !p.mapping[r]) : false;
    return check(bank) || check(book);
  }, [bank, book]);
  const [mapperOpen, setMapperOpen] = useState<boolean | null>(null);
  const mapperIsOpen = mapperOpen ?? mapperAutoOpen;

  async function processData(file: File, source: "BANK" | "BOOK", rows: Record<string, string>[], headers: string[]) {
    const mapping = autoMap(headers);
    const parsed: ParsedFile = { fileName: file.name, rows, headers, mapping };
    if (source === "BANK") setBank(parsed); else setBook(parsed);

    const saldoKey = mapping.balance;
    const dateKey = mapping.date;
    // Parse tiap tanggal dulu (fix bug: string ISO vs DD/MM/YYYY tak sebanding leksikografis).
    const latestDate = dateKey
      ? rows.reduce<string>((max, row) => {
          const iso = parseFlexibleDate(row[dateKey] ?? "") ?? "";
          return iso > max ? iso : max;
        }, "")
      : "";
    // Tahan baris footer: ambil baris transaksi valid TERAKHIR, bukan rows[length-1] buta.
    const last = lastValidRow(rows, mapping);
    const saldo = last && saldoKey ? Math.abs(parseIndonesianCurrency(last[saldoKey] ?? "")) : null;
    setMeta((m) => ({
      ...m,
      ...(source === "BANK"
        ? { endingBankBalance: saldo ?? m.endingBankBalance }
        : { endingBookBalance: saldo ?? m.endingBookBalance }),
      ...(latestDate && !m.periodEndDate ? { periodEndDate: latestDate } : {}),
    }));
  }

  async function handleFile(file: File, source: "BANK" | "BOOK") {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      try {
        const buf = await file.arrayBuffer();
        const { headers, rows } = await parseXlsx(buf);
        if (headers.length === 0) { toast.error("File .xlsx kosong atau tidak terbaca."); return; }
        await processData(file, source, rows, headers);
      } catch (e) {
        toast.error(e instanceof Error ? `Gagal membaca .xlsx: ${e.message}` : "Gagal membaca .xlsx.");
      }
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true, complete: async (result) => {
        await processData(file, source, result.data, result.meta.fields ?? []);
      },
    });
  }

  function handleMappingChange(itemLabel: "Bank" | "Buku", parsed: ParsedFile, val: string | null, role: ColumnRole) {
    const updated = { ...parsed, mapping: { ...parsed.mapping, [role]: val } };
    if (itemLabel === "Bank") setBank(updated); else setBook(updated);
    if (role === "balance" && val) {
      // Tahan baris footer — ambil baris transaksi valid terakhir.
      const last = lastValidRow(parsed.rows, updated.mapping);
      if (last) {
        const saldo = Math.abs(parseIndonesianCurrency(last[val] ?? ""));
        setMeta((m) => itemLabel === "Bank" ? { ...m, endingBankBalance: saldo } : { ...m, endingBookBalance: saldo });
      }
    }
  }

  function buildTransactions(parsed: ParsedFile, source: "BANK" | "BOOK") {
    if (!parsed) return [];
    const m = parsed.mapping;
    const cleaned: TxRow[] = [];
    let skipped = 0;
    parsed.rows.forEach((row, i) => {
      const date = parseFlexibleDate(m.date ? row[m.date] : "") ?? "";
      const reference = m.reference ? row[m.reference] : "";
      const description = m.description ? row[m.description] : "(tanpa keterangan)";
      const debit = parseIndonesianCurrency(m.debit ? row[m.debit] : 0);
      const kredit = parseIndonesianCurrency(m.credit ? row[m.credit] : 0);
      const saldo = m.balance ? parseIndonesianCurrency(row[m.balance]) : 0;
      const counterAccount = m.counterAccount ? row[m.counterAccount] || null : null;
      const direction = source === "BANK" ? (kredit > 0 ? "IN" : "OUT") : (debit > 0 ? "IN" : "OUT");
      const amount = Math.abs(debit) > 0 ? Math.abs(debit) : Math.abs(kredit);
      // Konsisten dengan preview: saring baris tanpa tanggal valid ATAU amount ≤ 0 (footer/kosong).
      if (!isTxRowValid(row, m)) { skipped += 1; return; }
      cleaned.push({ source, rowIndex: i, date, reference, description, direction, amount, runningBalance: Math.abs(saldo), counterAccount: source === "BOOK" ? counterAccount : null });
    });
    if (skipped > 0) {
      toast.info(`${skipped} baris dilewati (tanpa tanggal valid atau nominal 0) — kemungkinan baris footer/jumlah.`);
    }
    return cleaned;
  }

  async function handleSubmit() {
    if (!bank || !book) { toast.error("Upload kedua file (.csv / .xlsx) terlebih dahulu."); return; }
    const missing: string[] = [];
    if (!meta.companyName) missing.push("Nama Perusahaan");
    if (!meta.bankAccountName) missing.push("Nama Rekening Bank");
    if (!meta.periodLabel) missing.push("Periode");
    if (!meta.periodEndDate) missing.push("Tanggal Akhir Periode");
    if (missing.length > 0) { toast.error(`Lengkapi metadata: ${missing.join(", ")}.`); return; }

    const bankTxs = buildTransactions(bank, "BANK");
    const bookTxs = buildTransactions(book, "BOOK");
    if (bankTxs.length === 0) { toast.error("Tidak ada transaksi Bank valid (periksa tanggal & nominal)."); return; }
    if (bookTxs.length === 0) { toast.error("Tidak ada transaksi Buku valid (periksa tanggal & nominal)."); return; }

    setSubmitting(true);
    try {
      const { id } = await api.createSession({
        ...meta,
        bankTransactions: bankTxs,
        bookTransactions: bookTxs,
      });
      toast.success("Sesi dibuat, auto-match dijalankan.");
      router.push(`/workspace/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat sesi.");
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Impor Data Mutasi (CSV / Excel)</h1>
      <p className="mb-6 text-sm text-slate-600">Unggah Rekening Koran Bank &amp; Buku Kas Perusahaan, lalu jalankan auto-match.</p>

      {/* Langkah 1 — Dual dropzone */}
      <div className="grid gap-4 md:grid-cols-2">
        <Dropzone label="1a. Rekening Koran Bank (.csv / .xlsx)" parsed={bank} onFile={(f) => handleFile(f, "BANK")} template={BANK_TEMPLATE} templateName="template_bank.csv" />
        <Dropzone label="1b. Buku Kas Perusahaan (.csv / .xlsx)" parsed={book} onFile={(f) => handleFile(f, "BOOK")} template={BOOK_TEMPLATE} templateName="template_buku.csv" />
      </div>

      {/* Langkah 2 — Metadata */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-900">2. Metadata Sesi</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["companyName", "Nama Perusahaan", "text"], ["bankAccountName", "Nama Rekening Bank", "text"],
            ["periodLabel", "Periode (mis. Oktober 2026)", "text"], ["periodEndDate", "Tanggal Akhir Periode", "date"],
            ["preparedBy", "Prepared By", "text"], ["reviewedBy", "Reviewed By", "text"],
          ] as const).map(([key, label, type]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
              <input
                type={type}
                value={meta[key]}
                onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          ))}
          {([["openingBalance", "Saldo Awal"], ["endingBankBalance", "Saldo Akhir Bank"], ["endingBookBalance", "Saldo Akhir Buku"]] as const).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
              <input
                type="number"
                value={meta[key]}
                onChange={(e) => setMeta((m) => ({ ...m, [key]: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right font-mono tabular-nums text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Column Mapper — collapsible accordion */}
      {(bank || book) && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white">
          <button
            onClick={() => setMapperOpen(!mapperIsOpen)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              {mapperIsOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
              Sesuaikan Pemetaan Kolom &amp; Preview
            </div>
            {!mapperAutoOpen && (
              <span className="text-xs text-emerald-600">✓ Auto-deteksi OK</span>
            )}
            {mapperAutoOpen && (
              <span className="text-xs text-amber-600">⚠ Perlu penyesuaian manual</span>
            )}
          </button>
          {mapperIsOpen && (
            <div className="border-t border-slate-100 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                {[bank && { label: "Bank", parsed: bank }, book && { label: "Buku", parsed: book }].filter(Boolean).map((item) => {
                  const p = item!.parsed;
                  return (
                    <div key={item!.label} className="rounded-lg border border-slate-200 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-slate-900">Column Mapper — {item!.label}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {(Object.keys(COLUMN_ALIASES) as ColumnRole[]).map((role) => (
                          <label key={role} className="block">
                            <span className="mb-1 block text-xs text-slate-500">{role}</span>
                            <select
                              value={p.mapping[role] ?? ""}
                              onChange={(e) => handleMappingChange(item!.label as "Bank" | "Buku", p, e.target.value || null, role)}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-teal-500"
                            >
                              <option value="">— (abaikan) —</option>
                              {p.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="border-b border-slate-200 text-left text-slate-500">
                            <tr>{p.headers.slice(0, 5).map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {p.rows.slice(0, 5).map((row, i) => (
                              <tr key={i}>{p.headers.slice(0, 5).map((h) => <td key={h} className="px-2 py-1.5 text-slate-700">{row[h]}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {submitting ? "Memproses..." : "Proses & Jalankan Auto-Match"}
      </button>
    </AppShell>
  );
}