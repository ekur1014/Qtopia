# Coherence: our qBraid Award entry

**Coherence** is a quantum idle-factory RPG by **Ethan B. Chen**, made for team Qtopia's qBraid Award entry. You play Ket, a qubit, keeping Psi, the last coherent quantum Core, alive against the Noise. The Secure the Grid ideas in this repo are the game's rules, and every quantum number in it comes from a real qBraid job.

| | |
|---|---|
| **Play it** (public qBraid artifact) | [account.qbraid.com/user-artifacts/e9731a85ed0f4269b3c6c6c22d419893](https://account.qbraid.com/user-artifacts/e9731a85ed0f4269b3c6c6c22d419893) |
| **Video** (4:23, running on qBraid) | [Google Drive](https://drive.google.com/file/d/1z7Ary6AgG_X9dSeBKePyjaQ_85hx6bt1/view?usp=sharing) |
| **Slides** | [Google Slides](https://docs.google.com/presentation/d/1Ez0xGiOW3bbaMq1PTUEhMOFoKe5uKiMsOodB2HLaBT0/edit?usp=sharing) |
| **Code** | [github.com/EthanChenHyland/coherence](https://github.com/EthanChenHyland/coherence) |

## How it ties to this repo

- **Eves are BB84 eavesdroppers.** Each theft cites the team's BB84 run on Rigetti Cepheus-1-108Q, a real QPU: 4.25% errors (51 of 1,200 sifted bits), about 50 times the Quantinuum H2 emulator's 0.08% on the same protocol.
- **Bell twins are entangled pairs.** A Bell pair measured on the H2 emulator agreed 99.0% in the Z basis and 99.5% in X; the 1% disagreement is the chance that noise breaks a pair in play.
- **A CHSH Bell test on four qBraid devices** sets how long each timeline's twins stay linked: H2 emulator S = 2.48, IonQ simulator 2.80, Quobly Alloy Forge emulator 2.68, qBraid QIR simulator 2.66. All four beat the classical limit of 2; the same test is how a quantum key link proves it's really entangled.
- **Every world grows from qubits measured on qBraid:** 30 of 1,200 bits from a 12-qubit circuit on the H2 emulator. In the game's journal (J), the qBraid Lab page lists every job, and pressing R there sends a fresh circuit to qBraid.

The seed, Bell and CHSH runs used free emulators and simulators; the only real-hardware results the game uses are two of the team's six Rigetti Cepheus jobs (BB84 and the teleportation link). Every job ID is in [`QUANTUM.md`](https://github.com/EthanChenHyland/coherence/blob/main/QUANTUM.md) and [`qbraid/qdata.json`](https://github.com/EthanChenHyland/coherence/blob/main/qbraid/qdata.json) in the Coherence repo.

---

Coherence © 2026 Ethan B. Chen. All rights reserved.
