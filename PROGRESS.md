# ReconFlow — Progress Tracker

> Single Source of Truth teknis: `RECONFLOW_MASTER_SPEC.md` (di root).
> Checklist ini hanya status eksekusi. Baca SSOT sebelum memulai tiap fase.

## Keputusan Final (disetujui owner)
- **Next.js 15** (15.5.29) — bukan 16, hindari breaking changes.
- **SQLite** (`file:./dev.db`) untuk Fase 1–5; skema & query tetap PostgreSQL-compatible. Langkah switch ke Neon dicatat di README.
- **Lokasi:** `~/projects/reconflow`.
- **SSOT:** file asli di-copy dari Downloads (hash identik), TIDAK ditulis ulang dari chat.

## Catatan Versi (deviasi dari spec, disetujui)
- **Prisma 6.19.3** (spec: 5/6; Prisma 8-rc CLI-nya beda total — dihindari).
- **Zod 4** (spec ditulis saat Zod 3). API inti kompatibel; tipe Input pakai `z.input`, Output pakai `z.infer`.
- **Tailwind 4** (scaffold bawaan). shadcn/ui konvensional butuh Tailwind 3 → pakai **komponen custom Tailwind 4** (pola FinBoard yang teruji). Palet & font dari spec tetap 100% diterapkan.
- **@tanstack/react-table v8** (spec: v8). Scaffold bawa v9 → dikunci ke v8.
- **vitest 3** (scaffold tarik v5 yang bentrok peer-dep).

## Fase 1 — Project Bootstrap, Design Tokens & Database Layer
- [x] Scaffold Next.js 15 (App Router, TS, Tailwind 4, ESLint 9 flat config)
- [x] Pasang dependencies (prisma, zod, papaparse, date-fns, lucide-react, sonner, recharts, @tanstack/react-table v8, vitest)
- [x] `prisma/schema.prisma` (persis spec), `.env`, `src/lib/db.ts`
- [x] `npx prisma generate` + `npx prisma db push` (DB in-sync)
- [x] `src/lib/schemas/reconciliation.ts` (SSOT Zod + types)
- [x] `src/lib/format.ts` (formatIDR, formatDateID, formatPercent)
- [x] Design tokens Tailwind 4 (`globals.css`), font Inter + JetBrains Mono, Toaster (layout.tsx)
- [x] `vitest.config.ts` + script npm
- [x] Gate: `npx tsc --noEmit` 0 error
- [x] Gate: `npx prisma validate` valid + `npm run lint` 0 problem

## Fase 2 — Pure Accounting & Matching Engine + Automated Test Suite
- [x] `src/lib/engine/parser.ts` (parseIndonesianCurrency, parseFlexibleDate, inferDirection/Amount, detectColumnMapping)
- [x] `src/lib/engine/textSimilarity.ts` (normalizeDescription, extractReferenceTokens, computeTextSimilarity = 0.6·J + 0.4·Dice)
- [x] `src/lib/engine/matcher.ts` (3-Pass Priority Greedy Bipartite, persis spec §8.3)
- [x] `src/lib/engine/calculator.ts` (adjusted balance, variance, isBalanced, matchRate, waterfall)
- [x] `src/lib/engine/journals.ts` (AJE hanya sisi BUKU, default COA per kategori)
- [x] `src/lib/demo/scenarios.ts` (3 dataset CSV persis spec §11)
- [x] tests: engine.parser (22), engine.textSimilarity (8), engine.matcher (10), engine.journals (6), engine.calculator (7), scenarios.e2e (20)
- [x] Gate: `npm run test` → **73/73 PASS** (3 skenario variance Rp 0, jurnal seimbang)
- [x] Gate: `npx tsc --noEmit` → exit 0
- [x] Gate: `npx eslint --max-warnings=0` → 0 error/warning
- [x] Audit ketat: 0 TODO / 0 `as any` / 0 `@ts-ignore` di src/ & tests/

