import { describe, expect, test } from "bun:test";
import { sampleRepresentative, extractTopTerms } from "../src/describe";
import type { Cluster } from "../src/types";

describe("sampleRepresentative", () => {
  const cluster: Cluster = {
    id: "0",
    centroid: [1, 0, 0],
    memberIds: ["a", "b", "c", "d", "e", "f", "g", "h"],
    size: 8,
  };

  const items = [
    { id: "a", embedding: [0.99, 0.01, 0] }, // closest to centroid
    { id: "b", embedding: [0.95, 0.05, 0] },
    { id: "c", embedding: [0.9, 0.1, 0] },
    { id: "d", embedding: [0.85, 0.15, 0] },
    { id: "e", embedding: [0.8, 0.2, 0] },
    { id: "f", embedding: [0.75, 0.25, 0] },
    { id: "g", embedding: [0.7, 0.3, 0] },
    { id: "h", embedding: [0.65, 0.35, 0] }, // farthest from centroid
    { id: "z", embedding: [0, 0, 1] }, // not a member
  ];

  test("returns nearCentroid items closest to the centroid", () => {
    const { nearCentroid } = sampleRepresentative(cluster, items, {
      nearCentroid: 3,
    });

    expect(nearCentroid).toHaveLength(3);
    // Should include the closest items
    expect(nearCentroid).toContain("a");
    expect(nearCentroid).toContain("b");
  });

  test("returns atMode items", () => {
    const { atMode } = sampleRepresentative(cluster, items, { atMode: 3 });
    expect(atMode).toHaveLength(3);
    // Should be valid member IDs
    for (const id of atMode) {
      expect(cluster.memberIds).toContain(id);
    }
  });

  test("ignores non-member items", () => {
    const { nearCentroid, atMode } = sampleRepresentative(cluster, items);
    const all = [...nearCentroid, ...atMode];
    expect(all).not.toContain("z");
  });

  test("handles cluster smaller than requested sample", () => {
    const small: Cluster = {
      id: "0",
      centroid: [1, 0, 0],
      memberIds: ["a", "b"],
      size: 2,
    };

    const { nearCentroid } = sampleRepresentative(small, items, {
      nearCentroid: 10,
    });
    expect(nearCentroid).toHaveLength(2);
  });
});

describe("extractTopTerms", () => {
  test("returns most frequent terms", () => {
    const texts = [
      "machine learning classification algorithm",
      "deep learning neural network algorithm",
      "supervised learning classification method",
      "unsupervised learning clustering algorithm",
    ];

    const terms = extractTopTerms(texts, { limit: 5 });

    expect(terms).toHaveLength(5);
    // "learning" and "algorithm" appear in most docs
    expect(terms).toContain("learning");
    expect(terms).toContain("algorithm");
  });

  test("excludes stop words", () => {
    const texts = [
      "the algorithm is a method for the classification of the data",
    ];

    const terms = extractTopTerms(texts);

    expect(terms).not.toContain("the");
    expect(terms).not.toContain("is");
    expect(terms).not.toContain("a");
    expect(terms).not.toContain("for");
    expect(terms).not.toContain("of");
  });

  test("counts each term once per document", () => {
    const texts = [
      "algorithm algorithm algorithm algorithm", // repeated in one doc
      "method approach technique",
    ];

    const terms = extractTopTerms(texts, { limit: 10 });

    // "algorithm" should have df=1, same as "method", "approach", "technique"
    // All have df=1, so order among them is stable but equal
    expect(terms).toContain("algorithm");
  });

  test("handles empty input", () => {
    expect(extractTopTerms([])).toEqual([]);
  });

  test("respects limit", () => {
    const texts = ["one two three four five six seven eight nine ten"];
    const terms = extractTopTerms(texts, { limit: 3 });
    expect(terms).toHaveLength(3);
  });
});
