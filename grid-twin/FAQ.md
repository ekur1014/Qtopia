# Grid Twin: questions judges may ask

Short answers anyone on the team can give, with the reasoning behind them. Numbers come from DESIGN.md and the tests.

**Is the quantum part real or just an animation?**
The BB84 statistics are computed, not drawn: every 250 ms each quantum fiber runs a few hundred simulated photons with random bits and bases, an optional eavesdropper, fiber noise, and sifting. Because BB84 only uses single qubits in two bases, this simulation is exact. We checked it against real Qiskit Aer circuits on 7 scenarios and they agree (`sim/bb84_reference.py`, `tests/engine.test.mjs`). It is a simulation, not hardware: we say so on the page.

**Why not run Qiskit live?**
One Qiskit job per photon takes seconds per fiber; the 34 QKD fibers on the real grid at 4 updates a second would need a server and would lag. The math is identical, and Qiskit is how we proved it.

**Why does a full tap give about 25%?**
Eve guesses the wrong basis half the time; then her resent photon makes Bob's result random, wrong half of those times: 1/2 × 1/2 = 1/4. With fiber noise p, the error rate is p + f(1/4 − p/2) for a tap on a fraction f of photons.

**Why isn't the alarm at 11%?**
11% is where no secret key can be made at all (the key fraction 1 − 2h(Q) reaches zero; Shor and Preskill 2000). A careful spy stays far below that. So we warn when a fiber is statistically above its own baseline of 3.3%: the warning line is 4.4% to 5.1% on Chattanooga's fibers, depending on how many photons each detects. 11% stays the abort line.

**Can a spy hide?**
Yes, a little. Tapping about 5% of photons gives a 4.5% error rate, inside normal noise. She learns little, and privacy amplification removes what she learned. Raising sensitivity catches her sooner but causes more false alarms; the panel shows that trade-off.

**Couldn't an attacker trigger alarms on purpose to shut us down?**
That's why an alarm never takes a fiber down. The fiber stops trusting quantum keys and switches to post-quantum keys (ML-KEM), and keeps working. Only an operator can quarantine a fiber.

**What does "isolate" mean?**
Cutting a communication path. Never power: switching off power is the harm we're protecting against. If a site loses every path, it keeps running on its own local protection and a crew is sent.

**Why not QKD everywhere?**
QKD needs dedicated fiber and costly hardware at both ends, gets weaker with distance (in the Simulation lab, a 140 km rural link detects about 537 times fewer photons than a city fiber), and still needs classical authentication. Post-quantum cryptography protects every link in software. NSA, the UK NCSC and the French, German, Dutch and Swedish agencies all say to prioritize post-quantum cryptography. We use QKD where it adds something: an eavesdropping alarm on the backbone.

**What is decoy mode?**
When a fiber looks tapped, real traffic moves to another route but the fiber keeps running on fake traffic. The spy keeps tapping, and we keep measuring: the error rate tells us what share of photons she intercepts (about ±3% after a few seconds). Nothing she captures is real. It's refused where a site would lose its only route. (Different from decoy-state QKD, which uses weak pulses against photon-number-splitting attacks.)

**How does routing decide?**
Each fiber costs its length times (1 + 4 × risk), with risk from its live error rate. Real traffic takes the cheapest path, so it moves off a fiber that is getting suspicious even before the alarm. It's a weighted shortest-path decision: exact, fast and easy to explain.

**Does the visualization talk to real quantum code?**
Yes, when served by `grid-twin/start.py` (or `sim/live_server.py`): a fiber's current noise and tap can be re-run on Qiskit Aer, NVIDIA CUDA-Q, Quantinuum Guppy (Selene emulator), the team's notebook 1, and qBraid's cloud simulators. The error rates appear next to the browser's and the theory.

