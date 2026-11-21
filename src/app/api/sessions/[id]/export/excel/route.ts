import { getHydratedSession, notFoundResponse, requireSessionAccess } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";
import { generateExcel, excelFileName } from "@/lib/export/excelGenerator";
import { contentDisposition, wantsInline } from "@/lib/export/http";

/** GET /api/sessions/[id]/export/excel — unduh Workbook 4-sheet (spec §7 endpoint 16). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ownerKey } = getWorkspaceKey(request);
  await requireSessionAccess(id, ownerKey);
  const session = await getHydratedSession(id);
  if (!session) return notFoundResponse("Sesi");

  const buffer = await generateExcel(session);
  const filename = excelFileName(session);

  return new Response(new Uint8Array(buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(filename, wantsInline(request)),
      "Cache-Control": "no-store",
    },
  });
}
