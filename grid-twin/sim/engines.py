"""The same BB84 fiber, run on three quantum frameworks: Qiskit Aer, NVIDIA CUDA-Q and Quantinuum Guppy (Selene).

Every engine answers the same question as src/bb84.js: on a fiber with error rate p and a tap intercepting a
share f of photons, how many sifted bits arrive and how many are wrong? Grid Twin's bridge (live_server.py)
calls these from the browser, so a fiber on screen can be re-run on a real quantum stack and compared.

Model (identical to src/bb84.js and sim/bb84_reference.py): Alice sends a random bit in a random basis; Eve,
on a share f of photons, measures in a random basis and resends what she saw; the fiber flips the bit within
the photon's current basis with probability p; Bob measures in a random basis; only matching bases are kept.

Run the self-test: python sim/engines.py
"""

from __future__ import annotations

import importlib
import math
import pathlib
import sys
import tempfile
import time
from collections import Counter

import numpy as np


def expected_qber(p: float, f: float) -> float:
    return p + f * (0.25 - p / 2)


# ---------------------------------------------------------------------------------------------------------
# Rounds are drawn classically and grouped into cases, so Qiskit and CUDA-Q run one tiny circuit per case
# with many shots instead of one circuit per photon. Only sifted rounds (Alice's basis == Bob's) are kept:
# the others are thrown away in BB84 anyway.
# ---------------------------------------------------------------------------------------------------------
def sifted_cases(p: float, f: float, rounds: int, rng: np.random.Generator) -> Counter:
    match = rng.random(rounds) < 0.5  # Bob guessed Alice's basis
    n = int(match.sum())
    bit = rng.integers(0, 2, n)
    basis = rng.integers(0, 2, n)
    eve_on = rng.random(n) < f
    eve_basis = np.where(eve_on, rng.integers(0, 2, n), 0)
    flip = rng.random(n) < p
    return Counter(zip(bit.tolist(), basis.tolist(), eve_on.astype(int).tolist(), eve_basis.tolist(), flip.astype(int).tolist()))


def score(case: tuple, bob_bit: int) -> bool:
    return bob_bit != case[0]


# --- Qiskit Aer ------------------------------------------------------------------------------------------
def run_qiskit(p: float, f: float, rounds: int, seed: int) -> dict:
    from qiskit import QuantumCircuit
    from qiskit_aer import AerSimulator

    sim = AerSimulator(seed_simulator=seed)
    cases = sifted_cases(p, f, rounds, np.random.default_rng(seed))
    sifted = errors = 0
    for case, count in cases.items():
        bit, basis, eve_on, eve_basis, flip = case
        qc = QuantumCircuit(1, 2)
        if bit:
            qc.x(0)
        if basis:
            qc.h(0)
        cur = basis
        if eve_on:  # intercept-resend: measure in Eve's basis, leave the qubit in the state she saw
            if eve_basis:
                qc.h(0)
            qc.measure(0, 1)
            if eve_basis:
                qc.h(0)
            cur = eve_basis
        if flip:
            qc.z(0) if cur else qc.x(0)
        if basis:  # sifted: Bob measures in Alice's basis
            qc.h(0)
        qc.measure(0, 0)
        counts = sim.run(qc, shots=count).result().get_counts()
        for bits, c in counts.items():
            sifted += c
            if score(case, int(bits[-1])):
                errors += c
    return {"sifted": sifted, "errors": errors}


# --- NVIDIA CUDA-Q ---------------------------------------------------------------------------------------
_cudaq_kernel = None


def run_cudaq(p: float, f: float, rounds: int, seed: int) -> dict:
    import cudaq

    global _cudaq_kernel
    if _cudaq_kernel is None:
        cudaq.set_target("qpp-cpu")

        @cudaq.kernel
        def bb84_round(bit: int, basis: int, eve_on: int, eve_basis: int, flip: int):
            q = cudaq.qubit()
            anc = cudaq.qubit()
            if bit == 1:
                x(q)
            if basis == 1:
                h(q)
            cur = basis
            if eve_on == 1:
                # Eve measures in her basis: copying the photon's value into an ancilla in that basis is a
                # measurement whose result nobody reads; Bob then sees exactly the statistics of intercept-resend.
                if eve_basis == 1:
                    h(q)
                x.ctrl(q, anc)
                if eve_basis == 1:
                    h(q)
                cur = eve_basis
            if flip == 1:
                if cur == 1:
                    z(q)
                else:
                    x(q)
            if basis == 1:
                h(q)
            mz(q)

        _cudaq_kernel = bb84_round
    cudaq.set_random_seed(seed)
    cases = sifted_cases(p, f, rounds, np.random.default_rng(seed))
    sifted = errors = 0
    for case, count in cases.items():
        result = cudaq.sample(_cudaq_kernel, *case, shots_count=count)
        for bits, c in result.items():
            sifted += c
            if score(case, int(bits[0])):
                errors += c
    return {"sifted": sifted, "errors": errors}


