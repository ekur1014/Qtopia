# Secure the Grid (UTC): write-up

Tennessee Quantum Hackathon, Secure the Grid track. This one file holds every answer: it replaces the team's earlier separate write-ups (`WRITEUP_step1.md`, `WRITEUP_step2.md` and the first `WRITEUP.md`). Answers are labelled by Step and Part, as the track README asks, and the run record is at the end.

How this file was checked (14 Nov 2026):
- **Notebooks.** Every notebook was executed:
  - Notebooks 1 and 3 were run in full, cloud and hardware jobs included, and their outputs are saved.
  - Notebooks 2 and 2b were re-executed on scratch copies: no errors, and the results match their saved outputs within the expected sampling spread.
- **Job IDs.** Every job ID on our qBraid account was re-queried, and status and counts match.
- **Hardware results.** Each one was recomputed from the job's raw counts, not copied from the notebook.
- **Network figures.** The Step 3 numbers were recomputed from the network data in `grid-twin/data/networks/`.

Items marked **[TEAM]** need a teammate's input before submission.

---

## Step 1: Catch the eavesdropper (BB84)

Notebook: `1_bb84_eavesdropper.ipynb`. Alice encodes each bit with X when the bit is 1, then H when her basis is X. Bob measures in his own random basis, and the rounds where the bases differ are thrown away (sifting). The QBER is the error rate on the sifted bits.

### Part 1. Shared key, no eavesdropper
On Qiskit Aer, with 200 rounds and seed 42, Alice's and Bob's sifted keys match exactly: **QBER = 0.000**.

### Part 2. Add the eavesdropper
Eve intercepts every qubit, measures it in a random basis, and resends the state she saw. Half the time she picks the wrong basis, and then Bob's result is wrong half the time, so the expected QBER is 0.5 × 0.5 = **25%**.

- **Saved notebook run:** **QBER = 0.258** (25.8%). The notebook notes that with 200 rounds, 0.18 to 0.33 is normal.
- **Earlier run:** 0.237. The value moves from run to run because the simulator's measurements are random.
- **The jump from 0% to about 25% is the evidence that physics catches the spy.**

**Partial taps.** If Eve intercepts a fraction f of the photons on a fiber whose own noise is p, the expected error rate is **Q = p + f(1/4 − p/2)**. On a fiber with p = 3.3%, a full tap gives about 26.7%. This formula is what the live grid (Grid Twin) and the Photon line page use, and it was checked against Qiskit Aer, CUDA-Q, Guppy (Selene) and qBraid runs (Step 3, Part 3).

### Part 3. Hardware and thresholds
To avoid hundreds of paid jobs, 16 BB84 rounds are packed into one 16-qubit circuit and run once with 200 shots. Six of the 16 rounds survive sifting with this seed, giving about 1,200 measured bits. On the local Aer simulator, the batched QBER is **0.000**.

| Device | Kind | Shots | Wrong bits / sifted bits | QBER | Job ID |
|---|---|---|---|---|---|
| Qiskit Aer | local simulator | 200 | 0 / 1,200 | 0.000 | none (Aer creates no job) |
| **Rigetti Cepheus-1-108Q** (`aws:rigetti:qpu:cepheus-1-108q`) | **real QPU** | 200 | 51 / 1,200 | **4.25%** | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7` |
| IonQ simulator, noise model aria-1 | cloud simulator | 200 | 0 / 1,200 | 0.000 | `ionq:ionq:sim:simulator-a7ae-qjob-6af8bac1c8f5265fb3f20417` |
| Quantinuum H2 emulator | emulator (models readout error), not hardware | 200 | 1 / 1,200 | 0.08% | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8bac2c8f5265fb3f2041d` |
| qBraid QIR simulator | noise-free cloud simulator | 200 | 0 / 1,200 | 0.000 | `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af8bac4c8f5265fb3f20421` |

**Why the hardware run is on Rigetti, not IonQ Forte.** The README's suggested device is IonQ Forte, but it needs about 1,630 credits for 200 shots, and our first attempt was refused for lack of credits (1,630 required, 500 available on that account). The README lists Rigetti Cepheus as fine for BB84, which has no two-qubit gates, at 38.5 credits for 200 shots.

**What the hardware run shows**
- **Real hardware noise alone gives 4.25%.** On a real superconducting quantum computer, with no eavesdropper, gate and readout errors produce a QBER of 4.25%. That is the stand-in for a fiber's line noise.
- **The key is still usable.** 4.25% is well under the 11% abort line, so a secret key could still be distilled with error correction and privacy amplification.
- **The simulators can't show this.** All three cloud simulators and emulators stay at or near zero:
  - IonQ's noise model puts its noise mostly on two-qubit gates, and BB84 has none.
  - Quantinuum's emulator models readout error, but it is small on that machine (1 wrong bit in 1,200).
- **Each machine has its own noise floor.** Only the real QPU shows a realistic one, and an alarm threshold has to be set from the noise floor of the actual link.

**When to throw a key away**
- **Abort line: 11%.** Above about 11% QBER, one-way error correction and privacy amplification can no longer produce a secret key (Shor and Preskill), so the key is discarded and QKD stops on that fiber.
- **Alarm line: per fiber, not fixed.** Each fiber has its own baseline error from loss, dark counts and detector errors, so the alarm fires when a fiber's QBER rises *statistically* above its own baseline. This is how Grid Twin works, with an adjustable number of standard deviations.
  - The team's first draft used a fixed 7–8% alarm. Take a link whose own noise is the 4.25% we measured on Rigetti: a fixed 7% line lets a tap of up to about 12% of photons hide, since (0.07 − 0.0425) / (0.25 − 0.02125) ≈ 0.12. A full tap on that link would give about 27.1%. That is why the alarm is per fiber.
- **Can a careful spy hide in the line noise? Partly.** In Grid Twin's checks, on a fiber with a 3.3% baseline, a tap on 10% of photons is caught reliably, a 7% tap sits on the alarm line, and a 5% tap hides inside normal noise: QBER 4.5% against a warning line of about 4.7–5.0%.
  - What such a spy learns is bounded by the error rate. Privacy amplification shortens the key to remove that information, so a small hidden tap costs key rate, not secrecy.
