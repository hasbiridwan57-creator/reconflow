/**
 * Workbench & Report components untuk workspace 4-step.
 * Upgrade sesuai Gemini audit: dropdown kategori lengkap, sub-tabs,
 * discrepancy faultSide selector, true floating waterfall, badge IN/OUT.
 */
"use client";

import { useMemo, useState } from "react";
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, flexRender, createColumnHelper,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { api, type HydratedSessionResponse } from "@/lib/api/client";
import { formatIDR, formatIDRAccounting, formatDateID } from "@/lib/format";
import { getCategoryLabel } from "@/lib/engine/calculator";
import type { MatchPairDTO } from "@/lib/session";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell,
} from "recharts";

/* ---------- MatchingControlsBar ---------- */
export function MatchingControlsBar({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: (updated?: HydratedSessionResponse) => void }) {
  const [days, setDays] = useState(data.session.dateToleranceDays);
  const [amount, setAmount] = useState(data.session.amountToleranceRupiah);
  const [transposition, setTransposition] = useState(data.session.detectTransposition);
  const [running, setRunning] = useState(false);
  const finalized = data.session.status === "FINALIZED";

  async function run() {
    if (finalized) { toast.error("Sesi sudah FINALIZED. Buka kembali (REOPEN) terlebih dahulu."); return; }
    setRunning(true);
    try {
      await api.updateSession(data.session.id, {
        dateToleranceDays: days, amountToleranceRupiah: amount, detectTransposition: transposition,
      });
      const updated = await api.reRunMatch(data.session.id);
      toast.success("Auto-match dijalankan ulang.");
      onRefresh(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally { setRunning(false); }
  }

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">Konfigurasi Matching Engine</h3>
      <div className="flex flex-wrap items-end gap-6">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Toleransi Tanggal: <b>{days} hari</b></span>
          <input type="range" min={0} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={finalized} className="w-48 accent-teal-600" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Toleransi Nominal (Rp)</span>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} disabled={finalized} className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-right font-mono tabular-nums text-sm outline-none focus:border-teal-500 disabled:bg-slate-50" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={transposition} onChange={(e) => setTransposition(e.target.checked)} disabled={finalized} className="accent-teal-600" />
          Deteksi Transposition Error
        </label>
        <button onClick={run} disabled={running || finalized} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60">
          {running ? "Menjalankan..." : "Jalankan Ulang Auto-Match"}
        </button>
      </div>
    </div>
  );
}

/* ---------- ConfirmedMatchesTab ---------- */
const confirmedColumnHelper = createColumnHelper<MatchPairDTO>();

