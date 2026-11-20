# ReconFlow

**End-to-End Bank Reconciliation, Automated Matching & Audit-Ready Reporting Workspace.**

ReconFlow adalah aplikasi web fullstack B2B-grade yang menyatukan rekonsiliasi bank berbasis 3-Pass matching engine, jurnal penyesuaian otomatis, audit trail lengkap, dan laporan formal (PDF & Excel) — semuanya deterministik dan siap audit.

![Next.js](https://img.shields.io/badge/Next.js-15-000?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript) ![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)

## Fitur Utama

- **Intake CSV dual-source** — unggah mutasi rekening koran bank & buku kas dengan mapping kolom fleksibel (deteksi header otomatis).
- **3-Pass Matching Engine** (Priority Greedy Bipartite):
  1. *Exact match* — tanggal, nominal, referensi/deskripsi identik.
  2. *Fuzzy match* — skor kemiripan teks 0,6·Jaccard + 0,4·Dice + token referensi.
  3. *Transposition detection* — deteksi salah ketik nominal (kelipatan 9) → `DISCREPANCY_MATCH`.
- **2-Tab Inbox Zero + Live Balance Mirror** — Meja Rekonsiliasi memprioritaskan item anomali (double charge bank, unknown charge) lalu saran pasangan, sisa rutin; panel Cermin Saldo menampilkan bridge 2 sisi + badge Debit = Kredit real-time.
- **Smart categorization** — suggester berbasis kata kunci + deteksi **Double Charge Bank** & **Unknown Charge** (`isAnomaly: true`); bulk apply 1 klik + Setujui Semua Saran.
- **Klasifikasi penyesuaian** dua sisi (BANK / BOOK) dengan kategori akuntansi formal (NSF check, bank fee, deposit in transit, outstanding check, dll).
- **Auto Adjusting Journal Entries** — hanya penyesuaian sisi buku yang menjurnal; dijamin debit = kredit.
- **Jembatan saldo (reconciliation bridge)** — saldo bank & buku disesuaikan **harus bertemu di variance Rp 0**.
- **Audit trail** tiap mutasi (create/approve/klasifikasi/finalize) terekam permanen.
- **Ekspor laporan formal** — PDF (jsPDF) & Excel 4-sheet (ExcelJS), blok tanda tangan Prepared by / Reviewed by.

## Arsitektur

```
src/
├── app/
│   ├── api/                    # 14 REST endpoint (App Router route handlers, incl. bulk actions)
│   ├── page.tsx                # Beranda (demo cards + sesi terbaru)
│   ├── new/                    # Intake CSV 2 langkah (dual dropzone + column mapper dalam accordion)
│   ├── workspace/[id]/         # 2-Tab Inbox Zero + Live Balance Mirror
│   └── history/                # Arsip sesi + filter status
├── components/                 # UI (AppShell, workbench, laporan)
├── lib/
│   ├── engine/                 # parser, textSimilarity, matcher, suggester, calculator, journals, adjustments
│   ├── schemas/                # Zod SSOT (Zero Drift frontend↔backend)
│   ├── export/                 # pdfGenerator, excelGenerator
│   ├── session.ts              # Service layer (hydration + persistence)
│   └── db.ts                   # Prisma singleton
└── prisma/schema.prisma        # Skema DB
tests/                          # Vitest (107 test: unit + integration + 3 skenario e2e = Rp 0)
```

**Prinsip desain:** satu sumber kebenaran (SSOT) — skema Zod dipakai bersama frontend & backend; seluruh nominal uang disimpan & dihitung sebagai **integer Rupiah** (tanpa float) untuk akurasi akuntansi.

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS 4, font Inter + JetBrains Mono (angka `tabular-nums`) |
| Database | Prisma ORM (SQLite dev, PostgreSQL-ready) |
| Validasi | Zod 4 (shared schemas) |
| Chart/Tabel | Recharts, TanStack Table v8 |
| Ekspor | jsPDF + autotable, ExcelJS |
| Testing | Vitest 3 |

## Menjalankan Lokal

```bash
# 1. Install dependencies
npm install

# 2. Inisialisasi database (SQLite) + generate Prisma Client
npx prisma generate
npx prisma db push

# 3. Jalankan development server
npm run dev
# buka http://localhost:3000

# 4. (Opsional) Verifikasi kualitas
npm run test    # 107 test (unit + integration + 3 skenario demo = variance Rp 0)
npm run build   # build produksi
```

Pada halaman beranda, klik salah satu **3 kartu skenario demo** (UMKM, E-Commerce, Audit Perusahaan) untuk langsung melihat alur lengkap: auto-match → konfirmasi → klasifikasi → jembatan saldo Rp 0 → jurnal → ekspor PDF/Excel.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Build produksi |
| `npm run start` | Jalankan build produksi |
| `npm run test` | Jalankan seluruh test (Vitest) |
| `npm run db:push` | Sinkronkan skema Prisma ke DB |
| `npm run lint` | ESLint |

## Migrasi ke PostgreSQL (Neon) untuk Produksi

Skema & seluruh query Prisma sudah **100% PostgreSQL-compatible**. Untuk deploy ke Vercel + Neon:

1. Buat database Neon dan salin connection string.
2. Ubah `DATABASE_URL` di environment Vercel:
   ```
   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
   ```
3. Ganti `provider` di `prisma/schema.prisma` dari `sqlite` → `postgresql`.
4. Jalankan migrasi:
   ```bash
   npx prisma migrate dev --name init   # atau prisma db push saat deploy
   ```

Tidak ada perubahan kode aplikasi yang diperlukan — Prisma menangani perbedaan dialek SQL.

## Standar Kualitas

Setiap fase melewati gate wajib: `tsc --noEmit` (0 error) → `eslint --max-warnings=0` → `vitest` (100% pass) → `next build` (sukses). Detail audit tiap fase tercatat di [`PROGRESS.md`](./PROGRESS.md). Spesifikasi teknis lengkap di [`RECONFLOW_MASTER_SPEC.md`](./RECONFLOW_MASTER_SPEC.md).
