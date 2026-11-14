// Turns a stream of BB84 counts on one link into an alarm state.
//
// Two different lines, on purpose:
//   warning: the error rate is statistically above this link's own baseline (someone may be listening),
//   abort:   the error rate is at or above ~11%, where no secret key can be distilled at all.
// 11% is the abort line, not the detection line: a careful eavesdropper stays far below it.

import { ABORT_QBER } from "./bb84.js";

/** One-sided normal tail P(Z > z): the chance of a false warning on one check when nobody is listening. */
export function normalTail(z) {
  // Abramowitz and Stegun 7.1.26 approximation of erfc, accurate to about 1e-7.
  const x = z / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erfc = poly * Math.exp(-x * x);
  return x >= 0 ? erfc / 2 : 1 - erfc / 2;
}

// ln Γ(x) (Lanczos, g = 7), for exact binomial probabilities.
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Smallest error count k with P(X >= k) <= alpha for X ~ Binomial(n, p): the exact alarm line.
 * Errors at a few percent are skewed, so baseline + z·sigma (the normal approximation) alarms several times
 * more often than its normal tail says. Counting the exact tail keeps the false-alarm chance at most alpha.
 */
export function binomialCriticalCount(n, p, alpha) {
  if (n <= 0) return Infinity;
  if (p <= 0) return 1;
  if (p >= 1) return n + 1;
  const sd = Math.sqrt(n * p * (1 - p));
  let k = Math.min(n, Math.ceil(n * p + 15 * sd + 20));
  let pmf = Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  let tail = 0;
  const ratio = (1 - p) / p;
  for (; k >= 0; k--) {
    tail += pmf;
    if (tail > alpha) return k + 1;
    pmf *= (k / (n - k + 1)) * ratio; // pmf(k - 1)
  }
  return 0;
}

export function createDetector({ baseline, windowTicks = 16, minSifted = 600, z = 4, clearChecks = 6 }) {
  const samples = []; // recent { sifted, errors } per tick
  let status = "ok";
  let calm = 0; // consecutive checks below the warning line, used to clear an alarm (hysteresis)

  function evaluate() {
    let n = 0;
    let e = 0;
    for (const s of samples) {
      n += s.sifted;
      e += s.errors;
    }
    const qhat = n > 0 ? e / n : 0;
    const sigma = n > 0 ? Math.sqrt((baseline * (1 - baseline)) / n) : Infinity;
    // Alarm when the error count reaches the exact binomial critical count for a false-alarm chance of at most
    // normalTail(z) per check. Expressed as a rate, halfway below that count, so qhat > threshold <=> e >= k.
    const k = binomialCriticalCount(n, baseline, normalTail(z));
    const threshold = n > 0 ? (k - 0.5) / n : Infinity;
    const enough = n >= minSifted;

    if (enough && qhat >= ABORT_QBER) {
      status = "abort";
      calm = 0;
    } else if (enough && qhat > threshold) {
      status = "warning";
      calm = 0;
    } else if (status !== "ok" && enough) {
      // Only a check with enough evidence, under the line, counts towards clearing an alarm.
      calm++;
      if (calm >= clearChecks) status = "ok";
    }
    return { n, errors: e, qhat, sigma, threshold, status, enough };
  }

  return {
    push(sample) {
      samples.push(sample);
      while (samples.length > windowTicks) samples.shift();
      return evaluate();
    },
    setZ(newZ) {
      z = newZ;
    },
    reset() {
      samples.length = 0;
      status = "ok";
      calm = 0;
    },
    get baseline() {
      return baseline;
    },
  };
}
