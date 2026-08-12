// Lightweight, dependency-free statistical routines used by the analytics /
// AI query pages to test associations between variables and report real
// p-values (never asked of the LLM, which cannot be trusted to compute these
// correctly). Implements the standard Numerical Recipes algorithms for the
// incomplete gamma and incomplete beta functions; each has been checked
// against scipy to 4+ decimal places for a range of inputs.

function gammln(xx: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];
  const x = xx;
  let y = xx;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function gser(a: number, x: number): number {
  const ITMAX = 200, EPS = 3e-7;
  if (x <= 0) return 0;
  let ap = a, sum = 1 / a, del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammln(a));
}

function gcf(a: number, x: number): number {
  const ITMAX = 200, EPS = 3e-7, FPMIN = 1e-30;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
}

// Upper regularized incomplete gamma function Q(a,x) = 1 - P(a,x)
function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x < a + 1) return 1 - gser(a, x);
  return gcf(a, x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a,b)
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammln(a + b) - gammln(a) - gammln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Chi-square test of independence for any r x c contingency table (counts). */
export function chiSquareTest(table: number[][]): { chi2: number; df: number; p: number } | null {
  const rows = table.length;
  if (rows === 0) return null;
  const cols = table[0].length;
  const rowSums = table.map(r => r.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: cols }, (_, c) => table.reduce((a, r) => a + r[c], 0));
  const n = rowSums.reduce((a, b) => a + b, 0);
  const df = (rows - 1) * (cols - 1);
  if (n === 0 || df <= 0) return null;
  // 2x2 tables use Yates' continuity correction (matches the app's existing convention)
  const yates = rows === 2 && cols === 2;
  let chi2 = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const expected = (rowSums[i] * colSums[j]) / n;
      if (expected === 0) continue;
      const diff = yates ? Math.max(0, Math.abs(table[i][j] - expected) - 0.5) : Math.abs(table[i][j] - expected);
      chi2 += (diff * diff) / expected;
    }
  }
  const p = gammaQ(df / 2, chi2 / 2);
  return { chi2, df, p: isNaN(p) ? 1 : Math.min(1, Math.max(0, p)) };
}

/** Welch's two-sample t-test (unequal variances), exact t-distribution p-value. */
export function welchTTest(a: number[], b: number[]): { t: number; df: number; p: number } | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a), mb = mean(b);
  const va = stdDev(a) ** 2, vb = stdDev(b) ** 2;
  const se2 = va / a.length + vb / b.length;
  if (se2 === 0) return null;
  const t = (ma - mb) / Math.sqrt(se2);
  const df = (se2 * se2) / ((va / a.length) ** 2 / (a.length - 1) + (vb / b.length) ** 2 / (b.length - 1));
  const p = betai(df / 2, 0.5, df / (df + t * t));
  return { t, df, p: Math.min(1, Math.max(0, p)) };
}

/** Welch's t-test computed directly from summary statistics (mean/sd/n per group). */
export function welchTTestFromSummary(mean1: number, sd1: number, n1: number, mean2: number, sd2: number, n2: number): { t: number; df: number; p: number } | null {
  if (n1 < 2 || n2 < 2) return null;
  const se2 = (sd1 * sd1) / n1 + (sd2 * sd2) / n2;
  if (se2 === 0) return null;
  const t = (mean1 - mean2) / Math.sqrt(se2);
  const df = (se2 * se2) / (((sd1 * sd1) / n1) ** 2 / (n1 - 1) + ((sd2 * sd2) / n2) ** 2 / (n2 - 1));
  const p = betai(df / 2, 0.5, df / (df + t * t));
  return { t, df, p: Math.min(1, Math.max(0, p)) };
}

/** One-way ANOVA F-test across 2+ groups of numeric values. */
export function oneWayANOVA(groups: number[][]): { f: number; df1: number; df2: number; p: number } | null {
  const validGroups = groups.filter(g => g.length > 0);
  if (validGroups.length < 2) return null;
  const allValues = validGroups.flat();
  const grandMean = mean(allValues);
  const n = allValues.length;
  const k = validGroups.length;
  let ssBetween = 0, ssWithin = 0;
  for (const g of validGroups) {
    const gMean = mean(g);
    ssBetween += g.length * (gMean - grandMean) ** 2;
    for (const v of g) ssWithin += (v - gMean) ** 2;
  }
  const df1 = k - 1, df2 = n - k;
  if (df2 <= 0 || ssWithin === 0) return null;
  const msBetween = ssBetween / df1, msWithin = ssWithin / df2;
  const f = msBetween / msWithin;
  const p = betai(df2 / 2, df1 / 2, df2 / (df2 + df1 * f));
  return { f, df1, df2, p: Math.min(1, Math.max(0, p)) };
}

/** Pearson correlation coefficient with significance (t-distribution). */
export function pearsonCorrelation(x: number[], y: number[]): { r: number; n: number; p: number } | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  const r = num / Math.sqrt(dx2 * dy2);
  const df = n - 2;
  if (df <= 0 || Math.abs(r) >= 1) return { r, n, p: 0 };
  const t = (r * Math.sqrt(df)) / Math.sqrt(1 - r * r);
  const p = betai(df / 2, 0.5, df / (df + t * t));
  return { r, n, p: Math.min(1, Math.max(0, p)) };
}
