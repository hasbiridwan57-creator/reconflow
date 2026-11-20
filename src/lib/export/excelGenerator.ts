/**
 * Generator Excel 4 sheet (Rekonsiliasi Bank).
 * Sheet: Ringkasan, Transaksi Bank, Transaksi Buku, Jurnal Penyesuaian.
 * Lihat RECONFLOW_MASTER_SPEC.md §9.2.
 */
import ExcelJS from "exceljs";
import { slugify } from "@/lib/export/pdfGenerator";
import type { HydratedSessionResponse } from "@/lib/session";
import { getCategoryLabel } from "@/lib/engine/calculator";

export async function generateExcel(session: HydratedSessionResponse): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ReconFlow";
  wb.created = new Date();

  const meta = session.session;
  const s = session.summary;

  // ---- Sheet 1: Ringkasan (rincian per item penyesuaian) ----
  const ws1 = wb.addWorksheet("Ringkasan");
  ws1.columns = [
    { header: "Komponen", key: "label", width: 40 },
    { header: "Jumlah (Rp)", key: "value", width: 22 },
  ];
  ws1.addRows([
    { label: "Perusahaan", value: meta.companyName },
    { label: "Rekening Bank", value: meta.bankAccountName },
    { label: "Periode", value: meta.periodLabel },
    { label: "Status", value: meta.status },
    { label: "", value: "" },
  ]);

  // Penyesuaian Sisi Bank — rincian tiap item.
  ws1.addRow({ label: "SISI BANK", value: "" });
  ws1.addRow({ label: "  Saldo akhir bank", value: meta.endingBankBalance });
  const bankAdj = session.adjustments.filter((a) => a.side === "BANK");
  for (const a of bankAdj) {
    ws1.addRow({ label: `  ${a.description} [${getCategoryLabel(a.category)}]`, value: a.signedAmount });
  }
  ws1.addRow({ label: "  Saldo bank disesuaikan", value: s.adjustedBankBalance });
  ws1.addRow({ label: "", value: "" });

  // Penyesuaian Sisi Buku — rincian tiap item.
  ws1.addRow({ label: "SISI BUKU", value: "" });
  ws1.addRow({ label: "  Saldo akhir buku", value: meta.endingBookBalance });
  const bookAdj = session.adjustments.filter((a) => a.side === "BOOK");
  for (const a of bookAdj) {
    ws1.addRow({ label: `  ${a.description} [${getCategoryLabel(a.category)}]`, value: a.signedAmount });
  }
  ws1.addRow({ label: "  Saldo buku disesuaikan", value: s.adjustedBookBalance });
  ws1.addRow({ label: "", value: "" });

  ws1.addRow({ label: "SELISIH (VARIANCE)", value: s.variance });

  // Baris Match Rate (%) — cell numFmt '0.0%' terpisah.
  const matchRateRow = ws1.addRow({ label: "Match Rate (%)", value: s.matchRate });
  matchRateRow.getCell("value").numFmt = "0.0%";

  // Format angka Rupiah untuk kolom value (KECUALI baris persen).
  ws1.getColumn("value").numFmt = "#,##0";
  matchRateRow.getCell("value").numFmt = "0.0%";
  styleHeader(ws1);

  // ---- Sheet 2: Transaksi Bank ----
  const ws2 = wb.addWorksheet("Transaksi Bank");
  ws2.columns = [
    { header: "Tanggal", key: "date", width: 12 },
    { header: "Referensi", key: "ref", width: 16 },
    { header: "Keterangan", key: "desc", width: 42 },
    { header: "Arah", key: "dir", width: 8 },
    { header: "Nominal", key: "amount", width: 18 },
    { header: "Status", key: "status", width: 18 },
  ];
  session.bankTransactions.forEach((t) => {
    ws2.addRow({ date: t.date, ref: t.reference, desc: t.description, dir: t.direction, amount: t.amount, status: t.matchStatus ?? "UNMATCHED" });
  });
  ws2.getColumn("amount").numFmt = "#,##0";
  styleHeader(ws2);

  // ---- Sheet 3: Transaksi Buku ----
  const ws3 = wb.addWorksheet("Transaksi Buku");
  ws3.columns = [
    { header: "Tanggal", key: "date", width: 12 },
    { header: "Referensi", key: "ref", width: 16 },
    { header: "Keterangan", key: "desc", width: 42 },
    { header: "Arah", key: "dir", width: 8 },
    { header: "Nominal", key: "amount", width: 18 },
    { header: "Status", key: "status", width: 18 },
  ];
  session.bookTransactions.forEach((t) => {
    ws3.addRow({ date: t.date, ref: t.reference, desc: t.description, dir: t.direction, amount: t.amount, status: t.matchStatus ?? "UNMATCHED" });
  });
  ws3.getColumn("amount").numFmt = "#,##0";
  styleHeader(ws3);

  // ---- Sheet 4: Jurnal Penyesuaian ----
  const ws4 = wb.addWorksheet("Jurnal Penyesuaian");
  ws4.columns = [
    { header: "Uraian", key: "desc", width: 40 },
    { header: "Akun", key: "acc", width: 34 },
    { header: "Debit", key: "debit", width: 18 },
    { header: "Kredit", key: "credit", width: 18 },
  ];
  session.journals.entries.forEach((e) => {
    e.lines.forEach((l) => {
      ws4.addRow({ desc: e.description, acc: l.accountName, debit: l.debit || null, credit: l.credit || null });
    });
  });
  ws4.addRow({ desc: "", acc: "TOTAL", debit: session.journals.totalDebit, credit: session.journals.totalCredit });
  ws4.getColumn("debit").numFmt = "#,##0";
  ws4.getColumn("credit").numFmt = "#,##0";
  styleHeader(ws4);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function styleHeader(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
}

export function excelFileName(session: HydratedSessionResponse): string {
  return `ReconFlow_${slugify(`${session.session.companyName}_${session.session.periodLabel}`)}.xlsx`;
}