# --- Quantinuum Guppy on the Selene emulator --------------------------------------------------------------
# Here the whole BB84 round runs inside the emulator, including the coin flips: each random choice is a qubit
# rotated so that measuring it gives 1 with the right probability. Guppy reads programs from source files, so
# the program is generated with the fiber's p and f as constants, compiled once, and cached.
_guppy_cache: dict = {}

GUPPY_TEMPLATE = '''
from guppylang import guppy
from guppylang.std.angles import angle
from guppylang.std.builtins import output
from guppylang.std.quantum import qubit, measure, h, x, z, ry


@guppy
def coin(half_turns: angle) -> bool:
    c = qubit()
    ry(c, half_turns)
    return measure(c).read()


@guppy
def bb84_round() -> None:
    bit = coin(angle(0.5))
    basis = coin(angle(0.5))
    bob_basis = coin(angle(0.5))
    eve_on = coin(angle({eve_turns}))
    eve_basis = coin(angle(0.5))
    flip = coin(angle({flip_turns}))
    q = qubit()
    if bit:
        x(q)
    if basis:
        h(q)
    cur = basis
    if eve_on:
        # Intercept-resend: Eve measures the photon in her basis, then sends a fresh one in the state she saw.
        if eve_basis:
            h(q)
        seen = measure(q).read()
        q = qubit()
        if seen:
            x(q)
        if eve_basis:
            h(q)
        cur = eve_basis
    if flip:
        if cur:
            z(q)
        else:
            x(q)
    if bob_basis:
        h(q)
    output("bit", bit)
    output("basis", basis)
    output("bob_basis", bob_basis)
    output("bob", measure(q).read())
'''


def _turns_for_probability(prob: float) -> float:
    # ry(theta)|0> gives 1 with probability sin^2(theta/2); Guppy angles are in half-turns (theta / pi).
    return 2 * math.asin(math.sqrt(min(max(prob, 0.0), 1.0))) / math.pi


def run_guppy(p: float, f: float, rounds: int, seed: int) -> dict:
    key = (round(p, 6), round(f, 6))
    if key not in _guppy_cache:
        src = GUPPY_TEMPLATE.format(eve_turns=repr(_turns_for_probability(f)), flip_turns=repr(_turns_for_probability(p)))
        folder = pathlib.Path(tempfile.mkdtemp(prefix="gridtwin_guppy_"))
        name = f"bb84_guppy_{abs(hash(key))}"
        (folder / f"{name}.py").write_text(src)
        sys.path.insert(0, str(folder))
        module = importlib.import_module(name)
        sys.path.pop(0)
        _guppy_cache[key] = module.bb84_round.emulator(n_qubits=8)
    instance = _guppy_cache[key]
    result = instance.with_shots(rounds).with_seed(seed).run()
    sifted = errors = 0
    for shot in result.collated_shots():
        if int(shot["basis"][0]) != int(shot["bob_basis"][0]):
            continue
        sifted += 1
        if int(shot["bob"][0]) != int(shot["bit"][0]):
            errors += 1
    return {"sifted": sifted, "errors": errors}


# --- qBraid cloud simulators ----------------------------------------------------------------------------------
# One circuit per run, sent as a real qBraid job. Each BB84 round uses 4 qubits: the photon, a qubit that records
# Eve's measurement, a coin that decides whether Eve taps (probability f) and a coin that decides whether the fiber
# flips the bit (probability p). Eve's basis matches Alice's in exactly half the rounds. Rounds per circuit and shots
# are set per device in QBRAID_DEVICES below. On the QIR and GPU simulators every shot is a random sample. IonQ's
# free simulator instead returns exact probabilities (times the shot count), so its result is the expected error
# rate itself, with no sampling spread to quote.
QBRAID_DEVICE = "ionq:ionq:sim:simulator"


