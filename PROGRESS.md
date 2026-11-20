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
- [ ] `src/lib/engine/parser.ts`
- [ ] `src/lib/engine/textSimilarity.ts`
- [ ] `src/lib/engine/matcher.ts` (3-Pass)
- [ ] `src/lib/engine/calculator.ts`
- [ ] `src/lib/engine/journals.ts`
- [ ] `src/lib/demo/scenarios.ts` (3 dataset CSV)
- [ ] tests: engine.parser, engine.matcher, scenarios.e2e
- [ ] Gate: `npm run test` 100% PASS (3 skenario variance Rp 0)

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
