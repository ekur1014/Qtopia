"""Check the Grover oracle and diffuser from 2b_grover_symmetric_keys.ipynb.

1. One marked key (the original check). For every marked item and every size
   N = 2..32, the probability of measuring the marked item after
   floor(pi/4*sqrt(N)) iterations must equal the exact Grover value
   sin^2((2k+1)*asin(1/sqrt(N))).
2. M marked routes (3b_grover_route_search.ipynb). The oracle is 2b's oracle
   applied once per marked index (one X-wrapped multi-controlled Z each). For
   every subset of marks for N = 8 (all 256), the oracle must be the diagonal
   phase pattern (-1 on marked, +1 elsewhere), and after r iterations each
   index's probability must equal the closed form: marked sin^2((2r+1)t)/M,
   unmarked cos^2((2r+1)t)/(N-M), t = asin(sqrt(M/N)), within 1e-9.
   r = floor(pi / (4*asin(sqrt(M/N)))), the optimal count (M = 0 uses the
   M = 1 count); the textbook round(pi/4*sqrt(N/M)) overshoots when more than
   half the items are marked. Also checked for r = 0..3, and against 3b's own
   copy of the circuit when that notebook exists. The rule itself is checked:
   N = 8 gives M=0..8 -> 2,2,1,1,1,0,0,0,0, and for N = 2..32 and every M its r
   is the first peak (beats every r' <= r + 1). The router's and 3b's
   copies of the rule must agree.
3. Bit order: statevector index i and Aer's measured bitstring int(b, 2) both
   mean candidate i.

Run it with the qBraid-SDK / Qiskit environment (local simulation only):

    python check_grover.py
    python check_grover.py --write-fixture   # also rewrites grid-twin/tests/fixtures/route_cases.json
"""
import itertools
import json
import os
import sys

import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Operator, Statevector

HERE = os.path.dirname(os.path.abspath(__file__))
nb = json.load(open(os.path.join(HERE, "2b_grover_symmetric_keys.ipynb")))
code = lambda i: "".join(nb["cells"][i]["source"])
ns = {"np": np, "QuantumCircuit": QuantumCircuit}
exec(code(3) + "\n" + code(4) + "\n" + code(5).split("qc = build_grover")[0], ns)

# --- 1. One marked key (unchanged) ---
bad = 0
for n in range(1, 6):
    N, k = 2**n, int(np.floor(np.pi / 4 * np.sqrt(2**n)))
    exact = np.sin((2 * k + 1) * np.arcsin(1 / np.sqrt(N))) ** 2
    for key in range(N):
        qc = ns["build_grover"](n, key, k)
        qc.remove_final_measurements()
        p = abs(Statevector(qc).data[key]) ** 2
        if abs(p - exact) > 1e-9:
            bad += 1
            print(f"MISMATCH N={N} key={key}: got {p:.6f}, exact {exact:.6f}")
    print(f"N={N:2d} iterations={k} exact success probability {exact:.4f}: all {N} keys match")
print("mismatches:", bad)


# --- 2. M marked routes ---
sys.path.insert(0, HERE)
from chattanooga_router import grover_iterations, grover_success  # noqa: E402

# The iteration rule: the expected N = 8 table, and optimal for every N, M.
rule_bad = 0
if [grover_iterations(8, M) for M in range(9)] != [2, 2, 1, 1, 1, 0, 0, 0, 0]:
    rule_bad += 1
    print("RULE MISMATCH N=8:", [grover_iterations(8, M) for M in range(9)])
for N_i in (2, 4, 8, 16, 32):
    for M in range(1, N_i + 1):
        r = grover_iterations(N_i, M)
        best = max(grover_success(N_i, M, k) for k in range(r + 2))   # first peak: no fewer, no one-more
        if grover_success(N_i, M, r) < best - 1e-9:
            rule_bad += 1
            print(f"RULE NOT OPTIMAL N={N_i} M={M}: r={r}")
print(f"iteration rule floor(pi/(4 asin(sqrt(M/N)))), N=8 table + first-peak optimal for N=2..32, all M: {rule_bad} mismatches")
bad += rule_bad


def oracle_multi(qc, qubits, marked):
    """2b's oracle once per marked index: one X-wrapped multi-controlled Z each."""
    for m in marked:
        ns["oracle"](qc, qubits, m)


def build_multi(n, marked, iterations, measure=False):
    qc = QuantumCircuit(n, n) if measure else QuantumCircuit(n)
    qubits = list(range(n))
    qc.h(qubits)
    for _ in range(iterations):
        oracle_multi(qc, qubits, marked)
        ns["diffusion"](qc, qubits)
    if measure:
        qc.measure(qubits, qubits)
    return qc


def closed_form(N, marked, r):
    M = len(marked)
    t = np.arcsin(np.sqrt(M / N))
    p = np.full(N, np.cos((2 * r + 1) * t) ** 2 / (N - M) if M < N else 0.0)
    for m in marked:
        p[m] = np.sin((2 * r + 1) * t) ** 2 / M
    return p


def probs(qc):
    return Statevector(qc).probabilities()   # index i = sum_q bit_q * 2^q = candidate i