QBRAID_DEVICES = {
    # engine id: (device, rounds per circuit, shots, runtime options, label)
    # IonQ's simulator returns probabilities, and with many qubits it leaves out rare outcomes (a 40% tap read 6.6%
    # with 6 rounds = 24 qubits). Two rounds (8 qubits) per circuit keeps every outcome.
    "qbraid": ("ionq:ionq:sim:simulator", 2, 1000, None, "qBraid · IonQ simulator (cloud)"),
    "qbraid-qir": ("qbraid:qbraid:sim:qir-sv", 6, 2000, None, "qBraid · QIR simulator (cloud, free)"),
    "qbraid-gpu": ("qbraid:qbraid:sim:gpu-sv", 8, 4000, None, "qBraid · GPU state-vector simulator (credits)"),
}


def bb84_coin_circuit(p: float, f: float, bits, bases, eve_bases, encode=None):
    """BB84 rounds side by side in one circuit, with the fiber's tap and noise inside
    the circuit, so a cloud simulator runs the whole thing: Alice's photon, a qubit that records Eve's measurement,
    Eve's coin (taps with probability f) and the noise coin (flips with probability p). Every round is sifted (Bob
    measures in Alice's basis). `encode(bit, basis)` can be the team's notebook-1 function; default is the standard one.
    Layout: round r's photon is qubit r and classical bit r (helpers come after the photons), so a result string reads
    the same whether a backend reports classical bits (qBraid QIR) or every qubit (IonQ): round r = character -(r+1)."""
    from qiskit import QuantumCircuit

    theta = lambda prob: 2 * math.asin(math.sqrt(min(max(prob, 0.0), 1.0)))
    k = len(bits)
    qc = QuantumCircuit(4 * k, k)
    for r in range(k):
        q, rec, eve_coin, noise_coin = r, k + 3 * r, k + 3 * r + 1, k + 3 * r + 2
        if encode is not None:
            qc.compose(encode(int(bits[r]), int(bases[r])), qubits=[q], clbits=[r], inplace=True)
        else:
            if bits[r]:
                qc.x(q)
            if bases[r]:
                qc.h(q)
        qc.ry(theta(f), eve_coin)
        qc.ry(theta(p), noise_coin)
        # Eve (when her coin says so) measures in her basis: copy the photon's value into `rec` in that basis.
        if eve_bases[r]:
            qc.h(q)
        qc.ccx(eve_coin, q, rec)
        if eve_bases[r]:
            qc.h(q)
        # Fiber noise flips the bit within the photon's basis. After a tap the photon is in Eve's basis; a flip in
        # either basis only matters when it matches Bob's, so using Alice's basis gives the same error statistics.
        if bases[r]:
            qc.cz(noise_coin, q)
        else:
            qc.cx(noise_coin, q)
        if bases[r]:  # sifted: Bob measures in Alice's basis
            qc.h(q)
        qc.measure(q, r)
    return qc


def coin_rounds(rng, k):
    bits = rng.integers(0, 2, k)
    bases = rng.integers(0, 2, k)
    # Eve's basis matches Alice's on exactly half the rounds (k is even), as a random basis does on average, so the
    # few rounds in one circuit carry the intercept-resend statistics exactly.
    assert k % 2 == 0, "rounds per circuit must be even"
    mismatch = rng.permutation(k) < k // 2
    eve_bases = np.where(mismatch, 1 - bases, bases)
    return bits, bases, eve_bases


def count_errors(counts, bits):
    sifted = errors = 0
    k = len(bits)
    for bitstring, c in counts.items():
        bitstring = bitstring.replace(" ", "")
        for r in range(k):
            bob = int(bitstring[-(r + 1)])
            sifted += c
            errors += c * (bob != int(bits[r]))
    return sifted, errors


def run_on_qbraid(engine: str, qc, shots: int) -> tuple:
    import os
    from qbraid.runtime import QbraidProvider

    if not os.environ.get("QBRAID_API_KEY"):
        raise RuntimeError("QBRAID_API_KEY is not set for the server")
    device_id, _, _, options, _ = QBRAID_DEVICES[engine]
    device = QbraidProvider().get_device(device_id)
    job = device.run(qc, shots=shots, **({"runtime_options": options} if options else {}))
    return job.result().data.get_counts(), job.id, device_id


