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
- [ ] `src/lib/export/pdfGenerator.ts`
- [ ] `src/lib/export/excelGenerator.ts`
- [ ] 16 endpoint REST API + Zod + transaksi atomik + AuditLog
- [ ] `src/lib/api/client.ts` + `response.ts`
- [ ] Gate: tsc 0 error

## Fase 4 — Enterprise UI/UX & 4-Step Workspace
- [ ] AppShell, LiveReconStickyBar
- [ ] Halaman `/`, `/new`, `/workspace/[id]` (4 step), `/history`
- [ ] Gate: tsc 0 error, build sukses, responsif, mono tabular-nums

## Fase 5 — Final Audit & Production Verification Gate
- [ ] tsc / lint / test / build hijau
- [ ] Smoke test runtime (demo audit → GET session → export PDF/Excel 200)
- [ ] README.md profesional (fitur, arsitektur, run lokal, switch Neon)
