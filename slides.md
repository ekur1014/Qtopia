# Slides: Secure the Grid (UTC) pitch deck plan

Judges score the deck. This file is the plan and the draft text for it. Build the real deck (5 slides, using the template .pptx) from the sections below.
Status key: DONE = we have the content, TEAM = needs the teammate or all of us, VERIFY = check before it goes on a slide.

## What the organizers asked for (their slide-deck note)
The questions below are what people should consider. The notebooks are there to help you understand the technical and quantum side and to get started, but they should not limit you. Think about how you would present a solution around the problem. The repo is a starting point: pull in other resources and research, code new tools that add value, think about the big picture around the solution, and back it up with technical knowledge and understanding.

What that means for us: the deck is judged on understanding, presentation (problem, customer, solution, what we learned), the tools we build, and honesty about what failed. Code counts less than the story and our ability to explain it in plain words.

## The new five-slide template (Quantum_Hackathon_Five_Slide_Genric-Template.pptx)
The organizers' new template is "five slides, five minutes". It replaces the README's older Problem / Customer / Solution / Value / What we learned list. Its prompts, verbatim in meaning:

| # | Slide | Prompts on the template |
|---|---|---|
| 1 | The Problem | What problem are we solving? Describe the specific problem. Why does it matter? What is inadequate about existing approaches? |
| 2 | Ideal Customer Profile | Who needs this solution? Target organization/customer. Actual end user and decision maker. Why would they adopt or pay for it? |
| 3 | Solution & Technology | What did we build? Quantum computing/networking method and why it fits. Prototype, simulation, architecture or measured result. What works today versus what remains unproven. |
| 4 | The Team | Who made it happen? Names and relevant expertise. Individual contributions. Complementary technical and commercial skills. |
| 5 | What We Learned | What changed in 36 hours? What we validated or disproved. Most important surprise or limitation. What we would test or build next. |

The old "Value" slide is gone, so the value argument now lives on slide 2 (why they would adopt or pay) and slide 3 (what works today vs what is unproven). Plan for a 5-minute slot: about one minute per slide.

Logistics: submit the deck and a ZIP of this folder by **Sunday 9:00 AM** (hard deadline, one person submits). Bring the deck to the judging slot on a USB stick or laptop. Present in 5 minutes (five slides, five minutes). Finalists are announced Sunday at 12:20 PM. Keep a run record (device, job ID, shots, status) for every cloud run. Set sharing to "anyone with the link" and test the links in a private window.

---

## Slide 1. The Problem
Questions to answer: Which of the utility's data or keys must stay secret for 10 years or more? Is the bigger risk someone reading old traffic, or someone forging a command or firmware update later?

Draft (DONE, from Step 2):
- "Harvest now, decrypt later": an attacker records encrypted grid traffic today and decrypts it when a large enough quantum computer exists. Shor's algorithm breaks RSA and elliptic-curve cryptography, which protect VPNs, TLS, certificates and firmware signing.
- Two different risks, and both matter: **read later** (confidentiality of key exchange) and **forge later** (a signature check that a 20-30 year relay or meter trusts for its whole life). We think forge-later on firmware is the higher-consequence risk.
- How big is the gap? Today's largest machine on qBraid has 107 qubits through the SDK (156 on IBM machines in the web catalog). Gidney's 2025 estimate for RSA-2048 is under 1 million noisy qubits: about **4 orders of magnitude** away. Estimates keep falling (20 million in 2019, under 1 million in 2025, about 22,600 cat qubits claimed in Oct 2026 for one specific architecture). Link: `WRITEUP.md`, Step 2 Part 2.
- Demo we ran: Shor factors 15 (r = 4, 15 = 3 x 5). The circuit is hard-coded for N = 15, so it shows the idea, not the scale.
- [TEAM] Step 1: a spy on a fiber link is a separate, present-day threat. Add the BB84 result: error rate without and with an eavesdropper.

## Slide 2. Ideal Customer Profile
Questions to answer: What does a utility like EPB run on these links today? How long do field devices stay in service? Who signs off on a change like this, and which rules apply?

