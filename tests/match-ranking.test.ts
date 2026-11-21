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
});

describe("daysBetween", () => {
  it("hitung selisih hari absolut", () => {
    expect(daysBetween("2026-11-15", "2026-11-01")).toBe(14);
    expect(daysBetween("2026-11-15", "2026-11-16")).toBe(1);
    expect(daysBetween("2026-11-15", "2026-11-15")).toBe(0);
  });
});