def make_qbraid_engine(engine: str):
    def run_engine(p: float, f: float, rounds: int, seed: int) -> dict:
        _, k, shots, _, _ = QBRAID_DEVICES[engine]
        bits, bases, eve_bases = coin_rounds(np.random.default_rng(seed), k)
        counts, job_id, device_id = run_on_qbraid(engine, bb84_coin_circuit(p, f, bits, bases, eve_bases), shots)
        sifted, errors = count_errors(counts, bits)
        return {"sifted": sifted, "errors": errors, "job_id": job_id, "device": device_id, "shots": shots}

    return run_engine


run_qbraid = make_qbraid_engine("qbraid")


# --- The team's own notebook 1 code -----------------------------------------------------------------------
# Runs encode() and measure() from 1_bb84_eavesdropper.ipynb as written by the team, with Eve exactly as the
# notebook's TODO describes (measure in a random basis, re-encode). Fiber noise is added by flipping Bob's result
# with probability p, which gives the same error statistics on sifted rounds.
def load_notebook1(seed: int) -> tuple:
    """The team's notebook 1 functions: encode() and measure() (cells 3-4) and, for cloud runs, qber_from_counts()
    (cell 8, functions only). While encode() still has its TODO, it is completed exactly as the TODO comment says
    ("if bit == 1, apply X. If basis == 1 (X basis), apply H.") and the result says so."""
    import ast
    import json
    import os

    nb_path = pathlib.Path(os.environ.get("GRIDTWIN_NOTEBOOK1") or pathlib.Path(__file__).resolve().parents[2] / "1_bb84_eavesdropper.ipynb")
    nb = json.loads(nb_path.read_text())
    src = lambda i: "".join(nb["cells"][i]["source"])
    from qiskit import QuantumCircuit, transpile
    from qiskit_aer import AerSimulator

    ns = {"np": np, "QuantumCircuit": QuantumCircuit, "transpile": transpile, "sim": AerSimulator(seed_simulator=seed), "AerSimulator": AerSimulator}
    exec(src(3) + "\n" + src(4), ns)
    cell8 = ast.parse(src(8))
    cell8.body = [n for n in cell8.body if isinstance(n, ast.FunctionDef)]  # defs only: the cell also runs a demo
    exec(compile(cell8, "notebook1_cell8", "exec"), ns)
    note = None
    try:
        ns["encode"](0, 0)
    except NotImplementedError:
        def encode(bit, basis):
            qc = QuantumCircuit(1, 1)
            if bit == 1:
                qc.x(0)
            if basis == 1:
                qc.h(0)
            return qc

        ns["encode"] = encode
        note = "notebook 1's encode() still has its TODO: completed here exactly as its TODO comment says"
    return ns, note


def run_notebook1(p: float, f: float, rounds: int, seed: int) -> dict:
    """Notebook 1's own encode() and measure() on Qiskit Aer, with Eve exactly as the notebook's TODO describes
    (measure in a random basis, re-encode). Fiber noise flips Bob's result with probability p."""
    ns, note = load_notebook1(seed)
    rng = np.random.default_rng(seed)
    sifted = errors = 0
    for _ in range(min(rounds, 600)):
        bit, basis, bob_basis = (int(x) for x in rng.integers(0, 2, 3))
        qc = ns["encode"](bit, basis)
        if rng.random() < f:
            eve_basis = int(rng.integers(0, 2))
            eve_bit = ns["measure"](qc, eve_basis)
            qc = ns["encode"](eve_bit, eve_basis)
        bob = ns["measure"](qc, bob_basis)
        if rng.random() < p:
            bob ^= 1
        if basis == bob_basis:
            sifted += 1
            errors += int(bob != bit)
    out = {"sifted": sifted, "errors": errors}
    if note:
        out["note"] = note
    return out


QBRAID_DEVICES["notebook1-qbraid"] = ("qbraid:qbraid:sim:qir-sv", 6, 2000, None, "Team notebook 1 on qBraid · QIR simulator")


