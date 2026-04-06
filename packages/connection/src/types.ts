export interface SimilarityItem {
  readonly id: string;
  readonly embedding: number[];
}

export interface SimilarityPair {
  readonly aId: string;
  readonly bId: string;
  readonly similarity: number;
}