### Temuan & Perbaikan Fase 2 (audit mandiri)
1. **Bug engine `calculator.ts` (perbaikan desain):** `unclassifiedCount` semula menghitung setiap transaksi tanpa `adjustment` sebagai belum-terklasifikasi — padahal transaksi yang termatch (EXACT/SUGGESTED/MANUAL/DISCREPANCY) terekonsiliasi via `MatchPair`, bukan via penyesuaian. Akibatnya `isBalanced` tak pernah `true` meski variance Rp 0. **Fix:** perluas `MatchLike` dengan `bankTxId`/`bookTxId`; transaksi dianggap terekonsiliasi jika punya `adjustment` ATAU termasuk pasangan match terkonfirmasi.
2. **Semantik arah penyesuaian (dipahami ulang):** Unmatched **BANK** → penyesuaian **Sisi BUKU** (menghasilkan jurnal); Unmatched **BOOK** → penyesuaian **Sisi BANK** (timing difference, tanpa jurnal). Kunci jawaban dipindah ke helper test `tests/helpers/scenarios.ts` agar satu sumber.
3. **Double Charge Allianz (B-507):** bank memotong 2× padahal buku catat 1× → `BANK_ERROR_ADD +8.500.000` di **Sisi BANK** (override `side`), sehingga `adjustedBankBalance = +34.000.000 − 22.500.000 + 8.500.000` dan **TIDAK menghasilkan jurnal** (jurnal tetap 7 entri / Rp 17.284.000).
4. **Transposition BBM (B-502↔JKK-301):** selisih Rp 90.000 habis dibagi 9 → `DISCREPANCY_MATCH`; faultSide BOOK → `BOOK_ERROR_ADD +90.000` di sisi buku.
5. **Deviasi versi (tidak mengubah perilaku):** vitest 3.2.7; helper test diekspor dari modul terpisah untuk keterbacaan.
6. Hapus konstanta `CATEGORY_SIGN` yang tak terpakai (warning lint `--max-warnings=0`).

## Fase 3 — Fullstack REST API & Export Engines
- [x] `src/lib/session.ts` (service layer: getHydratedSession, runAndPersistAutoMatch, logAudit, notFoundResponse, toMatchCandidate, toPrismaTxInputs)
- [x] `src/lib/api.ts` (success/failure/handleError → kontrak `{ data }` / `{ error: { code, message } }`)
- [x] `src/lib/export/pdfGenerator.ts` (jsPDF + autoTable, Formal Financial Report + jembatan)
- [x] `src/lib/export/excelGenerator.ts` (ExcelJS 4-sheet: Ringkasan/Bank/Buku/Jurnal)
- [x] 16 endpoint REST lengkap (health, sessions CRUD, demo, match, matches approve/manual, adjustments CRUD, finalize, export PDF/Excel)
- [x] Zod validation per endpoint + transaksi atomik + AuditLog tiap mutasi
- [x] Gate: tsc 0 error, eslint --max-warnings=0 bersih
- [x] Gate: build sukses (16 route terdaftar)
- [x] Smoke test API runtime via `next start` (health, create demo, get session, approve, klasifikasi, finalize, export PDF `%PDF` / Excel `PK`)

### Temuan & Perbaikan Fase 3 (audit mandiri)
1. **Type-safety `notFoundResponse`:** semula return `Response` polos, memicu error build Next 15 (bentrok `NextResponse`). Diubah return `NextResponse.json`.
2. **`conflict()` helper:** diubah jadi throw `ApiError` (bukan return) agar tidak bocor ke type-validator handler Next 15; pemakaian di route dikonversi ke `failure(...,409)`.
3. **Enum Prisma:** field `category` Prisma bertipe `String` → dicast ke union `AdjustmentCategory` di DTO agar 100% type-safe.
4. **normalisasi CSV:** helper `toPrismaTxInputs` terpusat di session.ts menambahkan `normalizedDesc` (wajib Prisma) dari deskripsi, satu sumber untuk endpoint create & demo.
5. **Versi libs ekspor:** jspdf & autotable major terbaru (4/5) import API berubah → dikunci ke jspdf@^2 (2.5.2) + jspdf-autotable@^3 (3.8.4) yang stabil; exceljs@4.4.0.

