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
    const threshold = baseline + z * sigma;
    const enough = n >= minSifted;

    if (enough && qhat >= ABORT_QBER) {
      status = "abort";
      calm = 0;
    } else if (enough && qhat > threshold) {
      status = "warning";
      calm = 0;
    } else if (status !== "ok") {
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
