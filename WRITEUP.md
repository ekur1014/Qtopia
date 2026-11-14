# Secure the Grid (UTC): write-up

Tennessee Quantum Hackathon, Secure the Grid track. Answers are labelled by Step and Part, as the track README asks. Every cloud run, with its job ID, is listed in the run record at the end.

How the numbers were checked (14 Nov 2026):
- Notebooks 1 and 3 were run in full, cloud and hardware jobs included, and their outputs are saved. The local cells of notebooks 2, 2b and 3b were re-run on scratch copies with no errors; the results agree with the saved outputs within sampling spread.
- Every hardware result was recomputed from the job's raw counts, and every job ID on our qBraid account was re-queried.
- Gate counts, theory values and the Step 3 network figures were recomputed from the circuits and from the network data in `grid-twin/data/networks/`.
- `check_grover.py` checks the Grover oracle and diffuser against the exact formula (0 mismatches).

---

## Step 1: Catch the eavesdropper (BB84)

Notebook: `1_bb84_eavesdropper.ipynb`. Alice encodes each bit with X when the bit is 1, then H when her basis is X. Bob measures in his own random basis. Rounds where the bases differ are thrown away (sifting), and the QBER is the error rate on the sifted bits.

### Part 1. Shared key, no eavesdropper
On Qiskit Aer, with 200 rounds and seed 42 (93 rounds survive sifting), Alice's and Bob's sifted keys match exactly: QBER = 0.000.

### Part 2. Add the eavesdropper
Eve intercepts every qubit, measures it in a random basis and resends the state she saw. Half the time she picks the wrong basis, and then Bob's result is wrong half the time, so the expected QBER is 0.5 × 0.5 = 25%.

The saved notebook run gives QBER = 0.258. The value changes from run to run because the simulator's measurements are random (two of our re-runs gave 0.237 and 0.312); for 93 sifted bits the 95% range is 0.16 to 0.34. Either way, the jump from 0% to about 25% is what exposes Eve.

**Partial taps.** If Eve intercepts a fraction f of the photons on a fiber whose own error rate is p, the expected QBER is Q = p + f(1/4 − p/2). On a fiber with p = 3.3%, a full tap gives about 26.7%. Grid Twin and the Photon line page use this formula, and it was checked against Qiskit Aer, CUDA-Q, Guppy (Selene) and qBraid runs (Step 3, Part 3).

### Part 3. Hardware and thresholds
To avoid hundreds of paid jobs, 16 BB84 rounds are packed into one 16-qubit circuit and run once with 200 shots. Six of the 16 rounds survive sifting with this seed, giving 1,200 measured bits. These are 200 repeats of the same six states on the same six qubits, so the result is a rough estimate of the noise floor.

| Device | Kind | Shots | Wrong / sifted bits | QBER | Job ID |
|---|---|---|---|---|---|
| Qiskit Aer | local simulator | 200 | 0 / 1,200 | 0.000 | none (Aer creates no job) |
| **Rigetti Cepheus-1-108Q** | **real QPU** | 200 | 51 / 1,200 | **4.25%** | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7` |
| IonQ simulator, aria-1 noise model | cloud simulator | 200 | 0 / 1,200 | 0.000 | `ionq:ionq:sim:simulator-a7ae-qjob-6af8bac1c8f5265fb3f20417` |
| Quantinuum H2 emulator | emulator, not hardware | 200 | 1 / 1,200 | 0.08% | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8bac2c8f5265fb3f2041d` |
| qBraid QIR simulator | noise-free cloud simulator | 200 | 0 / 1,200 | 0.000 | `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af8bac4c8f5265fb3f20421` |

The track README suggests IonQ Forte for the hardware run, but 200 shots there cost about 1,630 credits, and our attempt was refused (500 credits available). The README lists Rigetti Cepheus as fine for BB84, which has no two-qubit gates, so we ran it there for 38.5 credits.

What the runs show:
- With no eavesdropper, gate and readout errors on a real superconducting QPU give a QBER of 4.25%. That stands in for a fiber's own line noise.
- 4.25% is well under the 11% abort line, so a secret key could still be distilled with error correction and privacy amplification.
- The simulators and the emulator stay at or near zero. IonQ's noise model puts most of its noise on two-qubit gates, BB84 has none, and the simulator models no readout error. Quantinuum's emulator does model readout error, but on that machine it is small (1 wrong bit in 1,200).
- So each machine has its own noise floor, and only the real QPU shows a realistic one. An alarm threshold has to come from the noise floor of the actual link.

When to throw a key away:
- **Abort line: 11%.** Above about 11% QBER, one-way error correction and privacy amplification can no longer produce a secret key (Shor and Preskill, 2000). The key is discarded and QKD stops on that fiber.
- **Alarm line: per fiber.** Each fiber has its own baseline error from loss, dark counts and detector errors, so the alarm fires when a fiber's QBER rises statistically above its own baseline. Grid Twin does this, with an adjustable number of standard deviations. A fixed line is weaker: on a link whose own noise is the 4.25% we measured on Rigetti, a fixed 7% alarm would let a tap on up to about 12% of photons go unnoticed, since (0.07 − 0.0425) / (0.25 − 0.02125) ≈ 0.12. A full tap on that link would give about 27.1%.
- **A careful spy can partly hide in the line noise.** In Grid Twin's checks, on a fiber with a 3.3% baseline, a tap on 10% of photons is caught reliably, a 7% tap sits on the alarm line, and a 5% tap hides inside normal noise (QBER 4.5% against a warning line of about 4.7 to 5.0%). What such a spy learns is bounded by the error rate she causes, and privacy amplification shortens the key to remove that information. A small hidden tap therefore costs key rate, not secrecy.
- **What the utility does on an alarm.** The fiber stops using QKD keys and switches to post-quantum key exchange (ML-KEM), but stays up. Traffic reroutes, and only an operator can take the fiber out of service, so an attacker cannot use the alarm to cut communications.