- **What the utility does on an alarm.** The fiber stops trusting QKD keys and switches to post-quantum key exchange (ML-KEM), but stays up. Real traffic reroutes, and only an operator can take the fiber out of service. This way, an attacker can't use the alarm to cut communications.

### Part 4. What physics buys, and what it doesn't
**Why the secrecy comes from physics.** BB84's security rests on quantum mechanics, not on a math problem being hard.
- **Measurement disturbs the state.** Measuring a photon in the wrong basis gives a random result and destroys the original state. Eve doesn't know Alice's basis, so whenever she guesses wrong, the photon she resends is no longer the one Alice sent.
- **No copying.** The no-cloning theorem says no operation can copy an unknown quantum state. Eve can't keep a copy and forward the original untouched, so any information she gains shows up as errors.
- **Classical signals can be tapped silently.** A classical signal can be copied without a trace and stored for later decryption. A photon can't.

**What BB84 still needs from classical cryptography**
- **Authentication.** BB84 does not prove who is on the other end. Without an authenticated classical channel, Eve can impersonate each side to the other (a man-in-the-middle attack). The public discussion (bases, error correction, privacy amplification) must be authenticated, either with pre-shared keys and an information-theoretic MAC (Wegman–Carter) or with post-quantum signatures (ML-DSA, FIPS 204).

**Where real QKD has been attacked.** Real attacks target the hardware, not the protocol:
- **Detector blinding:** bright light forces single-photon detectors into a mode the attacker controls.
- **Trojan-horse attacks:** light sent into a device reflects back with information about its settings.
- **Trusted relays:** on long routes, every relay holds the key in the clear.

**What the agencies say**
- **NSA** does not recommend QKD for national security systems. It cites the lack of built-in authentication, the special hardware, and the trusted relays.
- **The UK NCSC** does not support QKD for government or military use.
- **France, Germany, the Netherlands and Sweden** published a joint position (ANSSI, BSI, NLNCSA and the Swedish authority, Jan 2024). It says QKD fits only niche uses, is not yet mature in security terms, and that post-quantum cryptography should come first.

---

## Step 2: Size up the threat (Shor's algorithm, post-quantum cryptography, Grover's search)

Notebooks: `2_shor_harvest_now.ipynb` and `2b_grover_symmetric_keys.ipynb`. Re-executed on 14 Nov:
- **Notebook 2:** r = 4 and 15 = 3 × 5 again. This time phase 3/4 was the most common outcome, which is normal sampling variation. The device list is unchanged.
- **Notebook 2b:** 100.0%, 94.1% and 95.5% for N = 4, 8 and 16 (exact theory 100%, 94.5%, 96.1%). The saved notebook shows 100.0%, 95.5% and 96.0%, as in the table below.
- **N = 16 cloud runs (added 14 Nov):** run with the notebook's own oracle and diffuser, on the Quantinuum H2 emulator and on Rigetti Cepheus (real hardware).
- **`check_grover.py`:** 0 mismatches for every key, N = 2 to 32.

