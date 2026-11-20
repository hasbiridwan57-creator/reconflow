import { describe, it, expect } from "vitest";
import {
  parseIndonesianCurrency,
  parseFlexibleDate,
  dateDiffDays,
  inferDirection,
  inferAmount,
  detectColumnMapping,
} from "@/lib/engine/parser";

describe("parseIndonesianCurrency", () => {
  it("parses titik ribuan", () => {
    expect(parseIndonesianCurrency("12.450.000")).toBe(12450000);
  });

  it("parses format US dengan koma ribuan & titik desimal", () => {
    expect(parseIndonesianCurrency("12,450,000.00")).toBe(12450000);
  });

  it("parses dengan prefix Rp", () => {
    expect(parseIndonesianCurrency("Rp 12.450.000")).toBe(12450000);
  });

  it("parses desimal koma Indonesia", () => {
    expect(parseIndonesianCurrency("12.450.000,50")).toBe(12450001);
  });

  it("kurung akuntansi = negatif", () => {
    expect(parseIndonesianCurrency("(500.000)")).toBe(-500000);
  });

  it("kosong & strip jadi 0", () => {
    expect(parseIndonesianCurrency("")).toBe(0);
    expect(parseIndonesianCurrency("-")).toBe(0);
    expect(parseIndonesianCurrency(null)).toBe(0);
    expect(parseIndonesianCurrency(undefined)).toBe(0);
  });

  it("number input dibulatkan", () => {
    expect(parseIndonesianCurrency(12450.6)).toBe(12451);
    expect(parseIndonesianCurrency(-999.4)).toBe(-999);
  });
});

describe("parseFlexibleDate", () => {
  it("YYYY-MM-DD langsung", () => {
    expect(parseFlexibleDate("2026-10-05")).toBe("2026-10-05");
  });

  it("DD/MM/YYYY", () => {
    expect(parseFlexibleDate("05/10/2026")).toBe("2026-10-05");
  });

  it("DD-MM-YYYY", () => {
    expect(parseFlexibleDate("15-10-2026")).toBe("2026-10-15");
  });

  it("YYYY/MM/DD", () => {
    expect(parseFlexibleDate("2026/10/31")).toBe("2026-10-31");
  });

  it("invalid jadi null", () => {
    expect(parseFlexibleDate("bukan tanggal")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });
});

describe("dateDiffDays", () => {
  it("selisih 1 hari", () => {
    expect(dateDiffDays("2026-10-16", "2026-10-15")).toBe(1);
  });

  it("selisih 0 jika sama", () => {
    expect(dateDiffDays("2026-10-15", "2026-10-15")).toBe(0);
  });

  it("negatif jika b lebih besar", () => {
    expect(dateDiffDays("2026-10-15", "2026-10-16")).toBe(-1);
  });
});

describe("inferDirection & inferAmount", () => {
  it("BANK: kredit_masuk > 0 = IN", () => {
    expect(inferDirection("BANK", 0, 14500000)).toBe("IN");
    expect(inferAmount(0, 14500000)).toBe(14500000);
  });

  it("BANK: debit_keluar > 0 = OUT", () => {
    expect(inferDirection("BANK", 8200000, 0)).toBe("OUT");
    expect(inferAmount(8200000, 0)).toBe(8200000);
  });

  it("BOOK: debit_masuk > 0 = IN", () => {
    expect(inferDirection("BOOK", 14500000, 0)).toBe("IN");
    expect(inferAmount(14500000, 0)).toBe(14500000);
  });

  it("BOOK: kredit_keluar > 0 = OUT", () => {
    expect(inferDirection("BOOK", 0, 8200000)).toBe("OUT");
    expect(inferAmount(0, 8200000)).toBe(8200000);
  });
});

describe("detectColumnMapping", () => {
  it("deteksi header bank standar", () => {
    const m = detectColumnMapping(["tanggal", "no_referensi", "keterangan", "debit_keluar", "kredit_masuk", "saldo"]);
    expect(m.date).toBe("tanggal");
    expect(m.reference).toBe("no_referensi");
    expect(m.description).toBe("keterangan");
    expect(m.balance).toBe("saldo");
  });

  it("deteksi header book standar", () => {
    const m = detectColumnMapping(["tanggal", "no_bukti", "deskripsi", "akun_lawan", "debit_masuk", "kredit_keluar", "saldo"]);
    expect(m.reference).toBe("no_bukti");
    expect(m.counterAccount).toBe("akun_lawan");
  });

  it("header tak dikenal jadi null", () => {
    const m = detectColumnMapping(["kolom1", "kolom2"]);
    expect(m.date).toBeNull();
  });
});
