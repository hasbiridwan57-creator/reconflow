# RECONFLOW — Fullstack Engineering & Product Master Specification

> **INSTRUKSI UTAMA UNTUK AI CODING AGENT (HERMES):**
> Dokumen ini adalah *Single Source of Truth* (SSOT) untuk membangun **ReconFlow** — aplikasi web fullstack **Bank Reconciliation, Audit Trail, & Formal Financial Reporting**.
> Kerjakan seluruh spesifikasi secara berurutan dari **Fase 1 hingga Fase 5**. Jangan membuat *stub*, jangan meninggalkan komentar `TODO`, jangan menggunakan tipe `any`, dan pastikan kontrak API antara Backend dan Frontend 100% sinkron menggunakan shared Zod schemas & TypeScript types. Setiap rumus akuntansi dan 3 skenario demo di bawah WAJIB lolos uji unit otomatis (`vitest`) dengan selisih akhir tepat `Rp 0`.

---

## DAFTAR ISI
1. [Agent Operating Rules & Engineering Guardrails](#1-agent-operating-rules--engineering-guardrails)
2. [Product Requirements Document (PRD)](#2-product-requirements-document-prd)
3. [Aturan Akuntansi Inti (Accounting Invariants)](#3-aturan-akuntansi-inti-accounting-invariants)
4. [Arsitektur Fullstack & Struktur Folder](#4-arsitektur-fullstack--struktur-folder)
5. [Skema Database (Prisma ORM)](#5-skema-database-prisma-orm)
6. [Shared Types & Zod Validation Contracts](#6-shared-types--zod-validation-contracts)
7. [Kontrak REST API Fullstack (Backend <-> Frontend)](#7-kontrak-rest-api-fullstack-backend---frontend)
8. [Spesifikasi Algoritma Inti (Parser, 3-Pass Matcher, Calculator, Journals)](#8-spesifikasi-algoritma-inti-parser-3-pass-matcher-calculator-journals)
9. [Spesifikasi Ekspor Profesional (PDF Formal & Excel Multi-Sheet)](#9-spesifikasi-ekspor-profesional-pdf-formal--excel-multi-sheet)
10. [Arsitektur UI/UX, Design System & Alur Halaman](#10-arsitektur-uiux-design-system--alur-halaman)
11. [3 Skenario Dataset CSV Demo & Kunci Jawaban Verifikasi](#11-3-skenario-dataset-csv-demo--kunci-jawaban-verifikasi)
12. [Rencana Eksekusi Bertahap & Definition of Done (DoD)](#12-rencana-eksekusi-bertahap--definition-of-done-dod)

---

## 1. Agent Operating Rules & Engineering Guardrails

1. **Zero Frontend-Backend Drift:** Semua payload request dan response API WAJIB didefinisikan sekali di `src/lib/schemas/` menggunakan `zod`. Backend Route Handlers memvalidasi input menggunakan schema tersebut; Frontend menggunakan tipe hasil inferensi `z.infer<typeof ...>` melalui typed API client di `src/lib/api/client.ts`.
2. **Exact Integer Rupiah Arithmetic:** Seluruh nominal uang (Rupiah) disimpan sebagai angka bulat (tanpa desimal liar). Di Prisma SQLite gunakan tipe `Float` (IEEE-754 double mendukung integer eksak hingga $2^{53} - 1 \approx 9 \times 10^{15}$, menghindari overflow 32-bit `Int` sekaligus menghindari bug serialisasi JSON `BigInt`), dan WAJIB dibulatkan dengan `Math.round()` saat parsing & kalkulasi.
3. **Accounting Integrity First:** Tidak boleh ada jalan pintas logika akuntansi. Penyesuaian di sisi **Bank** tidak pernah menghasilkan jurnal penyesuaian; penyesuaian di sisi **Buku** selalu menghasilkan jurnal *double-entry* yang seimbang ($\sum \text{Debit} = \sum \text{Kredit}$).
4. **Idempotent Matching Engine:** Menjalankan ulang `POST /api/sessions/[id]/match` saat user mengubah toleransi tanggal/nominal TIDAK BOLEH menghapus `MANUAL_MATCH`, `MatchPair` yang sudah `isConfirmed = true`, maupun `ClassifiedAdjustment` yang sudah dibuat manual.
5. **Auditability:** Setiap aksi mutasi penting (impor data, auto-match, approve/reject, manual pair, unmatch, klasifikasi penyesuaian, finalisasi) WAJIB dicatat ke tabel `AuditLog`.
6. **Production Verification Gate:** Sebelum menyatakan pekerjaan selesai, agent WAJIB menjalankan dan memastikan semua perintah berikut sukses tanpa error:
   - `npx prisma validate && npx prisma db push`
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run test` (seluruh unit test engine + 3 skenario demo = Rp 0)
   - `npm run build`

---

## 2. Product Requirements Document (PRD)

### 2.1 Ringkasan Produk
- **Nama Produk:** ReconFlow
- **Tagline:** *End-to-End Bank Reconciliation, Automated Matching & Audit-Ready Reporting Workspace*
- **Tujuan:** Membangun aplikasi rekonsiliasi bank kelas *B2B SaaS / Enterprise Finance Tool* yang menerjemahkan siklus akuntansi nyata ke dalam workflow digital penuh: impor 2 sumber data (Rekening Koran Bank vs Buku Kas Perusahaan), pencocokan multi-tahap yang transparan, penyelesaian selisih, penyusunan matriks rekonsiliasi formal dua sisi, pembuatan jurnal penyesuaian otomatis, audit log, dan ekspor laporan PDF/Excel siap tanda tangan.

### 2.2 Functional Requirements

| Kode | Modul | Deskripsi Fitur | Kriteria Penerimaan (Acceptance Criteria) |
|---|---|---|---|
| `FR-01` | **Session & Demo Hub** | Membuat sesi rekonsiliasi baru atau memuat 1 dari 3 Skenario Demo via 1 klik. | Tombol Demo memanggil `POST /api/sessions/demo`, menyimpan transaksi ke DB, menjalankan auto-match awal, dan langsung mengarahkan ke `/workspace/[id]`. |
| `FR-02` | **Dual CSV Intake & Column Mapper** | Upload 2 file CSV (Rekening Koran & Buku Kas), preview 5 baris, auto-deteksi kolom, dan pemetaan manual. | Mampu memparsing format angka Indonesia (`"12.450.000"`, `"Rp 12.450.000"`, `"12,450,000.00"`) dan tanggal (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`). |
| `FR-03` | **3-Pass Auto-Match Engine** | Pencocokan otomatis di backend: `EXACT_MATCH`, `SUGGESTED_MATCH`, dan `DISCREPANCY_MATCH` (deteksi *transposition error*). | Menampilkan `confidenceScore` (0-100) dan daftar `reasons[]` yang manusiawi. Anti *double-matching* (1 baris buku tidak bisa cocok dengan 2 baris bank duplikat). |
| `FR-04` | **Matching Workbench** | Review *Suggested/Discrepancy* (Approve/Reject 1 klik), *Unmatched Split-Pane* (Klasifikasi kategori akuntansi), dan *Manual Pairing* (termasuk jika ada selisih nominal). | Setiap aksi langsung tersinkronisasi ke database dan memperbarui `LiveReconStickyBar` secara real-time tanpa reload halaman penuh. |
| `FR-05` | **Live Reconciliation Matrix & Waterfall** | Laporan rekonsiliasi formal metode Saldo Disesuaikan (*Adjusted Balance*) + grafik *Waterfall Chart* jembatan saldo. | Menampilkan status tegas `BALANCED (Rp 0)` (hijau) jika selisih = 0 dan seluruh item *unmatched* telah diklasifikasikan, atau `UNRECONCILED` (merah) jika belum. |
| `FR-06` | **Auto Adjusting Journal Entries (AJE)** | Generator jurnal penyesuaian otomatis dari seluruh item penyesuaian Sisi Buku, dengan akun lawan (COA) yang bisa diedit user. | Total Debit dan Total Kredit selalu sama persis. Penyesuaian Sisi Bank tidak pernah masuk tabel jurnal. |
| `FR-07` | **Audit Trail & Session Finalization** | Log kronologis seluruh keputusan user + tombol kunci sesi (`FINALIZED`). | Sesi hanya bisa difinalisasi jika `variance === 0` dan `unclassifiedCount === 0`. Sesi `FINALIZED` menjadi *read-only* (bisa di-*reopen* jika diperlukan). |
| `FR-08` | **Formal PDF & Multi-Sheet Excel Export** | Unduh laporan PDF formal (dengan blok tanda tangan *Prepared by / Reviewed by*) dan Excel `.xlsx` 4 sheet dari backend API. | File terunduh dengan nama rapi (`ReconFlow_PT-Kopi-Nusantara_Oktober-2026.pdf/.xlsx`), format angka `Rp #,##0`, dan isi 100% identik dengan layar. |
| `FR-09` | **Historical Archive** | Halaman `/history` menampilkan daftar semua sesi tersimpan di database beserta status, periode, saldo disesuaikan, dan aksi buka/hapus/ekspor. | Mendukung pencarian nama perusahaan/periode dan filter status (`DRAFT`, `BALANCED`, `FINALIZED`). |

---

## 3. Aturan Akuntansi Inti (Accounting Invariants)

Seluruh kode backend dan frontend wajib mematuhi hukum akuntansi berikut:

### 3.1 Konvensi Arah Arus Kas (*Sign Normalization*)
- **Rekening Koran Bank (Sudut Pandang Bank):**
  - `Kredit (kredit_masuk)` = Kas Perusahaan **BERTAMBAH** -> `direction: 'IN'`
  - `Debit (debit_keluar)` = Kas Perusahaan **BERKURANG** -> `direction: 'OUT'`
- **Buku Kas Perusahaan (Sudut Pandang Perusahaan):**
  - `Debit (debit_masuk)` = Kas Perusahaan **BERTAMBAH** -> `direction: 'IN'`
  - `Kredit (kredit_keluar)` = Kas Perusahaan **BERKURANG** -> `direction: 'OUT'`
- Semua transaksi disimpan dengan `amount >= 0` (bilangan bulat positif) dan `direction: 'IN' | 'OUT'`.

### 3.2 Rumus Saldo Disesuaikan (*Adjusted Balance Method*)
$$\text{Adjusted Bank Balance} = \text{Ending Bank Balance} + \sum \text{Bank Adjustments (signed)}$$

$$\text{Adjusted Book Balance} = \text{Ending Book Balance} + \sum \text{Book Adjustments (signed)}$$

$$\text{Variance} = \text{Adjusted Bank Balance} - \text{Adjusted Book Balance}$$

### 3.3 Tabel Kategori Penyesuaian & Tanda Matematis (*Signed Effect*)

| Kategori (`AdjustmentCategory`) | Sisi (`side`) | Efek ke Saldo Sisi Tersebut (`signedAmount`) | Sumber Umum | Perlu Jurnal (AJE)? | Akun Lawan Default (COA) |
|---|---|---|---|---|---|
| `DEPOSIT_IN_TRANSIT` | `BANK` | **Positif (`+amount`)** | Item `UNMATCHED` di `BOOK` (`IN`) | **TIDAK** | - |
| `OUTSTANDING_CHECK` | `BANK` | **Negatif (`-amount`)** | Item `UNMATCHED` di `BOOK` (`OUT`) | **TIDAK** | - |
| `BANK_ERROR_ADD` | `BANK` | **Positif (`+amount`)** | Double charge bank / salah debit bank (`BANK` `OUT`) | **TIDAK** | - |
| `BANK_ERROR_DEDUCT` | `BANK` | **Negatif (`-amount`)** | Salah kredit bank (`BANK` `IN`) | **TIDAK** | - |
| `INTEREST_INCOME` | `BOOK` | **Positif (`+amount`)** | Item `UNMATCHED` di `BANK` (`IN`) | **YA** | `Pendapatan Jasa Giro` |
| `UNRECORDED_RECEIPT` | `BOOK` | **Positif (`+amount`)** | Transfer masuk di `BANK` (`IN`) belum dicatat | **YA** | `Piutang Usaha` |
| `BANK_FEE` | `BOOK` | **Negatif (`-amount`)** | Biaya admin / BI-FAST di `BANK` (`OUT`) | **YA** | `Beban Administrasi Bank` |
| `TAX_ON_INTEREST` | `BOOK` | **Negatif (`-amount`)** | Pajak jasa giro di `BANK` (`OUT`) | **YA** | `Beban Pajak Jasa Giro` |
| `NSF_CHECK` | `BOOK` | **Negatif (`-amount`)** | Cek kosong/retur di `BANK` (`OUT`) | **YA** | `Piutang Usaha (Cek Kosong)` |
| `UNRECORDED_EXPENSE` | `BOOK` | **Negatif (`-amount`)** | Beban/debit tak dikenal di `BANK` (`OUT`) | **YA** | `Beban Lain-lain / Investigasi Audit` |
| `BOOK_ERROR_ADD` | `BOOK` | **Positif (`+absDiff`)** | Salah catat pengeluaran terlalu besar / penerimaan terlalu kecil | **YA** | `Koreksi Beban / Selisih Pembukuan` |
| `BOOK_ERROR_DEDUCT` | `BOOK` | **Negatif (`-absDiff`)** | Salah catat pengeluaran terlalu kecil / penerimaan terlalu besar | **YA** | `Koreksi Beban / Selisih Pembukuan` |

### 3.4 Aturan Tanda Otomatis Saat `DISCREPANCY_MATCH` Disetujui
Misalkan transaksi Bank dan Buku dipasangkan dengan nominal berbeda (`bankTx.amount !== bookTx.amount`):
- **Jika `direction === 'OUT'` (Pengeluaran):**
  - Jika `bookTx.amount > bankTx.amount` (Buku mencatat pengeluaran terlalu besar, contoh Skenario 3: Buku `12.540.000` vs Bank `12.450.000`):
    - Jika kesalahan ada di **Buku**: Saldo Buku terlalu rendah sebesar `90.000`, maka buat `BOOK_ERROR_ADD` dengan `signedAmount = +90000`.
    - Jika kesalahan ada di **Bank**: buat `BANK_ERROR_DEDUCT` dengan `signedAmount = -90000`.
  - Jika `bookTx.amount < bankTx.amount` (Buku mencatat pengeluaran terlalu kecil):
    - Jika kesalahan di **Buku**: buat `BOOK_ERROR_DEDUCT` dengan `signedAmount = -(bankTx.amount - bookTx.amount)`.
    - Jika kesalahan di **Bank**: buat `BANK_ERROR_ADD` dengan `signedAmount = +(bankTx.amount - bookTx.amount)`.
- **Jika `direction === 'IN'` (Penerimaan):**
  - Jika `bookTx.amount < bankTx.amount` (Buku mencatat penerimaan terlalu kecil):
    - Jika kesalahan di **Buku**: buat `BOOK_ERROR_ADD` dengan `signedAmount = +(bankTx.amount - bookTx.amount)`.
  - Jika `bookTx.amount > bankTx.amount` (Buku mencatat penerimaan terlalu besar):
    - Jika kesalahan di **Buku**: buat `BOOK_ERROR_DEDUCT` dengan `signedAmount = -(bookTx.amount - bankTx.amount)`.

---

## 4. Arsitektur Fullstack & Struktur Folder

### 4.1 Tech Stack
- **Core:** Next.js 15 (atau 14.2+) App Router, React 18/19, TypeScript (Strict Mode)
- **Database & ORM:** Prisma ORM v5/v6 dengan **SQLite (`file:./prisma/dev.db`)** sebagai default agar zero-config saat build, test, & self-hosted VPS (sertakan komentar 2 baris di `schema.prisma` untuk switch ke PostgreSQL di production Vercel/Neon/Supabase).
- **Validation:** `zod` (shared backend & frontend)
- **Styling & UI:** Tailwind CSS, shadcn/ui components (Radix primitives), `lucide-react`, `sonner` (toast notifications)
- **Tables & Charts:** `@tanstack/react-table` v8, `recharts`
- **CSV & Date:** `papaparse` (+ `@types/papaparse`), `date-fns`
- **Export Engine (Server-Side):** `exceljs` (multi-sheet styled Excel), `jspdf` + `jspdf-autotable` (formal PDF report)
- **Testing:** `vitest` + `@vitest/coverage-v8`

### 4.2 Struktur Folder Proyek

```text
reconflow/
├── prisma/
│   ├── schema.prisma                     # Skema database fullstack lengkap
│   └── seed.ts                           # Opsional: seed 1 contoh sesi demo
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout, Inter + JetBrains Mono, Toaster
│   │   ├── globals.css                   # Tailwind + custom design tokens
│   │   ├── page.tsx                      # Executive Quick-Start Hub & Demo Launcher
│   │   ├── new/
│   │   │   └── page.tsx                  # Wizard Impor Dual CSV & Column Mapper
│   │   ├── workspace/
│   │   │   └── [id]/
│   │   │       └── page.tsx              # 4-Step Guided Reconciliation Workspace
│   │   ├── history/
│   │   │   └── page.tsx                  # Arsip Sesi Rekonsiliasi (DB-backed)
│   │   └── api/
│   │       ├── health/route.ts           # GET healthcheck + DB ping
│   │       └── sessions/
│   │           ├── route.ts              # GET list sessions, POST create session
│   │           ├── demo/route.ts         # POST instantiate Scenario 1/2/3 + auto-match
│   │           └── [id]/
│   │               ├── route.ts          # GET hydrated session, PATCH metadata/config, DELETE
│   │               ├── match/route.ts    # POST re-run idempotent 3-pass matching engine
│   │               ├── finalize/route.ts # POST lock/reopen session with balance validation
│   │               ├── matches/
│   │               │   ├── manual/route.ts          # POST create manual pair
│   │               │   └── [matchId]/route.ts       # PATCH approve/reject, DELETE unmatch
│   │               ├── adjustments/
│   │               │   ├── route.ts                 # POST create adjustment
│   │               │   └── [adjId]/route.ts         # PATCH edit, DELETE remove
│   │               └── export/
│   │                   ├── pdf/route.ts             # GET formal PDF binary stream
│   │                   └── excel/route.ts           # GET 4-sheet Excel binary stream
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # Sidebar navigasi + top header
│   │   │   └── LiveReconStickyBar.tsx    # Bar sticky saldo disesuaikan & badge BALANCED
│   │   ├── intake/
│   │   │   ├── DualCsvUploader.tsx       # Drag & drop 2 CSV + auto-detect header
│   │   │   ├── ColumnMapperPanel.tsx     # Preview 5 baris + mapping dropdowns
│   │   │   └── DemoScenarioCards.tsx     # 3 kartu skenario demo siap klik
│   │   ├── workbench/
│   │   │   ├── KpiSummaryGrid.tsx        # 4 KPI Cards (Match Rate, Pending, Raw Diff, Net Diff)
│   │   │   ├── MatchingControlsBar.tsx   # Slider toleransi hari, nominal, toggle transposition
│   │   │   ├── SuggestedReviewTab.tsx    # Side-by-side Bank vs Book cards + Approve/Reject
│   │   │   ├── UnmatchedSplitTab.tsx     # Split-pane Hanya di Bank vs Hanya di Buku + Classify
│   │   │   ├── ManualPairModal.tsx       # Modal pairing manual & penanganan selisih nominal
│   │   │   └── ConfirmedMatchesTab.tsx   # TanStack Table audit semua pasangan cocok + Unmatch
│   │   ├── report/
│   │   │   ├── ReconMatrixCard.tsx       # Matriks Formal 2 Sisi (Adjusted Balance + Double Underline)
│   │   │   ├── ReconWaterfallChart.tsx   # Recharts Waterfall Chart jembatan Bank -> Book
│   │   │   ├── AdjustingJournalTable.tsx # Tabel Jurnal Penyesuaian (inline COA edit)
│   │   │   ├── AuditLogTimeline.tsx      # Riwayat kronologis seluruh aktivitas sesi
│   │   │   └── ExportSignoffModal.tsx    # Input Prepared By / Reviewed By + Export PDF/Excel
│   │   └── ui/                           # shadcn/ui components
│   ├── lib/
│   │   ├── db.ts                         # Singleton PrismaClient
│   │   ├── format.ts                     # formatIDR, formatDateID, formatPercent
│   │   ├── schemas/
│   │   │   └── reconciliation.ts         # SSOT Zod schemas & TypeScript types
│   │   ├── api/
│   │   │   ├── client.ts                 # Typed frontend fetch wrapper
│   │   │   └── response.ts               # Standard API JSON & error handler
│   │   ├── engine/
│   │   │   ├── parser.ts                 # CSV parser + normalizer angka/tanggal Indonesia
│   │   │   ├── textSimilarity.ts         # Stop-word cleaner + Jaccard/Dice + Ref Extractor
│   │   │   ├── matcher.ts                # 3-Pass Priority Greedy Bipartite Matcher
│   │   │   ├── calculator.ts             # Hitung Adjusted Balance, KPI, Waterfall Data
│   │   │   └── journals.ts               # Auto Adjusting Journal Entries + COA defaults
│   │   ├── export/
│   │   │   ├── pdfGenerator.ts           # Formal PDF report builder (jspdf-autotable)
│   │   │   └── excelGenerator.ts         # 4-Sheet Excel workbook builder (exceljs)
│   │   └── demo/
│   │       └── scenarios.ts              # 3 dataset CSV lengkap + metadata + deskripsi
├── tests/
│   ├── engine.parser.test.ts             # Unit test format angka/tanggal Indonesia
│   ├── engine.matcher.test.ts            # Unit test 3-pass matcher & anti double-matching
│   └── scenarios.e2e.test.ts             # Verifikasi matematis 3 skenario = Rp 0 & AJE balance
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 5. Skema Database (Prisma ORM)

Buat file `prisma/schema.prisma` persis dengan struktur berikut:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  // Default SQLite untuk zero-config local/VPS deployment.
  // Untuk PostgreSQL (Vercel/Neon/Supabase), ubah provider menjadi "postgresql"
  // dan set DATABASE_URL di .env.
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model ReconciliationSession {
  id                     String   @id @default(cuid())
  companyName            String
  bankAccountName        String
  periodLabel            String   // Contoh: "Oktober 2026"
  periodEndDate          String   // ISO YYYY-MM-DD, contoh: "2026-10-31"
  preparedBy             String   @default("Tim Keuangan")
  reviewedBy             String   @default("Manajer Keuangan")
  status                 String   @default("DRAFT") // DRAFT | BALANCED | FINALIZED
  demoScenarioKey        String?  // null | "umkm" | "ecommerce" | "audit"

  // Saldo disimpan sebagai Float (exact integer Rupiah hingga 9 kuadriliun)
  openingBalance         Float    @default(0)
  endingBankBalance      Float
  endingBookBalance      Float

  // Konfigurasi matching engine tersimpan per sesi
  dateToleranceDays      Int      @default(3)
  amountToleranceRupiah  Float    @default(0)
  minFuzzyScore          Float    @default(0.35)
  detectTransposition    Boolean  @default(true)

  transactions           Transaction[]
  matches                MatchPair[]
  adjustments            ClassifiedAdjustment[]
  auditLogs              AuditLog[]

  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}

model Transaction {
  id               String   @id @default(cuid())
  sessionId        String
  session          ReconciliationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  source           String   // "BANK" | "BOOK"
  rowIndex         Int      // Urutan baris asli CSV
  date             String   // ISO YYYY-MM-DD
  reference        String   @default("")
  description      String
  normalizedDesc   String
  direction        String   // "IN" | "OUT"
  amount           Float    // Selalu positif (integer Rupiah)
  runningBalance   Float?
  counterAccount   String?  // Akun lawan (khusus BOOK)

  bankMatch        MatchPair? @relation("BankTransactionMatch")
  bookMatch        MatchPair? @relation("BookTransactionMatch")
  adjustment       ClassifiedAdjustment?

  createdAt        DateTime @default(now())

  @@index([sessionId, source])
}

model MatchPair {
  id               String   @id @default(cuid())
  sessionId        String
  session          ReconciliationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  bankTxId         String   @unique
  bankTx           Transaction @relation("BankTransactionMatch", fields: [bankTxId], references: [id], onDelete: Cascade)

  bookTxId         String   @unique
  bookTx           Transaction @relation("BookTransactionMatch", fields: [bookTxId], references: [id], onDelete: Cascade)

  status           String   // EXACT_MATCH | SUGGESTED_MATCH | MANUAL_MATCH | DISCREPANCY_MATCH
  confidenceScore  Int      // 0 - 100
  reasonsJson      String   // JSON string array: string[]
  amountDiff       Float    @default(0) // bankTx.amount - bookTx.amount
  dateDiffDays     Int      @default(0)
  isConfirmed      Boolean  @default(false)

  adjustment       ClassifiedAdjustment?

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([sessionId, status])
}

model ClassifiedAdjustment {
  id                String   @id @default(cuid())
  sessionId         String
  session           ReconciliationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  // Terhubung ke salah satu: transactionId (untuk UNMATCHED) ATAU matchPairId (untuk DISCREPANCY_MATCH)
  transactionId     String?  @unique
  transaction       Transaction? @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  matchPairId       String?  @unique
  matchPair         MatchPair? @relation(fields: [matchPairId], references: [id], onDelete: Cascade)

  side              String   // "BANK" | "BOOK"
  category          String   // Lihat tabel AdjustmentCategory
  signedAmount      Float    // Positif (+) menambah saldo sisi tsb, Negatif (-) mengurangi
  description       String
  contraAccountName String?  // Akun lawan COA untuk jurnal penyesuaian (khusus side === "BOOK")
  auditNote         String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([sessionId, side])
}

model AuditLog {
  id          String   @id @default(cuid())
  sessionId   String
  session     ReconciliationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  action      String   // SESSION_CREATED | AUTO_MATCH_RUN | MATCH_APPROVED | MATCH_REJECTED | MANUAL_PAIRED | UNMATCHED | ADJUSTMENT_CREATED | ADJUSTMENT_UPDATED | ADJUSTMENT_DELETED | SESSION_FINALIZED | SESSION_REOPENED
  summary     String
  metadata    String?  // Optional JSON string
  createdAt   DateTime @default(now())

  @@index([sessionId, createdAt])
}
```

**Environment Default (`.env`):**
```env
DATABASE_URL="file:./dev.db"
```

---

## 6. Shared Types & Zod Validation Contracts

Semua enum dan schema ini ditempatkan di `src/lib/schemas/reconciliation.ts` dan diimpor oleh Backend & Frontend:

```typescript
import { z } from 'zod';

export const TransactionSourceSchema = z.enum(['BANK', 'BOOK']);
export const CashDirectionSchema = z.enum(['IN', 'OUT']);
export const SessionStatusSchema = z.enum(['DRAFT', 'BALANCED', 'FINALIZED']);

export const MatchStatusSchema = z.enum([
  'EXACT_MATCH',
  'SUGGESTED_MATCH',
  'MANUAL_MATCH',
  'DISCREPANCY_MATCH',
]);

export const AdjustmentSideSchema = z.enum(['BANK', 'BOOK']);

export const AdjustmentCategorySchema = z.enum([
  // Sisi Bank (Tidak dijurnal)
  'DEPOSIT_IN_TRANSIT',
  'OUTSTANDING_CHECK',
  'BANK_ERROR_ADD',
  'BANK_ERROR_DEDUCT',
  // Sisi Buku (Wajib dijurnal)
  'INTEREST_INCOME',
  'UNRECORDED_RECEIPT',
  'BANK_FEE',
  'TAX_ON_INTEREST',
  'NSF_CHECK',
  'UNRECORDED_EXPENSE',
  'BOOK_ERROR_ADD',
  'BOOK_ERROR_DEDUCT',
]);

export const MatchingConfigSchema = z.object({
  dateToleranceDays: z.number().int().min(0).max(14).default(3),
  amountToleranceRupiah: z.number().min(0).default(0),
  minFuzzyScore: z.number().min(0.1).max(0.95).default(0.35),
  detectTransposition: z.boolean().default(true),
});

export const NormalizedTransactionInputSchema = z.object({
  source: TransactionSourceSchema,
  rowIndex: z.number().int().min(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().default(''),
  description: z.string().min(1),
  direction: CashDirectionSchema,
  amount: z.number().nonnegative(),
  runningBalance: z.number().nullable().optional(),
  counterAccount: z.string().nullable().optional(),
});

export const CreateSessionSchema = z.object({
  companyName: z.string().min(2),
  bankAccountName: z.string().min(2),
  periodLabel: z.string().min(2),
  periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preparedBy: z.string().min(1).default('Tim Keuangan'),
  reviewedBy: z.string().min(1).default('Manajer Keuangan'),
  openingBalance: z.number().default(0),
  endingBankBalance: z.number(),
  endingBookBalance: z.number(),
  bankTransactions: z.array(NormalizedTransactionInputSchema).min(1),
  bookTransactions: z.array(NormalizedTransactionInputSchema).min(1),
  config: MatchingConfigSchema.optional(),
});

export const CreateDemoSessionSchema = z.object({
  scenarioKey: z.enum(['umkm', 'ecommerce', 'audit']),
});

export const UpdateSessionSchema = z.object({
  companyName: z.string().min(2).optional(),
  bankAccountName: z.string().min(2).optional(),
  periodLabel: z.string().min(2).optional(),
  periodEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  preparedBy: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).optional(),
  openingBalance: z.number().optional(),
  endingBankBalance: z.number().optional(),
  endingBookBalance: z.number().optional(),
  dateToleranceDays: z.number().int().min(0).max(14).optional(),
  amountToleranceRupiah: z.number().min(0).optional(),
  minFuzzyScore: z.number().min(0.1).max(0.95).optional(),
  detectTransposition: z.boolean().optional(),
});

export const MatchActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  // Khusus jika action === 'APPROVE' pada DISCREPANCY_MATCH:
  discrepancyResolution: z
    .object({
      faultSide: z.enum(['BOOK', 'BANK']),
      contraAccountName: z.string().optional(),
      auditNote: z.string().optional(),
    })
    .optional(),
});

export const ManualPairSchema = z.object({
  bankTxId: z.string().min(1),
  bookTxId: z.string().min(1),
  auditNote: z.string().optional(),
  // Wajib diisi jika bankTx.amount !== bookTx.amount:
  discrepancyResolution: z
    .object({
      faultSide: z.enum(['BOOK', 'BANK']),
      contraAccountName: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

export const CreateAdjustmentSchema = z.object({
  transactionId: z.string().optional(),
  matchPairId: z.string().optional(),
  category: AdjustmentCategorySchema,
  description: z.string().min(2),
  contraAccountName: z.string().optional(),
  auditNote: z.string().optional(),
  // Opsional override nominal absolut (default diambil dari transaction.amount)
  customAmount: z.number().positive().optional(),
});

export const UpdateAdjustmentSchema = z.object({
  category: AdjustmentCategorySchema.optional(),
  description: z.string().min(2).optional(),
  contraAccountName: z.string().nullable().optional(),
  auditNote: z.string().nullable().optional(),
});

export const FinalizeSessionSchema = z.object({
  action: z.enum(['FINALIZE', 'REOPEN']),
  preparedBy: z.string().min(1).optional(),
  reviewedBy: z.string().min(1).optional(),
});
```

---

## 7. Kontrak REST API Fullstack (Backend <-> Frontend)

Semua endpoint mengembalikan JSON standar:
- **Success:** `{ data: T }` (HTTP `200` / `201`)
- **Error:** `{ error: { code: string, message: string, details?: unknown } }` (HTTP `400` / `404` / `409` / `422` / `500`)

### Daftar Lengkap Endpoints

1. **`GET /api/health`**
   - Mengecek koneksi Prisma DB. Return `{ data: { status: "ok", timestamp } }`.

2. **`GET /api/sessions?q=&status=`**
   - Mengembalikan daftar seluruh sesi diurutkan `updatedAt DESC`, lengkap dengan ringkasan kalkulasi (`adjustedBankBalance`, `adjustedBookBalance`, `variance`, `matchRate`, `unclassifiedCount`, `transactionCount`).

3. **`POST /api/sessions`**
   - Body: `CreateSessionSchema`.
   - Side-effect: Simpan `ReconciliationSession` + seluruh `Transaction` (dengan `normalizedDesc` hasil proses backend) -> langsung jalankan 3-Pass Auto-Matching Engine -> simpan `MatchPair` -> catat `AuditLog` (`SESSION_CREATED` & `AUTO_MATCH_RUN`) -> kembalikan Hydrated Session (`201`).

4. **`POST /api/sessions/demo`**
   - Body: `CreateDemoSessionSchema` (`{ scenarioKey: "umkm" | "ecommerce" | "audit" }`).
   - Side-effect: Parse dataset CSV bawaan di server (`src/lib/demo/scenarios.ts`), buat sesi baru di DB, jalankan auto-match awal, catat `AuditLog`, kembalikan `{ data: { id, session } }` (`201`).

5. **`GET /api/sessions/[id]`**
   - Mengembalikan **Hydrated Session Object** yang menjadi state utama `/workspace/[id]`:
     ```typescript
     interface HydratedSessionResponse {
       session: SessionMeta;
       bankTransactions: TransactionDTO[];
       bookTransactions: TransactionDTO[];
       matches: MatchPairDTO[];           // Includes hydrated bankTx & bookTx + parsed reasons[]
       unmatchedBank: TransactionDTO[];   // Belum punya MatchPair
       unmatchedBook: TransactionDTO[];   // Belum punya MatchPair
       adjustments: ClassifiedAdjustmentDTO[];
       summary: ReconciliationSummaryDTO; // Matrix 2 sisi, KPI, isBalanced, waterfallData[]
       journals: AdjustingJournalEntryDTO[]; // Auto-generated AJE + totalDebit/totalCredit
       auditLogs: AuditLogDTO[];
     }
     ```
   - **PENTING:** Seluruh kalkulasi `summary` dan `journals` dihitung secara deterministik oleh `calculator.ts` & `journals.ts` di backend setiap kali data diambil/dimutasi, sehingga Frontend dan Export PDF/Excel **dijamin 100% menampilkan angka yang identik**.

6. **`PATCH /api/sessions/[id]`**
   - Body: `UpdateSessionSchema`.
   - Tolak dengan HTTP `409` jika `session.status === 'FINALIZED'`.
   - Perbarui metadata/saldo/config, kembalikan Hydrated Session terbaru.

7. **`DELETE /api/sessions/[id]`**
   - Hapus sesi (cascade hapus seluruh transaksi, matches, adjustments, audit logs).

8. **`POST /api/sessions/[id]/match`**
   - Body: `MatchingConfigSchema.optional()`.
   - Jika config diberikan, update config sesi di DB.
   - Hapus hanya `MatchPair` yang `isConfirmed === false` (yaitu `SUGGESTED_MATCH` dan `DISCREPANCY_MATCH` yang belum di-approve).
   - Pertahankan semua `EXACT_MATCH` (yang terkonfirmasi), `MANUAL_MATCH`, dan `Transaction` yang sudah terikat `ClassifiedAdjustment`.
   - Jalankan ulang 3-Pass Matcher pada sisa transaksi yang bebas -> simpan pasangan baru -> catat `AuditLog` (`AUTO_MATCH_RUN`) -> kembalikan Hydrated Session.

9. **`PATCH /api/sessions/[id]/matches/[matchId]`**
   - Body: `MatchActionSchema`.
   - Jika `action === 'REJECT'`: Hapus `MatchPair` (dan jika ada `ClassifiedAdjustment` terkait, hapus juga), catat `AuditLog` (`MATCH_REJECTED`).
   - Jika `action === 'APPROVE'`:
     - Set `isConfirmed = true`.
     - Jika `status === 'DISCREPANCY_MATCH'` dan `amountDiff !== 0`, wajib gunakan `discrepancyResolution` (default `faultSide = 'BOOK'`) untuk otomatis membuat `ClassifiedAdjustment` (`BOOK_ERROR_ADD`/`BOOK_ERROR_DEDUCT` atau `BANK_ERROR_ADD`/`BANK_ERROR_DEDUCT`) dalam satu `prisma.$transaction`.
     - Update status sesi otomatis (`BALANCED` jika `variance === 0 && unclassifiedCount === 0`, selain itu `DRAFT`).
     - Catat `AuditLog` (`MATCH_APPROVED`).

10. **`POST /api/sessions/[id]/matches/manual`**
    - Body: `ManualPairSchema`.
    - Validasi kedua transaksi milik `sessionId`, `bankTx.source === 'BANK'`, `bookTx.source === 'BOOK'`, `bankTx.direction === bookTx.direction`, dan keduanya belum punya `MatchPair` atau `ClassifiedAdjustment`.
    - Jika `bankTx.amount !== bookTx.amount`: wajib ada `discrepancyResolution` untuk langsung membentuk `ClassifiedAdjustment` selisihnya.
    - Buat `MatchPair` dengan `status: 'MANUAL_MATCH'`, `confidenceScore: 100`, `isConfirmed: true`.
    - Catat `AuditLog` (`MANUAL_PAIRED`).

11. **`DELETE /api/sessions/[id]/matches/[matchId]`**
    - Unmatch pasangan (termasuk `EXACT_MATCH` atau `MANUAL_MATCH`) kembali ke pool `UNMATCHED`, hapus `ClassifiedAdjustment` jika terikat `matchPairId`, catat `AuditLog` (`UNMATCHED`).

12. **`POST /api/sessions/[id]/adjustments`**
    - Body: `CreateAdjustmentSchema`.
    - Validasi konsistensi kategori terhadap sisi (`side` diturunkan otomatis dari `category` sesuai Tabel 3.3, tidak boleh salah sisi!).
    - Hitung `signedAmount` secara deterministik di backend berdasarkan tanda kategori (Positif/Negatif) dan `amount` transaksi (atau `customAmount`).
    - Isi `contraAccountName` default COA jika `side === 'BOOK'` dan user tidak mengisi custom.
    - Simpan ke DB, perbarui status sesi (`BALANCED`/`DRAFT`), catat `AuditLog` (`ADJUSTMENT_CREATED`).

13. **`PATCH /api/sessions/[id]/adjustments/[adjId]`** & **`DELETE /api/sessions/[id]/adjustments/[adjId]`**
    - Edit kategori/akun lawan/catatan audit atau hapus klasifikasi. Hitung ulang `signedAmount` otomatis jika `category` berubah.

14. **`POST /api/sessions/[id]/finalize`**
    - Body: `FinalizeSessionSchema`.
    - Jika `action === 'FINALIZE'`: Validasi keras di backend bahwa `summary.isBalanced === true` (`variance === 0` DAN `unclassifiedCount === 0` DAN `pendingSuggestedCount === 0`). Jika belum memenuhi, return HTTP `422` dengan pesan spesifik bagian mana yang belum selesai.
    - Set `status = 'FINALIZED'` (atau `'BALANCED'`/`'DRAFT'` saat `REOPEN`).

15. **`GET /api/sessions/[id]/export/pdf`**
    - Generate PDF formal di server menggunakan `pdfGenerator.ts`.
    - Header: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="ReconFlow_<slug>.pdf"`.

16. **`GET /api/sessions/[id]/export/excel`**
    - Generate Workbook `.xlsx` 4 sheet di server menggunakan `excelGenerator.ts`.
    - Header: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="ReconFlow_<slug>.xlsx"`.

---

## 8. Spesifikasi Algoritma Inti (Parser, 3-Pass Matcher, Calculator, Journals)

### 8.1 Parser CSV & Normalizer Format Indonesia (`src/lib/engine/parser.ts`)
1. **Normalisasi Angka (`parseIndonesianCurrency`):**
   - Terima string/number seperti `"Rp 12.450.000"`, `"12.450.000,00"`, `"12,450,000.00"`, `"(500.000)"`, `""`, `"-"`.
   - Jika kosong atau `"-"`, return `0`.
   - Deteksi tanda kurung akuntansi `"(500.000)"` sebagai nilai negatif sebelum mengambil `Math.abs` (atau menentukan direction jika memakai mode single signed column).
   - Deteksi pemisah desimal vs ribuan:
     - Jika ada titik dan koma (mis. `12.450.000,50` atau `12,450,000.50`), pemisah yang muncul paling belakang dengan 1-2 digit di belakangnya adalah desimal; karakter pemisah lainnya dihapus.
     - Jika hanya ada titik dan diikuti 3 digit (mis. `12.450.000`), hapus semua titik.
     - Bulatkan hasil akhir dengan `Math.round(parsed)`.
2. **Normalisasi Tanggal (`parseFlexibleDate`):**
   - Mendukung `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`. Output wajib ISO `YYYY-MM-DD`.
3. **Auto-Detection Column Mapper:**
   - Otomatis mengenali header umum Indonesia & Inggris:
     - Tanggal: `tanggal`, `tgl`, `date`, `trx_date`, `posting_date`
     - Referensi: `no_referensi`, `no_bukti`, `ref`, `reference`, `voucher`
     - Deskripsi: `keterangan`, `deskripsi`, `uraian`, `description`, `memo`, `narrative`
     - Debit: `debit`, `debit_keluar`, `debit_masuk`, `dr`, `db`
     - Kredit: `kredit`, `kredit_masuk`, `kredit_keluar`, `cr`
     - Saldo: `saldo`, `balance`, `running_balance`
     - Akun Lawan: `akun_lawan`, `account`, `contra_account`, `coa`

### 8.2 Text Normalization & Similarity (`src/lib/engine/textSimilarity.ts`)
1. **`normalizeDescription(text: string): string`**
   - Lowercase, ubah karakter non-alfanumerik (selain `#` dan `-` yang menyatu dengan nomor) menjadi spasi.
   - Hapus *stop-words* perbankan & akuntansi Indonesia:
     `['cr', 'db', 'dr', 'trf', 'transfer', 'kliring', 'pembayaran', 'pelunasan', 'biaya', 'pt', 'cv', 'tbk', 'autodebit', 'setoran', 'tagihan', 'saldo', 'bulan', 'okt', 'oktober', 'nov', 'november', 'des', 'desember', '2025', '2026', '2027', 'dari', 'ke', 'dan', 'untuk', 'atas', 'via', 'pencairan', 'penerimaan', 'pembelian', 'bayar', 'rutin', 'bulanan']`.
2. **`extractReferenceTokens(ref: string, desc: string): string[]`**
   - Ekstrak kode unik invoice/batch/cek menggunakan regex `/\b(?:inv[-#]?\d+|bg[-#]?\d+|#\d{3,}|batch\s*\w+|\d{4,})\b/gi`, normalisasi lowercase tanpa spasi.
   - Contoh: `"CR SHOPEE INTL ID PAYOUT #8821"` & `"Pencairan Saldo Shopee Batch #8821"` -> sama-sama menghasilkan token `#8821` / `8821`.
   - Contoh: `"CR PELUNASAN INV-094 PT INDOFARMA"` & `"Pelunasan Piutang PT Indofarma INV-094"` -> sama-sama menghasilkan `inv-094`.
3. **`computeTextSimilarity(normA: string, normB: string): number`**
   - Hitung **Jaccard Token Similarity** ($J$) dan **Dice Bigram Coefficient** ($D$).
   - Return `0.6 * J + 0.4 * D` dalam rentang $[0, 1]$.

### 8.3 3-Pass Priority Greedy Bipartite Matching (`src/lib/engine/matcher.ts`)

Input: `bankTxs` (yang belum terkunci), `bookTxs` (yang belum terkunci), `config`.
State tracking: `usedBankIds = new Set<string>()`, `usedBookIds = new Set<string>()`.

#### Pass 1 — `EXACT_MATCH` (Auto-Confirmed)
- Kumpulkan semua pasangan `(b, k)` di mana:
  - `b.direction === k.direction`
  - `b.amount === k.amount`
  - `dateDiffDays(b.date, k.date) === 0`
- Hitung `tieBreakerScore = computeTextSimilarity(b.normalizedDesc, k.normalizedDesc) + (hasSharedRef ? 0.5 : 0)`.
- **Urutkan seluruh kandidat Pass 1 berdasarkan `tieBreakerScore` DESC** (untuk mencegah salah pilih saat ada transaksi kembar seperti Double Charge Allianz).
- Iterasi greedy: jika `!usedBankIds.has(b.id) && !usedBookIds.has(k.id)`:
  - Tambahkan ke `usedBankIds` & `usedBookIds`.
  - Buat `MatchPair`:
    - `status: 'EXACT_MATCH'`
    - `confidenceScore: 100`
    - `isConfirmed: true`
    - `amountDiff: 0`, `dateDiffDays: 0`
    - `reasons: ['Tanggal identik', 'Nominal identik', ...(hasSharedRef ? ['Nomor referensi cocok'] : [])]`

#### Pass 2 — `SUGGESTED_MATCH` (Timing Difference / Fuzzy Match — Butuh Konfirmasi User)
- Kumpulkan semua pasangan sisa `(b, k)` di mana:
  - `b.direction === k.direction`
  - `Math.abs(b.amount - k.amount) <= config.amountToleranceRupiah`
  - `dateDiffDays <= config.dateToleranceDays`
- Hitung skor berbobot:
  - $S_{\text{amount}} = \text{config.amountToleranceRupiah} === 0 ? 1 : 1 - \frac{|b.\text{amount} - k.\text{amount}|}{\text{config.amountToleranceRupiah} + 1}$
  - $S_{\text{date}} = 1 - \frac{\text{dateDiffDays}}{\text{config.dateToleranceDays} + 1}$
  - $S_{\text{text}} = \text{computeTextSimilarity}(b.\text{normalizedDesc}, k.\text{normalizedDesc})$
  - $B_{\text{ref}} = \text{hasSharedRef} ? 15 : 0$
  - $\text{RawScore} = \text{round}(50 \cdot S_{\text{amount}} + 25 \cdot S_{\text{date}} + 25 \cdot S_{\text{text}} + B_{\text{ref}})$
  - $\text{ConfidenceScore} = \min(94, \text{RawScore})$
- Filter kandidat yang lolos: `ConfidenceScore >= 60` (ATAU jika nominal persis sama dan `dateDiffDays <= config.dateToleranceDays` dengan `S_text >= 0.15` atau `hasSharedRef`).
- Urutkan berdasarkan `ConfidenceScore` DESC, lalu `dateDiffDays` ASC.
- Iterasi greedy: pasangkan jika keduanya belum dipakai:
  - `status: 'SUGGESTED_MATCH'`
  - `isConfirmed: false`
  - `reasons`: contoh `['Nominal identik', 'Selisih tanggal 2 hari (Timing Difference)', 'Referensi #8821 cocok', 'Kemiripan teks 62%']`.

#### Pass 3 — `DISCREPANCY_MATCH` (Deteksi Salah Catat / *Transposition Error*)
- Hanya berjalan jika `config.detectTransposition === true`.
- Kumpulkan pasangan sisa `(b, k)` di mana:
  - `b.direction === k.direction`
  - `dateDiffDays <= 1`
  - `absDiff = Math.abs(b.amount - k.amount) > 0`
  - `absDiff / Math.max(b.amount, k.amount) <= 0.10` (selisih maksimal 10%)
  - `textSim >= 0.35` ATAU `hasSharedRef === true`
- Cek apakah `absDiff % 9 === 0` (`isTranspositionCandidate`).
  - Jika `isTranspositionCandidate`: `confidenceScore = Math.min(92, Math.round(70 + textSim * 22))`, reason utama: `"Indikasi Transposition Error (selisih Rp X habis dibagi 9)"`.
  - Jika bukan kelipatan 9 tetapi `dateDiffDays === 0` dan `textSim >= 0.50`: `confidenceScore = Math.min(85, Math.round(60 + textSim * 25))`, reason utama: `"Tanggal & vendor cocok namun terdapat selisih nominal Rp X"`.
- Urutkan berdasarkan `confidenceScore` DESC, pasangkan secara greedy:
  - `status: 'DISCREPANCY_MATCH'`
  - `isConfirmed: false`
  - `amountDiff: b.amount - k.amount`

### 8.4 Calculator & Waterfall Data Builder (`src/lib/engine/calculator.ts`)
Hitung secara deterministik:
1. Kelompokkan `adjustments` ke `bankAdjustments` (`side === 'BANK'`) dan `bookAdjustments` (`side === 'BOOK'`).
2. `totalBankAdjustments = sum(bankAdjustments.signedAmount)`
3. `totalBookAdjustments = sum(bookAdjustments.signedAmount)`
4. `adjustedBankBalance = endingBankBalance + totalBankAdjustments`
5. `adjustedBookBalance = endingBookBalance + totalBookAdjustments`
6. `rawDifference = endingBankBalance - endingBookBalance`
7. `variance = adjustedBankBalance - adjustedBookBalance`
8. `pendingSuggestedCount = matches.filter(m => !m.isConfirmed).length`
9. `unclassifiedBankCount = unmatchedBank.filter(tx => !tx.adjustment).length`
10. `unclassifiedBookCount = unmatchedBook.filter(tx => !tx.adjustment).length`
11. `unclassifiedCount = unclassifiedBankCount + unclassifiedBookCount`
12. `isBalanced = variance === 0 && unclassifiedCount === 0 && pendingSuggestedCount === 0`
13. `matchRate`: persentase transaksi terkonfirmasi terhadap total pasangan unik:
    $$\text{Match Rate (\%)} = \frac{2 \times |\text{Confirmed Matches}|}{|\text{Bank Txs}| + |\text{Book Txs}|} \times 100$$
14. **Waterfall Chart Data (`waterfallSteps[]`):**
    Susun array bar bertingkat untuk Recharts (menggunakan stacked bar transparan `base` + bar nilai `value`) yang menjembatani **Saldo Akhir Bank -> Penyesuaian Bank -> Saldo Disesuaikan -> (Kebalikan Penyesuaian Buku) -> Saldo Akhir Buku**:
    - Step 1: `Saldo Akhir Bank` (Total bar, warna Indigo/Slate)
    - Step 2..N: Agregasi per kategori Sisi Bank (`+ Setoran dalam Perjalanan`, `- Cek Beredar`, `+/- Koreksi Bank`) — Emerald jika positif, Rose jika negatif
    - Step Tengah: `Saldo Disesuaikan` (Total bar, warna Emerald jika Balanced / Amber jika belum)
    - Step Penutup (Opsional Toggle "Lihat Jembatan Sisi Buku"): atau tampilkan 2 sub-panel Waterfall yang sangat jelas:
      - *Jembatan Bank:* `Saldo Akhir Bank` -> `+ Deposit in Transit` -> `- Outstanding Checks` -> `± Bank Error` -> **`Saldo Bank Disesuaikan`**
      - *Jembatan Buku:* `Saldo Akhir Buku` -> `+ Penerimaan/Jasa Giro` -> `- Biaya/Cek Kosong` -> `± Book Error` -> **`Saldo Buku Disesuaikan`**
    *(Dua jembatan bersebelahan atau tab switch Bank vs Buku jauh lebih intuitif bagi akuntan dan bebas kebingungan tanda balik!)*

### 8.5 Auto Adjusting Journal Entries (`src/lib/engine/journals.ts`)
- Filter hanya `adjustments.filter(a => a.side === 'BOOK' && a.signedAmount !== 0)`.
- Untuk setiap item:
  - `absAmount = Math.abs(a.signedAmount)`
  - `contra = a.contraAccountName || DEFAULT_COA_BY_CATEGORY[a.category]`
  - Jika `a.signedAmount > 0` (Kas Bertambah):
    - Baris 1: `accountName: "Kas di Bank"`, `debit: absAmount`, `credit: 0`
    - Baris 2: `accountName: contra`, `debit: 0`, `credit: absAmount`
  - Jika `a.signedAmount < 0` (Kas Berkurang):
    - Baris 1: `accountName: contra`, `debit: absAmount`, `credit: 0`
    - Baris 2: `accountName: "Kas di Bank"`, `debit: 0`, `credit: absAmount`
- Kembalikan `{ entries, totalDebit, totalCredit, isDoubleEntryBalanced: totalDebit === totalCredit }`.

---

## 9. Spesifikasi Ekspor Profesional (PDF Formal & Excel Multi-Sheet)

### 9.1 Formal PDF Report (`src/lib/export/pdfGenerator.ts`)
Menggunakan `jspdf` + `jspdf-autotable` (A4 Portrait, margin 15mm, tipografi bersih):
1. **Kop Laporan Formal:**
   - Nama Perusahaan (bold, besar), Judul `"LAPORAN REKONSILIASI BANK"`, Rekening Bank, Periode (`Oktober 2026`), Tanggal Cetak, dan Badge Status (`BALANCED - SELISIH Rp 0` / `UNRECONCILED`).
2. **Bagian 1 — Matriks Rekonsiliasi Dua Sisi (Side-by-Side / Stacked Accounting Format):**
   - **A. Menurut Rekening Koran Bank:** Saldo Akhir Bank, rincian Penambahan (+), rincian Pengurangan (-), **Saldo Bank Disesuaikan (Bold + Double Border)**.
   - **B. Menurut Buku Kas Perusahaan:** Saldo Akhir Buku, rincian Penambahan (+), rincian Pengurangan (-), **Saldo Buku Disesuaikan (Bold + Double Border)**.
   - Baris Verifikasi: **Selisih Rekonsiliasi = Rp 0**.
3. **Bagian 2 — Tabel Jurnal Penyesuaian (Adjusting Journal Entries):**
   - Kolom: `No`, `Tanggal`, `Nama Akun`, `Keterangan`, `Debit (Rp)`, `Kredit (Rp)` + Baris **TOTAL** di akhir.
4. **Bagian 3 — Ringkasan Statistik & Catatan Audit:**
   - Total transaksi bank/buku, Match Rate %, jumlah item outstanding, dan catatan audit (*auditNote*) dari item anomali (seperti *Double Charge* atau *Cek Kosong*).
5. **Blok Tanda Tangan (Sign-Off Footer):**
   - 2 kolom formal:
     - Kiri: `Disusun oleh (Prepared by)` -> ruang tanda tangan -> `session.preparedBy`
     - Kanan: `Diperiksa & Disetujui oleh (Reviewed by)` -> ruang tanda tangan -> `session.reviewedBy`

### 9.2 Multi-Sheet Excel Workbook (`src/lib/export/excelGenerator.ts`)
Menggunakan `exceljs` dengan header berwarna (`#0F172A` teks putih), *freeze panes*, *auto column width*, dan format angka akuntansi Indonesia (`"Rp "#,##0;("Rp "#,##0);"-"`):
- **Sheet 1: `Ringkasan Rekonsiliasi`** — Metadata sesi + Matriks 2 Sisi Formal menggunakan formula Excel nyata (`=SUM(...)`, `=B10-B20`) sehingga auditor bisa memverifikasi rumus langsung di Excel!
- **Sheet 2: `Jurnal Penyesuaian`** — Tabel Jurnal Penyesuaian Debit/Kredit dengan formula `=SUM(...)` di baris total.
- **Sheet 3: `Item Penyesuaian & Outstanding`** — Daftar lengkap seluruh item penyesuaian Bank & Buku beserta kategori, nominal, dan catatan audit.
- **Sheet 4: `Log Pencocokan (Matched)`** — Audit log seluruh pasangan transaksi Bank vs Buku (Tanggal Bank, Deskripsi Bank, Nominal Bank, Tanggal Buku, Deskripsi Buku, Nominal Buku, Status Match, Confidence Score, Alasan).

---

## 10. Arsitektur UI/UX, Design System & Alur Halaman

### 10.1 Design System (*Enterprise Fintech Precision*)
- **Estetika:** Clean, tenang, padat informasi tapi bernapas (terinspirasi Ramp, Xero, Stripe Financial Reports). Hindari gradien mencolok atau animasi berlebihan.
- **Palet Warna:**
  - Canvas: `bg-slate-50` (`#F8FAFC`)
  - Card Surface: `bg-white border border-slate-200 shadow-xs rounded-xl`
  - Primary Brand: `slate-900` untuk tombol primer & header formal, `indigo-600` untuk aksen aktif/tab/focus ring.
  - Status Semantik:
    - `emerald-600` / `emerald-50` / `border-emerald-200`: `BALANCED`, `EXACT_MATCH`, Arus Masuk (`+`)
    - `amber-600` / `amber-50` / `border-amber-200`: `SUGGESTED_MATCH`, `DISCREPANCY_MATCH`, Peringatan Audit
    - `rose-600` / `rose-50` / `border-rose-200`: `UNRECONCILED`, `UNMATCHED`, Arus Keluar (`-`), Anomali
- **Tipografi Wajib:**
  - Sans: `Inter` (UI & labels)
  - Mono: `JetBrains Mono` (`font-mono tabular-nums text-right`) WAJIB diterapkan pada **semua nominal Rupiah, selisih, saldo, tanggal, dan persentase** agar angka lurus sempurna secara vertikal.

### 10.2 Halaman & Komponen Utama

#### Halaman 1: `/` — Executive Quick-Start Hub
- **Header Ringkas:** Judul ReconFlow + badge status sistem (`Fullstack Audit-Ready • SQLite/Prisma Persistence`).
- **Hero Action Bar:** Tombol utama **"Mulai Rekonsiliasi Baru (Upload CSV)"** (`/new`) dan tombol sekunder **"Lihat Riwayat Arsip"** (`/history`).
- **Section "Coba Skenario Demo Realistis (1-Klik)":**
  - 3 kartu interaktif sejajar (Desktop 3 kolom):
    1. **Skenario 1 — Operasional Normal UMKM** (`PT Kopi Nusantara Sejahtera`) • Badge `Dasar` • Highlights: *Timing difference 1 hari, Deposit in Transit, Cek Beredar, Jasa Giro & Admin*.
    2. **Skenario 2 — E-Commerce & Timing Difference** (`CV Gaya Minimalis Indonesia`) • Badge `Menengah` • Highlights: *Pencairan Shopee/Tokopedia/TikTok Shop selisih 1-2 hari, Unrecorded Reseller Transfer, BI-FAST*.
    3. **Skenario 3 — Kasus Audit & Anomali** (`PT Sinar Logistik Mandiri`) • Badge `Audit / Lanjutan` • Highlights: *Transposition Error BBM, Double Charge Allianz, Cek Kosong NSF, Unknown Cloud Charge*.
  - Klik kartu -> loading state -> `POST /api/sessions/demo` -> redirect ke `/workspace/[id]`.
- **Section "Sesi Terbaru":** Tabel ringkas 5 sesi terakhir dari DB dengan badge status & tombol "Lanjutkan".

#### Halaman 2: `/new` — Dual CSV Intake & Column Mapper
- **Form Metadata Sesi:** Nama Perusahaan, Nama Rekening Bank, Periode (mis. `Oktober 2026`), Tanggal Akhir Periode, Saldo Awal, Saldo Akhir Bank (auto-terisi dari baris terakhir CSV jika ada kolom saldo, tetap bisa diedit), Saldo Akhir Buku (auto-terisi), Prepared By, Reviewed By.
- **Dual Uploader Side-by-Side:**
  - Panel Kiri: Dropzone **Rekening Koran Bank (`.csv`)** + tombol "Unduh Template CSV Bank".
  - Panel Kanan: Dropzone **Buku Kas Perusahaan (`.csv`)** + tombol "Unduh Template CSV Buku".
- **Interactive Column Mapper & Preview:**
  - Begitu file di-upload, tampilkan preview 5 baris pertama dan dropdown pemetaan kolom (sudah auto-detected). Tampilkan validasi jumlah baris & total mutasi sebelum klik **"Proses & Jalankan Auto-Match"**.

#### Halaman 3: `/workspace/[id]` — 4-Step Guided Reconciliation Workspace
- **Sticky Top Bar (`LiveReconStickyBar`):** Selalu terlihat saat scroll:
  - Nama Perusahaan & Periode + Status Sesi
  - 3 angka utama (`font-mono tabular-nums`): **Saldo Bank Disesuaikan** | **Saldo Buku Disesuaikan** | **Selisih Aktual**
  - Progress indicator (mis. `Semua item terselesaikan` atau `3 item perlu tinjauan`)
  - Status Pill besar: **`BALANCED (Rp 0)`** (hijau) atau **`UNRECONCILED`** (merah)
- **Horizontal Stepper Tabs (4 Langkah — bisa lompat bebas, tapi terpandu):**
  - **Step 1: Ringkasan & Konfigurasi Engine**
    - Ringkasan metadata sesi (editable jika belum `FINALIZED`).
    - `MatchingControlsBar`: Slider Toleransi Tanggal (`0-14 hari`), Input Toleransi Nominal (`Rp`), Toggle `Deteksi Transposition Error`, tombol **"Jalankan Ulang Auto-Match"** (`POST /api/sessions/[id]/match`).
  - **Step 2: Matching Workbench (Inti Kerja Akuntan)**
    - `KpiSummaryGrid`: 4 kartu (*Match Rate %*, *Perlu Konfirmasi*, *Belum Diklasifikasi*, *Selisih Awal vs Sisa Selisih*).
    - Sub-tabs dengan counter badge:
      1. **`Perlu Konfirmasi` (`Suggested` & `Discrepancy`):**
         - Kartu perbandingan *Side-by-Side*: Kiri (Data Bank) vs Kanan (Data Buku), di tengah ada Confidence Badge (`88%`), alasan pencocokan (*chips*), dan jika `DISCREPANCY_MATCH` muncul alert banner kuning menunjukkan selisih nominal (mis. `Selisih Rp 90.000 — Indikasi Transposition Error`) beserta pilihan *Fault Side* (`Kesalahan Buku` / `Kesalahan Bank`) dan dropdown Akun Lawan.
         - Tombol cepat: **Approve** (hijau) & **Reject** (merah outline).
      2. **`Belum Cocok` (`Unmatched Split-Pane`):**
         - Layout 2 kolom seimbang: Kiri = **Hanya di Rekening Koran Bank**, Kanan = **Hanya di Buku Kas Perusahaan**.
         - Setiap baris memiliki:
           - Checkbox seleksi (jika user memilih 1 baris Bank + 1 baris Buku, muncul *floating bar* di bawah: **"Pasangkan Manual 2 Transaksi Terpilih"** -> buka `ManualPairModal`).
           - Tombol / Popover **"Klasifikasikan"** yang langsung memfilter opsi kategori relevan (contoh: baris `BANK OUT` otomatis menyarankan `Biaya Admin Bank`, `Pajak Jasa Giro`, `Cek Kosong (NSF)`, `Beban Belum Dicatat`, `Kesalahan Bank / Double Charge`; baris `BOOK IN` otomatis menyarankan `Setoran dalam Perjalanan`; baris `BOOK OUT` otomatis menyarankan `Cek Beredar`).
           - Jika baris sudah diklasifikasikan, tampilkan *status badge* kategori + tombol edit/hapus klasifikasi.
      3. **`Terkonfirmasi` (`Confirmed Matches`):**
         - TanStack Table lengkap dengan pencarian, filter status (`EXACT_MATCH`, `SUGGESTED_MATCH`, `MANUAL_MATCH`, `DISCREPANCY_MATCH`), alasan pencocokan, dan tombol **Unmatch**.
  - **Step 3: Matriks Rekonsiliasi Formal & Waterfall Chart**
    - **`ReconMatrixCard`:** Tampilan kertas kerja akuntan formal 2 kolom (Kiri: Sisi Bank, Kanan: Sisi Buku), rincian setiap item penyesuaian dengan tanggal & nominal rata kanan, subtotal penambahan/pengurangan, dan baris akhir **Saldo Kas yang Benar (Adjusted Balance)** bergaris bawah ganda (`border-b-4 border-double border-slate-900`).
    - **`ReconWaterfallChart`:** Grafik Waterfall Recharts dengan tab/panel Jembatan Saldo Bank & Jembatan Saldo Buku, lengkap dengan custom tooltip berformat Rupiah.
  - **Step 4: Jurnal Penyesuaian, Audit Trail & Ekspor**
    - **`AdjustingJournalTable`:** Tabel formal Debit/Kredit (Tanggal, Akun, Keterangan, Debit, Kredit). User dapat mengedit `contraAccountName` secara inline (disimpan via `PATCH /api/sessions/[id]/adjustments/[adjId]`). Baris footer menampilkan **TOTAL DEBIT = TOTAL KREDIT** dengan badge validasi hijau.
    - **`AuditLogTimeline`:** Daftar kronologis semua aktivitas audit sesi ini.
    - **Action Bar Finalisasi & Ekspor:**
      - Tombol **"Finalisasi & Kunci Sesi"** (aktif saat `isBalanced === true`).
      - Tombol **"Ekspor Laporan PDF"** (buka `ExportSignoffModal` untuk konfirmasi nama *Prepared by* & *Reviewed by*, simpan PATCH jika diubah, lalu download `/api/sessions/[id]/export/pdf`).
      - Tombol **"Ekspor Excel (.xlsx)"** (download `/api/sessions/[id]/export/excel`).

#### Halaman 4: `/history` — Arsip Rekonsiliasi
- Filter pencarian (Nama Perusahaan / Rekening / Periode) + filter tab status (`Semua`, `DRAFT`, `BALANCED`, `FINALIZED`).
- Tabel TanStack menampilkan: Perusahaan & Rekening, Periode, Saldo Disesuaikan, Selisih, Status Badge, Terakhir Diubah, dan tombol Aksi (**Buka**, **PDF**, **Excel**, **Hapus**).

---

## 11. 3 Skenario Dataset CSV Demo & Kunci Jawaban Verifikasi

Masukkan seluruh 6 dataset CSV di bawah ini secara persis ke `src/lib/demo/scenarios.ts`. Semua angka sudah diverifikasi dan WAJIB dijadikan bahan *automated test* di `tests/scenarios.e2e.test.ts`.

---

### Skenario 1 (`scenarioKey: "umkm"`): Operasional Normal UMKM
- **companyName:** `PT Kopi Nusantara Sejahtera`
- **bankAccountName:** `BCA Bisnis - 8820194421`
- **periodLabel:** `Oktober 2026`
- **periodEndDate:** `2026-10-31`
- **openingBalance:** `50000000`
- **endingBankBalance:** `68181000`
- **endingBookBalance:** `73300000`

**CSV Bank (`s1_rekening_koran_kopi.csv`):**
```csv
tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo
2026-10-02,BNK-1001,"CR QRIS SETTLEMENT 01-02 OKT",0,14500000,64500000
2026-10-05,BNK-1002,"DB TRF PT ROASTERY JAYA",8200000,0,56300000
2026-10-10,BNK-1003,"DB AUTODEBIT PLN & PDAM",1850000,0,54450000
2026-10-16,BNK-1004,"CR KLIRING CATERING BUMN",0,18750000,73200000
2026-10-20,BNK-1005,"DB SEWA RUKO OKT 2026",12000000,0,61200000
2026-10-25,BNK-1006,"DB PAYROLL KARYAWAN OKT",15500000,0,45700000
2026-10-28,BNK-1007,"CR QRIS SETTLEMENT 20-27 OKT",0,22400000,68100000
2026-10-31,BNK-1008,"CR JASA GIRO OKT 2026",0,145000,68245000
2026-10-31,BNK-1009,"DB PAJAK JASA GIRO 20%",29000,0,68216000
2026-10-31,BNK-1010,"DB BIAYA ADMIN BULANAN",35000,0,68181000
```

**CSV Buku Kas (`s1_buku_kas_kopi.csv`):**
```csv
tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo
2026-10-02,BKM-001,"Penjualan Kopi QRIS 01-02 Okt","Pendapatan Penjualan",14500000,0,64500000
2026-10-05,BKK-001,"Pembelian Biji Kopi PT Roastery Jaya","Persediaan Bahan Baku",0,8200000,56300000
2026-10-10,BKK-002,"Bayar Listrik & Air Outlet","Beban Utilitas",0,1850000,54450000
2026-10-15,BKM-002,"Pembayaran Catering Event BUMN","Pendapatan Catering",18750000,0,73200000
2026-10-20,BKK-003,"Sewa Ruko Bulan Oktober 2026","Beban Sewa",0,12000000,61200000
2026-10-25,BKK-004,"Gaji Barista & Staff Oktober","Beban Gaji",0,15500000,45700000
2026-10-28,BKM-003,"Penjualan Kopi QRIS 20-27 Okt","Pendapatan Penjualan",22400000,0,68100000
2026-10-30,BKK-005,"Cek #4012 Pembelian Cup & Kemasan CV Packindo","Persediaan Kemasan",0,4600000,63500000
2026-10-31,BKM-004,"Setoran Tunai Penjualan 28-31 Okt","Pendapatan Penjualan",9800000,0,73300000
```

**Expected Verification Assertions (Skenario 1):**
- Auto-Match awal: `6 EXACT_MATCH`, `1 SUGGESTED_MATCH` (`BNK-1004` <-> `BKM-002`, selisih 1 hari), `0 DISCREPANCY_MATCH`.
- Unmatched: Bank (`BNK-1008`, `BNK-1009`, `BNK-1010`), Book (`BKK-005`, `BKM-004`).
- Setelah Approve Suggested + Klasifikasi:
  - `adjustedBankBalance = 68181000 + 9800000 - 4600000 = 73381000`
  - `adjustedBookBalance = 73300000 + 145000 - 29000 - 35000 = 73381000`
  - `variance = 0`, `isBalanced = true`
  - `journals.entries.length = 3`, `totalDebit = totalCredit = 209000`

---

### Skenario 2 (`scenarioKey: "ecommerce"`): E-Commerce & Timing Difference
- **companyName:** `CV Gaya Minimalis Indonesia`
- **bankAccountName:** `Mandiri Giro - 14400982100`
- **periodLabel:** `Oktober 2026`
- **periodEndDate:** `2026-10-31`
- **openingBalance:** `125000000`
- **endingBankBalance:** `208925500`
- **endingBookBalance:** `215900000`

**CSV Bank (`s2_rekening_koran_ecommerce.csv`):**
```csv
tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo
2026-10-03,TRF-901,"CR SHOPEE INTL ID PAYOUT #8821",0,42600000,167600000
2026-10-06,TRF-902,"DB META ADS IRELAND BILLING",14250000,0,153350000
2026-10-09,TRF-903,"CR TOKOPEDIA ESCROW BATCH 10A",0,31800000,185150000
2026-10-12,TRF-904,"DB JNE EXPRESS INVOICE OKT-1",6750000,0,178400000
2026-10-15,TRF-905,"CR TIKTOK SHOP SETTLEMENT W2",0,27450000,205850000
2026-10-18,TRF-906,"DB TRF KONVEKSI BANDUNG JAYA",38000000,0,167850000
2026-10-18,TRF-907,"DB BIAYA BI-FAST",2500,0,167847500
2026-10-22,TRF-908,"CR TRF TOKO RESELLER SURABAYA",0,16500000,184347500
2026-10-25,TRF-909,"DB PAYROLL TIM DIGITAL & GUDANG",24500000,0,159847500
2026-10-27,TRF-910,"CR SHOPEE INTL ID PAYOUT #8940",0,48900000,208747500
2026-10-31,TRF-911,"DB BIAYA ADMIN & TOKEN BISNIS",50000,0,208697500
2026-10-31,TRF-912,"CR BUNGA GIRO OKT",0,285000,208982500
2026-10-31,TRF-913,"DB PAJAK BUNGA GIRO",57000,0,208925500
```

**CSV Buku Kas (`s2_buku_kas_ecommerce.csv`):**
```csv
tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo
2026-10-01,KM-201,"Pencairan Saldo Shopee Batch #8821","Piutang Marketplace",42600000,0,167600000
2026-10-06,KK-201,"Pembayaran Iklan Meta Ads Oktober","Beban Pemasaran",0,14250000,153350000
2026-10-08,KM-202,"Settlement Tokopedia Batch 10A","Piutang Marketplace",31800000,0,185150000
2026-10-12,KK-202,"Tagihan Ekspedisi JNE Express","Beban Pengiriman",0,6750000,178400000
2026-10-13,KM-203,"Pencairan TikTok Shop Minggu 2","Piutang Marketplace",27450000,0,205850000
2026-10-18,KK-203,"Pelunasan PO Kain Konveksi Bandung Jaya","Utang Usaha",0,38000000,167850000
2026-10-25,KK-204,"Gaji Tim Digital Marketing & Gudang","Beban Gaji",0,24500000,143350000
2026-10-25,KM-204,"Pencairan Saldo Shopee Batch #8940","Piutang Marketplace",48900000,0,192250000
2026-10-29,KK-205,"Bilyet Giro #BG-882 Pembelian Packaging Box","Persediaan Kemasan",0,11400000,180850000
2026-10-30,KM-205,"Withdraw TikTok Shop Akhir Bulan","Piutang Marketplace",19300000,0,200150000
2026-10-31,KM-206,"Withdraw Tokopedia Akhir Bulan","Piutang Marketplace",15750000,0,215900000
```

**Expected Verification Assertions (Skenario 2):**
- Auto-Match awal: `4 EXACT_MATCH`, `4 SUGGESTED_MATCH` (`TRF-901`<->`KM-201`, `TRF-903`<->`KM-202`, `TRF-905`<->`KM-203`, `TRF-910`<->`KM-204`), `0 DISCREPANCY_MATCH`.
- Unmatched: Bank (`TRF-907`, `TRF-908`, `TRF-911`, `TRF-912`, `TRF-913`), Book (`KK-205`, `KM-205`, `KM-206`).
- Setelah Approve Suggested + Klasifikasi:
  - `adjustedBankBalance = 208925500 + 19300000 + 15750000 - 11400000 = 232575500`
  - `adjustedBookBalance = 215900000 + 16500000 + 285000 - 2500 - 50000 - 57000 = 232575500`
  - `variance = 0`, `isBalanced = true`
  - `journals.entries.length = 5`, `totalDebit = totalCredit = 16894500`

---

### Skenario 3 (`scenarioKey: "audit"`): Kasus Audit — Salah Catat, Double Charge, Cek Kosong & Anomali
- **companyName:** `PT Sinar Logistik Mandiri`
- **bankAccountName:** `BNI Korporasi - 0091827364`
- **periodLabel:** `Oktober 2026`
- **periodEndDate:** `2026-10-31`
- **openingBalance:** `340000000`
- **endingBankBalance:** `369296000`
- **endingBookBalance:** `405160000`

**CSV Bank (`s3_rekening_koran_audit.csv`):**
```csv
tanggal,no_referensi,keterangan,debit_keluar,kredit_masuk,saldo
2026-10-02,B-501,"CR PELUNASAN INV-091 PT GARUDA FOOD",0,85000000,425000000
2026-10-05,B-502,"DB PERTAMINA FLEET CARD BBM",12450000,0,412550000
2026-10-08,B-503,"CR SETORAN CEK PT MAJU JAYA",0,15000000,427550000
2026-10-10,B-504,"DB RETUR CEK KOSONG PT MAJU JAYA (NSF)",15000000,0,412550000
2026-10-10,B-505,"DB BIAYA PENOLAKAN CEK KOSONG",125000,0,412425000
2026-10-14,B-506,"DB AUTODEBIT ASURANSI ARMADA ALLIANZ",8500000,0,403925000
2026-10-14,B-507,"DB AUTODEBIT ASURANSI ARMADA ALLIANZ",8500000,0,395425000
2026-10-18,B-508,"CR PELUNASAN INV-094 PT INDOFARMA",0,62500000,457925000
2026-10-21,B-509,"DB SERVIS TRUK PT HINO MOTOR",19800000,0,438125000
2026-10-23,B-510,"DB CARD DEBIT UNKNOWN SAAS CLOUD USD",1250000,0,436875000
2026-10-26,B-511,"DB PAYROLL DRIVER & OPERASIONAL",68000000,0,368875000
2026-10-31,B-512,"CR JASA GIRO KORPORASI",0,620000,369495000
2026-10-31,B-513,"DB PAJAK JASA GIRO",124000,0,369371000
2026-10-31,B-514,"DB BIAYA ADMIN GIRO KORPORASI",75000,0,369296000
```

**CSV Buku Kas (`s3_buku_kas_audit.csv`):**
```csv
tanggal,no_bukti,deskripsi,akun_lawan,debit_masuk,kredit_keluar,saldo
2026-10-02,JKM-301,"Pelunasan Piutang PT Garuda Food INV-091","Piutang Usaha",85000000,0,425000000
2026-10-05,JKK-301,"Tagihan BBM Pertamina Fleet Card","Beban BBM & Tol",0,12540000,412460000
2026-10-08,JKM-302,"Penerimaan Cek Pelunasan PT Maju Jaya","Piutang Usaha",15000000,0,427460000
2026-10-14,JKK-302,"Premi Asuransi Armada Bulanan Allianz","Beban Asuransi",0,8500000,418960000
2026-10-17,JKM-303,"Pelunasan Piutang PT Indofarma INV-094","Piutang Usaha",62500000,0,481460000
2026-10-21,JKK-303,"Perawatan Rutin Armada PT Hino Motor","Beban Pemeliharaan",0,19800000,461660000
2026-10-26,JKK-304,"Gaji Driver & Staf Operasional Okt","Beban Gaji",0,68000000,393660000
2026-10-29,JKK-305,"Cek #7781 Pembelian Ban Truk CV Karya Ban","Beban Pemeliharaan",0,22500000,371160000
2026-10-31,JKM-304,"Setoran Tunai Tagihan COD Pengiriman Bali","Piutang Usaha",34000000,0,405160000
```

**Expected Verification Assertions (Skenario 3):**
- Auto-Match awal:
  - `5 EXACT_MATCH`: `B-501`<->`JKM-301`, `B-503`<->`JKM-302`, `B-506` (atau `B-507`)<->`JKK-302` (**HANYA SATU**, duplikatnya tetap `UNMATCHED`!), `B-509`<->`JKK-303`, `B-511`<->`JKK-304`.
  - `1 SUGGESTED_MATCH`: `B-508`<->`JKM-303` (Ref `INV-094`, selisih 1 hari).
  - `1 DISCREPANCY_MATCH`: `B-502` (`12.450.000`) <-> `JKK-301` (`12.540.000`), selisih `90.000`, terdeteksi sebagai *Transposition Error*.
- Unmatched:
  - Bank (7 item): `B-504` (NSF Check `-15.000.000`), `B-505` (Biaya Tolak Cek `-125.000`), `B-507` (Bank Error Double Charge `+8.500.000` di Sisi Bank!), `B-510` (Unrecorded Expense/Anomali `-1.250.000`), `B-512` (Jasa Giro `+620.000`), `B-513` (Pajak Giro `-124.000`), `B-514` (Biaya Admin `-75.000`).
  - Book (2 item): `JKK-305` (Outstanding Check `-22.500.000`), `JKM-304` (Deposit in Transit `+34.000.000`).
- Setelah Approve Suggested + Approve Discrepancy (`faultSide: 'BOOK'`, `+90.000` `BOOK_ERROR_ADD`) + Klasifikasi seluruh Unmatched:
  - `adjustedBankBalance = 369296000 + 34000000 - 22500000 + 8500000 = 389296000`
  - `adjustedBookBalance = 405160000 + 90000 + 620000 - 15000000 - 125000 - 1250000 - 124000 - 75000 = 389296000`
  - `variance = 0`, `isBalanced = true`
  - `journals.entries.length = 7` (6 item Unmatched Bank yang masuk Sisi Buku + 1 item `BOOK_ERROR_ADD` BBM; **TIDAK** termasuk Double Charge Allianz karena itu Sisi Bank!)
  - `totalDebit = totalCredit = 17284000`

---

## 12. Rencana Eksekusi Bertahap & Definition of Done (DoD)

Hermes Agent WAJIB mengeksekusi proyek ini dalam **5 Fase Berurutan** dan memverifikasi setiap fase sebelum lanjut ke fase berikutnya:

### Fase 1: Project Bootstrap, Design Tokens & Database Layer
1. Inisialisasi proyek Next.js (App Router, TypeScript, Tailwind CSS) dan pasang semua dependensi (`prisma`, `@prisma/client`, `zod`, `papaparse`, `date-fns`, `lucide-react`, `sonner`, `recharts`, `@tanstack/react-table`, `exceljs`, `jspdf`, `jspdf-autotable`, `vitest`, komponen `shadcn/ui`).
2. Tulis `prisma/schema.prisma`, `.env`, `src/lib/db.ts`, dan jalankan `npx prisma generate && npx prisma db push`.
3. Tulis `src/lib/schemas/reconciliation.ts` dan `src/lib/format.ts`.

### Fase 2: Pure Accounting & Matching Engine + Automated Test Suite
1. Implementasikan `parser.ts`, `textSimilarity.ts`, `matcher.ts`, `calculator.ts`, `journals.ts`, dan `src/lib/demo/scenarios.ts`.
2. Tulis seluruh unit test di `tests/engine.parser.test.ts`, `tests/engine.matcher.test.ts`, dan `tests/scenarios.e2e.test.ts`.
3. Jalankan `npm run test` dan pastikan **100% PASS** (termasuk verifikasi 3 skenario mencapai `variance === 0`, deteksi transposition error, anti double-matching Allianz, dan keseimbangan Debit = Kredit Jurnal Penyesuaian).

### Fase 3: Fullstack REST API & Export Engines
1. Implementasikan `src/lib/export/pdfGenerator.ts` dan `src/lib/export/excelGenerator.ts`.
2. Implementasikan seluruh 16 endpoint REST API di `src/app/api/**` dengan validasi Zod, transaksi atomik Prisma (`prisma.$transaction`), dan pencatatan `AuditLog`.
3. Implementasikan typed client di `src/lib/api/client.ts`.

### Fase 4: Enterprise UI/UX & Interactive 4-Step Workspace
1. Bangun `AppShell`, `LiveReconStickyBar`, halaman `/` (Hub & 3 Demo Cards), halaman `/new` (Dual CSV Uploader + Column Mapper), halaman `/workspace/[id]` (4 Step lengkap dengan Suggested Review Cards, Unmatched Split-Pane, Manual Pair Modal, Formal Recon Matrix, Recharts Waterfall Chart, Editable AJE Table, Audit Log Timeline, Export Modal), dan halaman `/history`.
2. Pastikan seluruh tampilan responsif, seluruh angka memakai `font-mono tabular-nums text-right`, dan setiap mutasi menampilkan toast feedback (`sonner`) yang jelas.

### Fase 5: Final Audit & Production Verification Gate
1. Jalankan:
   - `npx tsc --noEmit` -> 0 error
   - `npm run lint` -> 0 error
   - `npm run test` -> semua test hijau
   - `npm run build` -> build Next.js production sukses tanpa error
2. Lakukan *smoke test* runtime: start server, panggil `POST /api/sessions/demo` untuk `audit`, verifikasi `GET /api/sessions/[id]`, `GET /api/sessions/[id]/export/pdf`, dan `GET /api/sessions/[id]/export/excel` mengembalikan HTTP `200` dengan payload valid.
3. Tulis `README.md` profesional (fitur, arsitektur, cara run lokal, cara switch ke PostgreSQL untuk deployment Vercel/VPS) dan sajikan ringkasan hasil verifikasi kepada user.