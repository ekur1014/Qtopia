"""Qiskit Aer reference for the grid twin's BB84 engine.

Runs BB84 with an intercept-resend eavesdropper and fiber noise as real quantum circuits on Qiskit Aer,
and writes the measured error rates to data/calibration.json. tests/engine.test.mjs then checks that the
browser's JavaScript engine (src/bb84.js) produces the same error rates.

Model, identical to src/bb84.js:
  - Alice sends a random bit in a random basis (Z or X); Bob measures in a random basis.
  - Eve intercepts a fraction f of photons, measures in a random basis, and resends what she saw in her basis.
  - The fiber flips the bit within the photon's current basis with probability p (X in Z, Z in X).
  - Only rounds where Alice's and Bob's bases match are kept (sifting); QBER is the error rate on those.

Usage, from the grid-twin folder:
    python sim/bb84_reference.py
"""

import json
import pathlib
import sys

import numpy as np
import qiskit
import qiskit_aer
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

N_QUBITS = 2000  # one BB84 round per qubit, all in one circuit (the stabilizer method handles this easily)
REPEATS = 6      # independent circuits per scenario, about 6,000 sifted rounds in total
SCENARIOS = [(0.0, 0.0), (0.0, 1.0), (0.0, 0.5), (0.033, 0.0), (0.033, 0.25), (0.033, 1.0), (0.08, 0.5)]


def expected_qber(p: float, f: float) -> float:
    return p + f * (0.25 - p / 2)


def run_once(p: float, f: float, seed: int) -> tuple[int, int]:
    rng = np.random.default_rng(seed)
    n = N_QUBITS
    alice_bits = rng.integers(0, 2, n)
    alice_bases = rng.integers(0, 2, n)
    bob_bases = rng.integers(0, 2, n)
    eve_on = rng.random(n) < f
    eve_bases = rng.integers(0, 2, n)
    flips = rng.random(n) < p

    qc = QuantumCircuit(n, 2 * n)  # clbits 0..n-1: Eve's results; n..2n-1: Bob's results
    for q in range(n):
        if alice_bits[q]:
            qc.x(q)
        if alice_bases[q]:
            qc.h(q)
        basis = alice_bases[q]
        if eve_on[q]:
            # Measure in Eve's basis and leave the qubit in the state she saw, in her basis (the resend).
            if eve_bases[q]:
                qc.h(q)
            qc.measure(q, q)
            if eve_bases[q]:
                qc.h(q)
            basis = eve_bases[q]
        if flips[q]:
            # Fiber noise: a bit flip within the photon's current basis.
            if basis == 0:
                qc.x(q)
            else:
                qc.z(q)
        if bob_bases[q]:
            qc.h(q)
        qc.measure(q, n + q)

    sim = AerSimulator(method="stabilizer", seed_simulator=seed)
    result = sim.run(qc, shots=1).result()
    bitstring = next(iter(result.get_counts()))
    sifted = errors = 0
    for q in range(n):
        if alice_bases[q] != bob_bases[q]:
            continue
        sifted += 1
        bob_bit = int(bitstring[-(n + q + 1)])  # Qiskit writes clbit 0 as the last character
        errors += int(bob_bit != int(alice_bits[q]))
    return int(sifted), int(errors)


def main() -> int:
    out = []
    seed = 20261114
    for p, f in SCENARIOS:
        sifted = errors = 0
        for _ in range(REPEATS):
            seed += 7919
            s, e = run_once(p, f, seed)
            sifted += s
            errors += e
        q = errors / sifted
        exp = expected_qber(p, f)
        sigma = (max(exp * (1 - exp), 1e-9) / sifted) ** 0.5
        out.append({"line_error": p, "eve_fraction": f, "sifted": sifted, "errors": errors, "qber": round(q, 6), "expected": round(exp, 6)})
        flag = "ok" if abs(q - exp) <= 4.5 * sigma else "OFF"
        print(f"p={p:<6} f={f:<5} Aer QBER {q:.4f}  expected {exp:.4f}  ({sifted} sifted)  {flag}")

    path = pathlib.Path(__file__).resolve().parent.parent / "data" / "calibration.json"
    path.write_text(json.dumps({
        "generated_by": "sim/bb84_reference.py",
        "qiskit": qiskit.__version__,
        "qiskit_aer": qiskit_aer.__version__,
        "method": "AerSimulator(method='stabilizer'), one BB84 round per qubit",
        "scenarios": out,
    }, indent=2) + "\n")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