Draft (mostly DONE, needs VERIFY on numbers):
- Customer: a city-scale utility like EPB in Chattanooga. EPB serves a 600-square-mile territory with a 100% community-wide fiber network, and EPB Fiber Optics has 132,658 customers (EPB Annual Report 2025; 131,233 in 2024). EPB's quantum-network press release cites a separate 9,000-mile community-wide fiber network. EPB serves over 202,000 electric customers (EPB Financial Report FY2025).
- It also runs the EPB Quantum Network: 216 dedicated dark fibers with room for 10 quantum nodes in downtown Chattanooga (EPB press release, Sept 2023; promotional source). It has a history of QKD field tests on its own fiber (Evans et al., IEEE Access 2021, trusted-node QKD, three systems).
- What they run on these links: DNP3 (SAv5), IEC 61850 (MMS, GOOSE), IEC 62351, ICCP, VPNs, smart-meter systems. Most of it is secured with RSA/ECC today. DNP3 SAv5 uses symmetric HMAC-SHA-256 for message authentication; IEC 62351-6:2020 moved GOOSE authentication to symmetric MACs. VERIFY the exact protocol crypto per vendor.
- Device life: protection relays and RTUs are planned for roughly 20-30 years; AMI meters 10-20 (SEL, ABB, utility planning documents). That is why a signature trusted today must hold into the 2040s.
- Who decides and which rules: the utility's engineering and security leadership and its board; NERC CIP-012-2 (control-center-to-control-center data protection, enforceable since 1 July 2026; technology-neutral, does not mandate encryption); CIP-005-8 (not yet enforceable; effective 1 July 2028, per NERC's standard page). NIST IR 8547 sets 2030 deprecation / 2035 disallowance for RSA and ECC in NIST standards; it binds a municipal utility through contracts, regulators or policy, not automatically. Federal systems (EO 14412): PQC key establishment by end of 2030 and PQC signatures by end of 2031.
- What an attack costs them (use sparingly, label as context): the 2015 Ukraine grid attack cut power to about 225,000 customers for 1-6 hours (E-ISAC report). The IBM Cost of a Data Breach 2024 average is $4.88M across all industries (not utility-specific).

### Why they would adopt or pay (the value argument; belongs on slide 2)
Prompt: Why would they adopt or pay for it? What does one QKD link cost (equipment, dedicated fiber, trusted nodes) next to a post-quantum software or firmware update? What does the utility get for the difference?

Draft (numbers and where they come from; label guesses):
- What the agencies say (independent, but pre-existing positions): NSA does not recommend QKD for national security systems and says it needs trusted relays and has limitations (NSA Post-Quantum Cybersecurity Resources page). The UK NCSC (2025 white paper) says it will not support QKD for government or military use. A joint position paper on QKD from ANSSI (France), BSI (Germany), NLNCSA (Netherlands) and the Swedish authority (Jan 2024) says QKD needs specialised infrastructure, has functional limitations, fits only niche use cases, is not yet mature security-wise, and that organizations should prioritise post-quantum cryptography (ANSSI publication page).
- PQC cost: the White House OMB/ONCD report (July 2024) put federal migration of priority civilian systems at about $7.1 billion over 2025-2035, flagged by OMB itself as high-uncertainty. No published utility-specific dollar figure found; say so.
- QKD cost: we could not find a published price. ID Quantique and Toshiba do not publish prices, and ABI Research notes that cost is a barrier to adoption without quantifying it. Earlier price figures from a research assistant did not hold up against the cited papers, so we removed them. What we can say from the architecture: a QKD link needs a matched pair of devices, dedicated or carefully engineered fiber, and a trusted relay (more hardware, plus a secure room) at every hop. Get a vendor quote or ask a mentor before putting a dollar number on a slide.
- A structural comparison (no invented prices): a 10-site star network needs 9 QKD links, each with paired devices and a relay at every hop, so cost scales with the number of links and sites. PQC is mostly software and firmware updates on hardware that can already be patched, plus replacing devices that cannot (ROM trust anchors, old meters) at normal refresh, so cost scales with the number of devices that cannot be updated. We have no PQC dollar figure for a utility. If the team wants a number, label it clearly as an assumption.
- Value story: PQC protects every link and every system, is standards-backed (NIST FIPS 203/204/205), and is mostly a software change. QKD protects only the key exchange on the links it is installed on, still needs authentication from classical crypto, and needs relays. The difference in spend buys coverage of the whole network instead of a few links.

## Slide 3. Solution & Technology
Questions to answer: Your network diagram, your working link, your rollout.

