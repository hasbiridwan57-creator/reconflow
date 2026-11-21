/**
 * Test fitur Pratinjau (Preview) sebelum unduh:
 * - parseWorkbookPreview: multi-sheet, nama sheet, deteksi numerik, padding kolom.
 * - contentDisposition/wantsInline: header inline vs attachment.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseWorkbookPreview } from "@/lib/engine/spreadsheet";
import { contentDisposition, wantsInline } from "@/lib/export/http";

/** Bangun workbook 2 sheet utk uji preview. */
async function buildMultiSheet(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Ringkasan");
  a.addRow(["Komponen", "Jumlah"]);
  a.addRow(["Saldo akhir bank", 369_296_000]);
  a.addRow(["Selisih", 0]);

  const b = wb.addWorksheet("Transaksi Bank");
  b.addRow(["Tanggal", "Keterangan", "Nominal"]);
  b.addRow(["2026-10-02", "Setoran", 1_000_000]);
  b.addRow(["2026-10-03", "Biaya admin", -35_000]); // baris ke-3

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("parseWorkbookPreview", () => {
  it("membaca seluruh sheet + nama sheet sesuai urutan", async () => {
    const sheets = await parseWorkbookPreview(await buildMultiSheet());
    expect(sheets.map((s) => s.name)).toEqual(["Ringkasan", "Transaksi Bank"]);
  });

  it("menandai cell numerik (isNumeric) vs teks dengan benar", async () => {
    const sheets = await parseWorkbookPreview(await buildMultiSheet());
    const ring = sheets[0];
    // Baris 2 = ["Saldo akhir bank", 369296000]
    const saldo = ring.rows[1];
    expect(saldo[0].text).toBe("Saldo akhir bank");
    expect(saldo[0].isNumeric).toBe(false);
    expect(saldo[1].text).toBe("369296000");
    expect(saldo[1].isNumeric).toBe(true);
  });

  it("menyeragamkan lebar tiap baris ke colCount", async () => {
    const sheets = await parseWorkbookPreview(await buildMultiSheet());
    for (const s of sheets) {
      expect(s.colCount).toBeGreaterThan(0);
      expect(s.rows.every((r) => r.length === s.colCount)).toBe(true);
    }
  });

  it("mengembalikan array kosong utk workbook tanpa worksheet", async () => {
    const wb = new ExcelJS.Workbook();
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const sheets = await parseWorkbookPreview(buf);
    expect(sheets).toEqual([]);
  });

  it("menghormati numFmt berkas: #,##0 → ribuan titik, 0.0% → persen koma", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ringkasan");
    ws.columns = [
      { header: "Komponen", key: "label", width: 40 },
      { header: "Jumlah (Rp)", key: "value", width: 22 },
    ];
    ws.addRow({ label: "Saldo akhir bank", value: 68_181_000 });
    ws.addRow({ label: "Biaya", value: -3_500 });
    ws.getColumn("value").numFmt = "#,##0";
    const rate = ws.addRow({ label: "Match Rate (%)", value: 0.7368421052631579 });
    rate.getCell("value").numFmt = "0.0%";
    const buf = (await ws.workbook.xlsx.writeBuffer()) as ArrayBuffer;

    const [sheet] = await parseWorkbookPreview(buf);
    const rowOf = (label: string) => sheet.rows.find((r) => r[0].text === label)!;
    expect(rowOf("Saldo akhir bank")[1].text).toBe("68.181.000");
    expect(rowOf("Biaya")[1].text).toBe("-3.500");
    expect(rowOf("Match Rate (%)")[1].text).toBe("73,7%");
    // Nilai numerik tetap ditandai numerik walau teksnya sudah diformat.
    expect(rowOf("Saldo akhir bank")[1].isNumeric).toBe(true);
  });

  it("tanpa numFmt → teks mentah (jalur impor parseXlsx tetap memakai cellToString)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    ws.addRow(["Nominal"]);
    ws.addRow([68_181_000]);
    const buf = (await ws.workbook.xlsx.writeBuffer()) as ArrayBuffer;
    const [sheet] = await parseWorkbookPreview(buf);
    expect(sheet.rows[1][0].text).toBe("68181000");
  });
});

describe("http content-disposition", () => {
  it("inline=1 → inline; default → attachment", () => {
    expect(contentDisposition("Laporan.pdf", true)).toBe('inline; filename="Laporan.pdf"');
    expect(contentDisposition("Laporan.pdf", false)).toBe('attachment; filename="Laporan.pdf"');
  });

  it("wantsInline mendeteksi query ?inline=1", () => {
    expect(wantsInline(new Request("http://localhost/api/x?inline=1"))).toBe(true);
    expect(wantsInline(new Request("http://localhost/api/x"))).toBe(false);
    expect(wantsInline(new Request("http://localhost/api/x?inline=0"))).toBe(false);
  });
});
