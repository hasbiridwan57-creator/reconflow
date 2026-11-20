import { getHydratedSession, notFoundResponse } from "@/lib/session";
import { generatePdf, pdfFileName } from "@/lib/export/pdfGenerator";

/** GET /api/sessions/[id]/export/pdf — unduh PDF formal (spec §7 endpoint 15). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getHydratedSession(id);
  if (!session) return notFoundResponse("Sesi");

  const bytes = generatePdf(session);
  const filename = pdfFileName(session);

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
