/**
 * Halaman /new — Dual CSV Intake & Column Mapper (spec §10.2 Halaman 2).
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api/client";
import { parseIndonesianCurrency, parseFlexibleDate, COLUMN_ALIASES, type ColumnRole } from "@/lib/engine/parser";
import { Upload, FileDown } from "lucide-react";

interface ParsedFile {
  fileName: string;
  rows: Record<string, string>[];
  headers: string[];
  mapping: Record<ColumnRole, string | null>;
}

const BANK_TEMPLATE = "tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo\n2026-10-02,BNK-001,\"Keterangan\",0,1000000,1000000\n";
const BOOK_TEMPLATE = "tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo\n2026-10-02,BKM-001,\"Keterangan\",\"Kas\",1000000,0,1000000\n";

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

function Dropzone({ label, parsed, onFile, template, templateName }: {
  label: string;
  parsed: ParsedFile | null;
  onFile: (file: File) => void;
  template: string;
  templateName: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
        <button onClick={() => downloadTemplate(template, templateName)} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
          <FileDown className="h-3.5 w-3.5" /> Unduh Template
        </button>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 py-8 transition hover:border-indigo-400 hover:bg-slate-50">
        <Upload className="mb-2 h-6 w-6 text-slate-400" />
        <span className="text-sm text-slate-600">{parsed ? parsed.fileName : "Klik atau tarik file .csv di sini"}</span>
        <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
      {parsed && (
        <div className="mt-3 text-xs text-slate-500">{parsed.rows.length} baris terdeteksi.</div>
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

  function handleFile(file: File, source: "BANK" | "BOOK") {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true, complete: (result) => {
        const parsed: ParsedFile = {
          fileName: file.name,
          rows: result.data,
          headers: result.meta.fields ?? [],
          mapping: autoMap(result.meta.fields ?? []),
        };
        if (source === "BANK") setBank(parsed); else setBook(parsed);

        // Auto-isi saldo akhir dari baris terakhir jika ada kolom saldo.
        const last = result.data[result.data.length - 1];
        const saldoKey = parsed.mapping.balance;
        if (last && saldoKey) {
          const saldo = Math.abs(parseIndonesianCurrency(last[saldoKey]));
          setMeta((m) => source === "BANK" ? { ...m, endingBankBalance: saldo } : { ...m, endingBookBalance: saldo });
        }
      },
    });
  }

  function buildTransactions(parsed: ParsedFile, source: "BANK" | "BOOK") {
    if (!parsed) return [];
    const m = parsed.mapping;
    return parsed.rows.map((row, i) => {
      const date = parseFlexibleDate(m.date ? row[m.date] : "") ?? "";
      const reference = m.reference ? row[m.reference] : "";
      const description = m.description ? row[m.description] : "(tanpa keterangan)";
      const debit = parseIndonesianCurrency(m.debit ? row[m.debit] : 0);
      const kredit = parseIndonesianCurrency(m.credit ? row[m.credit] : 0);
      const saldo = m.balance ? parseIndonesianCurrency(row[m.balance]) : 0;
      const counterAccount = m.counterAccount ? row[m.counterAccount] || null : null;
      const direction = source === "BANK" ? (kredit > 0 ? "IN" : "OUT") : (debit > 0 ? "IN" : "OUT");
      const amount = Math.abs(debit) > 0 ? Math.abs(debit) : Math.abs(kredit);
      return { source, rowIndex: i, date, reference, description, direction, amount, runningBalance: Math.abs(saldo), counterAccount: source === "BOOK" ? counterAccount : null };
    });
  }

  async function handleSubmit() {
    if (!bank || !book) { toast.error("Upload kedua file CSV terlebih dahulu."); return; }
    if (!meta.companyName || !meta.periodLabel) { toast.error("Isi Nama Perusahaan & Periode."); return; }
    setSubmitting(true);
    try {
      const { id } = await api.createSession({
        ...meta,
        bankTransactions: buildTransactions(bank, "BANK"),
        bookTransactions: buildTransactions(book, "BOOK"),
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
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Impor Dual CSV</h1>
      <p className="mb-6 text-sm text-slate-600">Unggah Rekening Koran Bank &amp; Buku Kas Perusahaan, lalu jalankan auto-match.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Dropzone label="Rekening Koran Bank (.csv)" parsed={bank} onFile={(f) => handleFile(f, "BANK")} template={BANK_TEMPLATE} templateName="template_bank.csv" />
        <Dropzone label="Buku Kas Perusahaan (.csv)" parsed={book} onFile={(f) => handleFile(f, "BOOK")} template={BOOK_TEMPLATE} templateName="template_buku.csv" />
      </div>

      {/* Metadata form */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-900">Metadata Sesi</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            ["companyName", "Nama Perusahaan"], ["bankAccountName", "Nama Rekening Bank"],
            ["periodLabel", "Periode (mis. Oktober 2026)"], ["periodEndDate", "Tanggal Akhir Periode (YYYY-MM-DD)"],
            ["preparedBy", "Prepared By"], ["reviewedBy", "Reviewed By"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
              <input
                value={meta[key]}
                onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right font-mono tabular-nums text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Column mapper preview */}
      {(bank || book) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[bank && { label: "Bank", parsed: bank }, book && { label: "Buku", parsed: book }].filter(Boolean).map((item) => {
            const p = item!.parsed;
            return (
              <div key={item!.label} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Column Mapper — {item!.label}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(COLUMN_ALIASES) as ColumnRole[]).map((role) => (
                    <label key={role} className="block">
                      <span className="mb-1 block text-xs text-slate-500">{role}</span>
                      <select
                        value={p.mapping[role] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          const updated = { ...p, mapping: { ...p.mapping, [role]: val } };
                          if (item!.label === "Bank") setBank(updated); else setBook(updated);
                        }}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
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
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {submitting ? "Memproses..." : "Proses & Jalankan Auto-Match"}
      </button>
    </AppShell>
  );
}
