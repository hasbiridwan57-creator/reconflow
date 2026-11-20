import { getHydratedSession, notFoundResponse } from "@/lib/session";
import { generateExcel, excelFileName } from "@/lib/export/excelGenerator";

/** GET /api/sessions/[id]/export/excel — unduh Workbook 4-sheet (spec §7 endpoint 16). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getHydratedSession(id);
  if (!session) return notFoundResponse("Sesi");

  const buffer = await generateExcel(session);
  const filename = excelFileName(session);

  return new Response(new Uint8Array(buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
