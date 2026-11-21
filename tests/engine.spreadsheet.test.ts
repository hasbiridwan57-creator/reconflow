import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseXlsx } from "@/lib/engine/spreadsheet";

/** Bangun workbook in-memory dengan tanggal, angka, string, formula, richText. */
async function buildTestWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(["Tanggal", "Keterangan", "Nominal"]);
  const r2 = ws.addRow([new Date("2026-10-02"), "Setoran pelanggan", 1000000]);
  r2.getCell(1).numFmt = "yyyy-mm-dd";
  ws.addRow(["2026-10-03", "Biaya adm", 25000]);
  const r4 = ws.addRow([null, { richText: [{ text: "Keterangan " }, { text: "kaya" }] }, null]);
  r4.getCell(3).value = { formula: "C2+C3", result: 1025000 };
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("parseXlsx", () => {
  it("mengubah workbook jadi { headers, rows } dengan header = baris 1", async () => {
    const buf = await buildTestWorkbook();
    const { headers, rows } = await parseXlsx(buf);
    expect(headers).toEqual(["Tanggal", "Keterangan", "Nominal"]);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]).toEqual({
      Tanggal: "2026-10-02",
      Keterangan: "Setoran pelanggan",
      Nominal: "1000000",
    });
  });

  it("mengonversi cell Date → ISO YYYY-MM-DD", async () => {
    const buf = await buildTestWorkbook();
    const { rows } = await parseXlsx(buf);
    expect(rows[0]["Tanggal"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("mengonversi richText → string gabungan & formula → hasil", async () => {
    const buf = await buildTestWorkbook();
    const { rows } = await parseXlsx(buf);
    // richText (kolom 2) berada di baris ke-4 — cari berdasarkan kolom Keterangan.
    const richRow = rows.find((r) => r["Keterangan"] === "Keterangan kaya");
    expect(richRow).toBeDefined();
    // formula (kolom 3) di baris sama — hasil 1.025.000.
    const formulaRow = rows.find((r) => r["Nominal"] === "1025000");
    expect(formulaRow).toBeDefined();
  });

  it("mengembalikan { headers: [], rows: [] } untuk workbook kosong", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Kosong");
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const { headers, rows } = await parseXlsx(buf);
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });

  it("mengonversi cell hyperlink → teks (bukan [object Object])", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    ws.addRow(["Ref"]);
    const row = ws.addRow([null]);
    row.getCell(1).value = { text: "INV-99", hyperlink: "https://example.com" };
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const { rows } = await parseXlsx(buf);
    expect(rows[0]["Ref"]).toBe("INV-99");
  });

  it("mengonversi cell error → string kosong", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("S");
    ws.addRow(["Nilai"]);
    const row = ws.addRow([null]);
    row.getCell(1).value = { error: "#DIV/0!" };
    // Cell error tak persist lewat writeBuffer (batasan ExcelJS) — test langsung helper.
    const { cellToString } = await import("@/lib/engine/spreadsheet");
    expect(cellToString(row.getCell(1))).toBe("");
  });
});