def run_notebook1_qbraid(p: float, f: float, rounds: int, seed: int) -> dict:
    """Notebook 1's own batch hardware path on qBraid: the team's encode() builds every photon, the circuit runs on
    qBraid's QIR simulator (the free simulator the notebook itself suggests), and the team's qber_from_counts() scores
    it. Added to the notebook's batch circuit: the fiber's tap and noise, as coin qubits inside the circuit."""
    ns, note = load_notebook1(seed)
    _, k, shots, _, _ = QBRAID_DEVICES["notebook1-qbraid"]
    bits, bases, eve_bases = coin_rounds(np.random.default_rng(seed), k)
    qc = bb84_coin_circuit(p, f, bits, bases, eve_bases, encode=ns["encode"])
    counts, job_id, device_id = run_on_qbraid("notebook1-qbraid", qc, shots)
    # The notebook's scorer expects one classical bit per round (round r = character -(r+1)). Some backends report
    # every qubit; keep just the rounds' bits.
    norm = {}
    for key, c in counts.items():
        key = key.replace(" ", "")
        key = key[-k:]
        norm[key] = norm.get(key, 0) + c
    counts = norm
    q = ns["qber_from_counts"](counts, [int(b) for b in bits], [int(b) for b in bases], [int(b) for b in bases])  # the team's scoring
    sifted = shots * k
    out = {"sifted": sifted, "errors": round(q * sifted), "job_id": job_id, "device": device_id, "shots": shots}
    if note:
        out["note"] = note
    return out


ENGINES = {
    "qiskit": run_qiskit,
    "cudaq": run_cudaq,
    "guppy": run_guppy,
    "notebook1": run_notebook1,
    "qbraid": run_qbraid,
    "qbraid-qir": make_qbraid_engine("qbraid-qir"),
    "notebook1-qbraid": run_notebook1_qbraid,
    "qbraid-gpu": make_qbraid_engine("qbraid-gpu"),
}
LABELS = {
    "qiskit": "Qiskit Aer",
    "cudaq": "NVIDIA CUDA-Q",
    "guppy": "Quantinuum Guppy (Selene)",
    "notebook1": "Team notebook 1 (Qiskit Aer)",
    **{e: v[4] for e, v in QBRAID_DEVICES.items()},
}
NEEDS = {"qiskit": "qiskit_aer", "cudaq": "cudaq", "guppy": "guppylang", "notebook1": "qiskit_aer", "qbraid": "qbraid", "qbraid-qir": "qbraid", "notebook1-qbraid": "qbraid", "qbraid-gpu": "qbraid"}


def available() -> dict:
    """Engines this machine can run. qBraid ones need QBRAID_API_KEY; the GPU one spends qBraid credits
    (5 per minute), so it is offered only when GRIDTWIN_ALLOW_PAID=1."""
    import os

    out = {}
    for name in ENGINES:
        try:
            importlib.import_module(NEEDS[name])
        except Exception:
            continue
        if name.startswith("qbraid") or name == "notebook1-qbraid":
            if not os.environ.get("QBRAID_API_KEY"):
                continue
        if name == "notebook1-qbraid":
            try:
                importlib.import_module("qiskit_aer")
            except Exception:
                continue
        if name == "qbraid-gpu" and os.environ.get("GRIDTWIN_ALLOW_PAID") != "1":
            continue
        out[name] = LABELS[name]
    return out


def run(engine: str, p: float, f: float, rounds: int, seed: int) -> dict:
    t = time.perf_counter()
    out = ENGINES[engine](p, f, rounds, seed)
    out.update(engine=engine, label=LABELS[engine], line_error=p, eve_fraction=f, rounds=rounds,
               qber=(out["errors"] / out["sifted"]) if out["sifted"] else 0.0, expected=expected_qber(p, f),
               ms=round((time.perf_counter() - t) * 1000))
    return out


if __name__ == "__main__":
    print("available:", available())
    for engine in available():
        for p, f in ((0.033, 0.0), (0.033, 1.0), (0.033, 0.4)):
            r = run(engine, p, f, 3000, 7)
            sigma = math.sqrt(max(r["expected"] * (1 - r["expected"]), 1e-9) / max(r["sifted"], 1))
            flag = "ok" if abs(r["qber"] - r["expected"]) <= 4.5 * sigma else "OFF"
            print(f"{r['label']:28s} p={p} f={f}: QBER {r['qber']:.4f} expected {r['expected']:.4f} ({r['sifted']} sifted, {r['ms']} ms) {flag}")