### Part 4. What physics buys, and what it doesn't
BB84's security rests on quantum mechanics, not on a math problem being hard:
- **Measurement disturbs the state.** Measuring a photon in the wrong basis gives a random result and destroys the original state. Eve doesn't know Alice's basis, so whenever she guesses wrong, the photon she resends is not the one Alice sent.
- **No cloning.** No operation can copy an unknown quantum state, so Eve can't keep a copy and forward the original untouched. Any information she gains shows up as errors.
- A classical signal, by contrast, can be copied without a trace and stored for later decryption.

What BB84 still needs from classical cryptography: authentication. BB84 does not prove who is on the other end, so without an authenticated classical channel Eve can impersonate each side to the other (a man-in-the-middle attack). The public discussion (bases, error correction, privacy amplification) must be authenticated, either with pre-shared keys and an information-theoretic MAC (Wegman–Carter) or with post-quantum signatures (ML-DSA, FIPS 204).

Where real QKD is weak in practice:
- **Detector blinding:** bright light forces single-photon detectors into a mode the attacker controls.
- **Trojan-horse attacks:** light sent into a device reflects back carrying information about its settings.
- **Trusted relays:** on long routes, every relay holds the key in the clear.

What security agencies say:
- **NSA** does not recommend QKD for national security systems, citing the lack of built-in authentication, the special-purpose hardware and the trusted relays.
- **The UK NCSC** does not support QKD for government or military use.
- **France, Germany, the Netherlands and Sweden** (ANSSI, BSI, NLNCSA and the Swedish authority, joint position paper, January 2024) say QKD fits only niche uses, is not yet mature in security terms, and that post-quantum cryptography should come first.

---

## Step 2: Size up the threat (Shor's algorithm, post-quantum cryptography, Grover's search)

Notebooks: `2_shor_harvest_now.ipynb` and `2b_grover_symmetric_keys.ipynb`.

### Part 1. Shor demo (factor 15)
We ran Shor's period-finding for N = 15 with base a = 7 on Qiskit Aer (8 counting qubits, 1024 shots). The outcomes land on phases 0, 1/4, 1/2 and 3/4, about equally often. Phases 0 and 1/2 give wrong periods (r = 1 and r = 2, and 7^r mod 15 ≠ 1 for both), so the notebook tries the outcomes from most to least common and keeps the first even r with 7^r mod 15 = 1. In the saved run the most common outcome was phase 1/2 (rejected), and the next was phase 3/4, giving r = 4. Then gcd(7² − 1, 15) = 3 and gcd(7² + 1, 15) = 5, so 15 = 3 × 5.

What it proves and what it doesn't: the multiply-by-7 circuit is hard-coded for N = 15 (a fixed pattern of swaps and X gates). It would not work for N = 21 or for a 2048-bit number, which needs a general modular-exponentiation circuit with billions of fault-tolerant gates. The demo shows the period-finding idea, not the scale. The threat itself is real: Shor's algorithm factors integers and solves discrete logarithms in polynomial time, which breaks RSA and elliptic-curve cryptography.

**Real-hardware run (our own extra).** The notebook's circuit compiles to about 13,300 two-qubit gates, far beyond any machine today. Because 7⁴ ≡ 1 (mod 15), every controlled multiplication by 7⁴ or a higher power of 2 does nothing, so those blocks can be dropped. With 4 counting qubits that leaves 168 two-qubit gates (about 255 after routing on Rigetti's qubit grid), and the ideal simulator gives the same four phases. We ran it once on Rigetti Cepheus (200 shots): 130 of 200 shots (65%) landed on the four ideal outcomes `0000`, `0100`, `1000` and `1100`, against 25% if the output were pure noise. The other 12 outcomes shared the remaining 70 shots (2 to 15 each). The period-finding structure survives on a real QPU, but with two caveats: dropping those blocks uses the period we were trying to find, and N = 15 is the smallest possible case. This run tests the hardware on a known circuit; it does not factor anything.

### Part 2. Hardware gap
Gate-based QPUs on qBraid (device catalog, 13 Nov 2026; each machine counted once, analog machines left out). The notebook's SDK listing (cell 7) shows only the IonQ, IQM, Rigetti and AQT machines; the IBM rows come from qBraid's web catalog.

| Machine | Qubits |
|---|---|
| IBM Fez / Marrakesh / Kingston / Boston / Pittsburgh | 156 each |
| IBM Miami | 120 |
| Rigetti Cepheus-1-108Q | 107 |
| IQM Emerald | 54 |
| IonQ Forte 1 / Forte Enterprise 1 | 36 each |
| Rigetti Cepheus-1-36Q | 36 |
| IQM Garnet | 20 |
| AQT IBEX Q1 | 12 |

