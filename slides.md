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

The old "Value" slide is gone, so the value argument now lives on slide 2 (why they would adopt or pay) and slide 3 (what works today vs what is unproven). The finalist slot in the README is 4 minutes; the template says five minutes. Ask a mentor which applies to your slot.

Logistics: submit the deck and a ZIP of this folder by **Sunday 9:00 AM** (hard deadline, one person submits). Bring the deck to the judging slot on a USB stick or laptop. Six finalists present for 4 minutes at the closing ceremony. Keep a run record (device, job ID, shots, status) for every cloud run. Set sharing to "anyone with the link" and test the links in a private window.

---

## Slide 1. The Problem
Questions to answer: Which of the utility's data or keys must stay secret for 10 years or more? Is the bigger risk someone reading old traffic, or someone forging a command or firmware update later?

Draft (DONE, from Step 2):
- "Harvest now, decrypt later": an attacker records encrypted grid traffic today and decrypts it when a large enough quantum computer exists. Shor's algorithm breaks RSA and elliptic-curve cryptography, which protect VPNs, TLS, certificates and firmware signing.
- Two different risks, and both matter: **read later** (confidentiality of key exchange) and **forge later** (a signature check that a 20-30 year relay or meter trusts for its whole life). We think forge-later on firmware is the higher-consequence risk.
- How big is the gap? Today's largest machine on qBraid has 107 qubits through the SDK (156 on IBM machines in the web catalog). Gidney's 2025 estimate for RSA-2048 is under 1 million noisy qubits: about **4 orders of magnitude** away. Estimates keep falling (20 million in 2019, under 1 million in 2025, about 22,600 cat qubits claimed in Oct 2026 for one specific architecture). Link: `WRITEUP_step2.md` Part 2.
- Demo we ran: Shor factors 15 (r = 4, 15 = 3 x 5). The circuit is hard-coded for N = 15, so it shows the idea, not the scale.
- [TEAM] Step 1: a spy on a fiber link is a separate, present-day threat. Add the BB84 result: error rate without and with an eavesdropper.

## Slide 2. Ideal Customer Profile
Questions to answer: What does a utility like EPB run on these links today? How long do field devices stay in service? Who signs off on a change like this, and which rules apply?

Draft (mostly DONE, needs VERIFY on numbers):
- Customer: a city-scale utility like EPB in Chattanooga. EPB serves about 202,000 electric customers (EPB / City of Chattanooga financial report, FY2025) over a fiber network of roughly 9,000 miles (EPB press release). VERIFY: EPB's own materials give different fiber-mile figures.
- It also runs the EPB Quantum Network: 216 dedicated dark fibers with room for 10 quantum nodes in downtown Chattanooga (EPB press release, Sept 2023; promotional source). It has a history of QKD field tests on its own fiber (Evans et al., IEEE Access 2021, trusted-node QKD, three systems).
- What they run on these links: DNP3 (SAv5), IEC 61850 (MMS, GOOSE), IEC 62351, ICCP, VPNs, smart-meter systems. Most of it is secured with RSA/ECC today. VERIFY the exact protocol crypto per vendor.
- Device life: protection relays and RTUs are planned for roughly 20-30 years; AMI meters 10-20 (SEL, ABB, utility planning documents). That is why a signature trusted today must hold into the 2040s.
- Who decides and which rules: the utility's engineering and security leadership and its board; NERC CIP-012-2 (control-center-to-control-center data protection, enforceable since 1 July 2026; technology-neutral, does not mandate encryption); CIP-005 (future version 2028, VERIFY). NIST IR 8547 sets 2030 deprecation / 2035 disallowance for RSA and ECC in NIST standards; it binds a municipal utility through contracts, regulators or policy, not automatically.
- What an attack costs them (use sparingly, label as context): the 2015 Ukraine grid attack cut power to about 225,000 customers for 1-6 hours (E-ISAC report). The IBM Cost of a Data Breach 2024 average is $4.88M across all industries (not utility-specific).

### Why they would adopt or pay (the value argument; belongs on slide 2)
Prompt: Why would they adopt or pay for it? What does one QKD link cost (equipment, dedicated fiber, trusted nodes) next to a post-quantum software or firmware update? What does the utility get for the difference?

Draft (numbers and where they come from; label guesses):
- What the agencies say (independent, but pre-existing positions): NSA does not recommend QKD for national security systems and says it needs trusted relays and has limitations (NSA Post-Quantum Cybersecurity Resources page). The UK NCSC (2025 white paper) says it will not support QKD for government or military use. A joint European position paper on QKD (ANSSI, BSI, NLNCSA, Swedish authorities, Jan 2024) calls it suited only to niche use. VERIFY: we could not confirm the last one from a primary source in this session.
- PQC cost: the White House OMB/ONCD report (July 2024) put federal migration of priority civilian systems at about $7.1 billion over 2025-2035, flagged by OMB itself as high-uncertainty. No published utility-specific dollar figure found; say so.
- QKD cost (all rough, from academic and consultancy sources, not EPB quotes): about EUR 200,000 per pair of QKD systems (academic estimate, arXiv 2206.14109, 2022); consultancy estimates of $100-150k per node and $200-300k per link (vendor/consultancy source, unverified); dedicated fiber rental about $1,000/km/year (preprint). A trusted-node chain needs hardware at every hop. VERIFY before quoting.
- A transparent guess for slide 2 (mark it as a guess): a 10-site star network needs 9 QKD links. At $200-300k per link that is roughly $1.8-2.7M in QKD equipment before fiber, trusted-node security and staff. Compare with PQC: mostly software and firmware updates on hardware that can already be patched, plus replacing the devices that cannot (ROM trust anchors, old meters), at normal refresh. We do not have a PQC dollar figure; give it as a range after a mentor or the utility case supports it.
- Value story: PQC protects every link and every system, is standards-backed (NIST FIPS 203/204/205), and is mostly a software change. QKD protects only the key exchange on the links it is installed on, still needs authentication from classical crypto, and needs relays. The difference in spend buys coverage of the whole network instead of a few links.

