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

/** Konversi 1 cell ExcelJS ke string bersih. */
function cellToString(cell: ExcelJS.Cell): string {
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
