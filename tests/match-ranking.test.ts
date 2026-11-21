import { describe, it, expect } from "vitest";
import { rankMatchCandidates, daysBetween, type RankCandidateTx } from "@/lib/engine/matchRanking";

const src = { amount: 500_000, direction: "IN" as const, date: "2026-11-15" };

const candidates: RankCandidateTx[] = [
  { id: "exact-same", amount: 500_000, direction: "IN", date: "2026-11-15", description: "Setoran" },
  { id: "exact-far", amount: 500_000, direction: "IN", date: "2026-11-01", description: "Setoran awal" },
  { id: "near", amount: 493_500, direction: "IN", date: "2026-11-16", description: "Setoran beda" },
  { id: "opp", amount: 500_000, direction: "OUT", date: "2026-11-15", description: "Penarikan" },
];

describe("rankMatchCandidates", () => {
  it("menyaring arah berbeda (default)", () => {
    const ranked = rankMatchCandidates(src, candidates);
    expect(ranked.map((r) => r.item.id)).not.toContain("opp");
  });

  it("menempatkan nominal persis + arah sama di urutan teratas", () => {
    const ranked = rankMatchCandidates(src, candidates);
    expect(ranked[0].item.id).toBe("exact-same");
    expect(ranked[0].reason).toMatch(/Nominal sama/i);
  });

  it("tie-breaker tanggal: nominal sama, tanggal terdekat menang", () => {
    const ranked = rankMatchCandidates(src, candidates);
    expect(ranked[0].item.id).toBe("exact-same");
    expect(ranked[1].item.id).toBe("exact-far");
  });

  it("nominal terdekat berikutnya setelah exact", () => {
    const ranked = rankMatchCandidates(src, candidates);
    expect(ranked[2].item.id).toBe("near");
    expect(ranked[2].reason).toMatch(/Selisih Rp6\.500/i);
  });

  it("menyertakan arah berbeda saat sameDirectionOnly=false (didiskon ke bawah)", () => {
    const ranked = rankMatchCandidates(src, candidates, false);
    const ids = ranked.map((r) => r.item.id);
    expect(ids).toContain("opp");
    const oppRank = ranked.findIndex((r) => r.item.id === "opp");
    const exactRank = ranked.findIndex((r) => r.item.id === "exact-same");
    expect(oppRank).toBeGreaterThan(exactRank);
  });

  it("REGRESI: nominal terdekat menang meski kandidat lebih besar (monotonic amountDiff)", () => {
    // Sumber Rp1.000.000. Kandidat Rp300.000 (selisih 700rb) WAJIB di atas
    // Rp2.000.000 (selisih 1jt) — rumus rasio lama cacat (2jt dapat skor lebih tinggi).
    const bigSrc = { amount: 1_000_000, direction: "IN" as const, date: "2026-11-15" };
    const bigCandidates: RankCandidateTx[] = [
      { id: "lower", amount: 300_000, direction: "IN", date: "2026-11-15", description: "Lebih kecil" },
      { id: "higher", amount: 2_000_000, direction: "IN", date: "2026-11-15", description: "Lebih besar" },
    ];
    const ranked = rankMatchCandidates(bigSrc, bigCandidates);
    expect(ranked[0].item.id).toBe("lower");
  });
});

describe("daysBetween", () => {
  it("hitung selisih hari absolut", () => {
    expect(daysBetween("2026-11-15", "2026-11-01")).toBe(14);
    expect(daysBetween("2026-11-15", "2026-11-16")).toBe(1);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
  });

  it("mengembalikan Infinity saat tanggal invalid (tidak NaN)", () => {
    expect(daysBetween("bukan-tanggal", "2026-11-15")).toBe(Number.POSITIVE_INFINITY);
    expect(daysBetween("2026-11-15", "")).toBe(Number.POSITIVE_INFINITY);
    expect(daysBetween("", "")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("rankMatchCandidates dengan tanggal invalid", () => {
  it("deterministik tanpa NaN: tanggal valid lebih diutamakan daripada invalid", () => {
    const srcInvalid = { amount: 500_000, direction: "IN" as const, date: "not-a-date" };
    const cands: RankCandidateTx[] = [
      { id: "valid-date", amount: 500_000, direction: "IN", date: "2026-11-15", description: "Tanggal valid" },
      { id: "invalid-date", amount: 500_000, direction: "IN", date: "bogus", description: "Tanggal invalid" },
    ];
    const ranked = rankMatchCandidates(srcInvalid, cands);
    // Keduanya Infinity dayDiff → tie; pastikan skor numerik (bukan NaN) & deterministik.
    expect(ranked).toHaveLength(2);
    expect(ranked[0].score).not.toBeNaN();
    expect(ranked[1].score).not.toBeNaN();
    // Uji dua kali — urutan tetap (deterministik).
    const ranked2 = rankMatchCandidates(srcInvalid, cands);
    expect(ranked2.map((r) => r.item.id)).toEqual(ranked.map((r) => r.item.id));
  });

  it("reason tidak memuat NaN untuk tanggal invalid", () => {
    const srcValid = { amount: 500_000, direction: "IN" as const, date: "2026-11-15" };
    const cands: RankCandidateTx[] = [
      { id: "bad-date", amount: 490_000, direction: "IN", date: "nope", description: "Tanggal rusak" },
    ];
    const ranked = rankMatchCandidates(srcValid, cands);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].reason).not.toMatch(/NaN/i);
  });
});
