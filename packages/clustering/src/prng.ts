// ---------------------------------------------------------------------------
// Seeded PRNG (xoshiro128**) — shared between kmeans variants
// ---------------------------------------------------------------------------

const MIX_K = 0x9e3779b97f4a7c15n;
const M1 = 0xbf58476d1ce4e5b9n;
const M2 = 0x94d049bb133111ebn;
const MASK64 = 0xffffffffffffffffn;

function splitmix(x: bigint): bigint {
  let v = x & MASK64;
  v = ((v ^ (v >> 30n)) * M1) & MASK64;
  v = ((v ^ (v >> 27n)) * M2) & MASK64;
  return (v ^ (v >> 31n)) & MASK64;
}

/**
 * SplitMix64 finalizer (Steele/Lea/Flood 2014) over (master, k, run).
 * Bit-identical to `mix_seed` in `metal/paradigmap-projector/src/kmeans.rs`.
 */
export function mixSeed64(master: bigint, k: bigint, run: bigint): bigint {
  const inner = splitmix((master ^ ((k * MIX_K) & MASK64)) & MASK64);
  return splitmix((inner ^ run) & MASK64);
}

/**
 * Derive a deterministic 32-bit seed for `createRng` from (master, k, run).
 * Internally computes the full 64-bit SplitMix64 mix and folds high/low
 * halves so all 64 bits of entropy influence the result.
 */
export function mixSeed(master: number, k: number, run: number): number {
  const mixed = mixSeed64(BigInt(master), BigInt(k), BigInt(run));
  const low = Number(mixed & 0xffffffffn);
  const high = Number((mixed >> 32n) & 0xffffffffn);
  return (low ^ high) >>> 0;
}

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