# 3b's own copy of the circuit, if the notebook exists (the cell defining build_grover_routes).
builders = {"2b oracle x M": build_multi}
nb3 = os.path.join(HERE, "3b_grover_route_search.ipynb")
if os.path.exists(nb3):
    cells = ["".join(c["source"]) for c in json.load(open(nb3))["cells"] if c["cell_type"] == "code"]
    src = next((c for c in cells if "def build_grover_routes" in c), None)
    if src:
        ns3 = {"np": np, "QuantumCircuit": QuantumCircuit}
        exec(src, ns3)

        def build_3b(n, marked, iterations, measure=False):
            qc = ns3["build_grover_routes"](n, marked, iterations)
            if not measure:
                qc.remove_final_measurements()
            return qc
        builders["3b notebook"] = build_3b
        nb_rule_bad = sum(1 for N_i in (2, 4, 8, 16, 32) for M in range(N_i + 1)
                          if ns3["grover_iterations"](N_i, M) != grover_iterations(N_i, M))
        print(f"3b notebook's grover_iterations vs chattanooga_router's, N=2..32, all M: {nb_rule_bad} mismatches")
        bad += nb_rule_bad

N, n = 8, 3
for label, build in builders.items():
    bad_phase = bad_prob = checked = 0
    for M in range(N + 1):
        for marked in itertools.combinations(range(N), M):
            marked = list(marked)
            if label == "2b oracle x M":
                qc = QuantumCircuit(n)
                oracle_multi(qc, list(range(n)), marked)
                want = np.diag([-1.0 if i in marked else 1.0 for i in range(N)])
                if not np.allclose(Operator(qc).data, want, atol=1e-9):
                    bad_phase += 1
                    print(f"PHASE MISMATCH marked={marked}")
            for r in sorted({grover_iterations(N, M), 0, 1, 2, 3}):
                p = probs(build(n, marked, r))
                checked += 1
                if np.max(np.abs(p - closed_form(N, marked, r))) > 1e-9:
                    bad_prob += 1
                    print(f"PROB MISMATCH ({label}) marked={marked} r={r}: {np.round(p, 6)}")
    if label == "2b oracle x M":
        print(f"N=8 multi-marked oracle, all 256 subsets: {bad_phase} phase-pattern mismatches")
    print(f"N=8 multi-marked Grover ({label}), 256 subsets x r in {{rule, 0..3}} "
          f"({checked} circuits): {bad_prob} probability mismatches")
    bad += bad_phase + bad_prob

# --- 3. Bit order on Aer: measured bitstring int(b, 2) is the candidate index ---
from qiskit_aer import AerSimulator  # noqa: E402

sim = AerSimulator(seed_simulator=7)
order_bad = 0
for marked in ([1], [4], [6], [2, 5, 7]):
    qc = build_multi(n, marked, grover_iterations(N, len(marked)), measure=True)
    counts = sim.run(transpile(qc, sim), shots=2000).result().get_counts()
    top = sorted((int(b, 2) for b, c in counts.items() if c > 2000 / N), key=int)
    if top != sorted(marked):
        order_bad += 1
        print(f"BIT ORDER MISMATCH marked={marked}: Aer peaks at {top}")
print(f"Aer bit order (index i = candidate i), 4 cases: {order_bad} mismatches")
bad += order_bad

# --- Fixture for the JavaScript tests ---
GROVER_FIXTURE = [(8, [1, 4, 6]), (8, []), (16, [3]), (8, list(range(8)))]
FIXTURE = os.path.join(HERE, "grid-twin", "tests", "fixtures", "route_cases.json")


def grover_fixture():
    out = []
    for N_i, marked in GROVER_FIXTURE:
        r = grover_iterations(N_i, len(marked))
        p = probs(build_multi(int(np.log2(N_i)), marked, r))
        out.append({"N": N_i, "marked": marked, "iterations": r, "probs": [float(x) for x in p]})
    return out


if "--write-fixture" in sys.argv:
    sys.path.insert(0, HERE)
    import chattanooga_router as cr
    fixture = {"note": "Generated by `python check_grover.py --write-fixture` from chattanooga_router.py "
                       "(routes) and the Qiskit statevector of the 2b oracle x M + 2b diffuser (grover). "
                       "Do not edit by hand.",
               **cr.fixture_cases(cr.load_network()), "grover": grover_fixture()}
    os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
    with open(FIXTURE, "w") as f:
        json.dump(fixture, f, indent=1)
        f.write("\n")
    print("wrote", os.path.relpath(FIXTURE, HERE))

if os.path.exists(FIXTURE):
    fx = json.load(open(FIXTURE))
    fx_bad = sum(1 for g in fx.get("grover", [])
                 if g["iterations"] != grover_iterations(g["N"], len(g["marked"]))
                 or np.max(np.abs(np.array(g["probs"]) - closed_form(g["N"], g["marked"], g["iterations"]))) > 1e-9)
    print(f"fixture grover entries vs closed form, {len(fx.get('grover', []))} cases: {fx_bad} mismatches")
    bad += fx_bad

print("total mismatches:", bad)
sys.exit(1 if bad else 0)
