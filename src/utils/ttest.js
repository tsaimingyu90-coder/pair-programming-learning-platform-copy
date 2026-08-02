/**
 * Welch's two-sample t-test (two-tailed)
 * Returns { t, df, p, significant }
 * Uses a numerical approximation for the t-distribution CDF (Abramowitz & Stegun).
 */

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

/**
 * Regularized incomplete beta function approximation via continued fraction (Lentz).
 * Used to compute the CDF of the t-distribution.
 */
function betacf(x, a, b) {
  const MAXIT = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function incompleteBeta(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(x, a, b);
  } else {
    return 1 - (Math.exp(Math.log(1 - x) * b + Math.log(x) * a - lbeta) / b) * betacf(1 - x, b, a);
  }
}

// Lanczos approximation for lgamma
function lgamma(z) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Two-tailed p-value for t-distribution with df degrees of freedom.
 */
function tDist2TailP(t, df) {
  const x = df / (df + t * t);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, p); // two-tailed
}

/**
 * Welch's t-test
 * @param {number[]} a - group 1 values
 * @param {number[]} b - group 2 values
 * @returns {{ t: number, df: number, p: number, significant: boolean, label: string }}
 */
export function welchTTest(a, b) {
  if (a.length < 2 || b.length < 2) return { t: null, df: null, p: null, significant: false, label: "樣本不足" };
  const n1 = a.length, n2 = b.length;
  const m1 = mean(a), m2 = mean(b);
  const v1 = variance(a), v2 = variance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return { t: 0, df: n1 + n2 - 2, p: 1, significant: false, label: "ns" };
  const t = (m1 - m2) / se;
  const df = (v1 / n1 + v2 / n2) ** 2 /
    ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const p = tDist2TailP(Math.abs(t), df);
  const significant = p < 0.05;
  const label = p < 0.001 ? "p < .001 ***" : p < 0.01 ? `p = ${p.toFixed(3)} **` : p < 0.05 ? `p = ${p.toFixed(3)} *` : `p = ${p.toFixed(3)} ns`;
  return { t: parseFloat(t.toFixed(3)), df: parseFloat(df.toFixed(1)), p: parseFloat(p.toFixed(4)), significant, label };
}

/**
 * Significance badge level
 */
export function sigLevel(p) {
  if (p === null) return null;
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}