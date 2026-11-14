# Grid Twin: design

## The idea in one paragraph

A utility already sees its fiber links. A quantum-secured link adds a new signal: its error rate. When that rate rises significantly above the link's own baseline, someone may be measuring the photons. Grid Twin shows that signal on every quantum link of a city network, lets you play the eavesdropper, and turns the alarm into a bounded, automatic response: stop trusting that link's quantum keys, fall back to post-quantum keys, reroute if needed, and never switch off power.

## Design decisions (and the critique that led to them)

1. **BB84 runs in the browser, not in Qiskit.** Notebook 1 runs one Qiskit Aer job per photon, which takes seconds per fiber. BB84 with intercept-resend uses only single qubits in basis states, so its statistics can be simulated exactly with plain random numbers. Qiskit stays the source of truth: `sim/bb84_reference.py` runs the same scenarios as real circuits and the tests compare the two.

2. **11% is the abort line, not the alarm line.** Below about 11% QBER, BB84 can still distill a secret key (secret fraction 1 − 2h(Q), Shor and Preskill 2000). A careful eavesdropper stays far below 11%, so the alarm is statistical: a fiber warns when its error rate is more than z standard deviations above **its own** baseline, given how many sifted bits it has seen. The 11% line marks where no key can be made at all. The team lead's "below 11% means the link is good enough" is kept, worded as a health indicator (it is the point where the key fraction reaches zero), not as a teleportation guarantee.

3. **An alarm never takes a link down.** If a tap could force a link offline, an attacker could use the alarm to cut communications at will. So an alarmed fiber stops supplying QKD keys and its traffic switches to ML-KEM (FIPS 203) keys; the link stays up. Only an operator quarantine removes a link from service.

4. **"Isolate" means communication, not power.** Cutting power is the damage the system exists to prevent. When a site loses every communication path, it keeps running on its own local protection and a crew is dispatched. The code carries `power: "energized"` on every site in every state, and a test checks it.

5. **The trusted-node problem is visible.** A QKD key from a control center to a distant substation is relayed hop by hop; every relay holds the key in the clear for a moment. Selecting a substation draws gold rings around its relays.

6. **PQC first, QKD where it is worth it.** QKD runs on the backbone (control centers and major substations). Sub-units and the long rural link use ML-KEM: short, numerous links are cheapest with software, and a 140 km fiber detects about 537 times fewer photons than a 10 km city fiber, so its key rate would be tiny (its error baseline would still be about 4.8%, workable on its own; at 200 km it would be 21%, past the abort line). Lo, Ma and Chen report a maximum secure distance of a little over 140 km for these parameters even with decoy states. This matches NSA, UK NCSC and the ANSSI/BSI/NLNCSA/Swedish joint paper, which all put post-quantum cryptography first.

7. **Stylized map.** Real substation locations are sensitive infrastructure data, so the layout is invented: 2 control centers (primary and backup), 6 major substations, 8 feeder sub-units, 1 remote site.

8. **No key is trusted before evidence.** A fiber that has just been restored (or has just started) runs on ML-KEM keys until it has collected enough sifted bits to judge its error rate ("Measuring"). Real QKD works the same way: the error rate is estimated before any key is used. This fixed a bug the audit found, where a restored fiber reused its old alarm state.

9. **Decoy traffic instead of cutting a line** (team idea). When a fiber looks tapped, real traffic can move to another route while the fiber keeps running on fake traffic and quantum photons. The tapper keeps tapping, and every photon she disturbs is evidence: inverting Q = p + f(1/4 − p/2) gives her intercepted share f̂ = (Q − p)/(1/4 − p/2) with a standard error. Decoy mode is refused when a site would be left with no route; then real traffic stays on the fiber with ML-KEM keys. (Not to be confused with *decoy-state* QKD, a different technique that uses weaker pulses to catch photon-number-splitting attacks.)

10. **Risk-aware routing** (team idea: "route real traffic over the best possible path with a decision model"). Real traffic takes the path with the lowest cost, where each fiber costs its length × (1 + 4 × risk) and risk comes from its live evidence: 0 when clean, rising toward 0.5 as its error rate nears the warning line, 0.5 while measuring, 2 in warning, 4 above 11%. So traffic leaves a suspicious fiber before it ever raises an alarm, if a safer route exists. It is a weighted shortest-path decision, chosen because it is exact, fast (milliseconds on 300 buses) and explainable; a learned or quantum optimizer could replace the cost function later.

