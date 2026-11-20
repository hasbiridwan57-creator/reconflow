/**
 * Format helpers untuk tampilan finansial.
 * Semua nominal Rupiah disimpan sebagai integer (exact) dan diformat tanpa desimal.
 * Gunakan bersama class `font-mono tabular-nums text-right` di UI agar
 * angka lurus sempurna secara vertikal.
 */

/** Format integer Rupiah: 1234500 -> "Rp 1.234.500" */
export function formatIDR(amount: number | null | undefined): string {
  const value = typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}Rp ${abs.toLocaleString("id-ID")}`;
}

/**
 * Format integer Rupiah gaya akuntansi: negatif dalam tanda kurung.
 * 1234500 -> "Rp 1.234.500", -500000 -> "(Rp 500.000)"
 */
export function formatIDRAccounting(amount: number | null | undefined): string {
  const value = typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount) : 0;
  if (value < 0) return `(Rp ${Math.abs(value).toLocaleString("id-ID")})`;
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/** Format tanggal ISO (YYYY-MM-DD) ke locale Indonesia tanpa zona-waktu geser. */
export function formatDateID(isoDate: string | null | undefined): string {
  if (!isoDate) return "-";
  const [y, m, d] = isoDate.split("-").map((part) => parseInt(part, 10));
  if (!y || !m || !d) return isoDate;
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${d} ${monthNames[m - 1]} ${y}`;
}

/** Format persentase: 0.8734 -> "87,3%" */
export function formatPercent(ratio: number | null | undefined, decimals = 1): string {
  const value = typeof ratio === "number" && Number.isFinite(ratio) ? ratio * 100 : 0;
  return `${value.toFixed(decimals).replace(".", ",")}%`;
}

/** Slug aman untuk nama file ekspor. */
export function slugifyFileName(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
