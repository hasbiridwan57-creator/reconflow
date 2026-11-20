/**
 * Text normalization & similarity untuk matcher engine.
 * Lihat RECONFLOW_MASTER_SPEC.md §8.2.
 */

/** Stop-words perbankan & akuntansi Indonesia. */
const STOP_WORDS = new Set([
  "cr", "db", "dr", "trf", "transfer", "kliring", "pembayaran", "pelunasan",
  "biaya", "pt", "cv", "tbk", "autodebit", "setoran", "tagihan", "saldo",
  "bulan", "okt", "oktober", "nov", "november", "des", "desember",
  "2025", "2026", "2027", "dari", "ke", "dan", "untuk", "atas", "via",
  "pencairan", "penerimaan", "pembelian", "bayar", "rutin", "bulanan",
]);

/**
 * Normalisasi deskripsi: lowercase, karakter non-alfanumerik jadi spasi
 * (kecuali `#` dan `-` yang menyatu dengan nomor), hapus stop-words.
 */
export function normalizeDescription(text: string): string {
  if (!text) return "";

  // Lowercase + ganti non-alfanumerik (kecuali # -) jadi spasi.
  const cleaned = text.toLowerCase().replace(/[^a-z0-9#\-]/g, " ");

  // Tokenisasi, buang stop-words, buang token kosong.
  return cleaned
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
    .join(" ");
}

/**
 * Ekstrak token referensi unik (invoice/batch/cek) dari ref + desc.
 * Regex: `inv[-#]?\d+`, `bg[-#]?\d+`, `#\d{3,}`, `batch\s*\w+`, `\d{4,}`.
 * Return lowercase tanpa spasi.
 */
export function extractReferenceTokens(ref: string, desc: string): string[] {
  const combined = `${ref} ${desc}`;
  const regex = /\b(?:inv[-#]?\d+|bg[-#]?\d+|#\d{3,}|batch\s*\w+|\d{4,})\b/gi;
  const matches = combined.match(regex) ?? [];

  return matches
    .map((m) => m.toLowerCase().replace(/\s+/g, "").replace(/[-#]/g, ""))
    .filter((m) => m.length > 0);
}

/**
 * Cek apakah dua transaksi berbagi token referensi.
 * Return token yang cocok (jika ada), atau empty array.
 */
export function findSharedRef(refA: string, descA: string, refB: string, descB: string): string[] {
  const tokensA = new Set(extractReferenceTokens(refA, descA));
  const tokensB = new Set(extractReferenceTokens(refB, descB));

  const shared: string[] = [];
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      shared.push(token);
    }
  }

  return shared;
}

/** Jaccard Token Similarity: |A ∩ B| / |A ∪ B|. */
function jaccardSimilarity(normA: string, normB: string): number {
  const tokensA = new Set(normA.split(/\s+/).filter((t) => t.length > 0));
  const tokensB = new Set(normB.split(/\s+/).filter((t) => t.length > 0));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/** Dice Bigram Coefficient: 2|A ∩ B| / (|A| + |B|). */
function diceBigramSimilarity(normA: string, normB: string): number {
  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  if (bigramsA.length === 0 && bigramsB.length === 0) return 1;
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const counterA = new Map<string, number>();
  for (const bg of bigramsA) {
    counterA.set(bg, (counterA.get(bg) ?? 0) + 1);
  }
  const counterB = new Map<string, number>();
  for (const bg of bigramsB) {
    counterB.set(bg, (counterB.get(bg) ?? 0) + 1);
  }

  let intersection = 0;
  for (const [bg, countA] of counterA) {
    const countB = counterB.get(bg) ?? 0;
    intersection += Math.min(countA, countB);
  }

  return (2 * intersection) / (bigramsA.length + bigramsB.length);
}

function getBigrams(text: string): string[] {
  const cleaned = text.replace(/\s+/g, "");
  const bigrams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    bigrams.push(cleaned.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Compute text similarity: `0.6 × Jaccard + 0.4 × Dice Bigram`.
 * Return [0, 1].
 */
export function computeTextSimilarity(normA: string, normB: string): number {
  const jaccard = jaccardSimilarity(normA, normB);
  const dice = diceBigramSimilarity(normA, normB);
  return 0.6 * jaccard + 0.4 * dice;
}
