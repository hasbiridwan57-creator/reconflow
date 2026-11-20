/**
 * Report components: AdjustingJournalTable, AuditLogTimeline, ExportSignoffModal.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, type HydratedSessionResponse } from "@/lib/api/client";
import { formatIDR } from "@/lib/format";
import { FileText, FileSpreadsheet, Lock, Clock } from "lucide-react";

/* ---------- AdjustingJournalTable ---------- */
export function AdjustingJournalTable({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const j = data.journals;
  // Map adjustmentId -> adjustment (untuk inline edit COA).
  const adjById = new Map(data.adjustments.map((a) => [a.id, a]));

  async function updateContra(adjId: string, contraAccountName: string) {
    try {
      await api.updateAdjustment(data.session.id, adjId, { contraAccountName });
      toast.success("Akun lawan diperbarui.");
      onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Jurnal Penyesuaian (Sisi Buku)</h4>
        <p className="text-xs text-slate-500">Penyesuaian Sisi Bank tidak menghasilkan jurnal.</p>
      </div>
      {j.entries.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">Belum ada jurnal penyesuaian.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Akun</th>
              <th className="px-4 py-3 font-medium">Keterangan</th>
              <th className="px-4 py-3 text-right font-medium">Debit</th>
              <th className="px-4 py-3 text-right font-medium">Kredit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {j.entries.map((e) => {
              const adj = adjById.get(e.adjustmentId);
              return e.lines.map((l, idx) => (
                <tr key={`${e.adjustmentId}-${idx}`}>
                  <td className="px-4 py-2">
                    {adj ? (
                      <input
                        defaultValue={l.accountName}
                        onBlur={(ev) => { if (ev.target.value !== l.accountName) updateContra(adj.id, ev.target.value); }}
                        className="w-full rounded border border-transparent px-2 py-1 text-sm outline-none hover:border-slate-200 focus:border-indigo-500"
                      />
                    ) : (
                      <span className="px-2 py-1 text-sm">{l.accountName}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{idx === 0 ? e.description : ""}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{l.debit !== 0 ? formatIDR(l.debit) : ""}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{l.credit !== 0 ? formatIDR(l.credit) : ""}</td>
                </tr>
              ));
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-900 bg-slate-50">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm font-semibold">TOTAL</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">{formatIDR(j.totalDebit)}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">{formatIDR(j.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <div className="border-t border-slate-200 p-3 text-center">
        {j.isDoubleEntryBalanced ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">✓ Total Debit = Total Kredit (Seimbang)</span>
        ) : (
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600">✗ Tidak seimbang</span>
        )}
      </div>
    </div>
  );
}

/* ---------- AuditLogTimeline ---------- */
export function AuditLogTimeline({ data }: { data: HydratedSessionResponse }) {
  const logs = data.auditLogs;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock className="h-4 w-4" /> Audit Trail</h4>
      {logs.length === 0 ? <div className="text-sm text-slate-500">Belum ada aktivitas.</div> : (
        <ol className="space-y-3 border-l border-slate-200 pl-4">
          {logs.map((log) => (
            <li key={log.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
              <div className="text-sm text-slate-900">{log.summary}</div>
              <div className="text-xs text-slate-400">{log.action} · {new Date(log.createdAt).toLocaleString("id-ID")}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- ExportSignoffModal + Action Bar ---------- */
export function ExportActionBar({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [preparedBy, setPreparedBy] = useState(data.session.preparedBy);
  const [reviewedBy, setReviewedBy] = useState(data.session.reviewedBy);
  const isBalanced = data.summary.isBalanced;
  const finalized = data.session.status === "FINALIZED";

  async function doExportPdf() {
    try {
      await api.updateSession(data.session.id, { preparedBy, reviewedBy });
      onRefresh();
      window.location.href = `/api/sessions/${data.session.id}/export/pdf`;
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="mb-4 text-sm font-semibold text-slate-900">Finalisasi &amp; Ekspor</h4>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={async () => {
            try {
              await api.finalize(data.session.id, { action: finalized ? "REOPEN" : "FINALIZE" });
              toast.success(finalized ? "Sesi dibuka kembali." : "Sesi difinalisasi.");
              onRefresh();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
          }}
          disabled={!isBalanced && !finalized}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Lock className="h-4 w-4" /> {finalized ? "Buka Kembali Sesi" : "Finalisasi & Kunci Sesi"}
        </button>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <FileText className="h-4 w-4" /> Ekspor Laporan PDF
        </button>
        <a href={`/api/sessions/${data.session.id}/export/excel`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <FileSpreadsheet className="h-4 w-4" /> Ekspor Excel (.xlsx)
        </a>
      </div>
      {!isBalanced && !finalized && (
        <p className="mt-3 text-xs text-amber-600">Sesi hanya bisa difinalisasi setelah selisih = Rp 0 dan seluruh item diklasifikasi.</p>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Blok Tanda Tangan</h3>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-slate-600">Prepared by</span>
              <input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs text-slate-600">Reviewed by</span>
              <input value={reviewedBy} onChange={(e) => setReviewedBy(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">Batal</button>
              <button onClick={doExportPdf} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Unduh PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