### Part 1. Shor demo (factor 15)
Ran Shor's period-finding for N = 15, base a = 7, on Qiskit Aer (8 counting qubits, 1024 shots).
The runs land on phases 0, 1/4, 1/2 and 3/4. Phases 0 and 1/2 give a wrong period (r = 1 and r = 2, where 7^r mod 15 != 1), so we keep the first candidate that is even and satisfies 7^r mod 15 = 1.
That is phase 1/4 or 3/4 (either can come first; in the notebook's saved run the most common sample was phase 1/2, which gives r = 2 and is rejected, and the accepted r = 4 came from phase 3/4), giving **r = 4**. Then gcd(7^2 - 1, 15) = 3 and gcd(7^2 + 1, 15) = 5, so **15 = 3 x 5**.

What it proves and what it doesn't: the multiplication-by-7 circuit is hard-coded for N = 15 (a fixed swap/X pattern). It would not work for N = 21 or for a 2048-bit number, which needs a general modular-exponentiation circuit built from many fault-tolerant gates. The demo shows the period-finding idea, not the scale.
The threat: Shor's algorithm factors integers and solves discrete logs in polynomial time, which breaks RSA and elliptic-curve cryptography.

Real-hardware run (optional, our own extra). The circuit as written in the notebook compiles to about 13,300 two-qubit gates, far beyond any machine today. Because 7^4 = 1 (mod 15), every fourth repeat of the controlled multiplication does nothing, so we can drop those blocks without changing the result (checked on the ideal simulator: same four phases). With 4 counting qubits that is 168 two-qubit gates (about 255 once routed on Rigetti's grid). We ran it once on Rigetti Cepheus (200 shots). Result: 130 of 200 shots (65%) landed on the four ideal outcomes `0000`, `0100`, `1000`, `1100` (phases 0, 1/4, 1/2, 3/4), compared with 25% if the output were pure noise. The other 12 outcomes shared the remaining 35% (about 6 shots each). So the period-finding structure survives on a real quantum computer for N = 15, but this is the smallest possible case, and the circuit was cut down by hand. It does not factor anything we couldn't factor in our heads.

### Part 2. Hardware gap
Gate-based QPUs on qBraid (qBraid device catalog, 13 Nov 2026; each machine counted once, analog machines excluded). The notebook's SDK listing (cell 7) shows IonQ, IQM, Rigetti and AQT machines only; the IBM rows below come from the web catalog:

| Machine | Qubits |
|---|---|
| IBM Fez / Marrakesh / Kingston / Boston / Pittsburgh | 156 each |
| IBM Miami | 120 |
| Rigetti Cepheus-1-108Q | 107 |
| IQM Emerald | 54 |
| IonQ Forte 1 / Forte Enterprise 1 | 36 |
| IQM Garnet | 20 |
| AQT IBEX Q1 | 12 |

- Largest real device: **156 qubits** (IBM Fez, Marrakesh, Kingston, Boston) in the qBraid web device catalog. The notebook's own SDK device list (cell 7, run 13 Nov 2026) did not show the IBM machines, so its largest entry is **107 qubits** (Rigetti Cepheus-1-108Q; the 108Q name counts one unusable qubit). We report both.
- RSA-2048 needs, by estimate:
  - Gidney & Ekera (2019, revised 2021): about 20 million noisy physical qubits, 8 hours; a bit more than 3n logical qubits (about 6,000+ for n = 2048).
  - **Gidney (2025, arXiv:2505.15917): fewer than 1 million noisy physical qubits, under a week.** *(Logical-qubit count: not confirmed here; read the paper before quoting.)*
  - Pappalardo et al., Alice & Bob (IACR ePrint 2026/2665, Oct 2026): about 22,593 physical cat qubits, about 3.14 days. This is a theoretical estimate assuming a specific cat-qubit architecture and noise model (phase-flip noise only). Their largest chip has 12 cat qubits.
  - Iceberg Quantum "Pinnacle" (Feb 2026): under 100,000 physical qubits (secondary source; verify).
- The gap against Gidney 2025 (his figure is an upper bound, 'fewer than 1 million', so these are upper bounds too): 1,000,000 / 156 = up to about 6,400x (**3.8 orders of magnitude**) using the 156-qubit IBM machines, or 1,000,000 / 107 = about 9,300x (**4.0 orders**) using the SDK list. Either way, **about 4 orders of magnitude**. Against the 2019 estimate it is about 5 orders; for the Alice & Bob cat-qubit estimate about 2 orders, though that uses a different kind of qubit.
- What a qubit count leaves out: error rates, gate fidelity, connectivity, and how long qubits stay coherent. Running for days needs error-corrected logical qubits, which no machine above has at this scale. The estimates also fall over time, which is why "harvest now, decrypt later" is urgent even when the gap looks large.

Sources: Gidney 2025 (https://arxiv.org/abs/2505.15917); Alice & Bob (https://eprint.iacr.org/2026/2665).

### Part 3. Exposure map (written)
Assumption: a representative reference architecture for a city-scale utility like EPB, not an audited inventory of EPB's network. Vendor-specific details are marked **[verify]**.
Key idea: confidentiality risk ("harvest now, decrypt later") depends on how long the data must stay secret. Signature risk ("forge later") depends on how long the device lives. A 20-30 year relay trusts a signature check for its whole life.

| # | System | Quantum-vulnerable crypto | Must stay secure | Patch difficulty | Main threat |
|---|---|---|---|---|---|
| 1 | Substation to control-center VPN (IPsec/TLS) | RSA/ECDSA auth, ECDH key exchange | Links last 20+ yr; carries grid state and credentials | Low-Medium: gateway firmware; hybrid ML-KEM: RFC 9370 for IPsec/IKEv2, TLS 1.3 hybrid groups (such as X25519MLKEM768) for TLS [verify vendor support] | Harvest now (confidentiality) |
| 2 | Remote access (VPN, SSH, bastion, vendor access) | RSA/ECDSA keys, ECDH/X25519 | Long-lived credentials | Low: software upgrades (OpenSSH already ships a hybrid ML-KEM mode) | Harvest now + credential theft |
| 3 | SCADA/EMS to RTUs (DNP3 SAv5, IEC 62351) | SAv5's message authentication is symmetric (HMAC-SHA-256 by default; AES key wrap, with AES-128 as the baseline and AES-256 optional), but its optional remote update-key method uses RSA and DSA, which Shor breaks; ECDSA is not in SAv5. The TLS wrapper and PKI use RSA/ECC | RTU life 15-25 yr; telemetry and credentials 10+ yr | Medium: head-end is easy, RTU firmware is not | Harvest now on TLS |
| 4 | IEC 61850 (MMS, GOOSE, SV) and relays | TLS ECDHE/ECDSA. GOOSE/SV authentication: the 2007 edition of IEC 62351-6 used RSA signatures, but the 2020 edition moved to symmetric MACs (HMAC-SHA256, AES-GMAC) per published analyses, so the quantum exposure is mostly the key distribution and PKI behind it (IEC 62351-9), and older 2007-style deployments [verify against the standard text] | Relay life 20-30 yr; GOOSE/SV carry little secret data, so forged or replayed commands are the risk | High: GOOSE must fit in one Ethernet frame (about 1,500 bytes; typical messages are far smaller) and meet tight latency budgets, so ML-DSA signatures (2.4-4.6 KB) cannot be attached to each message | Forge later via key or PKI compromise (malicious trip); low confidentiality risk |
| 5 | Utility PKI / certificate authorities | RSA/ECDSA roots, 20-25 yr validity | Roots issued today stay trusted into the 2040s and beyond (20-25 yr validity) | High: HSMs, cross-signing, every relying party | Forge later + harvest |
| 6 | Firmware signing and secure boot (relays, RTUs, meters, gateways) | RSA/ECDSA; trust anchor often in ROM/OTP | Device life 15-30 yr | Very high: an immutable ROM anchor can't be field-patched | Forge later (highest consequence) |
| 7 | Smart-meter AMI | ECC P-256 key agreement/certs; AES payload | Meter life 10-20 yr; customer data 5-10 yr | Very high: millions of constrained devices | Harvest now on customer data |
| 8 | ICCP/TASE.2 between utilities, synchrophasors | TLS with RSA/ECC; C37.118 often unencrypted | Inter-utility trust 15-25 yr | Medium-High: bilateral agreements | Forge later on peer identity |
| 9 | DER, OpenADR, customer/vendor APIs | TLS RSA/ECC certs; RS256/ES256 tokens | 10-20 yr; PII and DER commands | Low-Medium: cloud side agile, embedded gateways not | Harvest now on PII |
| 10 | Enterprise IT (S/MIME, certificates, TLS, backups, billing; Kerberos is mostly symmetric AES, with RSA/ECDSA only in optional PKINIT) | RSA/ECDSA in S/MIME, certificates and TLS; AES at rest | Retention 7-10+ yr | Low-Medium: broad but mainstream roadmaps | Harvest now on email/backups |

Honest limits on the exposure: much utility traffic runs on private fiber, not the public internet, so passive interception is harder than for internet traffic. That lowers (but doesn't remove) harvest-now risk, and it is why the signature and firmware items matter as much as key exchange.
Symmetric crypto (AES, SHA-2) is not broken by Shor. NIST expects to keep both; use AES-256 where margin matters (see Step 2, Part 5).

### Part 4. Migration plan (written)
Standards: ML-KEM (FIPS 203) for key establishment, ML-DSA (FIPS 204) for signatures, SLH-DSA (FIPS 205) and LMS/XMSS (SP 800-208) for hash-based signatures, which suit firmware and constrained devices.
Timeline: NIST IR 8547 (final, 27 Oct 2026) deprecates RSA/ECC after 2030 and disallows them after 2035. The final version is stricter than the 2024 draft: the draft only deprecated 112-bit-strength algorithms after 2030, while higher-strength ones such as P-256 and RSA-3072 were only disallowed after 2035; the final deprecates quantum-vulnerable public-key algorithms after 2030. This binds NIST standards; for a municipal utility it matters through contracts, regulators or internal policy. US EO 14412 (22 June 2026) sets federal deadlines for high-value assets and high-impact systems (excluding national security systems): post-quantum key establishment by 31 December 2030 and post-quantum digital signatures by 31 December 2031 (read from the order's text). Hybrid modes (ML-KEM plus a classical algorithm) are not meant to fall under the 2035 disallowance.
Regulation: NERC CIP-012-2 (enforceable 1 July 2026) requires protecting control-center-to-control-center data against disclosure, modification and loss of availability. It is technology-neutral and does not mandate encryption, but encryption is the usual method. CIP-005-8 (not yet enforceable; effective 1 July 2028 per NERC's standard page) adds communication-link protection.

| Rank | Fix | What to deploy | Why this rank |
|---|---|---|---|
| 1 | Inventory + crypto agility | Cryptographic inventory (CBOM); require negotiable algorithms and replaceable crypto in all new procurement | You can't migrate what you can't see; agility is the hedge against changes |
| 2 | Key exchange on every network edge: VPN, TLS, SSH, remote access | Hybrid X25519+ML-KEM-768 now (ML-KEM-1024 for the longest-lived data) | Harvest-now is live today; software-only; mature hybrids exist |
| 3 | Firmware signing and trust anchors | Dual-sign (RSA/ECDSA + LMS/XMSS or ML-DSA); require PQC-capable hardware in new buys | Longest lead time, highest consequence; a ROM anchor bought in 2027 must verify into the 2040s |
| 4 | PKI / CA hierarchy | ML-DSA or hybrid certificate chains, HSM firmware, plan for larger certificates and CRLs | Every other system depends on issuable PQC certificates; root rollover takes years |
| 5 | AMI / smart meters | PQC-capable and AES-256 requirements in the next meter RFQ; head-end ML-KEM first | A 15-20 yr fleet locks in today's purchase decision |
| 6 | SCADA/EMS and DNP3 | Keep SAv5's symmetric authentication (HMAC-SHA-256; use AES-256 key wrap where supported) and disable the RSA/DSA update-key option; upgrade the TLS layer to hybrid ML-KEM at the head-end | The vulnerable parts are the update-key option and the centrally-updatable wrapper |
| 7 | IEC 61850 / GOOSE | Move to MAC-based authentication (IEC 62351-6:2020 style, HMAC-SHA-256 or AES-GMAC) and protect the key distribution and PKI behind it; watch IEC 62351 PQC profiles for the PKI side | Frame size and latency, not the math, set the schedule; symmetric MACs already fit |
| 8 | ICCP and synchrophasors | Hybrid TLS; rewrite bilateral agreements | Multi-party governance is the bottleneck: start contracts early |
| 9 | DER and customer/vendor APIs | Hybrid TLS and PQC clauses in aggregator contracts | Low cost, but third parties control the timing |
| 10 | Enterprise IT | Mainstream vendor PQC updates, AES-256 | Broad but lower criticality |
| 11 | Symmetric keys (AES, from Part 5) | AES-256 in all new procurement and for data that must stay secret for decades; revisit AES-128 equipment at normal refresh | Not an emergency: Grover only halves the key exponent and NIST says AES-128 stays secure for decades; the fix is a longer key, not a new algorithm |

Reasoning: confidentiality (key exchange) is urgent now because recording is cheap. Signatures are driven by lead time, because a forged signature needs a working large quantum computer. Hardware that can't be patched in the field (ROM anchors, meters) is the true long pole.
Disagreement between our AI drafts, and how we resolved it: one draft ranked the PKI second, another ranked firmware third. We put firmware above PKI because device trust anchors can't be patched later, while a PKI can be rolled forward in software.

### Part 5. Grover's search and symmetric keys
What we ran (notebook `2b_grover_symmetric_keys.ipynb`): a Grover search with a phase oracle and a diffuser, on Qiskit Aer (noise-free, 1024 shots), with the number of iterations floor((pi/4) sqrt(N)).

| N | Iterations | Measured success (Aer) | Exact theory | IonQ noisy simulator (forte-1 noise model, 200 shots) | Quantinuum H2 emulator (200 shots) | Real QPU: Rigetti Cepheus (200 shots) |
|---|---|---|---|---|---|---|
| 4 | 1 | 100.0% | 100.0% | 100% | 100% (200/200) | **88.5%** (177/200) |
| 8 | 2 | 95.5% | 94.5% | 71.5% | 92.5% (185/200) | **45.0%** (90/200) |
| 16 | 3 | 96.0% | 96.1% | 36.0% | 87.0% (174/200) | **4.5%** (9/200) |

- On the noise-free simulator the most common outcome is the secret key in every run. We also checked the oracle and diffuser against the exact Grover formula for every possible key for N = 2 to 32 with `check_grover.py` in this repo: no mismatches.
- Noise: the peak stays on the right key on IonQ's noisy simulator, but it shrinks fast as the circuit grows (about 2, 24 and 84 two-qubit gates for N = 4, 8, 16, per the notebook). At N = 16 the right answer is still the most common one, but only about one shot in three. The IonQ simulator and the Quantinuum emulator are noise models, not real hardware. The two noisy runs disagree on how much noise matters: IonQ's simulator model drops N = 8 to 71.5%, while the Quantinuum H2 emulator (which models a different trapped-ion machine, readout error included) stays at 92.5%. Different devices and noise models give different answers, so a noise number is only meaningful for the machine it models. At N = 16 the emulator still found the key 87.0% of the time (174/200).
- **Real hardware (Rigetti Cepheus, a superconducting QPU).** The right key was still the most common outcome both times, but the peak shrank sharply: 88.5% at N = 4 (2 two-qubit gates) and 45.0% at N = 8 (24 two-qubit gates before routing; Rigetti's grid layout adds more). Random guessing would give 25% for N = 4 and 12.5% for N = 8, so the answer is still clearly visible. Most wrong outcomes at N = 8 got 5 to 10% each, so the peak is real but far from the 94.5% the theory gives. Real hardware did worse than both noise models for N = 8 (45% vs 71.5% and 92.5%): a noise model is only as good as its match to the actual machine. We also ran N = 16 (about 84 two-qubit gates before routing). There the right key came up on only 9 of 200 shots (4.5%), below the 6.25% of random guessing, and the most common outcomes were wrong keys (21 shots each). At that size the noise wipes out the search. The takeaway for the utility: today's machines can find a 3-bit key by Grover's search, but the success rate falls quickly as the circuit grows, so there is no practical threat to AES from this direction.
- A toy search over N = 16 keys says nothing about AES. The point is the scaling: Grover needs about sqrt(N) steps instead of N.

**Answer: what Grover means for AES key length.** Grover cuts a brute-force search over 2^128 keys (AES-128) to about 2^64 quantum steps, and over 2^256 (AES-256) to about 2^128. It does not break AES; it halves the exponent. Two things limit it in practice. Each Grover step must run a full AES circuit on an error-corrected quantum computer, and Grover can't be split across many machines the way classical guessing can: NIST's PQC FAQ notes that, per Zalka (1997), the full quadratic speedup requires all the steps to run in series, so a parallel attack gets a smaller advantage.
What NIST says (PQC FAQ, "should we double the key length for AES now?", added 18 Nov 2018): "it is quite likely that Grover's algorithm will provide little or no advantage in attacking AES, and AES 128 will remain secure for decades to come", and current applications can keep using AES with 128, 192 or 256-bit keys.
Our recommendation for the utility: keep AES-128 where it is today, but specify **AES-256 for new equipment and for data that must stay secret for decades** (smart meters, relays, firmware images, VPNs). It costs almost nothing extra, and it removes any argument about Grover. This also matches the stricter US national-security guidance: NSA's CNSA 2.0 specifies AES with 256-bit keys.
**Compared with RSA: less urgent, and easier to fix.** Shor's algorithm breaks RSA and elliptic curves outright, in polynomial time, so there is no key length that saves them: the algorithm has to be replaced (ML-KEM, ML-DSA). Grover only weakens AES by a square root, and the fix is the same algorithm with a longer key. The hard part is not the math but devices that are hard-coded to AES-128 and can't be changed in the field: another reason to require AES-256 in the next purchase.
In the migration plan (Part 4): symmetric keys are row 11, the lowest priority: not an emergency, but AES-256 goes into all new procurement.

---

## Step 3: Design the network (capstone)

### Part 1. Architecture
**The network: Chattanooga's real grid.** It is imported from OpenStreetMap, the data behind OpenInfraMap, as the mentors suggested, and was fetched on 14 Nov 2026 (© OpenStreetMap contributors, ODbL). We assume communication fiber runs along every power line, as optical ground wire usually does.
- **117 sites and 145 lines.** Sites: 2 control centers, 31 major substations and 84 distribution sub-units.
- **Control centers (assumed).** Which two sites are the control centers is our assumption, because the real locations are not public: Oglethorpe (EPB) and Chickamauga (TVA).
- **Line lengths.** 0.2 to 22.2 km, median 3.5 km.

**Where QKD goes and where PQC goes**
- **QKD (BB84) on 34 backbone fibers.** These run along the 161 kV (30), 230 kV (2) and 500 kV (2) lines between the control centers and the major transmission substations. This follows the mentors' advice: QKD only at high-value points.
- **Post-quantum cryptography on the other 111 fibers.** These run along the 46 kV lines to distribution sub-units and use ML-KEM (FIPS 203) for keys and ML-DSA (FIPS 204) for authentication. QKD to every neighborhood substation would multiply equipment and relays for little gain.
- **PQC protects everything; QKD adds a physical eavesdropper alarm** on the fibers where it is worth it.

**The four limits the README asks about**
- **Distance.** Fiber QKD reaches roughly 80 to 100 km before relays are needed, because loss grows with distance (about 0.2 dB/km at 1550 nm). The longest QKD fiber in Chattanooga is 22 km, well inside that.
  - Statewide, on Tennessee's 500 kV backbone (33 sites, 38 spans, also from OpenStreetMap), 8 spans are longer than 80 km. Those run on ML-KEM in our model, or would need trusted relays.
- **Number of substations.** QKD on all 145 fibers would mean a matched device pair on every fiber. Backbone-only QKD keeps it to 34 fibers. Grid Twin can show both: "Backbone only" (our design) and "Every fiber" (the team's whiteboard sketch).
- **Trusted nodes.** A QKD key crosses one fiber. To reach a farther substation, it is relayed hop by hop, and every relay holds the key in the clear. So relays must be physically secured sites, and Grid Twin marks them with gold rings. Because each relay is a place an insider could read the key, key paths and the route search (below) use the fewest relay sites they can. Keys switch to ML-KEM wherever no healthy QKD chain exists.
- **Timing synchronization.** The two ends of a QKD link must agree on time closely enough to match detections to pulses: nanosecond-scale detector gating. Sites are synchronized with GPS-disciplined IEEE 1588 Precision Time Protocol, using the IEEE C37.238 power profile already used in substations.

**What happens when a fiber is tapped.** Its QBER rises, the per-fiber alarm fires, and the response runs on its own. It is demonstrated live in Grid Twin:
- The fiber's keys switch to ML-KEM, and the fiber stays up.
- Real traffic reroutes along the least risky path.
- The fiber runs decoy traffic, so the tap can be measured. This is only used when no site would be stranded.
- A crew inspection is recommended.

The response cuts communication paths only, never power. Only an operator can quarantine a fiber.

**Route search: how site A reaches site B.** The inputs are a start site, an end site and a QBER cutoff (QBER is the share of key bits that arrive wrong). The cutoff is a slider from 1% to 25%; the default, 11%, is the Shor–Preskill limit. A fiber at or above the cutoff counts as tapped and is not used.
- **Fewest sites first.** There are no quantum repeaters, so every site a QKD key passes through is a trusted relay: it measures the key and re-encrypts it for the next fiber. Someone inside that site, an insider or a hacked device, could read the key before it is re-encrypted. So the search minimises the number of intermediate sites first, and only then the risk-weighted distance, km × (1 + 20 × QBER). Grid Twin shows how this compares with the plain shortest route by km ("the shortest route would pass through N sites; this one passes through M").
- **Fallback order.**
  1. A clean QKD route, every fiber under the cutoff, relayed by trusted sites.
  2. If there is none: the best route over every fiber still in service, on ML-KEM keys agreed end to end. Sites along the way only forward ciphertext they cannot read.
  3. If there is no physical path at all: the site is islanded. Power stays on, it runs on local protection, and a crew is dispatched.
- **Where it runs.** In the live grid's "Find a route" panel (Start and End pickers, the cutoff slider, the route highlighted in 3D with its hops, km, highest QBER and trusted sites, updated live as taps are placed), in `grid-twin/src/route.js`, and in the Python twin `chattanooga_router.py`. The cutoff, the blocked-link rule, the cost formula and the ML-KEM fallback come from teammate Asheb's earlier router. The automatic response above uses the same fewest-sites rule for its QKD key paths.

**Grover in the route search (a demonstration, not a speed-up).** Yen's k-shortest routes give N = 8 candidate QKD routes (3 qubits). Notebook 2b's Grover oracle, generalised to M marked items, marks the clean ones (every fiber under the cutoff), followed by 2b's diffuser, for floor(π / (4·asin(√(M/N)))) iterations, the optimal count (the textbook round(π/4 · √(N/M)) overshoots when more than half the routes are clean; with most routes clean it uses 0 rounds, since a plain random draw already wins). The route it draws is then checked classically. With no clean route (M = 0) the output stays uniform, every check fails, and the search falls back to ML-KEM. `3b_grover_route_search.ipynb` runs it on Qiskit Aer, and `check_grover.py` verifies the generalised oracle for every subset of marks at N = 8. Dijkstra solves this exactly and fast on a classical computer, and the oracle is built from QBER values we already know. This shows the same Grover circuit from 2b running on the grid problem with √N oracle queries; it is not a speed-up claim.

**Diagram:** the live grid page (`grid-twin/`, or the one-file `grid_twin.html`). **[TEAM]** Save a screenshot of the healthy grid and one with a tapped fiber as image files in this folder, for the Solution slide.

### Part 2. Assumptions and tradeoffs
**Assumptions**
- **Fiber routes.** Fiber runs along every power line. The real fiber routes are not public.
- **Control centers.** The two control-center locations are our assumption.
- **Fiber parameters.** 0.21 dB/km loss, 4.5% detector efficiency, 1.7 × 10⁻⁶ dark counts and 3.3% detector error, from Table 1 of Ma, Qi, Zhao and Lo (arXiv quant-ph/0503005). The baseline-error formula is the single-photon case of Eq. (8) of Lo, Ma and Chen (2005).
  - A 140 km fiber therefore detects about 537 times fewer photons than a 10 km one, so it takes much longer to build up evidence of a tap.
- **Distance limit.** Roughly 80–100 km for fiber QKD without relays, from the mentors. EPB's own field test is the reference for a utility: Evans et al., "Trusted Node QKD at an Electrical Utility", IEEE Access 2021 (arXiv:2103.09877). It ran three QKD systems on an isolated part of EPB's fiber, with trusted nodes.
- **Cost.** We found no published price for QKD equipment: vendors don't publish prices. See Part 5.

**Tradeoffs**
- **QKD detects taps on the link; PQC doesn't.** But QKD does not authenticate, needs relays, and costs hardware on every fiber.
- **PQC covers every link and every system with software and firmware.** Its security rests on math problems believed hard for quantum computers, not on physics.
- **Fixed versus per-fiber alarm threshold.** A fixed threshold is simpler, but a per-fiber threshold catches smaller taps (Step 1, Part 3).
- **Alarm response.** Keeping an alarmed fiber up on ML-KEM keeps an attacker from forcing outages by tapping. The cost is that the fiber carries post-quantum-protected traffic during an incident.

### Part 3. Working prototype
**Option B, the teleportation link (`3_secure_grid_link.ipynb`).** Alice sends a generic state, RY(1.0) then RZ(0.7), over an entangled pair, with deferred-measurement corrections (CX and CZ). Bob undoes the state, so a working link reads 0 on qubit 2 every time.
The runs are saved in the notebook:

| Device | Kind | Shots | Qubit 2 read 0 | Job ID |
|---|---|---|---|---|
| Qiskit Aer | local simulator | 1024 | **1024 of 1024** (100%) | none |
| IonQ simulator, noise model forte-1 | cloud simulator | 200 | 195 of 200 (97.5%) | `ionq:ionq:sim:simulator-a7ae-qjob-6af8baa7c8f5265fb3f203fa` |
| Quantinuum H2 emulator | emulator, not hardware | 200 | 199 of 200 (99.5%) | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8babac8f5265fb3f2040d` |
| **Rigetti Cepheus-1-108Q** | **real QPU** | 200 | **167 of 200 (83.5%)** | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8bab8c8f5265fb3f2040a` |

**What the hardware run shows**
- **The link works on real, noisy gates.** For this one input state, the share of zeros measures how close Bob's state is to Alice's: 83.5% on real hardware, against 100% in theory. The undo gates add a little noise of their own. The circuit uses 4 two-qubit gates before routing (three CX and one CZ), so it feels gate noise that BB84 doesn't.
- **What the test does not cover.** All three qubits are on one chip, so this tests the link's logic, not distance. A real link would deliver the entangled pair over fiber and send the two correction bits classically.
- **What it means for trusted nodes (Part 1).** With entanglement swapping, the middle nodes would never hold the key, unlike trusted relays. That needs high-quality entanglement over every hop, which is a roadmap item, not something to deploy today.

**Also built: BB84 on every backbone fiber, live (Grid Twin).** Any fiber can be re-run as real quantum code from the page. For one fiber with a 40% tap (theory 12.64%):

| Engine | QBER |
|---|---|
| Qiskit Aer | 13.52% |
| NVIDIA CUDA-Q | 12.11% |
| Quantinuum Guppy on the Selene emulator | 11.15% |
| qBraid IonQ simulator | 12.55% (job `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7`, re-checked: COMPLETED) |
| The team's own notebook 1 code on qBraid's QIR simulator | 12.48% |

All are within statistical error of the theory.

### Part 4. Rollout plan
**[TEAM]** This is a draft, put together from the Step 2 migration ranking and the Step 3 design. Confirm it before it goes on a slide.
1. **Now (software, no new hardware).**
   - A cryptographic inventory.
   - Hybrid ML-KEM on every VPN, TLS and SSH edge.
   - PQC-capable hardware and AES-256 required in all new procurement.
   - Dual-signed firmware (classical plus a hash-based or ML-DSA signature).

   These are Step 2, Part 4, ranks 1–3. They protect every link against "harvest now, decrypt later".
2. **Next (pilot).** QKD on a few short backbone fibers near the control centers, with per-fiber QBER monitoring and the automatic ML-KEM fallback. Measure the key rate, the false-alarm rate and the upkeep on EPB's real fiber, building on EPB's 2021 field test.
3. **Later (only if the pilot justifies it).**
   - Extend QKD to the remaining backbone fibers (34 in total).
   - Secure the trusted relays.
   - Finish the PKI, AMI and SCADA migrations (Step 2, Part 4, ranks 4–11).
   - Statewide links over 80 km stay on ML-KEM unless relays prove worth their cost.

### Part 5. Cost versus security
**What it costs**
- **No published QKD price.** ID Quantique and Toshiba do not publish prices. Price figures in an earlier draft of our write-up had no source and have been removed.
- **What we can say from the architecture.** Each QKD fiber needs a matched pair of devices and suitable fiber, and every hop of a longer route needs a secured relay. So QKD cost grows with the number of fibers and hops: 34 fibers in our design, against 145 for QKD everywhere.
- **PQC is mostly software and firmware updates**, plus replacing devices that can't be updated at their normal refresh time. We found no utility-specific dollar figure. For scale, the White House (OMB/ONCD, July 2024) estimated about $7.1 billion to migrate priority federal civilian systems over 2025–2035, a figure OMB itself flags as high-uncertainty.

**What it protects, and what a cheaper option leaves exposed**
- **PQC alone** protects every link and system against harvest-now and forge-later attacks with standards-backed algorithms (FIPS 203, 204 and 205). It does not detect a tap: an eavesdropper on a PQC fiber is invisible, though what they record stays encrypted.
- **Adding QKD on the 34 backbone fibers** buys a physical tap alarm on the most important links, and keys whose secrecy doesn't depend on math assumptions. It does not replace PQC, which still provides authentication and covers everything else.

**Recommendation for the board.** PQC everywhere first: it is cheap, broad and required by the timelines. Then a QKD pilot on the backbone, expanded only if it proves its value. A design with PQC only is a defensible fallback.

---

## Run record (every cloud run)

### Step 1
| Part | Device | Shots | Status | Job ID | Result |
|---|---|---|---|---|---|
| Parts 1–2 | Qiskit Aer (local) | 200 rounds | completed | none | QBER 0.000 clean, 0.258 with Eve (saved run) |
| Part 3 | Qiskit Aer (local), batched circuit | 200 | completed | none | QBER 0.000 |
| Part 3 | **Rigetti Cepheus-1-108Q, real QPU** | 200 | COMPLETED, 38.5 credits | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7` | QBER 4.25% (51/1,200) |
| Part 3 | IonQ simulator, aria-1 noise model | 200 | COMPLETED, 0 credits | `ionq:ionq:sim:simulator-a7ae-qjob-6af8bac1c8f5265fb3f20417` | QBER 0.000 |
| Part 3 | Quantinuum H2 emulator | 200 | COMPLETED, 0 credits | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8bac2c8f5265fb3f2041d` | QBER 0.08% (1/1,200) |
| Stretch | qBraid QIR simulator | 200 | COMPLETED, 0 credits | `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af8bac4c8f5265fb3f20421` | QBER 0.000 |
| Part 3 (earlier) | IonQ Forte through AWS, real QPU | 200 | **refused: insufficient credits** (1,630 required, 500 available) | none | none |
| Part 3 (earlier) | IonQ simulator, aria-1 noise model | 200 | completed (teammate's account; not re-checkable from ours) | `ionq:ionq:sim:simulator-a7b0-qjob-6af7c328f15852ed27b72012` | QBER 0.08% (reported) |

### Step 2
- Part 1: Qiskit Aer simulator on a laptop (no cloud job, no credits); result r = 4, 15 = 3 x 5.
- Part 2: qBraid device catalog queried 13 Nov 2026; no hardware jobs run.
- Part 2: notebook cell 7 listed devices through the qBraid SDK (107 qubits at most; no IBM machines in that list); the web catalog lists IBM at 156 qubits.
- Part 5: Qiskit Aer for the N = 4, 8, 16 searches (no job IDs; Aer doesn't create one). Three jobs on the free IonQ simulator (`ionq:ionq:sim:simulator`, noise model forte-1, 200 shots, status COMPLETED, cost 0):
  - N = 4: `ionq:ionq:sim:simulator-a7ae-qjob-6af7caaff15852ed27b7215d`
  - N = 8: `ionq:ionq:sim:simulator-a7ae-qjob-6af7cacbf15852ed27b72167`
  - N = 16: `ionq:ionq:sim:simulator-a7ae-qjob-6af7cadcf15852ed27b7216d`
  - Three jobs on the free Quantinuum H2 emulator (`quantinuum:quantinuum:sim:h2-emulator`, 200 shots, COMPLETED, cost 0 credits; emulator, not hardware). The first two were submitted as OpenQASM 2 through the qBraid plugin because the SDK on our laptop failed to parse QASM 2 locally; the N = 16 job went through the SDK after `openqasm3` was pinned to 1.0.1:
    - N = 4: `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af7ccc1f15852ed27b721e3` (200/200 on key 2)
    - N = 8: `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af7ccc3f15852ed27b721e6` (185/200 on key 6)
    - N = 16, key 14 (added 14 Nov): `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8baa6c8f5265fb3f203f4` (174/200 on key 14)
  - Real hardware: four jobs on Rigetti Cepheus-1-108Q through AWS Braket (`aws:rigetti:qpu:cepheus-1-108q`, 200 shots each, COMPLETED, 38.5 qBraid credits each, 154 credits total):
    - Grover N = 4, key 2: `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d357f15852ed27b72465` (177/200 on key 2)
    - Grover N = 8, key 6: `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d357f15852ed27b72468` (90/200 on key 6)
    - Shor, factoring 15 (reduced circuit, 4 counting qubits): `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d39af15852ed27b724ad` (130/200 on the four ideal outcomes)
    - Grover N = 16, key 14 (added 14 Nov): `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa7c8f5265fb3f203fd` (9/200 on key 14)
  - Open Quantum attempts that did not produce results: our first three jobs on IonQ Forte (`openquantum:ionq:qpu:forte-1`) failed because no Open Quantum account was linked; after linking, the Shor job was cancelled immediately (no reason given, probably out of Open Quantum credits) and the two Grover jobs stayed queued. We also could not send jobs to IBM machines: qBraid does not support direct access to them from this account.
- Tools: AI assistants helped draft and check the written analysis and code; we reviewed and merged the results. Checked against primary sources: NIST IR 8547, CIP-012-2 effective date, EO 14412. Confirmed from primary pages: CIP-005-8 effective date, CNSA 2.0 specifying AES-256, EO 14412 deadlines (2030 key establishment, 2031 signatures). Confirmed from standards-body and research sources: DNP3 SAv5 crypto, EPB's customer count. Confirmed only from published analyses, not the standard's text: IEC 62351-6:2020 using symmetric MACs. Not confirmed: vendor support for hybrid modes.

Sources: NIST PQC FAQ on AES and Grover (https://csrc.nist.gov/projects/post-quantum-cryptography/faqs); NIST IR 8547 (https://csrc.nist.gov/pubs/ir/8547/final); FIPS 203/204/205 and SP 800-208 (https://csrc.nist.gov/projects/post-quantum-cryptography); NERC CIP-012-2 (https://www.nerc.com/standards/reliability-standards/cip/cip-012-2); EO 14412 (https://www.federalregister.gov/documents/2026/06/25/2026-12909/securing-the-nation-against-advanced-cryptographic-attacks); service-life data: SEL paper (https://cms-cdn.selinc.com/assets/Literature/Publications/Technical%20Papers/7045_BalancingSubstation_DD_20220311_Web.pdf).

Re-checked on 14 Nov 2026: all ten Step 2 job IDs above were queried on qBraid. All are COMPLETED, and their counts match the table: 177, 90, 130 and 9 of 200 on Rigetti; 143 and 72 of 200 on the IonQ simulator for N = 8 and 16; 200, 185 and 174 of 200 on the H2 emulator.

### Step 3
| Part | Device | Shots | Status | Job ID | Result |
|---|---|---|---|---|---|
| Part 3 | Qiskit Aer (local), teleportation | 1024 | completed | none | 1024 of 1024 |
| Part 3 | IonQ simulator, forte-1 noise model, teleportation | 200 | COMPLETED, 0 credits | `ionq:ionq:sim:simulator-a7ae-qjob-6af8baa7c8f5265fb3f203fa` | 195 of 200 |
| Part 3 | Quantinuum H2 emulator, teleportation | 200 | COMPLETED, 0 credits | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8babac8f5265fb3f2040d` | 199 of 200 |
| Part 3 | **Rigetti Cepheus-1-108Q, real QPU, teleportation** | 200 | COMPLETED, 38.5 credits | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8bab8c8f5265fb3f2040a` | 167 of 200 |
| Part 3 (earlier) | IonQ simulator, forte-1 noise model, teleportation | 200 | completed (teammate's account; not re-checkable from ours) | `ionq:ionq:sim:simulator-a7b2-qjob-6af7d3fcf15852ed27b724f1` | 197 of 200 (reported) |
| Part 3 | IonQ simulator (Grid Twin, one fiber, 40% tap) | 1000 | COMPLETED (re-checked) | `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7` | QBER 12.55% (theory 12.64%) |

## What changed from the earlier write-ups
1. **Step 1, Part 2.** The Eve result is now the saved notebook's value (0.258).
2. **Step 1, Part 3.**
   - Removed the claim that IonQ Forte showed a 1.5–4.5% baseline: no Forte run exists.
   - Added the real-hardware run (Rigetti, 4.25%) and fresh free-backend runs with job IDs.
   - Dropped the Quantinuum "2.1%", which had no job ID; our emulator run gives 0.08%.
   - Added the per-fiber alarm reasoning alongside the 11% abort line.
3. **Step 2.** Replaced `WRITEUP.md`'s Step 2 with the verified `WRITEUP_step2.md`. This fixes "4 to 20 million" qubits (now: under 1 million, Gidney 2025), "Rigetti Aspen" (now: Cepheus) and AES-256 as "unbreakable".
4. **Step 3, Part 1.** Now the Chattanooga real-grid design, in line with the team's decision to drop the dual ring. Removed the unmeasured "<12 ms" switching claim and the satellite tier.
5. **Step 3 labels.** The teleportation link is Part 3, as in the README. Added the missing Parts 2 (assumptions and tradeoffs) and 4 (rollout, marked as a draft). The cost table's unsourced dollar figures are gone.
6. **New runs on 14 Nov.**
   - BB84 and teleportation on real hardware (Rigetti), and Grover N = 16 on the H2 emulator and Rigetti.
   - Notebook 3 now has saved outputs.
   - Our 3 Rigetti jobs cost 115.5 credits; every simulator and emulator job cost 0.
