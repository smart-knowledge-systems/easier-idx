// ---------------------------------------------------------------------------
// Cluster module types
// ---------------------------------------------------------------------------

/** A single cluster with its centroid and member assignments. */
export interface Cluster {
  readonly id: string;
  readonly centroid: number[];
  readonly memberIds: readonly string[];
  readonly size: number;
}

/** An individual document's cluster assignment. */
export interface ClusterAssignment {
  readonly id: string;
  readonly clusterId: string;
  /** Cosine distance (1 - similarity) to the assigned centroid. */
  readonly distance: number;
}

/** Full result of a clustering run. */
export interface ClusterResult {
  readonly k: number;
  readonly clusters: readonly Cluster[];
  readonly assignments: readonly ClusterAssignment[];
  readonly silhouette: number;
  readonly iterations: number;
  readonly converged: boolean;
}

/** Options for k-means. All optional — progressive disclosure. */
export interface KMeansOptions {
  /** Maximum Lloyd iterations before stopping. Default 100. */
  readonly maxIterations?: number;
  /** Run k-means N times, return the best (lowest inertia). Default 1. */
  readonly runs?: number;
  /** Seed for deterministic initialization. */
  readonly seed?: number;
  /** Called after each iteration with current inertia. */
  readonly onProgress?: (iteration: number, inertia: number) => void;
}

// ---------------------------------------------------------------------------
// Classification types
// ---------------------------------------------------------------------------

/** A cluster definition for classification (centroid + acceptance boundary). */
export interface ClusterDef {
  readonly id: string;
  readonly centroid: number[];
  /** Max cosine distance for acceptance (e.g. p95). Omit to accept all. */
  readonly threshold?: number;
}

/** A pre-assigned (labeled) item used as a kNN reference point. */
export interface LabeledItem {
  readonly id: string;
  readonly embedding: number[];
  /** Cluster IDs this item belongs to (can span multiple granularities). */
  readonly clusterIds: readonly string[];
}

/** Controls how kNN neighbors cast their votes into a cluster structure. */
export interface VotingStrategy {
  /** Given a neighbor's cluster memberships, return the cluster IDs to vote for. */
  getVotes(clusterIds: readonly string[]): string[];
}

/** Result of classifying a single item into a cluster structure. */
export interface ClassifyResult {
  readonly id: string;
  /** Winning cluster ID, or null if no cluster accepted. */
  readonly clusterId: string | null;
  /** Cosine distance to winning centroid. Infinity if rejected. */
  readonly distance: number;
  /** Votes received by the winning cluster. */
  readonly votes: number;
  /** Total votes cast across all clusters. */
  readonly totalVotes: number;
  /** Whether the item was within the cluster's distance threshold. */
  readonly accepted: boolean;
}

/** Options for kNN classification. */
export interface ClassifyOptions {
  /** Number of nearest neighbors to consider. Default 16. */
  readonly k?: number;
  /** Voting strategy. Default: voteAll(). */
  readonly strategy?: VotingStrategy;
}

// ---------------------------------------------------------------------------
// Provider interface — for delegating to a remote/worker implementation
// ---------------------------------------------------------------------------

/** Pluggable clustering backend (e.g. Rust worker, Cloudflare Worker). */
export interface ClusterProvider {
  cluster(
    items: { id: string; embedding: number[] }[],
    k: number,
    options?: KMeansOptions,
  ): Promise<ClusterResult>;
}
