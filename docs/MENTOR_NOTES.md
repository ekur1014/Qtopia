# Mentor recordings: what we learned and what we changed

Saturday 14 November 2026. Source: `Additional Mentor Recordings IMPORTANT/`. It holds three recordings (25 min, 9 min and 6 min), each with its transcript and summary, plus a saved OpenInfraMap link. The transcripts were checked against the audio lengths (about 175 to 195 words per minute, so they are complete).

## What the mentors told us

### Scope ("do less better than more worse")
- Draw a line around what we present. Investors and judges stop trusting a team that claims to do everything.
- Our core is right: QKD over the fiber that already runs with the grid, plus a live view of each link's error rate, and what to do when one rises.
- Teleportation between Oak Ridge, UTC, EPB and IonQ is interesting but is quantum communication, not grid security. Put it on the **roadmap**, not in the demo.
- QKD goes to **high-value points** (transmission substations), not homes, and probably not neighborhood substations.

### Pitch framing
- Don't claim QKD would have stopped this week's outages and hacks. We work on encryption; cybersecurity is one level of abstraction up. You can use recent events for emotional context, nothing more.
- Energy is a real market for QKD.
- Slides: three lines of five words, or five lines of three. Only technical terms (like QBER) get to be big.

### Real data (the most actionable tip)
- Use **OpenInfraMap** to get real coordinates of Chattanooga's substations and lines. A realistic map is what EPB, who will see the pitch, actually works with.
- Lines that are not green are the higher-voltage ones to care about. Communication fiber generally follows the power lines.
- Show it as a separate view with the real data.

### Distance, repeaters and satellites
- Fiber QKD reaches roughly 80 to 100 km; substations can act as relays. Repeaters are expensive (a mentor's passing remark; we found no published price).
- Use **China's network** as the reference for when fiber stops making sense.
- Satellites (a LEO swarm, or a geostationary one, which needs government permission) are a **reach goal** for statewide scale. First work out whether long fiber is too expensive.

### Other points
- A teammate raised key-generation speed: fiber QKD's clock rate may not keep up during a fast live attack (compare free-space optics). Worth one honest sentence in "What we learned".
- Grover search for fault-finding is not needed: grid telemetry already tells you where faults are.
- Open question from the team: did EPB's big entanglement test on Chattanooga's network use repeaters? Within the city they likely are not needed.

## What we changed because of it

| Mentor point | Change |
|---|---|
| Use OpenInfraMap, show the real grid | New hero view **Tennessee Quantum Grid**: 117 real sites (31 substations, 84 sub-units and 2 control centers whose locations we assumed) and 145 real lines around Chattanooga (EPB and TVA, from OpenStreetMap), and Tennessee's 500 kV backbone (33 sites). Grid Twin's stylized city and IEEE grids became the "Simulation lab" |
| QKD at high-value points only | On the real grid: QKD on 161 kV and above, ML-KEM on 46 kV distribution |
| Distances decide fiber vs satellite | The statewide view marks the 8 spans over 80 km as needing relays (ML-KEM in the model). Real Chattanooga links are 0.2 to 22 km |
| Satellite is roadmap only | The satellite drawing was removed (14 Nov): no part of our design needs one. Satellites stay a roadmap idea for statewide distances |
| Decoy traffic and rerouting on an alarm | Already built; now automatic when a tap is placed |
| Teleportation is roadmap | The teleportation view stays an optional layer, not part of the main demo |

## What it meant for the teammates' pages

Update: at the user's request these pages were fixed and restyled as part of one project site (see grid-twin/BUILD_LOG.md, "One project"). What we found:

- `chattanooga_quantum_map.html` followed the same OpenInfraMap idea. Some of its sites matched real places (the EPB headquarters address), others could not be matched to OpenStreetMap. Its cost figures ($100k per mile, "satellite saves over 90%") had no source.
- `threejs_quantum_grid.html` showed "IonQ Forte: 98.5% fidelity". The job ID on that page was a simulator job (`ionq:sim:simulator-…`), so "Forte" should not have been claimed; we could not match the ID to any run in our logs. Our own IonQ run was also on the simulator.
- The same page claimed teleportation gives breaker trips in under 16 ms. That is not supported: teleportation needs a classical message, so it is never faster than the fiber.

All three are corrected now.