- **Largest real device:** 156 qubits (the IBM machines) in the web catalog. The notebook's SDK listing did not show IBM, so its largest entry is 107 qubits (Rigetti Cepheus-1-108Q). We report both.
- **What RSA-2048 needs, by published estimate:**
  - Gidney & Ekerå (2019; published 2021): about 20 million noisy physical qubits for 8 hours, and a bit more than 3n logical qubits (about 6,200 for n = 2048).
  - Gidney (2025, arXiv:2505.15917): fewer than 1 million noisy physical qubits (897,864, rounded up for slack) and about 1,400 logical qubits (1,399 in the paper's Table 5), for under a week. It assumes a square grid with nearest-neighbour connections, a 0.1% gate error rate and a 1 µs surface-code cycle.
  - Pappalardo et al., Alice & Bob (IACR ePrint 2026/2665, Oct 2026): about 22,593 physical cat qubits for 3.14 days. This assumes cat qubits with phase-flip noise only (no bit flips); allowing bit flips raises it to about 45,000.
  - Iceberg Quantum, Pinnacle (Feb 2026, QLDPC codes): fewer than 100,000 physical qubits; their Oct 2026 update (Pinnacle 1.2) gives 48,000 to 72,000 at a 1 µs code cycle. These are company preprints.
- **The gap.** Against Gidney 2025: 1,000,000 / 156 ≈ 6,400× (3.8 orders of magnitude) using the IBM machines, or 1,000,000 / 107 ≈ 9,300× (4.0 orders) using the SDK list, so about 4 orders of magnitude. Against the 2019 estimate it is about 5 orders. Against the cat-qubit estimate it is about 2 orders, but for a different kind of qubit that no one has built at that scale.
- **What a qubit count leaves out:** error rates, gate fidelity, connectivity and coherence time. Running for days needs error-corrected logical qubits, which no machine above has at this scale. The estimates also keep falling (20 million in 2019, under 1 million in 2025), which is why "harvest now, decrypt later" is urgent even when the gap looks large.

### Part 3. Exposure map
This assumes a representative reference architecture for a city-scale utility like EPB; it is not an audited inventory of EPB's network.
Confidentiality risk ("harvest now, decrypt later") depends on how long the data must stay secret. Signature risk ("forge later") depends on how long the device lives: a relay in service for 20 to 30 years trusts its signature check for its whole life.

| # | System | Quantum-vulnerable crypto | Must stay secure | Patch difficulty | Main threat |
|---|---|---|---|---|---|
| 1 | Substation to control-center VPN (IPsec/TLS) | RSA/ECDSA authentication, ECDH key exchange | Links last 20+ yr; carry grid state and credentials | Low to medium: gateway firmware. Hybrid ML-KEM exists for IKEv2 (RFC 9370) and TLS 1.3 (X25519MLKEM768); vendor support varies | Harvest now (confidentiality) |
| 2 | Remote access (VPN, SSH, bastion, vendor access) | RSA/ECDSA keys, ECDH/X25519 | Long-lived credentials | Low: software upgrades (OpenSSH already ships a hybrid ML-KEM key exchange) | Harvest now, credential theft |
| 3 | SCADA/EMS to RTUs (DNP3 SAv5, IEC 62351) | SAv5 message authentication is symmetric (HMAC-SHA-256; AES-128 key wrap, AES-256 optional), but its optional remote update-key method uses RSA and DSA, which Shor breaks. The TLS wrapper and PKI use RSA/ECC | RTU life 15-25 yr; telemetry and credentials 10+ yr | Medium: the head-end is easy, RTU firmware is not | Harvest now on TLS |
| 4 | IEC 61850 (MMS, GOOSE, SV) and relays | TLS with ECDHE/ECDSA. For GOOSE/SV, the 2007 edition of IEC 62351-6 used RSA signatures; published analyses say the 2020 edition moved to symmetric MACs (HMAC-SHA-256, AES-GMAC), so the exposure is mainly the key distribution and PKI behind them (IEC 62351-9) and older 2007-style deployments | Relay life 20-30 yr; GOOSE/SV carry little secret data, so forged or replayed commands are the risk | High: GOOSE must fit in one Ethernet frame (about 1,500 bytes) and meet tight latency budgets, so ML-DSA signatures (2.4-4.6 KB) can't be attached to each message | Forge later through key or PKI compromise (a malicious trip); low confidentiality risk |
| 5 | Utility PKI / certificate authorities | RSA/ECDSA roots with 20-25 yr validity | Roots issued today stay trusted into the 2040s | High: HSMs, cross-signing, every relying party | Forge later, harvest now |
| 6 | Firmware signing and secure boot (relays, RTUs, meters, gateways) | RSA/ECDSA; the trust anchor is often in ROM/OTP | Device life 15-30 yr | Very high: an immutable ROM anchor can't be patched in the field | Forge later (highest consequence) |
| 7 | Smart-meter AMI | ECC P-256 key agreement and certificates; AES payload | Meter life 10-20 yr; customer data 5-10 yr | Very high: millions of constrained devices | Harvest now on customer data |
| 8 | ICCP/TASE.2 between utilities, synchrophasors | TLS with RSA/ECC; C37.118 often unencrypted | Inter-utility trust 15-25 yr | Medium to high: bilateral agreements | Forge later on peer identity |
| 9 | DER, OpenADR, customer and vendor APIs | TLS with RSA/ECC certificates; RS256/ES256 tokens | 10-20 yr; personal data and DER commands | Low to medium: the cloud side is agile, embedded gateways are not | Harvest now on personal data |
| 10 | Enterprise IT (email, certificates, TLS, backups, billing) | RSA/ECDSA in S/MIME, certificates and TLS (Kerberos is mostly symmetric, with RSA/ECDSA only in optional PKINIT); AES at rest | Retention 7-10+ yr | Low to medium: broad, but mainstream vendor roadmaps | Harvest now on email and backups |

Limits of this map: much utility traffic runs on private fiber rather than the public internet, so passive interception is harder than for internet traffic. That lowers, but doesn't remove, the harvest-now risk, and it is why the signature and firmware rows matter as much as key exchange.
Symmetric cryptography (AES, SHA-2) is not broken by Shor's algorithm, and NIST expects to keep both; use AES-256 where margin matters (Part 5).

### Part 4. Migration plan
**Standards.** ML-KEM (FIPS 203) for key establishment, ML-DSA (FIPS 204) for signatures, and SLH-DSA (FIPS 205) and LMS/XMSS (SP 800-208) for hash-based signatures, which suit firmware and constrained devices.

**Timeline.**
- NIST IR 8547 (final, 27 Oct 2026) deprecates all quantum-vulnerable public-key algorithms (RSA, ECDSA, EdDSA, DH and ECDH) after 2030 and disallows them under NIST standards after 2035. The 2024 draft was looser: it deprecated only 112-bit-strength algorithms after 2030 and left stronger ones, such as P-256 and RSA-3072, until 2035. NIST IR 8547 binds NIST standards; a municipal utility feels it through contracts, regulators or its own policy.
- US Executive Order 14412 (22 June 2026), put into effect by OMB memo M-26-15, requires federal high-value assets and high-impact systems (excluding national security systems) to use post-quantum key establishment by 31 December 2030 and post-quantum signatures by 31 December 2031.

**Regulation.** NERC CIP-012-2 (enforceable since 1 July 2026) requires protecting the confidentiality, integrity and availability of real-time data sent between control centers. It is technology-neutral and does not mandate encryption, but encryption is the usual way to meet it. CIP-005-8, the revised electronic security perimeter standard, takes effect on 1 July 2028.

| Rank | Fix | What to deploy | Why this rank |
|---|---|---|---|
| 1 | Inventory and crypto agility | A cryptographic inventory (CBOM); negotiable algorithms and replaceable crypto required in all new procurement | You can't migrate what you can't see, and agility is the hedge against future changes |
| 2 | Key exchange on every network edge: VPN, TLS, SSH, remote access | Hybrid X25519 + ML-KEM-768 now (ML-KEM-1024 for the longest-lived data) | Harvest-now is happening today; this is software-only, and mature hybrids exist |
| 3 | Firmware signing and trust anchors | Dual signatures (RSA/ECDSA plus LMS/XMSS or ML-DSA); PQC-capable hardware required in new purchases | Longest lead time and highest consequence: a ROM anchor bought in 2027 must still verify in the 2040s |
| 4 | PKI / CA hierarchy | ML-DSA or hybrid certificate chains, HSM firmware, room for larger certificates and CRLs | Every other system depends on issuable PQC certificates, and a root rollover takes years |
| 5 | AMI / smart meters | PQC capability and AES-256 in the next meter RFQ; ML-KEM at the head-end first | A 15-20 yr fleet locks in today's purchase decision |
| 6 | SCADA/EMS and DNP3 | Keep SAv5's symmetric authentication (HMAC-SHA-256, AES-256 key wrap where supported), disable the RSA/DSA update-key option, and move the TLS layer to hybrid ML-KEM at the head-end | The vulnerable parts are the update-key option and the centrally updatable wrapper |
| 7 | IEC 61850 / GOOSE | MAC-based authentication (IEC 62351-6:2020 style, HMAC-SHA-256 or AES-GMAC), with the key distribution and PKI behind it protected; follow IEC 62351's PQC work for the PKI side | Frame size and latency, not the math, set the schedule, and symmetric MACs already fit |
| 8 | ICCP and synchrophasors | Hybrid TLS; rewritten bilateral agreements | Multi-party governance is the bottleneck, so start the contracts early |
| 9 | DER and customer/vendor APIs | Hybrid TLS and PQC clauses in aggregator contracts | Low cost, but third parties control the timing |
| 10 | Enterprise IT | Mainstream vendor PQC updates, AES-256 | Broad but less critical |
| 11 | Symmetric keys (AES, Part 5) | AES-256 in all new procurement and for data that must stay secret for decades; AES-128 equipment revisited at normal refresh | Not an emergency: Grover's search only halves the key exponent, and NIST says AES-128 stays secure for decades. The fix is a longer key, not a new algorithm |

Reasoning: key exchange is urgent now because recording traffic is cheap. Signatures are driven by lead time, since forging one needs a working large quantum computer. Hardware that can't be patched in the field (ROM trust anchors, meters) is the true long pole. That is also why firmware (rank 3) sits above the PKI (rank 4): device trust anchors can't be patched later, while a PKI can be rolled forward in software.

### Part 5. Grover's search and symmetric keys
Notebook `2b_grover_symmetric_keys.ipynb` runs Grover's search with a phase oracle and a diffuser for floor((π/4)√N) iterations: 1, 2 and 3 for N = 4, 8 and 16. The circuits use 2, 24 and 84 two-qubit gates before routing.

| N | Iterations | Qiskit Aer (noise-free, 1024 shots) | Exact theory | IonQ simulator, forte-1 noise model (200 shots) | Quantinuum H2 emulator (200 shots) | Rigetti Cepheus, real QPU (200 shots) |
|---|---|---|---|---|---|---|
| 4 | 1 | 100.0% | 100.0% | 100% (200/200) | 100% (200/200) | **88.5%** (177/200) |
| 8 | 2 | 95.5% | 94.5% | 71.5% (143/200) | 92.5% (185/200) | **45.0%** (90/200) |
| 16 | 3 | 96.0% | 96.1% | 36.0% (72/200) | 87.0% (174/200) | **4.5%** (9/200) |

- **Noise-free.** The most common outcome is the secret key every time. `check_grover.py` also checks the oracle and diffuser against the exact Grover formula, sin²((2k+1)·asin(1/√N)), for every key and N = 2 to 32: no mismatches.
- **Noise models.** On IonQ's noisy simulator the peak stays on the right key but shrinks fast as the circuit grows; at N = 16 the key is still the most common outcome, but only about one shot in three. The Quantinuum H2 emulator, which models a different trapped-ion machine, stays much higher (92.5% at N = 8, 87.0% at N = 16). Different noise models give different answers, so a noise number only means something for the machine it models.
- **Real hardware.** On Rigetti Cepheus the right key was the most common outcome at N = 4 (88.5%) and N = 8 (45.0%), against 25% and 12.5% for random guessing. At N = 8 each of the seven wrong outcomes got 5.5 to 10%, so the peak is real but far below the 94.5% theory value, and below both noise models. At N = 16 the key came up on only 9 of 200 shots (4.5%), below the 6.25% of random guessing, and the two most common outcomes were wrong keys (21 shots each): at that size the noise wipes out the search.
- **What it shows.** Today's machines can find a 3-bit key with Grover's search, but the success rate collapses as the circuit grows. A search over 16 keys says nothing about AES directly; the point is the scaling, about √N steps instead of N.

**What Grover's search means for AES key length.** Grover's search cuts a brute-force search over 2¹²⁸ keys (AES-128) to about 2⁶⁴ quantum steps, and over 2²⁵⁶ (AES-256) to about 2¹²⁸. It weakens AES by halving the key exponent; it does not break it. In practice it is weaker still. Each step must run a full AES circuit on an error-corrected quantum computer, and the steps must run one after another: split across M machines, Grover's search runs only √M times faster, while a classical search runs M times faster (Zalka, 1997, cited in NIST's FAQ).

