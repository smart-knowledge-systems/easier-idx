// ---------------------------------------------------------------------------
// Cluster description helpers — prepares inputs for LLM-based labeling
//
// STEERING #1: No generation. These functions select representative items
// and extract keywords — the consumer provides the LLM call.
// ---------------------------------------------------------------------------

import type { Cluster } from "@easier-idx/core";

/**
 * Sample representative document IDs from a cluster for description.
 *
 * Returns two groups:
 * - `nearCentroid`: items closest to the centroid (most typical)
 * - `atMode`: items near the mode distance (most representative of spread)
 *
 * @param cluster - The cluster to sample from.
 * @param items - All items with embeddings (superset of cluster members).
 * @param options - How many to sample from each group.
 * @returns Sampled item IDs from each group.
 */
export function sampleRepresentative(
  cluster: Cluster,
  items: readonly { id: string; embedding: number[] }[],
  options?: { nearCentroid?: number; atMode?: number },
): { nearCentroid: string[]; atMode: string[] } {
  const { nearCentroid: nNear = 5, atMode: nMode = 10 } = options ?? {};

  const memberSet = new Set(cluster.memberIds);
  const centroid = new Float64Array(cluster.centroid);

  // Normalize centroid
  let norm = 0;
  for (let i = 0; i < centroid.length; i++) norm += centroid[i] * centroid[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < centroid.length; i++) centroid[i] /= norm;

  // Compute distances for members
  const distances: { id: string; distance: number }[] = [];
  for (const item of items) {
    if (!memberSet.has(item.id)) continue;

    const v = new Float64Array(item.embedding);
    let vn = 0;
    for (let i = 0; i < v.length; i++) vn += v[i] * v[i];
    vn = Math.sqrt(vn);
    if (vn > 0) for (let i = 0; i < v.length; i++) v[i] /= vn;

    let d = 0;
    for (let i = 0; i < v.length; i++) d += v[i] * centroid[i];
    distances.push({ id: item.id, distance: 1 - d });
  }

  distances.sort((a, b) => a.distance - b.distance);

  // Near centroid: take the closest
  const nearCentroidIds = distances.slice(0, nNear).map((d) => d.id);

  // At mode: find the mode distance (peak of histogram), sample around it
  const modeIds = sampleAroundMode(distances, nMode);

  return { nearCentroid: nearCentroidIds, atMode: modeIds };
}

/**
 * Extract top terms from a collection of texts using simple frequency analysis.
 *
 * Tokenizes, removes stopwords, and returns the most frequent terms.
 * Useful for building keyword context to include in an LLM prompt.
 *
 * @param texts - Text content from cluster members.
 * @param options - How many terms to return.
 * @returns Top terms sorted by frequency.
 */
export function extractTopTerms(
  texts: readonly string[],
  options?: { limit?: number },
): string[] {
  const { limit = 20 } = options ?? {};

  const freq = new Map<string, number>();

  for (const text of texts) {
    const tokens = tokenize(text);
    const seen = new Set<string>(); // count each term once per document
    for (const token of tokens) {
      if (!seen.has(token)) {
        seen.add(token);
        freq.set(token, (freq.get(token) ?? 0) + 1);
      }
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

// ── Internal helpers ────────────────────────────────────────────────────

function sampleAroundMode(
  sorted: { id: string; distance: number }[],
  n: number,
): string[] {
  if (sorted.length <= n) return sorted.map((d) => d.id);

  // Simple histogram to find mode distance
  const nBins = Math.min(20, Math.ceil(sorted.length / 5));
  const minDist = sorted[0].distance;
  const maxDist = sorted[sorted.length - 1].distance;
  const range = maxDist - minDist;

  if (range === 0) return sorted.slice(0, n).map((d) => d.id);

  const binWidth = range / nBins;
  const bins = new Int32Array(nBins);

  for (const { distance } of sorted) {
    const bin = Math.min(
      Math.floor((distance - minDist) / binWidth),
      nBins - 1,
    );
    bins[bin]++;
  }

  // Find peak bin
  let peakBin = 0;
  for (let i = 1; i < nBins; i++) {
    if (bins[i] > bins[peakBin]) peakBin = i;
  }

  const modeDist = minDist + (peakBin + 0.5) * binWidth;

  // Sort by distance to mode, take closest n
  const byModeProximity = sorted
    .map((d) => ({ ...d, modeGap: Math.abs(d.distance - modeDist) }))
    .sort((a, b) => a.modeGap - b.modeGap);

  return byModeProximity.slice(0, n).map((d) => d.id);
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "not",
  "no",
  "so",
  "if",
  "as",
  "we",
  "our",
  "they",
  "their",
  "them",
  "he",
  "she",
  "his",
  "her",
  "i",
  "my",
  "me",
  "you",
  "your",
  "about",
  "which",
  "who",
  "whom",
  "what",
  "when",
  "where",
  "how",
  "than",
  "then",
  "also",
  "just",
  "more",
  "most",
  "very",
  "only",
  "some",
  "such",
  "each",
  "all",
  "both",
  "into",
  "over",
  "after",
  "before",
  "between",
  "through",
  "during",
  "without",
  "within",
  "along",
  "among",
  "because",
  "while",
  "since",
  "until",
  "although",
  "though",
  "however",
  "other",
  "another",
  "much",
  "many",
  "well",
  "even",
  "still",
  "already",
  "often",
  "here",
  "there",
  "up",
  "out",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}
