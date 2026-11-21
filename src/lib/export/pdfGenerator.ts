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

  // Top accent bar — tipis 3mm, Deep Teal.
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 3, "F");

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

  // Stempel status formal — pojok kanan atas.
  const stampText = s.isBalanced ? "RECONCILED  ·  Rp 0" : "DRAFT  ·  UNRECONCILED";
  const stampColor: [number, number, number] = s.isBalanced ? [5, 150, 105] : [217, 119, 6];
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const stampW = doc.getTextWidth(stampText) + 6;
  const stampX = pageW - 14 - stampW;
  doc.setDrawColor(...stampColor);
  doc.setTextColor(...stampColor);
  doc.setLineWidth(0.6);
  doc.roundedRect(stampX, 14, stampW, 8, 1.5, 1.5, "S");
  doc.text(stampText, stampX + 3, 19.3);

  // 4 KPI ringkasan — di bawah header, sebelum tabel Sisi Bank.
  const kpiY = 46;
  const kpiH = 14;
  const kpiGap = 3;
  const kpiW = (pageW - 28 - kpiGap * 3) / 4;
  const kpis: { label: string; value: string }[] = [
    { label: "Saldo Akhir Bank", value: `Rp ${formatIDR(meta.endingBankBalance)}` },
    { label: "Saldo Akhir Buku", value: `Rp ${formatIDR(meta.endingBookBalance)}` },
    { label: "", value: "" }, // #3 dirender khusus (1 atau 2 baris).
    { label: "Selisih (Variance)", value: `Rp ${formatIDR(s.variance)}` },
  ];
  const kasBenar = s.isBalanced || s.adjustedBankBalance === s.adjustedBookBalance;
  doc.setFontSize(8);
  kpis.forEach((k, i) => {
    const kx = 14 + i * (kpiW + kpiGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(kx, kpiY, kpiW, kpiH, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(k.label, kx + 2.5, kpiY + 5);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);

    if (i === 2) {
      // Kotak KPI #3 — Saldo Kas Benar (balanced) ATAU Saldo Disesuaikan (2 baris).
      if (kasBenar) {
        doc.text("Saldo Kas Benar", kx + 2.5, kpiY + 5);
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`Rp ${formatIDR(s.adjustedBankBalance)}`, kx + 2.5, kpiY + 11);
      } else {
        doc.text("Saldo Disesuaikan", kx + 2.5, kpiY + 5);
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`Bank: Rp ${formatIDR(s.adjustedBankBalance)}`, kx + 2.5, kpiY + 8.5);
        doc.text(`Buku: Rp ${formatIDR(s.adjustedBookBalance)}`, kx + 2.5, kpiY + 12.2);
      }
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      return;
    }

    if (i === 3) {
      // Kotak KPI #4 — warna sesuai variance.
      doc.setTextColor(...(s.variance === 0 ? ([5, 150, 105] as [number, number, number]) : ([225, 29, 72] as [number, number, number])));
    } else {
      doc.setTextColor(15, 23, 42);
    }

    doc.setFontSize(9);
    // Adaptif: kecilkan font bila melebihi lebar kotak — JANGAN potong digit.
    let fontSize = 9;
    while (fontSize > 7 && doc.getTextWidth(k.value) > kpiW - 4) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
    doc.text(k.value, kx + 2.5, kpiY + 11);
    doc.setFontSize(8);
  });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

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
    startY: kpiY + kpiH + 8,
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