NIST's post-quantum FAQ ("To protect against the threat of quantum computers, should we double the key length for AES now?") says "it is quite likely that Grover's algorithm will provide little or no advantage in attacking AES, and AES 128 will remain secure for decades to come", and that current applications can keep using AES with 128, 192 or 256-bit keys.

Our recommendation for the utility: keep AES-128 where it is today, but specify AES-256 for new equipment and for data that must stay secret for decades (smart meters, relays, firmware images, VPNs). It costs almost nothing extra and removes any argument about Grover. It also matches NSA's CNSA 2.0, which specifies AES-256 for national security systems.

**Compared with RSA: less urgent, and easier to fix.** Shor's algorithm breaks RSA and elliptic curves outright, in polynomial time, so no key length saves them and the algorithm has to be replaced (ML-KEM, ML-DSA). Grover's search only weakens AES by a square root, and the fix is the same algorithm with a longer key. The hard part is devices that are hard-coded to AES-128 and can't be changed in the field, which is another reason to require AES-256 in the next purchase. In the migration plan, symmetric keys are rank 11, the lowest priority.

---

## Step 3: Design the network (capstone)

Notebooks: `3_secure_grid_link.ipynb` (the working link) and `3b_grover_route_search.ipynb` (route search). The live design is Grid Twin (`grid-twin/`, or the one-file `grid_twin.html`).

