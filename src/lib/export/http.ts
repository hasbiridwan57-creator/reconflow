/**
 * Helper HTTP ekspor — Content-Disposition inline/attachment yang bisa diuji unit.
 * Dipakai route PDF & Excel agar unduh vs pratinjau konsisten.
 */

/** Bangun header Content-Disposition. inline=true utk pratinjau di iframe, false utk unduh. */
export function contentDisposition(filename: string, inline: boolean): string {
  return `${inline ? "inline" : "attachment"}; filename="${filename}"`;
}

/** True bila request meminta pratinjau inline (query `?inline=1`). */
export function wantsInline(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.get("inline") === "1";
  } catch {
    return false;
  }
}
