// ---------------------------------------------------------------------------
// kNN classification into a defined cluster structure
// ---------------------------------------------------------------------------

import type {
  ClassifyOptions,
  ClassifyResult,
  ClusterDef,
  LabeledItem,
  VotingStrategy,
} from "@easier-idx/core";
import { dot, normalizeVec } from "./vecmath";

// ── Built-in voting strategies ──────────────────────────────────────────

/**
 * Vote for every cluster the neighbor belongs to.
 * Use when projecting into a flat list of clusters across all granularities.
 */
export function voteAll(): VotingStrategy {
  return {
    getVotes(clusterIds) {
      return [...clusterIds];
    },
  };
}

/**
 * Vote only for clusters in the given set.
 * Use when projecting into a specific subset (e.g. domain-level clusters).
 */
export function voteSubset(validIds: ReadonlySet<string>): VotingStrategy {
  return {
    getVotes(clusterIds) {
      return clusterIds.filter((id) => validIds.has(id));
    },
  };
}

/**
 * Vote for the deepest (highest-tier) cluster the neighbor belongs to.
 * Use when projecting into a hierarchical tree structure.
 *
 * @param tiers - Map from cluster ID to tier depth (higher = deeper/more specific).
 */
export function voteDeepest(
  tiers: ReadonlyMap<string, number>,
): VotingStrategy {
  return {
    getVotes(clusterIds) {
      let bestId: string | null = null;
      let bestTier = -Infinity;
      for (const id of clusterIds) {
        const tier = tiers.get(id);
        if (tier != null && tier > bestTier) {
          bestTier = tier;
          bestId = id;
        }
      }
      return bestId != null ? [bestId] : [];
    },
  };
}

/**
 * Vote for the single most specific cluster (lowest k / highest specificity).
 *
 * @param specificity - Map from cluster ID to specificity score (higher = more specific).
 */
export function voteMostSpecific(
  specificity: ReadonlyMap<string, number>,
): VotingStrategy {
  return {
    getVotes(clusterIds) {
      let bestId: string | null = null;
      let bestSpec = -Infinity;
      for (const id of clusterIds) {
        const spec = specificity.get(id);
        if (spec != null && spec > bestSpec) {
          bestSpec = spec;
          bestId = id;
        }
      }
      return bestId != null ? [bestId] : [];
    },
  };
}

// ── Classification ──────────────────────────────────────────────────────

/**
 * Classify items into a defined cluster structure using kNN majority voting.
 *
 * 1. For each candidate, find k nearest neighbors in `labeled`.
 * 2. Each neighbor votes per the strategy (flat, tree, subset, etc.).
 * 3. The winning cluster is gated by its centroid distance threshold.
 *
 * @param candidates - New items to classify.
 * @param labeled - Already-assigned items used as kNN reference points.
 * @param clusters - The cluster structure to project into.
 * @param options - k, voting strategy.
 * @returns One ClassifyResult per candidate.
 */
export function classify(
  candidates: readonly { id: string; embedding: number[] }[],
  labeled: readonly LabeledItem[],
  clusters: readonly ClusterDef[],
  options?: ClassifyOptions,
): ClassifyResult[] {
  const k = options?.k ?? 16;
  const strategy = options?.strategy ?? voteAll();

  if (candidates.length === 0) return [];
  if (labeled.length === 0) {
    return candidates.map((c) => ({
      id: c.id,
      clusterId: null,
      distance: Infinity,
      votes: 0,
      totalVotes: 0,
      accepted: false,
    }));
  }

  // Precompute: normalize all labeled embeddings
  const labeledVecs: Float64Array[] = labeled.map((l) =>
    normalizeVec(l.embedding),
  );

  // Build centroid map
  const centroidMap = new Map<
    string,
    { vec: Float64Array; threshold: number }
  >();
  for (const cluster of clusters) {
    centroidMap.set(cluster.id, {
      vec: normalizeVec(cluster.centroid),
      threshold: cluster.threshold ?? Infinity,
    });
  }

  const results: ClassifyResult[] = [];

  for (const candidate of candidates) {
    const candVec = normalizeVec(candidate.embedding);

    // Find k nearest labeled neighbors
    const sims: { idx: number; sim: number }[] = [];
    for (let i = 0; i < labeledVecs.length; i++) {
      sims.push({ idx: i, sim: dot(candVec, labeledVecs[i]) });
    }
    sims.sort((a, b) => b.sim - a.sim);
    const topK = sims.slice(0, k);

    // Tally votes
    const votes = new Map<string, number>();
    let totalVotes = 0;

    for (const { idx } of topK) {
      const neighborClusters = labeled[idx].clusterIds;
      const votedFor = strategy.getVotes(neighborClusters);
      for (const cid of votedFor) {
        // Only count votes for clusters that exist in our structure
        if (centroidMap.has(cid)) {
          votes.set(cid, (votes.get(cid) ?? 0) + 1);
          totalVotes++;
        }
      }
    }

    // Find winner
    let bestId: string | null = null;
    let bestVotes = 0;
    for (const [cid, count] of votes) {
      if (count > bestVotes) {
        bestVotes = count;
        bestId = cid;
      }
    }

    // Check distance threshold
    if (bestId != null) {
      const cluster = centroidMap.get(bestId)!;
      const distance = 1 - dot(candVec, cluster.vec);
      const accepted = distance <= cluster.threshold;

      results.push({
        id: candidate.id,
        clusterId: accepted ? bestId : null,
        distance,
        votes: bestVotes,
        totalVotes,
        accepted,
      });
    } else {
      results.push({
        id: candidate.id,
        clusterId: null,
        distance: Infinity,
        votes: 0,
        totalVotes,
        accepted: false,
      });
    }
  }

  return results;
}
