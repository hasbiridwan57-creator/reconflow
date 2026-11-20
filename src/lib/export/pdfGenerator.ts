/**
 * Generator PDF formal (Laporan Rekonsiliasi Bank).
 * Lihat RECONFLOW_MASTER_SPEC.md §9.1.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { HydratedSessionResponse } from "@/lib/session";
import { getCategoryLabel } from "@/lib/engine/calculator";

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

  // Jembatan Sisi Bank — rincian per item penyesuaian.
  const bankAdj = session.adjustments.filter((a) => a.side === "BANK");
  const bookAdj = session.adjustments.filter((a) => a.side === "BOOK");
  // Baris pertama 3 kolom penuh agar nominal tak bergeser ke kolom Kategori.
  const bankRows: string[][] = [["Saldo akhir bank", "", formatIDR(meta.endingBankBalance)]];
  for (const a of bankAdj) {
    bankRows.push([`   ${a.description}`, getCategoryLabel(a.category), formatIDRAccounting(a.signedAmount)]);
  }
  bankRows.push(["= Saldo bank disesuaikan", "", formatIDR(s.adjustedBankBalance)]);

  autoTable(doc, {
    startY: 46,
    head: [["Sisi Bank — Komponen", "Kategori", "Jumlah (Rp)"]],
    body: bankRows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
    columnStyles: { 2: { halign: "right" } },
  });

  // Jembatan Sisi Buku — rincian per item penyesuaian.
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const bookRows: string[][] = [["Saldo akhir buku", "", formatIDR(meta.endingBookBalance)]];
  for (const a of bookAdj) {
    bookRows.push([`   ${a.description}`, getCategoryLabel(a.category), formatIDRAccounting(a.signedAmount)]);
  }
  bookRows.push(["= Saldo buku disesuaikan", "", formatIDR(s.adjustedBookBalance)]);
  bookRows.push(["SELISIH (VARIANCE)", "", formatIDR(s.variance)]);

  autoTable(doc, {
    startY: y,
    head: [["Sisi Buku — Komponen", "Kategori", "Jumlah (Rp)"]],
    body: bookRows,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 118, 110] },
    columnStyles: { 2: { halign: "right" } },
  });

  // Jurnal penyesuaian
  const journalRows = session.journals.entries.flatMap((e) =>
    e.lines.map((l) => [e.description, l.accountName, l.debit !== 0 ? formatIDR(l.debit) : "", l.credit !== 0 ? formatIDR(l.credit) : ""]),
  );
  if (journalRows.length > 0) {
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: y,
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

  // Blok Tanda Tangan Formal — posisi DINAMIS dari lastAutoTable.finalY.
  const pageHeight = doc.internal.pageSize.getHeight();
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let signY: number;
  if (finalY + 58 > pageHeight - 18) {
    doc.addPage();
    signY = 28;
  } else {
    signY = finalY + 18;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const col1X = 20;
  const col2X = 120;
  const sigLine = signY;
  const nameY = signY + 6;
  const dateY = signY + 22;

  doc.text("Disusun Oleh (Prepared by):", col1X, signY - 6);
  doc.text("Direview Oleh (Reviewed by):", col2X, signY - 6);
  // Garis tanda tangan.
  doc.line(col1X, sigLine, col1X + 60, sigLine);
  doc.line(col2X, sigLine, col2X + 60, sigLine);
  // Nama di bawah garis.
  doc.setFont("helvetica", "bold");
  doc.text(meta.preparedBy, col1X, nameY);
  doc.text(meta.reviewedBy, col2X, nameY);
  // Tanggal cetak.
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const printedDate = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`Tanggal cetak: ${printedDate}`, col1X, dateY);

  // Footer Status — PALING AKHIR (setelah blok tanda tangan digambar),
  // di bawah halaman terakhir agar tak pernah menabrak tabel jurnal.
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text(
    `Status: ${meta.status}  |  Selisih: ${s.isBalanced ? "SEIMBANG (Rp 0)" : `Rp ${s.variance.toLocaleString("id-ID")}`}  |  Match Rate: ${(s.matchRate * 100).toFixed(1)}%`,
    14,
    doc.internal.pageSize.getHeight() - 12,
  );

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

/** Format akuntansi: negatif dalam tanda kurung, positif dengan tanda +. */
function formatIDRAccounting(n: number): string {
  if (n === 0) return formatIDR(0);
  if (n > 0) return `+${formatIDR(n)}`;
  return `(${formatIDR(Math.abs(n))})`;
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