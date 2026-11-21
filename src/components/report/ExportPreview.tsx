/**
 * ExportPreview — modal pratinjau sebelum unduh (PDF & Excel).
 *
 * Komponen ini di-import DINAMIS (next/dynamic, ssr:false) dari ExportActionBar,
 * sehingga `exceljs` (dipakai parseWorkbookPreview) TIDAK ikut bundle awal halaman
 * workspace — chunk-nya baru dimuat saat user menekan "Pratinjau".
 *
 * PDF  → dirender oleh penampil PDF bawaan browser via <iframe src=...?inline=1>.
 * Excel → byte .xlsx di-fetch lalu diurai client-side jadi grid multi-sheet.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { X, FileText, FileSpreadsheet, Loader2 } from "lucide-react";
import { parseWorkbookPreview, type PreviewSheet } from "@/lib/engine/spreadsheet";

type Tab = "pdf" | "excel";

export default function ExportPreview({
  sessionId,
  defaultTab = "pdf",
  onClose,
}: {
  sessionId: string;
  defaultTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [sheets, setSheets] = useState<PreviewSheet[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // Escape menutup modal pratinjau.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Muat & urai .xlsx sekali saja, saat tab Excel pertama kali dibuka.
  useEffect(() => {
    if (tab !== "excel" || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/export/excel?inline=1`);
        if (!res.ok) throw new Error(`Gagal memuat berkas (HTTP ${res.status}).`);
        const buf = await res.arrayBuffer();
        const parsed = await parseWorkbookPreview(buf);
        if (!cancelled) setSheets(parsed);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat pratinjau.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, sessionId]);

  const sheet = sheets && sheets.length > 0 ? sheets[Math.min(activeSheet, sheets.length - 1)] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Pratinjau ekspor">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header + tab */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab("pdf")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "pdf" ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <FileText className="h-4 w-4" /> Laporan PDF
            </button>
            <button
              onClick={() => setTab("excel")}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "excel" ? "bg-teal-50 text-teal-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
            </button>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/sessions/${sessionId}/export/${tab}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Unduh
            </a>
            <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 bg-slate-50">
          {tab === "pdf" ? (
            <iframe
              title="Pratinjau PDF"
              src={`/api/sessions/${sessionId}/export/pdf?inline=1`}
              className="h-full w-full border-0 bg-white"
            />
          ) : loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Menyiapkan pratinjau…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-rose-600">{error}</div>
          ) : !sheet || sheet.rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">Tidak ada data pada berkas.</div>
          ) : (
            <div className="flex h-full flex-col">
              {/* Strip tab sheet */}
              <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2">
                {sheets!.map((s, i) => (
                  <button
                    key={s.name}
                    onClick={() => setActiveSheet(i)}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${i === activeSheet ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              {/* Grid */}
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {sheet.rows.map((row, ri) => (
                      <tr key={ri} className={ri === 0 ? "" : "border-b border-slate-100"}>
                        {row.map((cell, ci) => {
                          const isHeader = ri === 0;
                          const align = cell.isNumeric ? "text-right font-mono tabular-nums" : "text-left";
                          return (
                            <td
                              key={ci}
                              className={`whitespace-nowrap px-3 py-1.5 ${align} ${
                                isHeader ? "bg-teal-700 font-semibold text-white" : "text-slate-700"
                              }`}
                            >
                              {cell.text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
