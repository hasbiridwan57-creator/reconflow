/**
 * Generator PDF formal (Laporan Rekonsiliasi Bank).
 * Lihat RECONFLOW_MASTER_SPEC.md §9.1.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { HydratedSessionResponse } from "@/lib/session";

export function generatePdf(session: HydratedSessionResponse): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const meta = session.session;
  const s = session.summary;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("LAPORAN REKONSILIASI BANK", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(meta.companyName, 14, 25);
  doc.text(`${meta.bankAccountName} — Periode: ${meta.periodLabel}`, 14, 30);
  doc.text(`Periode berakhir: ${meta.periodEndDate}`, 14, 35);
  doc.text(`Disusun: ${meta.preparedBy}   |   Direview: ${meta.reviewedBy}`, 14, 40);

  // Ringkasan saldo (jembatan bank -> buku)
  autoTable(doc, {
    startY: 46,
    head: [["Komponen", "Jumlah (Rp)"]],
    body: [
      ["Saldo akhir bank", formatIDR(meta.endingBankBalance)],
      ["Penyesuaian sisi bank (bersih)", formatIDR(s.totalBankAdjustments)],
      ["= Saldo bank disesuaikan", formatIDR(s.adjustedBankBalance)],
      ["Saldo akhir buku", formatIDR(meta.endingBookBalance)],
      ["Penyesuaian sisi buku (bersih)", formatIDR(s.totalBookAdjustments)],
      ["= Saldo buku disesuaikan", formatIDR(s.adjustedBookBalance)],
      ["SELISIH (VARIANCE)", formatIDR(s.variance)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: { 1: { halign: "right" } },
  });

  // Jurnal penyesuaian
  const journalRows = session.journals.entries.flatMap((e) =>
    e.lines.map((l) => [e.description, l.accountName, l.debit !== 0 ? formatIDR(l.debit) : "", l.credit !== 0 ? formatIDR(l.credit) : ""]),
  );
  if (journalRows.length > 0) {
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
      head: [["Uraian", "Akun", "Debit", "Kredit"]],
      body: [
        ...journalRows,
        ["", "TOTAL", formatIDR(session.journals.totalDebit), formatIDR(session.journals.totalCredit)],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [5, 150, 105] },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    });
  }

  // Footer status
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(
    `Status: ${meta.status}  |  Selisih: ${s.isBalanced ? "SEIMBANG (Rp 0)" : `Rp ${s.variance.toLocaleString("id-ID")}`}  |  Match Rate: ${s.matchRate}%`,
    14,
    doc.internal.pageSize.getHeight() - 12,
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

export function pdfFileName(session: HydratedSessionResponse): string {
  const slug = slugify(`${session.session.companyName}_${session.session.periodLabel}`);
  return `ReconFlow_${slug}.pdf`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