**What does the teleportation view show?**
The team lead's idea: a fiber under 11% error could supply usable entangled pairs if run with an entanglement-based protocol. Select a substation and the view finds the entanglement-swapping route from a control center with the lowest end-to-end error (errors combine as (1 − 2Q_end) = ∏(1 − 2Q_i)). The swapping nodes never hold the key, unlike trusted relays. It still needs two ordinary bits per teleported qubit, so nothing is faster than the fiber.

**Can the visualization run on qBraid?**
Yes, with the live server: the **qBraid · IonQ simulator**, **qBraid · QIR simulator** and **Team notebook 1 on qBraid** buttons send that fiber's photons as real jobs to qBraid's free simulators and log the job IDs. At a 40% tap (theory 12.64%) they read 12.55%, 12.96% and 12.48%.

**What is the trusted-node problem?**
QKD keys only cross one fiber. To reach a far substation, the key is relayed through intermediate sites, and each relay holds the key in the clear for a moment. Every relay must be trusted and physically secured. Select a substation whose direct fiber is tapped to see its relays (gold rings). Key paths and the route search use as few relays as they can.

**Is this a real utility's network?**
The main view is: Chattanooga's real EPB and TVA substations and lines from OpenStreetMap (public data). The stylized city in the Simulation lab is invented. The fiber parameters come from a published experiment (GYS 2004, as tabulated by Ma, Qi, Zhao and Lo).

**What does it not model?**
Attacks beyond intercept-resend (for example photon-number splitting or detector attacks), key rates in bits per second, finite-key effects, and real network traffic. See the limits section of DESIGN.md.

**Where is the quantum advantage?**
The eavesdropping alarm is the part only physics can give: a classical link can be copied without a trace. The response logic is ordinary graph search, and we say so.

**Does the operator have to do anything when a tap is found?**
No. Detection, the switch to ML-KEM, rerouting, decoy traffic, the tap measurement and the inspection recommendation all run on their own; the incident card shows each step and its time. The one thing left to a person is quarantine, because an automatic quarantine would let an attacker cut communications just by tapping.

**Is there a satellite?**
No. The mentors put satellites on the roadmap for statewide distances, and the team removed the satellite drawing from the app. Our real Chattanooga links are all at most 22.2 km, well within fiber QKD; only the statewide 500 kV view has spans over 80 km.

**Is the map real?**
Yes. Substations and lines are public OpenStreetMap data, the same data OpenInfraMap draws. Two things are our assumptions: which two substations hold the keys, and that fiber runs along every power line.

**How does the route search work, and where does Grover come in?**
You pick a start site, an end site and a QBER cutoff (QBER is the share of key bits that arrive wrong; default 11%, where no secret key can be made). Any fiber at or above the cutoff counts as tapped and is skipped. The search first looks for a clean QKD route (QKD: keys sent as single photons). If there is none, it takes the best route over every fiber still in service and uses ML-KEM, post-quantum encryption agreed end to end. If there is no physical path at all, the site is islanded: power stays on, local protection runs, and a crew is sent.
Grover is a demonstration, not a speed-up. We list the 8 shortest candidate routes (Yen's method), and notebook 2b's Grover circuit (its oracle extended to mark several items) amplifies the clean ones; the route it draws is then checked normally. With no clean route, every draw fails the check and the search falls back to ML-KEM. Dijkstra already solves this exactly and fast on a normal computer, and the oracle is built from error rates we already know. What it shows is the same circuit from 2b working on a grid problem, with √N oracle queries instead of N.

**Why fewest sites rather than shortest distance?**
There are no quantum repeaters, so a QKD key only crosses one fiber. Every site in the middle is a trusted relay: it measures the key and re-encrypts it for the next fiber. For that moment, someone inside the site, an insider or a hacked device, could read it. Each extra site is one more place the key can leak, while a few extra kilometres of city fiber barely change the error rate (the model's baseline is 3.3% on every Chattanooga fiber, 0.2 to 22.2 km). So the search minimises the number of sites first and only then the risk-weighted distance. The panel shows the difference: "the shortest route would pass through N sites; this one passes through M".