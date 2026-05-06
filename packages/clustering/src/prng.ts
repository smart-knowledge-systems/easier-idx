// ---------------------------------------------------------------------------
// Seeded PRNG (xoshiro128**) — shared between kmeans variants
// ---------------------------------------------------------------------------

/**
 * Create a deterministic [0, 1) random number generator from an integer seed.
 *
 * Uses xoshiro128** with a 4-word state derived from the seed. The same seed
 * always produces the same sequence, so callers driving multi-run k-means at
 * a higher level can reproduce internal runs by passing `baseSeed + runIndex`.
 */
export function createRng(seed: number): () => number {
  let s0 = seed >>> 0 || 1;
  let s1 = (seed * 2654435761) >>> 0 || 1;
  let s2 = (seed * 2246822519) >>> 0 || 1;
  let s3 = (seed * 3266489917) >>> 0 || 1;
  return () => {
    const result = (((s1 * 5) << 7) | ((s1 * 5) >>> 25)) * 9;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);
    return (result >>> 0) / 4294967296;
  };
}
