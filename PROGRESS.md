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

## Migrasi PostgreSQL (Neon) + Deployment — TAHAP 1
- [x] **Prisma → PostgreSQL**: datasource provider `sqlite`→`postgresql` (url tetap `env(DATABASE_URL)`).
- [x] **package.json**: `postinstall: prisma generate`; `build: prisma generate && next build` (hapus `--turbopack` agar stabil di Vercel serverless).
- [x] **Case-insensitive search**: `GET /api/sessions` pakai `Prisma.ReconciliationSessionWhereInput` + `mode: "insensitive"` (filter companyName/bankAccountName).
- [x] **Test bebas-DB**: hapus override `DATABASE_URL` di `vitest.config.ts`; suite integrasi di-`describe.skipIf(!TEST_DATABASE_URL)`; hapus cleanup `fs.unlinkSync`. `npm run test` → 97 pass + 1 skipped (tanpa perlu DB).
- [x] **Repo hygiene**: `.gitignore` (`.env*`, `.DS_Store`, `prisma/*.db*`); buat `.env.example`. Tidak ada secret di git.
- [x] Gate lokal: prisma validate ✅ · generate ✅ · tsc 0 ✅ · lint 0 ✅ · test 97+1skip ✅ · build ✅

## Putaran R7 — Isolasi DB Test + Banner Reopen (Gemini audit `bdfd27d`)
- [x] **Fix isolasi DB test (akar: hoisting ESM)** — `DATABASE_URL` test dipindah ke `vitest.config.ts` (`test.env`) sehingga ter-set SEBELUM modul mana pun dievaluasi; `@/lib/db` (via `@/lib/session`) kini memakai DB test, bukan dev.db. `TEST_DB_PATH` test dibaca dari env (deterministik, sinkron db push & cleanup). Bukti: `npm run test` TIDAK mengubah `prisma/dev.db` (md5 identik sebelum/sesudah).
- [x] **Bersihkan prisma/dev.db** — hapus 133 sesi sampah (semua punya demoScenarioKey, 16 di antaranya status `RECONCILED` tak-valid bekas test lama) via DELETE FK-safe (anak dulu). Sidebar "Rekening Aktif" kembali bersih. Backup di /tmp.
- [x] **Banner info terkunci + tombol REOPEN** (`ReconciliationDesk`) — saat FINALIZED tampil banner amber ramping di paling atas kolom kiri: "Sesi ini telah difinalisasi dan dikunci (read-only)" + tombol 1-klik "Buka Kembali Sesi" (`api.finalize(id,{action:"REOPEN"})`). Terverifikasi browser: klik → status kembali DRAFT, banner hilang.
- [x] Gate: tsc 0 → lint 0 → **test 107/107** → build 17 route; dev.db tetap bersih setelah test.

## Putaran R6 — Bug Fungsional & Polish (Gemini audit `1b8b62e`)
- [x] **LedgerExplorer** — fix search: nominal hanya dicocokkan jika ada digit (`digits.length > 0`); ConfirmedTable kini cari tanggal + nominal + referensi
- [x] **LedgerExplorer** — fix `adjMap` key dari `a.transactionId` → `a.id` sehingga pill "Penyesuaian: [Kategori]" tampil benar
- [x] **LedgerExplorer** — tambah kolom **Sumber** (BANK sky / BUKU violet) di tabel non-confirmed
- [x] **Hitungan tersisa konsisten** — `actionableRemaining` = match tak-confirmed + unmatched tanpa adjustment; dipakai KPI "Perlu Tindakan", badge Tab 1, & pesan BalanceMirror (tak ada lagi double-counting)
- [x] **KPI Jurnal** — sub-label kondisional `isDoubleEntryBalanced ? "Debit = Kredit" : "Tidak Seimbang"`
- [x] **Tombol Ekspor PDF** header — jadi link unduh langsung di SEMUA status (DRAFT/BALANCED/FINALIZED)
- [x] **ReconMatrixCard** — subtotal double-underline di akhir Bagian A (Saldo Bank Disesuaikan) & Bagian B (Saldo Buku Disesuaikan)
- [x] **Polish** — `focus:border-indigo-500`→teal-500; Waterfall `CartesianGrid` halus; sisa `rounded-xl`→`rounded-lg` di 6 file
- [x] Gate: tsc 0 → lint 0 → **test 107/107** → build 17 route hijau

