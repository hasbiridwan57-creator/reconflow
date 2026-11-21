/**
 * Pembaca spreadsheet .xlsx (ExcelJS) → { headers, rows }.
 * Baris 1 = header. Cell Date → ISO YYYY-MM-DD. Cell formula/richText/angka → string bersih.
 * Pure & bebas Node API berat — dipakai di client via Dropzone.
 */
import ExcelJS from "exceljs";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** Konversi 1 cell ExcelJS ke string bersih (diekspor utk test unit). */
export function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((t) => t.text).join("").trim();
  }
  if (typeof v === "object" && "formula" in v && "result" in v) {
    const r = v.result;
    if (r instanceof Date) return r.toISOString().slice(0, 10);
    return String(r ?? "").trim();
  }
  // Cell hyperlink: utamakan teks tampilan, fallback ke URL.
  if (typeof v === "object" && "hyperlink" in v) {
    return String(("text" in v && v.text) || v.hyperlink || "").trim();
  }
  // Cell error (mis. #DIV/0!) → string kosong, bukan "[object Object]".
  if (typeof v === "object" && "error" in v) {
    return "";
  }
  return String(v).trim();
}

/** Baca worksheet pertama file .xlsx buffer → { headers, rows }. */
export async function parseXlsx(buffer: ArrayBuffer | Buffer): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  const table: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    // Iterasi berdasar indeks kolom (1..N) agar posisi tetap benar walau ada cell kosong di tengah.
    const lastCol = Math.max(row.cellCount, 1);
    for (let col = 1; col <= lastCol; col += 1) {
      vals[col - 1] = cellToString(row.getCell(col));
    }
    if (vals.some((s) => s !== "" && s !== undefined)) table.push(vals);
  });

  if (table.length === 0) return { headers: [], rows: [] };

  const headers = table[0];
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < table.length; i++) {
    const rec: Record<string, string> = {};
    headers.forEach((h, ci) => {
      rec[h] = table[i][ci] ?? "";
    });
    rows.push(rec);
  }
  return { headers, rows };
}

/* =====================================================================
 * Pratinjau multi-sheet (.xlsx) — utk modal Preview sebelum unduh.
 * ===================================================================== */

export interface PreviewCell {
  text: string;
  isNumeric: boolean;
}

export interface PreviewSheet {
  name: string;
  colCount: number;
  rows: PreviewCell[][];
}

/** True bila cell berisi angka (atau formula dengan hasil numerik). */
function isNumericCell(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  if (typeof v === "number") return true;
  if (typeof v === "object" && v !== null && "formula" in v && "result" in v) {
    return typeof (v as { result?: unknown }).result === "number";
  }
  return false;
}

/**
 * Baca SELURUH worksheet dari buffer .xlsx → grid preview.
 * Baris yang seluruh selnya kosong dibuang; lebar tiap baris diseragamkan ke colCount.
 */
export async function parseWorkbookPreview(buffer: ArrayBuffer | Buffer): Promise<PreviewSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const sheets: PreviewSheet[] = [];

  for (const ws of wb.worksheets) {
    const raw: PreviewCell[][] = [];
    let colCount = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const lastCol = Math.max(row.cellCount, 1);
      const cells: PreviewCell[] = [];
      for (let col = 1; col <= lastCol; col += 1) {
        const cell = row.getCell(col);
        cells.push({ text: cellToString(cell), isNumeric: isNumericCell(cell) });
      }
      // Lewati baris yang seluruh selnya kosong (mis. baris pemisah).
      if (!cells.some((c) => c.text !== "")) return;
      colCount = Math.max(colCount, cells.length);
      raw.push(cells);
    });
    // Seragamkan lebar baris → colCount (pad dengan sel kosong).
    const rows: PreviewCell[][] = raw.map((cells) => {
      if (cells.length === colCount) return cells;
      const padded = cells.slice();
      while (padded.length < colCount) padded.push({ text: "", isNumeric: false });
      return padded;
    });
    sheets.push({ name: ws.name, colCount, rows });
  }
  return sheets;
}
