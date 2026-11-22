# Catatan Audit E2E (23 Nov 2026)

## Bug ditemukan & diperbaiki saat dogfood E2E production
1. **Isolasi login OPI tidak aktif di production** (2 akar masalah):
   - `getWorkspaceKey` memvalidasi `x-rf-auth-user-id` sebagai UUID v4 saja, padahal `User.id` Prisma = cuid (`cmws1...`). Identitas login tak pernah dipakai → semua request diperlakukan sebagai tamu. Fix: terima UUID atau cuid (`f251190`).
   - Middleware Edge memakai `jsonwebtoken` yang bergantung pada modul `crypto` Node (tidak tersedia di Edge Runtime) → verifikasi `rf_session` gagal diam-diam. Fix: verifikasi HS256 via Web Crypto (`authEdge.ts`, `d0728ea`).
2. **Validasi email terlalu longgar** di endpoint auth → diperketat `z.string().email()` (`67766a5`).

## Verifikasi akhir (production alias, 16 cek)
health 200 · login salah 401 · email invalid 422 · login 200+cookie · me OK · create 201 · baca sendiri 200 · anonim 404 · adjustment 201 · finalize gate 422 · variance OK · export PDF/Excel 200 · delete 200 → 404. Isolasi antar-user: user B dapat 404 untuk sesi user A. Semua pass.

## Catatan
- `PATCH /api/sessions/{id}/adjustments/{adjId}` tidak menerima `customAmount` (by design; hapus + buat ulang bila perlu ubah nominal).
- Data probe audit sudah dibersihkan dari DB.
