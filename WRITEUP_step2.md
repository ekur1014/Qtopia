# Secure the Grid: Step 2 write-up (WRITEUP_step2.md)

## Step 2 (Shor + harvest now, decrypt later)

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
| 16 | 3 | 96.0% | 96.1% | 36.0% | not run | not run |

- On the noise-free simulator the most common outcome is the secret key in every run. We also checked the oracle and diffuser against the exact Grover formula for every possible key for N = 2 to 32 with `check_grover.py` in this repo: no mismatches.
- Noise: the peak stays on the right key on IonQ's noisy simulator, but it shrinks fast as the circuit grows (about 2, 24 and 84 two-qubit gates for N = 4, 8, 16, per the notebook). At N = 16 the right answer is still the most common one, but only about one shot in three. The IonQ simulator and the Quantinuum emulator are noise models, not real hardware. The two noisy runs disagree on how much noise matters: IonQ's simulator model drops N = 8 to 71.5%, while the Quantinuum H2 emulator (which models a different trapped-ion machine, readout error included) stays at 92.5%. Different devices and noise models give different answers, so a noise number is only meaningful for the machine it models. We did not run the emulator for N = 16.
- **Real hardware (Rigetti Cepheus, a superconducting QPU).** The right key was still the most common outcome both times, but the peak shrank sharply: 88.5% at N = 4 (2 two-qubit gates) and 45.0% at N = 8 (24 two-qubit gates before routing; Rigetti's grid layout adds more). Random guessing would give 25% for N = 4 and 12.5% for N = 8, so the answer is still clearly visible. Most wrong outcomes at N = 8 got 5 to 10% each, so the peak is real but far from the 94.5% the theory gives. Real hardware did worse than both noise models for N = 8 (45% vs 71.5% and 92.5%): a noise model is only as good as its match to the actual machine. The takeaway for the utility: today's machines can find a 3-bit key by Grover's search, but the success rate falls quickly as the circuit grows, so there is no practical threat to AES from this direction.
- A toy search over N = 16 keys says nothing about AES. The point is the scaling: Grover needs about sqrt(N) steps instead of N.

**Answer: what Grover means for AES key length.** Grover cuts a brute-force search over 2^128 keys (AES-128) to about 2^64 quantum steps, and over 2^256 (AES-256) to about 2^128. It does not break AES; it halves the exponent. Two things limit it in practice. Each Grover step must run a full AES circuit on an error-corrected quantum computer, and Grover can't be split across many machines the way classical guessing can: NIST's PQC FAQ notes that, per Zalka (1997), the full quadratic speedup requires all the steps to run in series, so a parallel attack gets a smaller advantage.
What NIST says (PQC FAQ, "should we double the key length for AES now?", added 18 Nov 2018): "it is quite likely that Grover's algorithm will provide little or no advantage in attacking AES, and AES 128 will remain secure for decades to come", and current applications can keep using AES with 128, 192 or 256-bit keys.
Our recommendation for the utility: keep AES-128 where it is today, but specify **AES-256 for new equipment and for data that must stay secret for decades** (smart meters, relays, firmware images, VPNs). It costs almost nothing extra, and it removes any argument about Grover. This also matches the stricter US national-security guidance: NSA's CNSA 2.0 specifies AES with 256-bit keys.
**Compared with RSA: less urgent, and easier to fix.** Shor's algorithm breaks RSA and elliptic curves outright, in polynomial time, so there is no key length that saves them: the algorithm has to be replaced (ML-KEM, ML-DSA). Grover only weakens AES by a square root, and the fix is the same algorithm with a longer key. The hard part is not the math but devices that are hard-coded to AES-128 and can't be changed in the field: another reason to require AES-256 in the next purchase.
In the migration plan (Part 4): symmetric keys are row 11, the lowest priority: not an emergency, but AES-256 goes into all new procurement.

## Run record and AI use
- Part 1: Qiskit Aer simulator on a laptop (no cloud job, no credits); result r = 4, 15 = 3 x 5.
- Part 2: qBraid device catalog queried 13 Nov 2026; no hardware jobs run.
- Part 2: notebook cell 7 listed devices through the qBraid SDK (107 qubits at most; no IBM machines in that list); the web catalog lists IBM at 156 qubits.
- Part 5: Qiskit Aer for the N = 4, 8, 16 searches (no job IDs; Aer doesn't create one). Three jobs on the free IonQ simulator (`ionq:ionq:sim:simulator`, noise model forte-1, 200 shots, status COMPLETED, cost 0):
  - N = 4: `ionq:ionq:sim:simulator-a7ae-qjob-6af7caaff15852ed27b7215d`
  - N = 8: `ionq:ionq:sim:simulator-a7ae-qjob-6af7cacbf15852ed27b72167`
  - N = 16: `ionq:ionq:sim:simulator-a7ae-qjob-6af7cadcf15852ed27b7216d`
  - Two jobs on the free Quantinuum H2 emulator (`quantinuum:quantinuum:sim:h2-emulator`, 200 shots, COMPLETED, cost 0 credits; emulator, not hardware). Submitted as OpenQASM 2 through the qBraid plugin because the SDK on our laptop failed to parse QASM 2 locally:
    - N = 4: `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af7ccc1f15852ed27b721e3` (200/200 on key 2)
    - N = 8: `quantinuum:quantinuum:sim:h2-emulator-a7ae-qjob-6af7ccc3f15852ed27b721e6` (185/200 on key 6)
  - Real hardware: three jobs on Rigetti Cepheus-1-108Q through AWS Braket (`aws:rigetti:qpu:cepheus-1-108q`, 200 shots each, COMPLETED, 38.5 qBraid credits each, 115.5 credits total):
    - Grover N = 4, key 2: `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d357f15852ed27b72465` (177/200 on key 2)
    - Grover N = 8, key 6: `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d357f15852ed27b72468` (90/200 on key 6)
    - Shor, factoring 15 (reduced circuit, 4 counting qubits): `aws:rigetti:qpu:cepheus-1-108q-a7ae-qjob-6af7d39af15852ed27b724ad` (130/200 on the four ideal outcomes)
  - Open Quantum attempts that did not produce results: our first three jobs on IonQ Forte (`openquantum:ionq:qpu:forte-1`) failed because no Open Quantum account was linked; after linking, the Shor job was cancelled immediately (no reason given, probably out of Open Quantum credits) and the two Grover jobs stayed queued. We also could not send jobs to IBM machines: qBraid does not support direct access to them from this account.
- Tools: AI assistants helped draft and check the written analysis and code; we reviewed and merged the results. Checked against primary sources: NIST IR 8547, CIP-012-2 effective date, EO 14412. Confirmed from primary pages: CIP-005-8 effective date, CNSA 2.0 specifying AES-256, EO 14412 deadlines (2030 key establishment, 2031 signatures). Confirmed from standards-body and research sources: DNP3 SAv5 crypto, EPB's customer count. Confirmed only from published analyses, not the standard's text: IEC 62351-6:2020 using symmetric MACs. Not confirmed: vendor support for hybrid modes.

Sources: NIST PQC FAQ on AES and Grover (https://csrc.nist.gov/projects/post-quantum-cryptography/faqs); NIST IR 8547 (https://csrc.nist.gov/pubs/ir/8547/final); FIPS 203/204/205 and SP 800-208 (https://csrc.nist.gov/projects/post-quantum-cryptography); NERC CIP-012-2 (https://www.nerc.com/standards/reliability-standards/cip/cip-012-2); EO 14412 (https://www.federalregister.gov/documents/2026/06/25/2026-12909/securing-the-nation-against-advanced-cryptographic-attacks); service-life data: SEL paper (https://cms-cdn.selinc.com/assets/Literature/Publications/Technical%20Papers/7045_BalancingSubstation_DD_20220311_Web.pdf).