export function ConfirmedMatchesTab({ data, onRefresh }: { data: HydratedSessionResponse; onRefresh: (updated?: HydratedSessionResponse) => void }) {
  const finalized = data.session.status === "FINALIZED";
  const confirmed = data.matches.filter((m) => m.isConfirmed);
  const [search, setSearch] = useState("");
  const helper = confirmedColumnHelper;
  const columns = useMemo(() => [
    helper.accessor((row) => row.bankTx.date, { id: "date", header: "Tanggal", cell: (i) => <span className="text-xs text-slate-600">{formatDateID(i.row.original.bankTx.date)}</span> }),
    helper.accessor((row) => row.bankTx.description, { id: "bank", header: "Bank", cell: (i) => <div className="text-sm text-slate-900">{i.getValue()}</div> }),
    helper.accessor((row) => row.bookTx.description, { id: "book", header: "Buku", cell: (i) => <div className="text-sm text-slate-900">{i.getValue()}</div> }),
    helper.accessor("status", { header: "Status", cell: (i) => {
      const map: Record<string, string> = { EXACT_MATCH: "Cocok Persis", SUGGESTED_MATCH: "Saran", DISCREPANCY_MATCH: "Selisih", MANUAL_MATCH: "Manual" };
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{map[i.getValue()] ?? i.getValue()}</span>;
    }}),
    helper.accessor("confidenceScore", { header: "Confidence", cell: (i) => <span className="font-mono tabular-nums text-sm">{i.getValue()}%</span> }),
    helper.accessor((row) => row.bankTx.amount, { id: "amount", header: "Nominal", cell: (i) => <span className="font-mono tabular-nums text-right text-sm">{formatIDR(i.getValue())}</span> }),
    helper.display({ id: "actions", header: "", cell: (i) => (
      <button
        onClick={async () => {
          try { const updated = await api.deleteMatch(data.session.id, i.row.original.id); toast.success("Unmatched."); onRefresh(updated); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Gagal."); }
        }}
        disabled={finalized}
        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
      >Unmatch</button>
    )}),
  ], [data, onRefresh, helper, finalized]);
  const table = useReactTable({
    data: confirmed, columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
  });

  if (confirmed.length === 0) return <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Belum ada pasangan terkonfirmasi.</div>;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari cepat..."
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-teal-500"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => <th key={h.id} className="px-4 py-3 font-medium">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-3">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- ReconMatrixCard (formal statement terpadu) ---------- */
export function ReconMatrixCard({ data }: { data: HydratedSessionResponse }) {
  const s = data.summary;
  const bankAdj = data.adjustments.filter((a) => a.side === "BANK");
  const bookAdj = data.adjustments.filter((a) => a.side === "BOOK");

  function renderSection(
    title: string,
    subtitle: string,
    start: number,
    adj: typeof bankAdj,
    totalLabel: string,
    totalValue: number,
  ) {
    const additions = adj.filter((a) => a.signedAmount > 0);
    const deductions = adj.filter((a) => a.signedAmount < 0);
    return (
      <div className="space-y-1 text-sm">
        <div className="mb-2">
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="text-[11px] text-slate-400">{subtitle}</p>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Saldo akhir</span>
          <span className="font-mono tabular-nums text-right">{formatIDR(start)}</span>
        </div>
        {additions.length > 0 && <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Penambahan (+)</div>}
        {additions.map((a) => (
          <div key={a.id} className="flex justify-between">
            <div>
              <div className="text-sm text-slate-900">{a.description}</div>
              <div className="text-[11px] text-slate-400">{getCategoryLabel(a.category)}</div>
            </div>
            <span className="font-mono tabular-nums text-right text-emerald-600">{formatIDRAccounting(a.signedAmount)}</span>
          </div>
        ))}
        {deductions.length > 0 && <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pengurangan (−)</div>}
        {deductions.map((a) => (
          <div key={a.id} className="flex justify-between">
            <div>
              <div className="text-sm text-slate-900">{a.description}</div>
              <div className="text-[11px] text-slate-400">{getCategoryLabel(a.category)}</div>
            </div>
            <span className="font-mono tabular-nums text-right text-rose-600">{formatIDRAccounting(a.signedAmount)}</span>
          </div>
        ))}
        <div className="double-underline mt-3 flex justify-between border-t border-slate-300 pt-2 font-semibold">
          <span>{totalLabel}</span>
          <span className="font-mono tabular-nums text-right">{formatIDR(totalValue)}</span>
        </div>
      </div>
    );
  }

  const balanced = s.variance === 0;
  return (
    <div className="rounded-lg border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="border-b border-slate-200 px-5 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-slate-900">Matriks Rekonsiliasi — Laporan Formal</h3>
      </div>
      <div className="space-y-5 p-5">
        {renderSection("A. Sisi Bank (Rekening Koran)", "Saldo bank disesuaikan", data.session.endingBankBalance, bankAdj, "Saldo Bank Disesuaikan", s.adjustedBankBalance)}
        <div className="border-t border-slate-200/70 pt-4">
          {renderSection("B. Sisi Buku (Buku Kas / GL)", "Saldo buku disesuaikan", data.session.endingBookBalance, bookAdj, "Saldo Buku Disesuaikan", s.adjustedBookBalance)}
        </div>
      </div>
      {/* Baris penutup CHECK */}
      <div className={`border-t-2 px-5 py-3 text-center ${balanced ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-rose-500 bg-rose-50 text-rose-800"}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">Check (Harus Rp 0): </span>
        <span className="font-mono text-lg font-bold tabular-nums">{formatIDR(s.variance)}</span>
      </div>
    </div>
  );
}

/* ---------- ReconWaterfallChart (true floating) ---------- */
const COLOR_HEX: Record<string, string> = {
  indigo: "#0D9488",   // Saldo Awal — Teal-600
  emerald: "#10B981",  // Penambahan — Emerald-500
  rose: "#F43F5E",     // Pengurangan — Rose-500
  amber: "#F59E0B",    // Saldo belum seimbang — Amber-500
  teal: "#0F766E",     // Saldo Disesuaikan balanced — Teal-700
};

interface WaterfallDatum {
  label: string;
  base: number;
  displayValue: number;
  signed: number;
  color: string;
}

export function ReconWaterfallChart({ data }: { data: HydratedSessionResponse }) {
  const s = data.summary;
  // Gunakan base ASLI dari backend (posisi floating), bukan Math.min(0, ...).
  const chartData: WaterfallDatum[] = s.waterfallSteps.map((step) => {
    let color = COLOR_HEX[step.color] ?? "#0D9488";
    // Saldo Disesuaikan: amber (belum seimbang) → teal (seimbang).
    if (step.kind === "total" && step.label.includes("Disesuaikan") && s.variance === 0) {
      color = COLOR_HEX.teal!;
    }
    return {
      label: step.label,
      base: step.base,
      displayValue: Math.abs(step.value),
      signed: step.value,
      color,
    };
  });
  // Domain YAxis dari [0, max(base + tinggi)] dengan padding atas nyaman.
  const maxTop = chartData.reduce((max, d) => Math.max(max, d.base + d.displayValue), 0);
  const yMax = Math.ceil((maxTop * 1.05) / 1_000_000) * 1_000_000;

  const tooltipFormatter = (value: number, name: string, item: { payload?: WaterfallDatum }) => {
    if (name === "displayValue") {
      const d = item.payload;
      const isTotal = d && d.base === 0 && d.signed > 0 && d.displayValue === d.signed && d.label.includes("Saldo");
      const formatted = isTotal ? formatIDR(d!.signed) : (d && d.signed > 0 ? `+${formatIDR(d.signed)}` : `-${formatIDR(Math.abs(d!.signed))}`);
      return [formatted, d?.label ?? ""];
    }
    return ["", ""];
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h4 className="mb-1 text-sm font-semibold text-slate-900">Jembatan Penyesuaian Saldo Bank</h4>
      <p className="mb-4 text-xs text-slate-500">
        Saldo Akhir Buku: <span className="font-mono tabular-nums">{formatIDR(data.session.endingBookBalance)}</span> · Selisih: <span className={`font-mono tabular-nums ${s.variance === 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatIDR(s.variance)}</span>
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 40, left: 20 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
          <YAxis domain={[0, yMax]} tickFormatter={(v: number) => formatIDR(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <CartesianGrid stroke="#F1F5F9" vertical={false} />
          <Tooltip
            formatter={(value, name, item) => tooltipFormatter(value as number, name as string, item as { payload?: WaterfallDatum })}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          {/* base transparan = posisi floating (dari backend); displayValue = tinggi batang. */}
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="displayValue" stackId="wf" isAnimationActive={false}>
            {chartData.map((c, i) => <Cell key={i} fill={c.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