## Fase 4 — Enterprise UI/UX & 4-Step Workspace
- [x] `AppShell` (sidebar + topbar), `LiveReconStickyBar` (badge BALANCED/UNBALANCED)
- [x] Halaman `/` (beranda + 3 kartu demo + sesi terbaru)
- [x] Halaman `/new` (wizard dual-CSV intake + column mapper)
- [x] Halaman `/workspace/[id]` (4-step: Ringkasan&Konfigurasi / Matching Workbench / Matriks&Waterfall / Jurnal&Audit&Ekspor)
- [x] Halaman `/history` (arsip + TanStack Table filter status)
- [x] Komponen workbench (KpiGrid, ControlsBar, SuggestedReview, UnmatchedSplit, ConfirmedMatches, ReconMatrix, Waterfall)
- [x] Komponen laporan (AdjustingJournalTable inline-edit COA, AuditLogTimeline, ExportActionBar + signoff modal)
- [x] Gate: tsc 0 error, eslint --max-warnings=0, build sukses
- [x] Semua nominal & persen pakai `font-mono tabular-nums text-right`

### Temuan & Perbaikan Fase 4 (audit mandiri)
1. **AppShell SSR error:** `usePathname` dipakai tanpa `"use client"` → build gagal. Ditambahkan direktif `"use client"`.
2. **5 warning lint** (unused vars, `?:` expression, useMemo deps) → dibersihkan agar `--max-warnings=0` lolos; `handleDelete` dibungkus `useCallback`.

## Fase 5 — Final Audit & Production Verification Gate
- [x] tsc / lint / test / build hijau
- [x] Smoke test runtime end-to-end ketiga skenario demo via API hidup: approve → klasifikasi (kunci jawaban §11) → **variance Rp 0 + isBalanced true + jurnal debit=kredit** → finalize → export PDF/Excel valid
- [x] README.md profesional (fitur, arsitektur, run lokal, switch Neon)

### Temuan & Perbaikan Fase 5 (audit mandiri) — KRITIS
1. **BUG AKUNTANSI KRITIS (ditemukan & diperbaiki):** Di `PATCH .../matches/[matchId]` (approve route), `signedAmount` penyesuaian **DISCREPANCY_MATCH dihitung terbalik** (`-absDiff`). Akibatnya saat approve transposition error BBM (B-502↔JKK-301, selisih Rp 90.000, faultSide BOOK) lewat **API hidup**, penyesuaian salah arah (−90.000) → variance audit menjadi **2× selisih = Rp 180.000** (bukan Rp 0). Unit test lolos karena helper menghitung `signedAmount = -amountDiff` dengan benar — divergensi logika antara helper & route inilah gap yang tak tertangkap test murni. **Fix:** sinkronkan route ke ground truth helper (`signedAmount = isBook ? -amountDiff : +amountDiff`, kategori mengikuti arah). Verifikasi: smoke API ketiga skenario kini **semua variance Rp 0, isBalanced true, jurnal seimbang, ekspor valid**.

## Putaran Audit Gemini ke-2 (Nov 2026)
- [x] Fix `GET /api/sessions`: variance dihitung dari penyesuaian bertanda langsung (bukan membalik `signedAmount`); unclassifiedCount hanya hitung transaksi tanpa match & tanpa adjustment.
- [x] Fix ekspor PDF/Excel: rincian item penyesuaian per baris; footer Match Rate persen betul; blok tanda tangan formal di PDF; `numFmt='0.0%'` untuk Match Rate di Excel.
- [x] Fix waterfall true floating pakai `base` asli + domain YAxis + tooltip custom.
- [x] Fix 4 UI bug: accessor string di ConfirmedMatchesTab; `faultSide` di SuggestedReviewTab; tombol manual pair disembunyikan jika sudah diklasifikasi; deskripsi penyesuaian di ReconMatrixCard; tombol PDF FINALIZED langsung unduh.
- [x] Fix PATCH match route: include `bookTx` + fallback `contraAccountName` + description informatif.
- [x] Perkuat integration test: hapus status "RECONCILED" (bukan enum); uji route handler Next.js langsung (GET sessions, PATCH BBM, export PDF/Excel).
- [x] Smart Category Suggestion helper di `src/lib/engine/suggester.ts` + pill 1-klik di UnmatchedSplitTab.
- [x] Banner Demo Audit Brief di `/workspace/[id]`.
- [x] UX `/new`: `periodEndDate` type=date + auto-isi dari tanggal terbaru; saldo akhir update otomatis saat ubah mapping balance.
- [x] Gate hijau: tsc / lint / test / build.
