/**
 * Arsip Rekonsiliasi (spec §10.2 Halaman 4 & FR-09).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { api, type SessionListItem } from "@/lib/api/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { AppShell } from "@/components/layout/AppShell";
import { Search, FileText, FileSpreadsheet, Trash2, ExternalLink } from "lucide-react";

const STATUS_TABS = ["Semua", "DRAFT", "BALANCED", "FINALIZED"] as const;

const STATUS_CLASS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  BALANCED: "bg-emerald-50 text-emerald-600 border-emerald-200",
  FINALIZED: "bg-teal-50 text-teal-600 border-teal-200",
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_TABS)[number]>("Semua");
  const [globalFilter, setGlobalFilter] = useState("");

  async function reload() {
    try {
      setSessions(await api.listSessions());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat riwayat.");
    }
  }

  useEffect(() => { void reload(); }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Hapus sesi ini beserta seluruh transaksi, match, penyesuaian, dan audit log?")) return;
    try {
      await api.deleteSession(id);
      toast.success("Sesi dihapus.");
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "Semua") return sessions;
    return sessions.filter((s) => s.status === statusFilter);
  }, [sessions, statusFilter]);

  const columnHelper = createColumnHelper<SessionListItem>();
  const columns = useMemo(() => [
    columnHelper.accessor("companyName", {
      header: "Perusahaan & Rekening",
      cell: (info) => (
        <div>
          <div className="font-medium text-slate-900">{info.getValue()}</div>
          <div className="text-xs text-slate-500">{info.row.original.bankAccountName}</div>
        </div>
      ),
    }),
    columnHelper.accessor("periodLabel", {
      header: "Periode",
      cell: (info) => (
        <div>
          <div className="text-slate-700">{info.getValue()}</div>
          <div className="text-xs text-slate-400">s.d. {formatDateID(info.row.original.periodEndDate)}</div>
        </div>
      ),
    }),
    columnHelper.accessor((row) => row.variance, {
      id: "variance",
      header: "Selisih (Adjusted)",
      cell: (info) => {
        const v = info.getValue();
        return <span className={`font-mono tabular-nums ${v === 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatIDR(v)}</span>;
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => (
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[info.getValue()] ?? STATUS_CLASS.DRAFT}`}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("updatedAt", {
      header: "Terakhir Diubah",
      cell: (info) => <span className="text-xs text-slate-500">{new Date(info.getValue()).toLocaleString("id-ID")}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: (info) => {
        const id = info.row.original.id;
        return (
          <div className="flex items-center justify-end gap-2">
            <Link href={`/workspace/${id}`} className="text-slate-600 hover:text-teal-600" title="Buka">
              <ExternalLink className="h-4 w-4" />
            </Link>
            <a href={`/api/sessions/${id}/export/pdf`} className="text-slate-600 hover:text-teal-600" title="Unduh PDF">
              <FileText className="h-4 w-4" />
            </a>
            <a href={`/api/sessions/${id}/export/excel`} className="text-slate-600 hover:text-teal-600" title="Unduh Excel">
              <FileSpreadsheet className="h-4 w-4" />
            </a>
            <button onClick={() => handleDelete(id)} className="text-slate-400 hover:text-rose-600" title="Hapus">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    }),
  ], [columnHelper, handleDelete]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Arsip Rekonsiliasi</h1>
      <p className="mb-6 text-sm text-slate-600">Seluruh sesi tersimpan di database.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Cari perusahaan / rekening..."
            className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                statusFilter === tab ? "bg-teal-50 text-teal-600" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className={`px-4 py-3 font-medium ${header.column.id === "actions" ? "text-right" : ""}`}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">Tidak ada sesi.</td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