## Bright Modern Treasury — Visual Upgrade (Gemini audit #5)
- [x] **Design system**: globals.css → "Bright Modern Treasury" (alabaster canvas #F8FAFC, primary teal-600, status semantik emerald/amber/rose).
- [x] **AppShell**: sidebar putih permanen (w-64, border-r) + mobile slide-over drawer; Brand header (Wallet teal + ReconFlow + Treasury Workspace); Primary CTA "+ Rekonsiliasi Baru"; menu Beranda/Arsip; seksi **REKENING AKTIF** multi-account switcher (titik status, nama perusahaan, sub-rekening+periode, badge match%, highlight aktif teal); footer badge "Double-Entry · Audit-Ready".
- [x] **Live sync sidebar**: helper `notifySessionsChanged()` di client.ts memicu event `reconflow:sessions-changed` setelah tiap mutasi sesi (createDemo/createSession/approveMatch/approveAllSuggested/createAdjustment/createBulkAdjustments/deleteAdjustment/deleteMatch/manualPair/finalize/deleteSession). Sidebar mendengarkan & me-refresh otomatis.
- [x] **Workspace header eksekutif**: breadcrumb + judul rekening+periode + badge status semantik + chip Demo; CTA cepat (PDF unduh langsung saat FINALIZED / buka tab laporan bila belum; Excel; Pengaturan). **6-Metric KPI Strip** (Mutasi Bank/Buku, Match Rate, Perlu Tindakan, Jurnal, Check). **Underline tabs** teal (Meja Rekonsiliasi dengan counter/centang + Laporan & Ledger Audit).
- [x] **Tab 2 = Executive Audit Cockpit**: ReconMatrixCard jadi **statement terpadu** (A. Sisi Bank / B. Sisi Buku + double-underline + baris CHECK `bg-emerald-50 border-t-2 border-emerald-500`); WaterfallChart warna teal/emerald/rose/teal-700; grid halus + label X terbaca.
- [x] **LedgerExplorer (komponen baru)**: 4 sub-tab underline dengan counter (Belum Cocok/Terkonfirmasi/Semua Bank/Semua Buku) + search real-time + kolom padat (Tanggal/Referensi/Keterangan/Arah/Nominal/Status pill semantik) + tab Terkonfirmasi menampilkan pasangan Bank↔Buku + Confidence.
- [x] **Layout Tab 2**: Baris 1 grid xl:col-7 Matrix + xl:col-5 Waterfall; Baris 2 LedgerExplorer; Baris 3 xl:col-8 Jurnal + xl:col-4 (ExportActionBar di atas AuditLogTimeline max-h-96 overflow).
- [x] **Polish Tab 1 / Home / /new / /history**: seluruh aksen indigo-600/indigo-50 → teal-600/teal-50; CTA `bg-slate-900` → `bg-teal-600/700`; kartu rounded-xl → rounded-lg + subtle shadow; angka finansial tetap mono tabular-nums text-right.
- [x] **Sinkronisasi warna ekspor**: PDF header `[79,70,229]` → `[15,118,110]` (Crisp Deep Teal); Excel `FF4F46E5` → `FF0F766E`; PDF Jurnal tetap `[5,150,105]` (Emerald Teal).
- [x] Gate hijau (zero regression — 107 test lulus): tsc 0 / lint 0 / test 107/107 / build 17 route.

## Putaran Final Polish (Gemini audit #4)
- [x] **Fix kartu anomali**: komponen `AnomalyTxCard` baru untuk unmatched `isAnomaly` (border-rose + badge ANOMALI + `suggestion.reason` + tombol 1-klik `{getCategoryLabel} · {impactLabel}`); `RoutineCard` terima prop `selected` untuk highlight manual pair.
- [x] **Cermin Saldo**: baris Jurnal Penyesuaian pakai `data.journals.isDoubleEntryBalanced` (→ "Debit = Kredit" / "Tidak Seimbang"), bukan `s.isBalanced`.
- [x] **Tombol bulk akurat**: `smartRoutineItems` (useMemo, sug ≠ null & !isAnomaly) dipakai konsisten untuk syarat `>= 2`, label jumlah, & payload `applyAllSmart`.
- [x] **Manual pair UX**: floating pill saat 1 sisi terpilih ("1 transaksi [Bank/Buku] terpilih — pilih pasangan di sisi lawan" + Batal); ring highlight indigo pada kartu terpilih; pilihan `<select>` Kesalahan Buku/Bank saat `manualDiff ≠ 0`.
- [x] **AnomalyCard (DISCREPANCY_MATCH)**: tampilkan `match.reasons`, tombol `Tolak` (REJECT), input akun lawan opsional saat `faultSide === BOOK`.
- [x] **AdjustmentList**: klik "Batalkan" pada penyesuaian dengan `matchPairId` memanggil `api.deleteMatch` (unmatch + hapus adj) — tak menyisakan DISCREPANCY_MATCH tanpa koreksi.
- [x] **Backend bulk route**: urutan cek 422 (validation, transaksi bukan milik sesi) SEBELUM 409 (eligibility).
- [x] **README + PROGRESS** disegarkan: 14 REST endpoint, 2-Tab Inbox Zero + Cermin Saldo, deteksi anomali Double Charge & Transposition Error, 107 test.
- [x] Gate hijau: tsc 0 / lint 0 / test 107/107 / build 17 route.

## Redesign UX 2-Tab + Inbox Zero + Cermin Saldo (Gemini audit #3)
- [x] **Fix PDF**: `bankRows` 3 kolom penuh (nominal tak bergeser); posisi blok tanda tangan dinamis dari `lastAutoTable.finalY` (auto addPage bila muat); footer status dipindah ke paling akhir (tak menabrak jurnal).
- [x] **Helper `adjustments.ts`**: `BANK_CATEGORIES`, `POSITIVE_CATEGORIES`, `defaultContraAccount`, `buildAdjustmentFields`, `getAdjustmentImpactLabel` terpusat (Zero Drift) — dipakai POST/PATCH/bulk adjustments.
- [x] **Upgrade suggester**: interface `CategorySuggestion` (category + reason + impactLabel + isAnomaly); deteksi double charge (B-507↔B-506), unknown charge (B-510); urutan deteksi wajib — `"biaya"/"admin"` dicek SEBELUM `"nsf"` agar B-505 → BANK_FEE.
- [x] **2 endpoint bulk atomik**: `POST /matches/approve-all` (hanya SUGGESTED_MATCH, DISCREPANCY_MATCH tak disentuh); `POST /adjustments/bulk` (validasi + `$transaction` + 409 bila semua sudah terpakai / FINALIZED). Shared Zod `BulkCreateAdjustmentsSchema` + API client `approveAllSuggested` & `createBulkAdjustments`.
- [x] **Workspace 2 tab**: hapus 4 stepper, 3 sub-tab bersarang, 4 KPI card, LiveReconStickyBar, DemoAuditBrief. Header ringkas + 2 tab (Meja Rekonsiliasi / Laporan & Ekspor) + drawer Pengaturan (metadata + MatchingControlsBar).
- [x] **Meja Rekonsiliasi (Inbox Zero)**: progress bar tunggal; Seksi 1 Perlu Perhatian Audit (discrepancy + anomaly); Seksi 2 Saran Pasangan (Setujui Semua); Seksi 3 Sisa Rutin (filter + Terapkan Semua Saran Cerdas + tombol utama indigo + dropdown dampak); state Inbox Zero Achieved (kartu emerald); 2 accordion (Penyesuaian Tercatat + Transaksi Sudah Cocok).
- [x] **Cermin Saldo (sticky)**: badge BALANCED/BELUM, selisih besar, ringkasan Sisi Bank & Buku vertikal, mini stats, CTA kontekstual.
- [x] **`/new` 2 langkah**: dual dropzone + status auto-deteksi; column mapper & preview disembunyikan dalam accordion (auto-terbuka bila kolom wajib gagal terdeteksi).
- [x] **Test**: suggester (8 test — B-504/B-505/B-506/B-507/B-510); integration (approve-all, bulk 201+409, PDF skenario 3); total **107 test**.
- [x] Gate hijau: tsc 0 / lint 0 / test 107/107 / build 17 route.

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