### Part 1. Architecture
**The network: Chattanooga's real grid,** imported from OpenStreetMap (the data behind OpenInfraMap, as the mentors suggested), fetched 14 Nov 2026 (© OpenStreetMap contributors, ODbL). We assume communication fiber runs along every power line, as optical ground wire usually does.
- 117 sites and 145 lines: 2 control centers, 31 major substations and 84 distribution sub-units.
- The real control-center locations are not public, so the two control centers are our assumption: Oglethorpe (EPB) and Chickamauga (TVA).
- Line lengths run from 0.2 to 22.2 km (median 3.5 km).

**Where QKD goes and where PQC goes.**
- **QKD (BB84) on 34 backbone fibers,** along the 161 kV (30), 230 kV (2) and 500 kV (2) lines between the control centers and the major substations. This follows the mentors' advice to use QKD only at high-value points.
- **Post-quantum cryptography on the other 111 fibers,** along the 46 kV lines to distribution sub-units: ML-KEM (FIPS 203) for keys and ML-DSA (FIPS 204) for authentication. QKD to every neighborhood substation would multiply equipment and relays for little gain.
- PQC protects everything; QKD adds a physical eavesdropper alarm on the fibers where it is worth it.

**The four limits the README asks about.**
- **Distance.** Fiber QKD reaches roughly 80 to 100 km before relays are needed, because loss grows with distance (about 0.2 dB/km at 1550 nm). The longest QKD fiber in Chattanooga is 22 km. On Tennessee's 500 kV backbone (33 sites, 38 spans, also from OpenStreetMap), 8 spans are longer than 80 km; those run on ML-KEM in our model, or would need trusted relays.
- **Number of substations.** QKD on all 145 fibers would need a matched device pair on every fiber; backbone-only QKD keeps it to 34. Grid Twin can show both: "Backbone only" (our design) and "Every fiber" (the team's whiteboard sketch).
- **Trusted nodes.** A QKD key crosses one fiber. To reach a farther substation, it is relayed hop by hop, and every relay holds the key in the clear. So relays must be physically secured sites, and Grid Twin marks them with gold rings. Because each relay is a place an insider could read the key, key paths and the route search (below) use the fewest relay sites they can. Keys switch to ML-KEM wherever no healthy QKD chain exists.
- **Timing synchronization.** The two ends of a QKD link must agree on time closely enough to match detections to pulses (nanosecond-scale detector gating). Sites are synchronized with GPS-disciplined IEEE 1588 Precision Time Protocol, using the IEEE C37.238 power profile already used in substations.

**What happens when a fiber is tapped.** Its QBER rises, the per-fiber alarm fires, and the response runs automatically, as Grid Twin shows live:
- The fiber's keys switch to ML-KEM, and the fiber stays up.
- Traffic reroutes along the least risky path.
- The fiber carries decoy traffic so the tap can be measured, but only when no site would be stranded.
- A crew inspection is recommended.

The response cuts communication paths only, never power, and only an operator can quarantine a fiber.

**Route search: how site A reaches site B.** The inputs are a start site, an end site and a QBER cutoff (QBER is the share of key bits that arrive wrong). The cutoff is a slider from 1% to 25%; the default, 11%, is the Shor–Preskill limit. A fiber at or above the cutoff counts as tapped and is not used.
- **Fewest sites first.** There are no quantum repeaters, so every site a QKD key passes through is a trusted relay: it measures the key and re-encrypts it for the next fiber. Someone inside that site, an insider or a hacked device, could read the key before it is re-encrypted. So the search minimises the number of intermediate sites first, and only then the risk-weighted distance, km × (1 + 20 × QBER). Grid Twin shows how this compares with the plain shortest route by km ("the shortest route would pass through N sites; this one passes through M").
- **Fallback order.**
  1. A clean QKD route, every fiber under the cutoff, relayed by trusted sites.
  2. If there is none: the best route over every fiber still in service, on ML-KEM keys agreed end to end. Sites along the way only forward ciphertext they cannot read.
  3. If there is no physical path at all: the site is islanded. Power stays on, it runs on local protection, and a crew is dispatched.
- **Where it runs.** In the live grid's "Find a route" panel (Start and End pickers, the cutoff slider, the route highlighted in 3D with its hops, km, highest QBER and trusted sites, updated live as taps are placed), in `grid-twin/src/route.js`, and in the Python twin `chattanooga_router.py`. The cutoff, the blocked-link rule, the cost formula and the ML-KEM fallback come from teammate Asheb's earlier router. The automatic response above uses the same fewest-sites rule for its QKD key paths.

**Grover in the route search (a demonstration, not a speed-up).** Yen's k-shortest routes give N = 8 candidate QKD routes (3 qubits). Notebook 2b's Grover oracle, generalised to M marked items, marks the clean ones (every fiber under the cutoff), followed by 2b's diffuser, for floor(π / (4·asin(√(M/N)))) iterations, the optimal count (the textbook round(π/4 · √(N/M)) overshoots when more than half the routes are clean; with most routes clean it uses 0 rounds, since a plain random draw already wins). The route it draws is then checked classically. With no clean route (M = 0) the output stays uniform, every check fails, and the search falls back to ML-KEM. `3b_grover_route_search.ipynb` runs it on Qiskit Aer, and `check_grover.py` verifies the generalised oracle for every subset of marks at N = 8. Dijkstra solves this exactly and fast on a classical computer, and the oracle is built from QBER values we already know. In the notebook's example (N = 8 routes, M = 3 clean after one tap), one iteration raises the chance of drawing a clean route from 37.5% to 84.4% (172 of 200 shots on Aer). This shows the same Grover circuit from 2b running on the grid problem with about √(N/M) oracle queries instead of about N/M; it is not a speed-up claim.

**Diagram:** the live grid page (`grid-twin/`, or `grid_twin.html`).

### Part 2. Assumptions and tradeoffs
**Assumptions.**
- **Fiber routes.** Fiber runs along every power line; the real fiber routes are not public.
- **Control centers.** The two control-center locations are our assumption.
- **Fiber parameters.** 0.21 dB/km loss, 4.5% detector efficiency, 1.7 × 10⁻⁶ dark counts and 3.3% detector error, from Table 1 of Ma, Qi, Zhao and Lo (arXiv:quant-ph/0503005). The baseline-error formula is the single-photon case of Eq. (8) of Lo, Ma and Chen (2005). With these values a 140 km fiber detects about 537 times fewer photons than a 10 km one, so it takes far longer to build up evidence of a tap.
- **Distance limit.** Roughly 80 to 100 km for fiber QKD without relays (from the mentors). The utility reference is EPB's own field test: Evans et al., "Trusted Node QKD at an Electrical Utility", IEEE Access 2021 (arXiv:2103.09877), which ran three QKD systems on an isolated part of EPB's fiber, with trusted nodes.
- **Cost.** We found no published price for QKD equipment (Part 5).

**Tradeoffs.**
- QKD detects taps on the link and PQC doesn't. But QKD does not authenticate, needs relays, and needs hardware on every fiber.
- PQC covers every link and every system with software and firmware. Its security rests on math problems believed hard for quantum computers, not on physics.
- A fixed alarm threshold is simpler, but a per-fiber threshold catches smaller taps (Step 1, Part 3).
- Keeping an alarmed fiber up on ML-KEM stops an attacker from forcing outages by tapping. The cost is that the fiber carries traffic protected only by post-quantum cryptography during an incident.

### Part 3. Working prototype
**Option B, the teleportation link (`3_secure_grid_link.ipynb`).** Alice prepares a generic state, RY(1.0) then RZ(0.7), and teleports it over an entangled pair, with the corrections applied as gates (CX and CZ, the deferred-measurement form). Bob then undoes Alice's preparation, so a working link reads 0 on qubit 2 every time.

| Device | Kind | Shots | Qubit 2 read 0 | Job ID |
|---|---|---|---|---|
| Qiskit Aer | local simulator | 1024 | **1024 of 1024** (100%) | none |
| IonQ simulator, forte-1 noise model | cloud simulator | 200 | 195 of 200 (97.5%) | `ionq:ionq:sim:simulator-a7ae-qjob-6af8baa7c8f5265fb3f203fa` |
| Quantinuum H2 emulator | emulator, not hardware | 200 | 199 of 200 (99.5%) | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8babac8f5265fb3f2040d` |
| **Rigetti Cepheus-1-108Q** | **real QPU** | 200 | **167 of 200 (83.5%)** | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8bab8c8f5265fb3f2040a` |

What the runs show:
- **The link works on real, noisy gates.** For this input state, the share of zeros is how closely Bob's state matches Alice's (readout error included): 83.5% on real hardware against 100% in theory. The circuit has 4 two-qubit gates before routing (three CX and one CZ), so unlike BB84 it is exposed to two-qubit gate noise, and the undo gates add a little noise of their own.
- **What it does not test.** All three qubits are on one chip, so this tests the link's logic, not distance. A real link would deliver the entangled pair over fiber and send the two correction bits classically.
- **What it means for trusted nodes (Part 1).** With entanglement swapping, the middle nodes would never hold the key, unlike trusted relays. That needs high-quality entanglement over every hop (quantum repeaters), so it is a roadmap item, not something to deploy today.

**Also built: BB84 on any backbone fiber, live (Grid Twin).** Any fiber can be re-run as real quantum code from the page. For one fiber with a 40% tap (theory 12.64%):

| Engine | QBER |
|---|---|
| Qiskit Aer | 13.52% |
| NVIDIA CUDA-Q | 12.11% |
| Quantinuum Guppy on the Selene emulator | 11.15% |
| qBraid IonQ simulator (job `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7`) | 12.55% |
| Notebook 1's own code on qBraid's QIR simulator | 12.48% |

With about 2,000 sifted bits per run, one standard error is about 0.7 points. Four engines are within 1.2 standard errors of the theory value; Guppy, at 11.15%, is the furthest out, at 2.0.

### Part 4. Rollout plan
1. **Now (software, no new hardware).** A cryptographic inventory; hybrid ML-KEM on every VPN, TLS and SSH edge; PQC-capable hardware and AES-256 required in all new procurement; dual-signed firmware (classical plus a hash-based or ML-DSA signature). These are ranks 1 to 3 of the Step 2 migration plan, and they protect every link against "harvest now, decrypt later".
2. **Next (pilot).** QKD on a few short backbone fibers near the control centers, with per-fiber QBER monitoring and the automatic ML-KEM fallback. Measure the key rate, the false-alarm rate and the upkeep on EPB's real fiber, building on EPB's 2021 field test.
3. **Later, only if the pilot justifies it.** Extend QKD to the rest of the 34 backbone fibers, secure the trusted relays, and finish the PKI, AMI and SCADA migrations (Step 2 ranks 4 to 11). Statewide links over 80 km stay on ML-KEM unless relays prove worth their cost.

### Part 5. Cost versus security
**What it costs.**
- We found no published QKD price: ID Quantique and Toshiba do not publish prices.
- From the architecture: each QKD fiber needs a matched pair of devices and suitable fiber, and every hop of a longer route needs a secured relay. QKD cost therefore grows with the number of fibers and hops: 34 fibers in our design, against 145 for QKD everywhere.
- PQC is mostly software and firmware updates, plus replacing devices that can't be updated at their normal refresh time. We found no utility-specific figure. For scale, the White House (OMB/ONCD, July 2024) estimated about $7.1 billion (in 2024 dollars) to migrate prioritized federal systems, national security systems excluded, over 2025 to 2035. The report calls this a rough order-of-magnitude estimate with "a high, but expected, level of uncertainty".

**What it protects, and what a cheaper option leaves exposed.**
- **PQC alone** protects every link and system against harvest-now and forge-later attacks with standards-backed algorithms (FIPS 203, 204 and 205). It does not detect a tap: an eavesdropper on a PQC fiber goes unseen, though what they record stays encrypted.
- **Adding QKD on the 34 backbone fibers** buys a physical tap alarm on the most important links, and keys whose secrecy doesn't depend on math assumptions. It does not replace PQC, which still provides authentication and covers everything else.

**Recommendation for the board.** PQC everywhere first: it is cheap, broad and required by the timelines. Then a QKD pilot on the backbone, expanded only if it proves its value. A PQC-only design is a defensible fallback.

---

## Run record (every cloud run)

All simulator and emulator jobs cost 0 credits. Our six Rigetti Cepheus jobs cost 38.5 credits each (231 in total). Qiskit Aer runs locally and creates no job.

### Step 1
| Part | Device | Shots | Status | Job ID | Result |
|---|---|---|---|---|---|
| 1–2 | Qiskit Aer (local) | 200 rounds | completed | none | QBER 0.000 without Eve, 0.258 with Eve (saved run) |
| 3 | Qiskit Aer (local), batched circuit | 200 | completed | none | QBER 0.000 |
| 3 | **Rigetti Cepheus-1-108Q, real QPU** | 200 | COMPLETED | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa6c8f5265fb3f203f7` | QBER 4.25% (51/1,200) |
| 3 | IonQ simulator, aria-1 noise model | 200 | COMPLETED | `ionq:ionq:sim:simulator-a7ae-qjob-6af8bac1c8f5265fb3f20417` | QBER 0.000 |
| 3 | Quantinuum H2 emulator | 200 | COMPLETED | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8bac2c8f5265fb3f2041d` | QBER 0.08% (1/1,200) |
| Stretch | qBraid QIR simulator | 200 | COMPLETED | `qbraid:qbraid:sim:qir-sv-a7ae-qjob-6af8bac4c8f5265fb3f20421` | QBER 0.000 |
| 3 (earlier) | IonQ Forte through AWS, real QPU | 200 | refused: insufficient credits (1,630 needed, 500 available) | none | none |
| 3 (earlier) | IonQ simulator, aria-1 noise model | 200 | completed on a teammate's account (not re-checkable from ours) | `ionq:ionq:sim:simulator-a7b0-qjob-6af7c328f15852ed27b72012` | QBER 0.08% (as reported) |

### Step 2
| Part | Device | Shots | Status | Job ID | Result |
|---|---|---|---|---|---|
| 1 | Qiskit Aer (local), Shor N = 15 | 1024 | completed | none | r = 4, 15 = 3 × 5 |
| 1 | **Rigetti Cepheus-1-108Q, real QPU**, Shor reduced circuit (4 counting qubits) | 200 | COMPLETED | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d39af15852ed27b724ad` | 130/200 on the four ideal outcomes |
| 2 | qBraid device catalog and SDK listing (13 Nov 2026) | none | n/a | none | 156 qubits (web), 107 (SDK) |
| 5 | Qiskit Aer (local), Grover N = 4, 8, 16 | 1024 each | completed | none | 100.0%, 95.5%, 96.0% |
| 5 | IonQ simulator, forte-1, Grover N = 4, key 2 | 200 | COMPLETED | `ionq:ionq:sim:simulator-a7ae-qjob-6af7caaff15852ed27b7215d` | 200/200 |
| 5 | IonQ simulator, forte-1, Grover N = 8, key 6 | 200 | COMPLETED | `ionq:ionq:sim:simulator-a7ae-qjob-6af7cacbf15852ed27b72167` | 143/200 |
| 5 | IonQ simulator, forte-1, Grover N = 16, key 14 | 200 | COMPLETED | `ionq:ionq:sim:simulator-a7ae-qjob-6af7cadcf15852ed27b7216d` | 72/200 |
| 5 | Quantinuum H2 emulator, Grover N = 4, key 2 | 200 | COMPLETED | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af7ccc1f15852ed27b721e3` | 200/200 |
| 5 | Quantinuum H2 emulator, Grover N = 8, key 6 | 200 | COMPLETED | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af7ccc3f15852ed27b721e6` | 185/200 |
| 5 | Quantinuum H2 emulator, Grover N = 16, key 14 | 200 | COMPLETED | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8baa6c8f5265fb3f203f4` | 174/200 |
| 5 | **Rigetti Cepheus-1-108Q, real QPU**, Grover N = 4, key 2 | 200 | COMPLETED | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d357f15852ed27b72465` | 177/200 |
| 5 | **Rigetti Cepheus-1-108Q, real QPU**, Grover N = 8, key 6 | 200 | COMPLETED | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d357f15852ed27b72468` | 90/200 |
| 5 | **Rigetti Cepheus-1-108Q, real QPU**, Grover N = 16, key 14 | 200 | COMPLETED | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8baa7c8f5265fb3f203fd` | 9/200 |

The first two H2 emulator jobs were sent as OpenQASM 2 through the qBraid plugin, because the SDK on our laptop failed to parse QASM 2 locally; the N = 16 job went through the SDK after `openqasm3` was pinned to 1.0.1.

Runs that produced no result: our first three jobs on IonQ Forte through Open Quantum (`openquantum:ionq:qpu:forte-1`) failed because no Open Quantum account was linked. After linking, the Shor job was cancelled immediately (no reason given; probably out of Open Quantum credits) and the two Grover jobs stayed queued. We also could not send jobs to IBM machines, because qBraid does not offer direct access to them from our account.

### Step 3
| Part | Device | Shots | Status | Job ID | Result |
|---|---|---|---|---|---|
| 3 | Qiskit Aer (local), teleportation | 1024 | completed | none | 1024 of 1024 |
| 3 | IonQ simulator, forte-1 noise model, teleportation | 200 | COMPLETED | `ionq:ionq:sim:simulator-a7ae-qjob-6af8baa7c8f5265fb3f203fa` | 195 of 200 |
| 3 | Quantinuum H2 emulator, teleportation | 200 | COMPLETED | `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af8babac8f5265fb3f2040d` | 199 of 200 |
| 3 | **Rigetti Cepheus-1-108Q, real QPU, teleportation** | 200 | COMPLETED | `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af8bab8c8f5265fb3f2040a` | 167 of 200 |
| 3 (earlier) | IonQ simulator, forte-1 noise model, teleportation | 200 | completed on a teammate's account (not re-checkable from ours) | `ionq:ionq:sim:simulator-a7b2-qjob-6af7d3fcf15852ed27b724f1` | 197 of 200 (as reported) |
| 3 | IonQ simulator (Grid Twin, one fiber, 40% tap) | 1000 | COMPLETED | `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7` | QBER 12.55% (theory 12.64%) |
| 3 (route search) | Qiskit Aer (local, seeded), Grover over N = 8 routes with M = 3 clean | 200 | completed | none | 172/200 clean picks (exact 84.4%) |

### Tools and sources
**AI use.** AI assistants helped draft and check the written analysis and the code. We reviewed every result, and every number above traces to a notebook output, a job's raw counts, the network data or a cited source.

**Sources.**
- NIST PQC FAQ on AES and Grover: https://csrc.nist.gov/projects/post-quantum-cryptography/faqs
- NIST IR 8547 (final, Oct 2026): https://csrc.nist.gov/pubs/ir/8547/final
- FIPS 203, 204, 205 and SP 800-208: https://csrc.nist.gov/projects/post-quantum-cryptography
- EO 14412: https://www.federalregister.gov/documents/2026/06/25/2026-12909/securing-the-nation-against-advanced-cryptographic-attacks
- NERC CIP-012-2: https://www.nerc.com/standards/reliability-standards/cip/cip-012-2 ; CIP-005-8: https://www.nerc.com/standards/reliability-standards/cip/cip-005-8
- Gidney 2025: https://arxiv.org/abs/2505.15917 ; Gidney & Ekerå 2019: https://arxiv.org/abs/1905.09749
- Pappalardo et al. (Alice & Bob): https://eprint.iacr.org/2026/2665
- OMB/ONCD, Report on Post-Quantum Cryptography (July 2024): https://bidenwhitehouse.archives.gov/wp-content/uploads/2024/07/REF_PQC-Report_FINAL_Send.pdf
- Iceberg Quantum Pinnacle: https://www.iceberg-quantum.com/blog/pinnacle-and-series-seed/ and https://www.iceberg-quantum.com/blog/releases/pinnacle-1-2/
- Ma, Qi, Zhao and Lo, practical decoy-state QKD: https://arxiv.org/abs/quant-ph/0503005
- Evans et al., trusted-node QKD at EPB: https://arxiv.org/abs/2103.09877
- Device service life: SEL technical paper, https://cms-cdn.selinc.com/assets/Literature/Publications/Technical%20Papers/7045_BalancingSubstation_DD_20220311_Web.pdf

Not confirmed: vendor support for hybrid ML-KEM modes in specific utility products, and the IEC 62351-6:2020 MAC details, which come from published analyses rather than the standard's text.