Draft:
- DONE, the design we present (Step 3): **Grid Twin** (`grid-twin/`), a 3D live twin of the network. 2 control centers, 6 major substations, 8 feeder sub-units, 1 remote site. QKD (BB84) on the 11-fiber backbone between control centers and major substations; ML-KEM on the short sub-unit links and the 140 km rural link (QKD there would detect about 537 times fewer photons than on a city fiber). Show it live: tap a fiber, watch the error rate climb, the alarm fire, keys switch to ML-KEM and QKD keys reroute through a trusted relay. See `grid-twin/DEMO.md` for the 60-second script.
- How the response works: an alarm never takes a fiber down (an attacker could use that to cut comms); the fiber switches to ML-KEM keys and stays up. Only an operator quarantines a fiber. Isolation cuts communication paths, never power. The alarm is statistical (a rise above that fiber's own baseline, about 4.7 to 5.0%), and 11% is the abort line where no key can be made.
- Evidence: the browser's BB84 engine matches Qiskit Aer circuits on all 7 test scenarios; 15 automated tests pass. Teleportation link (Step 3, Part 3): the teammate's notebook 3.
- DONE, our migration ranking (Step 2): 1 crypto inventory and agility; 2 hybrid ML-KEM on every VPN/TLS/SSH edge now; 3 firmware signing and ROM trust anchors (dual-sign, PQC-capable hardware); 4 PKI/CA; 5 AMI procurement; 6 SCADA/DNP3 TLS layer; 7 IEC 61850/GOOSE; 8 ICCP/synchrophasors; 9 DER and APIs; 10 enterprise IT; 11 symmetric keys (AES-256 in new buys). See `WRITEUP.md`, Step 2 Parts 3-5.
- Results to show side by side (quantum vs classical, simulator vs emulator):
  - Shor factors 15: r = 4, 3 x 5.
  - Grover on Aer: N = 4, 8, 16 find the key with 100%, 95.5%, 96.0% success (theory 100%, 94.5%, 96.1%).
  - Noise: IonQ noisy simulator drops N = 8 to 71.5% and N = 16 to 36%; Quantinuum H2 emulator stays at 92.5% for N = 8. Different machine models, different answers.
  - Real hardware (Rigetti Cepheus, 200 shots): Grover N = 4 finds the key 88.5% of the time and N = 8 only 45% (theory 94.5%, random 12.5%). Shor on 15 (circuit cut down by hand to 168 two-qubit gates): 65% of shots on the four ideal outcomes vs 25% for pure noise. The structure survives on a real quantum computer, but only at the smallest size.
- Design principle: PQC (hybrid ML-KEM + ML-DSA) protects everything; QKD adds a physical eavesdropper alarm on the backbone fibers where it is worth it; trusted-node relays are trust anchors that must be protected (Grid Twin draws them as gold rings).
- Tools built: Grid Twin covers three of the README's suggested tools in one: the interactive BB84 demo with an eavesdropper, the threshold explorer (the sensitivity slider and the careful-spy case), and the network map of QKD vs PQC links. Still possible: a migration tracker from our Part 3 table.

## Slide 4. The Team
Prompts: Who made it happen? Names and relevant expertise. Individual contributions. Complementary technical and commercial skills.

Draft: [TEAM] fill in names and roles. Suggested split from this repo's work: Step 1 BB84 (teammate), Step 2 Shor/Grover and the migration analysis (this branch's author, with AI assistance), Step 3 capstone design, deck and customer/value research. Say plainly which parts used AI assistants (see slide 5) and who can explain each result. Judges ask everyone to explain the work in plain words.

## Slide 5. What We Learned
Questions to answer: Where does quantum help this customer today, and where doesn't it? What failed, and why?

Draft (honest list; add the teammate's failures):
- Quantum helps today: BB84 gives a physical eavesdropper alarm on a dedicated link (Step 1). It does not replace authentication.
- Quantum does not help today: Shor cannot break RSA yet (4 orders of magnitude of qubits to go, and no error-corrected machine). Our Grover demo says nothing about breaking AES: Grover only halves the key exponent, and NIST says AES-128 stays secure for decades (we still recommend AES-256 in new buys).
- What surprised us: IonQ's simulator and Quantinuum's emulator gave very different noise results for the same circuit (71.5% vs 92.5% at N = 8), and the real Rigetti machine did worse than both (45%): noise is a property of the machine, not the algorithm. The Shor circuit as written needs about 13,300 two-qubit gates; we had to cut it to 168 by hand to run it at all.
- What failed or cost us time: the notebook's device list did not show IBM's 156-qubit machines that the web catalog lists; a package update (openqasm3 1.0.2) broke QASM 2 submission from Python until we pinned 1.0.1; the first job path to the Quantinuum emulator needed Quantinuum's terms accepted. Add anything else that went wrong.
- From building Grid Twin: a careful spy who taps about 5% of photons hides inside normal fiber noise (QBER 4.5% against a 4.7 to 5.0% warning line). QKD cannot catch her quickly, but privacy amplification makes what she learns worthless. A fixed threshold like 7% would let a much bigger tap hide; the threshold should come from each fiber's own baseline.
- What we would do next: pilot hybrid ML-KEM on the VPN edge, start a crypto inventory, require PQC-capable hardware in the next procurement.
- Tools we used: AI assistants helped with drafting and checking code and notes. We reviewed the results ourselves, and everyone presenting can explain what is in the deck.

---

## Checklist before Sunday 9:00 AM
- [ ] Teammate's Step 1 (BB84) and Step 3 (capstone) added to slides 1, 3, 5; names and roles on slide 4.
- [ ] Open the template .pptx (now in this repo) and fill in its five slides.
- [x] `WRITEUP.md` is now the single write-up for every Step and Part (14 Nov), with the verified Step 2 and the Chattanooga Step 3. Its **[TEAM]** items (diagram screenshots, rollout plan) still need the team.
- [ ] Resolve the remaining VERIFY items (exact protocol crypto per vendor) or remove the claim.
- [x] Run record complete (job IDs are in `WRITEUP.md`, at the end).
- [ ] Rehearse: everyone can explain the Shor, Grover, QKD-vs-PQC and migration-ranking choices in plain words.
- [ ] Make the ZIP of the track folder; test every shared link in a private window; bring the deck on a USB stick.
- [ ] Optional: qBraid Award entry (video link + 3 slides) via the form in the root README.
