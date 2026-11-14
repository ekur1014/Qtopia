// BB84 physics for the grid twin. Pure functions, no DOM: used by the browser and by the node tests.
//
// Why this runs in JavaScript and not in Qiskit: BB84 with an intercept-resend eavesdropper only uses single
// qubits prepared and measured in the Z or X basis, so every outcome probability is exactly 0, 1/2 or 1.
// Sampling those probabilities is an exact simulation of the protocol's statistics. sim/bb84_reference.py
// runs the same scenarios on Qiskit Aer and tests/engine.test.mjs checks that the two agree.

// Fiber and detector parameters: the GYS 2004 experiment row of Table 1 in Ma, Qi, Zhao and Lo,
// "Practical decoy state for quantum key distribution" (arXiv quant-ph/0503005): 1550 nm, alpha = 0.21 dB/km,
// e_detector = 3.3%, Y0 = 1.7e-6, eta_Bob = 0.045. The same values drive Figure 1 of Lo, Ma and Chen,
// "Decoy State Quantum Key Distribution", PRL 94, 230504 (2005), whose Eq. (8) is the baseline formula below.
// They are assumptions for a generic metro fiber link, not measurements of any utility's network.
export const FIBER = {
  alphaDbPerKm: 0.21,   // fiber loss
  bobEfficiency: 0.045, // detector efficiency times receiver optics
  darkCountProb: 1.7e-6, // background/dark count probability per pulse
  opticalError: 0.033,  // probability a detected photon hits the wrong detector (misalignment)
};

// The secret-key fraction 1 - 2h(Q) reaches zero at about 11% (Shor and Preskill, PRL 85, 441 (2000)).
export const ABORT_QBER = 0.11;

/** Probability that a photon sent into `km` of fiber is detected by Bob. */
export function transmittance(km, p = FIBER) {
  return Math.pow(10, (-p.alphaDbPerKm * km) / 10) * p.bobEfficiency;
}

/** Error rate of a link with no eavesdropper: misalignment errors plus dark counts, which matter more as loss grows.
 *  Single-photon case of Eq. (8) in Lo, Ma and Chen (2005): e = (e_detector * eta + Y0 / 2) / (eta + Y0). */
export function baselineQber(km, p = FIBER) {
  const eta = transmittance(km, p);
  const y0 = p.darkCountProb;
  return (p.opticalError * eta + 0.5 * y0) / (eta + y0);
}

export function binaryEntropy(q) {
  if (q <= 0 || q >= 1) return 0;
  return -q * Math.log2(q) - (1 - q) * Math.log2(1 - q);
}

/** Fraction of sifted bits that survive error correction and privacy amplification (one-way, asymptotic). */
export function secretFraction(q) {
  return Math.max(0, 1 - 2 * binaryEntropy(q));
}

/**
 * Expected QBER for line error p and an intercept-resend eavesdropper on a fraction f of the photons.
 * If Eve guesses Alice's basis (probability 1/2) Bob sees only line noise p. If she guesses wrong, her resent
 * photon is in the other basis and Bob's result is random (error 1/2). So Q = (1-f)p + f(p/2 + 1/4).
 */
export function expectedQber(p, f) {
  return p + f * (0.25 - p / 2);
}

/** Small seeded PRNG (mulberry32) so tests and demos are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulate `rounds` detected BB84 rounds on one link.
 * lineError: probability the fiber flips the bit in the photon's own basis.
 * eveFraction: fraction of photons Eve intercepts, measures in a random basis and resends.
 * Returns counts only; the browser keeps a sliding window of them.
 */
export function runRounds({ rounds, lineError = 0, eveFraction = 0, rng = Math.random }) {
  let sifted = 0;
  let errors = 0;
  let intercepted = 0;
  for (let i = 0; i < rounds; i++) {
    const aliceBit = rng() < 0.5 ? 1 : 0;
    const aliceBasis = rng() < 0.5 ? 1 : 0;
    const bobBasis = rng() < 0.5 ? 1 : 0;

    // The photon on the fiber: a bit encoded in a basis.
    let bit = aliceBit;
    let basis = aliceBasis;

    if (eveFraction > 0 && rng() < eveFraction) {
      intercepted++;
      const eveBasis = rng() < 0.5 ? 1 : 0;
      const eveBit = eveBasis === basis ? bit : rng() < 0.5 ? 1 : 0; // wrong basis: random outcome
      bit = eveBit; // she resends what she measured, in her basis
      basis = eveBasis;
    }

    if (rng() < lineError) bit ^= 1; // fiber noise flips the bit within the photon's basis

    const bobBit = bobBasis === basis ? bit : rng() < 0.5 ? 1 : 0;

    if (aliceBasis === bobBasis) {
      sifted++;
      if (bobBit !== aliceBit) errors++;
    }
  }
  return { rounds, sifted, errors, intercepted };
}
