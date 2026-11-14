# Grid Twin: design

## The idea in one paragraph

A utility already sees its fiber links. A quantum-secured link adds a new signal: its error rate. When that rate rises significantly above the link's own baseline, someone may be measuring the photons. Grid Twin shows that signal on every quantum link of a city network, lets you play the eavesdropper, and turns the alarm into a bounded, automatic response: stop trusting that link's quantum keys, fall back to post-quantum keys, reroute if needed, and never switch off power.

## Design decisions (and the critique that led to them)

1. **BB84 runs in the browser, not in Qiskit.** Notebook 1 runs one Qiskit Aer job per photon, which takes seconds per fiber. BB84 with intercept-resend uses only single qubits in basis states, so its statistics can be simulated exactly with plain random numbers. Qiskit stays the source of truth: `sim/bb84_reference.py` runs the same scenarios as real circuits and the tests compare the two.

2. **11% is the abort line, not the alarm line.** Below about 11% QBER, BB84 can still distill a secret key (secret fraction 1 − 2h(Q), Shor and Preskill 2000). A careful eavesdropper stays far below 11%, so the alarm is statistical: a fiber warns when its error rate is more than z standard deviations above **its own** baseline, given how many sifted bits it has seen. The 11% line marks where no key can be made at all. The team lead's "below 11% means the link is good enough" is kept, worded as a health indicator (it is the point where the key fraction reaches zero), not as a teleportation guarantee.

3. **An alarm never takes a link down.** If a tap could force a link offline, an attacker could use the alarm to cut communications at will. So an alarmed fiber stops supplying QKD keys and its traffic switches to ML-KEM (FIPS 203) keys; the link stays up. Only an operator quarantine removes a link from service.

4. **"Isolate" means communication, not power.** Cutting power is the damage the system exists to prevent. When a site loses every communication path, it keeps running on its own local protection and a crew is dispatched. The code carries `power: "energized"` on every site in every state, and a test checks it.

5. **The trusted-node problem is visible.** A QKD key from a control center to a distant substation is relayed hop by hop; every relay holds the key in the clear for a moment. Selecting a substation draws gold rings around its relays.

6. **PQC first, QKD where it is worth it.** QKD runs on the backbone (control centers and major substations). Sub-units and the long rural link use ML-KEM: short, numerous links are cheapest with software, and a 140 km fiber loses too many photons (its QKD baseline would be about 4.8%, close to unusable once anything else goes wrong; at 200 km it would be 21%, past the abort line). This matches NSA, UK NCSC and the ANSSI/BSI/NLNCSA/Swedish joint paper, which all put post-quantum cryptography first.

7. **Stylized map.** Real substation locations are sensitive infrastructure data, so the layout is invented: 2 control centers (primary and backup), 6 major substations, 8 feeder sub-units, 1 remote site.

## Physics

**Error rate with an eavesdropper.** Let p be the fiber's own error rate and f the share of photons Eve intercepts. On sifted rounds: if Eve guesses Alice's basis (probability 1/2), Bob sees only fiber noise, error p; if she guesses wrong, her resent photon is in the other basis and Bob's result is random, error 1/2. So

  Q = (1 − f)·p + f·(p/2 + 1/4) = p + f·(1/4 − p/2).

A full tap (f = 1) on a clean fiber gives 25%; on a 3.3% fiber it gives 26.65%.

**Fiber baseline.** With transmittance η(L) = 10^(−αL/10)·η_Bob and dark-count probability Y0,

  Q_base(L) = (e_opt·η + Y0/2) / (η + Y0),

using α = 0.21 dB/km, η_Bob = 4.5%, Y0 = 1.7e-6, e_opt = 3.3% (GYS 2004 values as used by Lo, Ma and Chen 2005). City links (8 to 22 km) sit at 3.30%; 100 km is 3.5%, 150 km 5.7%, 200 km 21%.

**Alarm.** Over a sliding window of n sifted bits, warn when Q̂ > Q_base + z·sqrt(Q_base(1 − Q_base)/n). With n about 2,200 to 3,200 sifted bits (a 4-second window; longer fibers detect fewer photons) and z = 4.5, the warning line is 4.7% to 5.0%. A tap on 10% or more of photons (QBER about 5.6%) is caught within seconds; a 7% tap (4.9%) sits right on the line and is caught only some of the time; a 5% tap (4.5%) hides in the noise (that is the "careful spy" the README asks about; privacy amplification is what makes her information worthless). The false-alarm chance per check is the normal tail at z (3.4e-6 at z = 4.5). Alarms clear only after several calm checks (hysteresis).

**Secret-key fraction.** r(Q) = max(0, 1 − 2h(Q)), h the binary entropy: 58% at 3.3% QBER, 0 at 11%. This is the asymptotic one-way bound; real systems with finite keys and decoy states get less.

## Response policy (src/response.js)

| Situation | Link | Sites |
|---|---|---|
| Healthy QKD fiber | supplies QKD keys | |
| Fiber in warning or abort | keeps carrying traffic, keys from ML-KEM | a substation whose QKD chain used it reroutes its QKD key through other healthy QKD fibers (trusted relays), or falls back to ML-KEM if none is left |
| Operator quarantines a fiber | out of service | traffic reroutes over any remaining link; a site with no path left is cut off from comms, keeps power, runs on local protection, crew dispatched |
| Tap on a post-quantum link | nothing detects it | ML-KEM keeps the traffic unreadable to the tapper |

Paths are shortest by fiber length (Dijkstra), from either control center.

## Limits (say these on the "What we learned" slide)

- Intercept-resend is the simplest attack; real QKD faces others (photon-number splitting, detector attacks), handled with decoy states and careful hardware.
- The fiber model is a textbook model with lab parameters, not a measurement of any utility's network.
- Key *rates* are not shown, only the secret-key fraction: rates depend on hardware we do not have.
- QKD still needs authenticated classical channels, which come from classical or post-quantum cryptography.
- The response is classical graph logic. A QAOA version of "which links to isolate" is possible (UTC's original Problem 2, the TVA QAOA primer) but would not beat this at this size.
