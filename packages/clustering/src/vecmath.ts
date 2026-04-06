// ---------------------------------------------------------------------------
// Shared vector math for Float64Array hot paths (dot, normalize, cosine)
// ---------------------------------------------------------------------------

export function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalizeInPlace(v: Float64Array): void {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
}

export function normalizeVec(v: number[]): Float64Array {
  const f = new Float64Array(v);
  normalizeInPlace(f);
  return f;
}

export function cosineDistance(a: Float64Array, b: Float64Array): number {
  return 1 - dot(a, b);
}
