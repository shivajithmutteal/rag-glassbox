/** Vector math for semantic (embedding) retrieval. */

export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function norm(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * a[i]!;
  return Math.sqrt(sum);
}

/** Cosine similarity in [-1, 1]; returns 0 if either vector is all zeros. */
export function cosine(a: number[], b: number[]): number {
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}