11. **Teleportation view** (team lead's idea: "QBER below 11% means we're good on our entanglement; we'd be able to teleport between any node where the QBER is low enough"). Assumes the same fibers ran an entanglement-based protocol (BBM92), so a fiber's error rate describes the entangled pairs it can deliver. Below 11%, one-way entanglement distillation works (the same bound as BB84's key). Entanglement swapping joins pairs; with independent errors per hop, (1 − 2Q_end) = ∏(1 − 2Q_i), so the best route is a shortest path with weights −ln(1 − 2Q_i), and the end-to-end pair is usable when Q_end < 11%. Swapping nodes never hold the key, which is how such a link would remove the trusted-node problem (notebook 3's question). Teleportation still needs two classical bits per qubit.

12. **QKD coverage switch**. The design puts QKD on the backbone only; the team's whiteboard also had QKD on sub-unit links. Both are available; any site with a healthy QKD chain to a control center gets QKD keys.

## Physics

**Error rate with an eavesdropper.** Let p be the fiber's own error rate and f the share of photons Eve intercepts. On sifted rounds: if Eve guesses Alice's basis (probability 1/2), Bob sees only fiber noise, error p; if she guesses wrong, her resent photon is in the other basis and Bob's result is random, error 1/2. So

  Q = (1 − f)·p + f·(p/2 + 1/4) = p + f·(1/4 − p/2).

A full tap (f = 1) on a clean fiber gives 25%; on a 3.3% fiber it gives 26.65%.

**Fiber baseline.** With transmittance η(L) = 10^(−αL/10)·η_Bob and dark-count probability Y0,

  Q_base(L) = (e_opt·η + Y0/2) / (η + Y0),

the single-photon case of Eq. (8) in Lo, Ma and Chen (PRL 94, 230504, 2005), using α = 0.21 dB/km, η_Bob = 4.5%, Y0 = 1.7e-6, e_opt = 3.3%: the GYS 2004 row of Table 1 in Ma, Qi, Zhao and Lo (arXiv quant-ph/0503005). City links (8 to 22 km) sit at 3.30%; 100 km is 3.5%, 150 km 5.7%, 200 km 21%.

**Alarm.** Over a sliding window of n sifted bits, warn when Q̂ > Q_base + z·sqrt(Q_base(1 − Q_base)/n). With n about 2,200 to 3,200 sifted bits (a 4-second window; longer fibers detect fewer photons) and z = 4.5, the warning line is 4.7% to 5.0%. A tap on 10% or more of photons (QBER about 5.6%) is caught within seconds; a 7% tap (4.9%) sits right on the line and is caught only some of the time; a 5% tap (4.5%) hides in the noise (that is the "careful spy" the README asks about; privacy amplification is what makes her information worthless). The false-alarm chance per check is the normal tail at z (3.4e-6 at z = 4.5). Alarms clear only after several calm checks (hysteresis).

**Secret-key fraction.** r(Q) = max(0, 1 − 2h(Q)), h the binary entropy: 58% at 3.3% QBER, 0 at 11%. This is the asymptotic one-way bound; real systems with finite keys and decoy states get less.

## Response policy (src/response.js)

| Situation | Link | Sites |
|---|---|---|
| Healthy QKD fiber | supplies QKD keys | |
| Fiber in warning or abort | keeps carrying traffic, keys from ML-KEM | a substation whose QKD chain used it reroutes its QKD key through other healthy QKD fibers (trusted relays), or falls back to ML-KEM if none is left |
| Same, with automatic response on (default) | switches to decoy traffic if every site keeps another route; the tap is measured over the next full window; a crew inspection is recommended | real traffic already avoids it (risk-weighted routing); the incident closes itself when the error rate returns to normal |
| Operator quarantines a fiber | out of service | traffic reroutes over any remaining link; a site with no path left is cut off from comms, keeps power, runs on local protection, crew dispatched |
| Tap on a post-quantum link | nothing detects it | ML-KEM keeps the traffic unreadable to the tapper |

Paths are shortest by fiber length (Dijkstra), from either control center.

## Limits (say these on the "What we learned" slide)

- Intercept-resend is the simplest attack; real QKD faces others (photon-number splitting, detector attacks), handled with decoy states and careful hardware.
- The fiber model is a textbook model with lab parameters, not a measurement of any utility's network.
- Key *rates* are not shown, only the secret-key fraction: rates depend on hardware we do not have.
- QKD still needs authenticated classical channels, which come from classical or post-quantum cryptography.
- The response is classical graph logic. A QAOA version of "which links to isolate" is possible (UTC's original Problem 2, the TVA QAOA primer) but would not beat this at this size.

## Automatic response (src/main.js, incidents)

Placing a tap needs no further clicks: the network runs the whole response itself, and an incident card shows each stage with its time.

1. **Detect**: the fiber's error rate is significantly above its own baseline (or above 11%).
2. **Switch keys**: QKD keys from the fiber are no longer trusted; its traffic uses ML-KEM. The fiber stays up.
3. **Reroute**: real traffic follows the risk-weighted routes; the card names any site that has no other path.
4. **Decoy**: the fiber carries only fake traffic, if no site would be stranded; otherwise this stage says why it was skipped.
5. **Measure**: after one full detector window (16 ticks, 4 s) of photons sent after the alarm, the tap estimate f̂ is reported. Waiting a full window keeps older, untapped photons out of the estimate (a 3 s wait under-read a full tap as 89%; the full window reads 95 to 100%).
6. **Recommend**: send a crew to inspect the fiber; quarantine is the operator's call.

What stays manual, on purpose: **quarantine**. If a tap could take a fiber out of service automatically, an attacker could cut communications at will by tapping. The operator can quarantine from the card or the inspector, and restore later (the fiber restarts on probation).

## Real grid (the hero)

The default view is Chattanooga's real grid from OpenStreetMap, and a statewide 500 kV view.

**Mapping:**
- Substations become sites.
- Power lines become fiber links with their real route and length.
- 161 kV and above is the QKD backbone; 46 kV distribution runs on ML-KEM.
- The two key hubs are assumed.

**What the real data shows:**
- **Chattanooga:** every link is between 0.2 and 22 km, comfortably inside fiber QKD's reach.
- **Statewide:** 8 of 38 spans exceed 80 km and would need trusted relays or repeaters. That is the only place a satellite argument could start, and it stays on the roadmap.

**Long fibers:** they detect fewer photons. Each fiber gets at least 90 detections per tick (about 45 sifted bits), so one 16-tick window always reaches the detector's 600-bit minimum. Before this floor, fibers over about 50 km stayed in "Measuring" forever.