## Slide 3. Solution & Technology
Questions to answer: Your network diagram, your working link, your rollout.

Draft:
- [TEAM] Step 3: network design (2 control centers + 6-10 substations, link lengths), where QKD and where PQC, trusted-node problem, timing sync, working prototype link (BB84 or teleportation), phased rollout. Not started in this repo by us.
- DONE, our migration ranking (Step 2): 1 crypto inventory and agility; 2 hybrid ML-KEM on every VPN/TLS/SSH edge now; 3 firmware signing and ROM trust anchors (dual-sign, PQC-capable hardware); 4 PKI/CA; 5 AMI procurement; 6 SCADA/DNP3 TLS layer; 7 IEC 61850/GOOSE; 8 ICCP/synchrophasors; 9 DER and APIs; 10 enterprise IT; 11 symmetric keys (AES-256 in new buys). See `WRITEUP_step2.md` Parts 3-5.
- Results to show side by side (quantum vs classical, simulator vs emulator):
  - Shor factors 15: r = 4, 3 x 5.
  - Grover on Aer: N = 4, 8, 16 find the key with 100%, 95.5%, 96.0% success (theory 100%, 94.5%, 96.1%).
  - Noise: IonQ noisy simulator drops N = 8 to 71.5% and N = 16 to 36%; Quantinuum H2 emulator stays at 92.5% for N = 8. Different machine models, different answers.
- Suggested design principle for the diagram: use PQC (hybrid ML-KEM + ML-DSA) as the default across all links; use QKD only where the case is strong (short dedicated fiber between a few high-value sites), and treat QKD trusted-node relays as trust anchors that must be protected.
- Tools to build (these count; pick one or two): an interactive BB84 demo with an eavesdropper slider; a threshold explorer (line noise vs a spy, where to set the alarm); a network map showing which links get QKD vs PQC and why; a migration tracker that ranks systems by data lifetime x device lifetime. Our Part 3 table is already the data for the tracker.

## Slide 4. The Team
Prompts: Who made it happen? Names and relevant expertise. Individual contributions. Complementary technical and commercial skills.

Draft: [TEAM] fill in names and roles. Suggested split from this repo's work: Step 1 BB84 (teammate), Step 2 Shor/Grover and the migration analysis (this branch's author, with AI assistance), Step 3 capstone design, deck and customer/value research. Say plainly which parts used AI assistants (see slide 5) and who can explain each result. Judges ask everyone to explain the work in plain words.

## Slide 5. What We Learned
Questions to answer: Where does quantum help this customer today, and where doesn't it? What failed, and why?

Draft (honest list; add the teammate's failures):
- Quantum helps today: BB84 gives a physical eavesdropper alarm on a dedicated link (Step 1). It does not replace authentication.
- Quantum does not help today: Shor cannot break RSA yet (4 orders of magnitude of qubits to go, and no error-corrected machine). Our Grover demo says nothing about breaking AES: Grover only halves the key exponent, and NIST says AES-128 stays secure for decades (we still recommend AES-256 in new buys).
- What surprised us: IonQ's simulator and Quantinuum's emulator gave very different noise results for the same circuit (71.5% vs 92.5% at N = 8): noise is a property of the machine model, not the algorithm.
- What failed or cost us time: the notebook's device list did not show IBM's 156-qubit machines that the web catalog lists; a package update (openqasm3 1.0.2) broke QASM 2 submission from Python until we pinned 1.0.1; the first job path to the Quantinuum emulator needed Quantinuum's terms accepted. Add anything else that went wrong.
- What we would do next: pilot hybrid ML-KEM on the VPN edge, start a crypto inventory, require PQC-capable hardware in the next procurement.
- AI use (be upfront): we used AI assistants (Claude and open models via OpenCode) to draft parts of the written analysis and to write and check code. Every claim marked VERIFY needs a human check, and everyone presenting must be able to explain what is in the deck.

---

## Checklist before Sunday 9:00 AM
- [ ] Teammate's Step 1 (BB84) and Step 3 (capstone) added to slides 1, 3, 5; names and roles on slide 4.
- [ ] Open the template .pptx and fill in its five slides (it is not committed by us; add it to the repo only if the team wants it there).
- [ ] Merge `WRITEUP_step2.md` and the other steps into one `WRITEUP.md` (the README's required name), labeled by Step and Part.
- [ ] Resolve every VERIFY item or remove the claim.
- [ ] Run record complete (job IDs are in `WRITEUP_step2.md`).
- [ ] Rehearse: everyone can explain the Shor, Grover, QKD-vs-PQC and migration-ranking choices in plain words.
- [ ] Make the ZIP of the track folder; test every shared link in a private window; bring the deck on a USB stick.
- [ ] Optional: qBraid Award entry (video link + 3 slides) via the form in the root README.
