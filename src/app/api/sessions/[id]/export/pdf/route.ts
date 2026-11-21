import { getHydratedSession, notFoundResponse, requireSessionAccess } from "@/lib/session";
import { getWorkspaceKey } from "@/lib/workspace";
import { generatePdf, pdfFileName } from "@/lib/export/pdfGenerator";
import { contentDisposition, wantsInline } from "@/lib/export/http";

/** GET /api/sessions/[id]/export/pdf — unduh PDF formal (spec §7 endpoint 15).
 *  `?inline=1` → Content-Disposition inline (pratinjau di iframe, bukan unduh). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ownerKey } = getWorkspaceKey(request);
  await requireSessionAccess(id, ownerKey);
  const session = await getHydratedSession(id);
  if (!session) return notFoundResponse("Sesi");

  const bytes = generatePdf(session);
  const filename = pdfFileName(session);
  const inline = wantsInline(request);

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(filename, inline),
      "Cache-Control": "no-store",
    },
  });
}