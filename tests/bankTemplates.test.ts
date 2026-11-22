/**
 * Test deteksi template bank Indonesia (pure, tanpa DOM).
 * Cover: skor header, fallback generic, mapping kolom, baris footer,
 * defaults (saldo akhir, periode, tanggal akhir), angka Indonesia.
 */
import { describe, it, expect } from "vitest";
import {
  detectBankTemplate,
  lastValidDataRow,
  latestDateFrom,
  isoToPeriodLabel,
  looksLikeIndonesianNumber,
} from "../src/lib/engine/bankTemplates";

const BCA_HEADERS = ["Tanggal", "No Referensi", "Keterangan", "Debit", "Kredit", "Saldo"];

function bcaRows(): Record<string, string>[] {
  return [
    { Tanggal: "01/10/2026", "No Referensi": "BCA-001", Keterangan: "Setoran", Debit: "0", Kredit: "1.000.000", Saldo: "1.000.000" },
    { Tanggal: "05/10/2026", "No Referensi": "BCA-002", Keterangan: "Bayar listrik", Debit: "250.000", Kredit: "0", Saldo: "750.000" },
    { Tanggal: "31/10/2026", "No Referensi": "BCA-003", Keterangan: "Penjualan", Debit: "0", Kredit: "500.000", Saldo: "1.250.000" },
  ];
}

describe("detectBankTemplate", () => {
  it("mengenali format BCA dari header", () => {
    const r = detectBankTemplate({ headers: BCA_HEADERS, rows: bcaRows(), source: "BANK" });
    expect(r).not.toBeNull();
    expect(r!.templateKey).toBe("bca");
    expect(r!.score).toBeGreaterThanOrEqual(0.6);
    expect(r!.defaults.bankAccountName).toContain("Bank BCA");
  });

  it("mengisi saldo akhir dari baris valid terakhir (bukan baris TOTAL)", () => {
    const rows = [
      ...bcaRows(),
      { Tanggal: "", "No Referensi": "", Keterangan: "TOTAL", Debit: "250.000", Kredit: "1.500.000", Saldo: "1.250.000" },
    ];
    const r = detectBankTemplate({ headers: BCA_HEADERS, rows, source: "BANK" })!;
    expect(r.defaults.endingBalance).toBe(1250000);
  });

  it("mengisi periode + tanggal akhir dari data", () => {
    const r = detectBankTemplate({ headers: BCA_HEADERS, rows: bcaRows(), source: "BANK" })!;
    expect(r.defaults.periodEndDate).toBe("2026-10-31");
    expect(r.defaults.periodLabel).toBe("Oktober 2026");
  });

  it("memetakan kolom hasil deteksi ke header asli", () => {
    const r = detectBankTemplate({ headers: BCA_HEADERS, rows: bcaRows(), source: "BANK" })!;
    expect(r.mapping.date).toBe("Tanggal");
    expect(r.mapping.description).toBe("Keterangan");
    expect(r.mapping.debit).toBe("Debit");
    expect(r.mapping.credit).toBe("Kredit");
    expect(r.mapping.balance).toBe("Saldo");
  });

  it("header asing → generic (tidak yakin)", () => {
    const r = detectBankTemplate({
      headers: ["col_a", "col_b", "col_c"],
      rows: [{ col_a: "1", col_b: "2", col_c: "3" }],
      source: "BANK",
    });
    expect(r).not.toBeNull();
    expect(r!.templateKey).toBe("generic");
    expect(r!.summary).toMatch(/tidak dikenali/i);
  });

  it("mengenali buku kas (alias no_bukti, akun_lawan)", () => {
    const headers = ["Tanggal", "No Bukti", "Deskripsi", "Akun Lawan", "Debit Masuk", "Kredit Keluar", "Saldo"];
    const rows = [
      { Tanggal: "02/10/2026", "No Bukti": "BKM-001", Deskripsi: "Penjualan tunai", "Akun Lawan": "Pendapatan", "Debit Masuk": "1.000.000", "Kredit Keluar": "0", Saldo: "1.000.000" },
      { Tanggal: "03/10/2026", "No Bukti": "BKK-001", Deskripsi: "Beli atk", "Akun Lawan": "Beban ATK", "Debit Masuk": "0", "Kredit Keluar": "150.000", Saldo: "850.000" },
    ];
    const r = detectBankTemplate({ headers, rows, source: "BOOK" })!;
    expect(r.templateKey).toBe("bukukas");
    expect(r.mapping.counterAccount).toBe("Akun Lawan");
    expect(r.defaults.endingBalance).toBe(850000);
  });

  it("mendukung variasi header Mandiri (Tanggal Transaksi, No Transaksi)", () => {
    const headers = ["Tanggal Transaksi", "No Transaksi", "Keterangan", "Debit", "Kredit", "Saldo"];
    const rows = [
      { "Tanggal Transaksi": "01/11/2026", "No Transaksi": "MDR-1", Keterangan: "Transfer", Debit: "0", Kredit: "100.000", Saldo: "100.000" },
      { "Tanggal Transaksi": "30/11/2026", "No Transaksi": "MDR-2", Keterangan: "Tarik", Debit: "50.000", Kredit: "0", Saldo: "50.000" },
    ];
    const r = detectBankTemplate({ headers, rows, source: "BANK" })!;
    expect(r.templateKey).toBe("mandiri");
    expect(r.defaults.periodLabel).toBe("November 2026");
    expect(r.defaults.endingBalance).toBe(50000);
  });

  it("headers kosong → null", () => {
    expect(detectBankTemplate({ headers: [], rows: [], source: "BANK" })).toBeNull();
  });
});

describe("lastValidDataRow & util", () => {
  it("melewati baris footer dan baris tanpa nominal", () => {
    const rows = bcaRows();
    rows.push({ Tanggal: "31/10/2026", "No Referensi": "", Keterangan: "JUMLAH", Debit: "250.000", Kredit: "1.500.000", Saldo: "1.250.000" });
    const last = lastValidDataRow(rows, { date: "Tanggal", debit: "Debit", credit: "Kredit" });
    expect(last?.["No Referensi"]).toBe("BCA-003");
  });

  it("latestDateFrom mengabaikan baris tanpa tanggal valid", () => {
    const rows = [
      ...bcaRows(),
      { Tanggal: "bukan tanggal", "No Referensi": "X", Keterangan: "rusak", Debit: "1", Kredit: "0", Saldo: "0" },
    ];
    expect(latestDateFrom(rows, "Tanggal")).toBe("2026-10-31");
  });

  it("isoToPeriodLabel bulan Indonesia", () => {
    expect(isoToPeriodLabel("2026-10-31")).toBe("Oktober 2026");
    expect(isoToPeriodLabel("2026-01-05")).toBe("Januari 2026");
    expect(isoToPeriodLabel("")).toBe("");
  });

  it("looksLikeIndonesianNumber mengenali titik ribuan & koma desimal", () => {
    expect(looksLikeIndonesianNumber("1.250.000")).toBe(true);
    expect(looksLikeIndonesianNumber("1.250,50")).toBe(true);
    expect(looksLikeIndonesianNumber("-500")).toBe(true);
    expect(looksLikeIndonesianNumber("abc")).toBe(false);
    expect(looksLikeIndonesianNumber("")).toBe(false);
  });
});
