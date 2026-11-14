"""Check the Grover oracle and diffuser from 2b_grover_symmetric_keys.ipynb.

For every marked item and every size N = 2..32, the probability of measuring the
marked item after floor(pi/4*sqrt(N)) iterations must equal the exact Grover value
sin^2((2k+1)*asin(1/sqrt(N))). Run it with the qBraid-SDK / Qiskit environment:

    python check_grover.py
"""
import json
import sys

import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

nb = json.load(open("2b_grover_symmetric_keys.ipynb"))
code = lambda i: "".join(nb["cells"][i]["source"])
ns = {"np": np, "QuantumCircuit": QuantumCircuit}
exec(code(3) + "\n" + code(4) + "\n" + code(5).split("qc = build_grover")[0], ns)

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
sys.exit(1 if bad else 0)
