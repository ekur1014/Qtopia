# Grid Twin: demo script

A 60-second live demo for the Solution & Technology slide, plus setup and a backup plan.

## Before you present

1. Start the page: `source ~/.qtopia.env; python3 grid-twin/start.py` (opens the live grid, with the qBraid buttons), or double-click `grid_twin.html` at the top of the repo. Let the intro flight finish. The top bar switches to the real map, the photon line and the quantum lab.
2. The page opens in the light theme, the easiest to read on a projector. The cinematic orbit turns the view slowly until you touch anything; press **O** to stop it for good, **H** to fit the whole network, **F** to fly close to the selection.
3. **It needs internet**: Three.js and the fonts load from public CDNs. Test on the venue Wi-Fi. If it is unreliable, have the backup ready (below).
4. Set the browser to full screen. Close other tabs so the animation stays smooth.
5. If clicking a fiber is awkward on the projector, use **Find a fiber or site** in the panel instead. The browser console also has one-liners:
   ```js
   gridTwin.tap("L6", 1)          // real grid: full tap on Chickamauga–Hamilton
   gridTwin.select("node", "T23") // Hamilton: key now relayed via JC Edwards
   gridTwin.route("T1", "T4", 0.11) // route search: Sequoyah to Oglethorpe, 11% cutoff
   // Simulation lab (?net=city): gridTwin.tap("L11", 1), gridTwin.select("node", "S6"), gridTwin.quarantine("P4")
   ```

## The script (about 60 seconds)

| Time | Do | Say |
|---|---|---|
| 0:00 | Page at rest: the real Chattanooga grid | "This is Chattanooga's real grid: EPB and TVA substations and lines, from public map data. Green fibers on the transmission lines run quantum key distribution, BB84, live. Purple links to neighborhood substations use post-quantum cryptography." |
| 0:10 | Press **2** (Eavesdrop), click the **Chickamauga–Hamilton** fiber (L6; or pick it in **Find a fiber or site**). Then do nothing | "I'm tapping this fiber: an eavesdropper measures every photon. Now watch: nobody touches anything." |
| 0:15 | Point at the incident card filling in, stage by stage | "Within about a second it's detected. Keys switch to ML-KEM, so the fiber stays up: an attacker can't use our alarm to cut communications. Real traffic reroutes, and the fiber switches to decoy traffic: the spy keeps tapping and gets only fake data." |
| 0:22 | Point at **Measured** and **Recommended** | "Four seconds later the network has measured her: close to 100% of photons intercepted, an intercept-resend signature. It recommends a crew inspection. Quarantine stays a human decision." |
| 0:30 | Press **1**, click **Hamilton** | "Hamilton still gets a quantum key, now relayed from Oglethorpe through two other substations. Those gold rings are trusted nodes: they briefly hold the key, so they must be physically secured. That's the trusted-node problem." |
| 0:40 | Remove the tap (click the fiber again with tool 2, or "Remove all taps"); set the tap slider to **5%** and tap another fiber | "A careful spy taps only 5%. Now the error rate stays inside normal noise: physics alone can't catch her quickly. That's why the threshold comes from each fiber's own baseline, and why privacy amplification matters." |
| 0:55 | On the incident card, click **Quarantine fiber** | "If the operator does quarantine, traffic reroutes. A site with no path left loses communications, but never power." |
| Optional | Remove all taps. In **Find a route**, pick a Start and an End site (for example Sequoyah and Oglethorpe, or `gridTwin.route("T1", "T4", 0.11)`) | "Now the route search. Pick any two sites. It finds a quantum-key route with the fewest sites in between, because every site the key passes through briefly holds it: an insider there could read it. The panel says how many sites the plain shortest route would pass through, and how many this one does." |
| Optional | With tool 2, tap one fiber on the highlighted route at 100% | "I tap a fiber on that route. Its error rate jumps past the 11% cutoff and the automatic response moves it to decoy traffic, so the route moves to other fibers and other trusted sites. If no clean quantum route is left, it uses ML-KEM end to end, so the sites in between only forward data they can't read. If there is no path at all, the site is islanded: power stays on." |
| Optional | Remove the tap; untick **Automatic response** (otherwise its alarm moves the fiber to decoy traffic before the cutoff matters); set the tap slider to **20%** (error rate about 8%) and tap a route fiber; then drag the **Cutoff** from 11% down to **7%** | "A 20% tap gives about 8%: under 11%, so the route still uses it. Drop the cutoff to 7% and that borderline fiber is blocked, and the route changes. The Grover card shows the same choice as a quantum search over 8 candidate routes. It's a demonstration of notebook 2b's circuit, not a speed-up: a normal computer solves this exactly." |
| Optional | Pick **Tennessee 500 kV backbone** in the network list | "Statewide, eight spans are longer than 80 km: past what fiber QKD reaches without relays. That is where trusted relays or repeaters come in. A satellite would only make sense at this scale, and it stays on the roadmap." |

## What to point at

- **Network now** cards: fibers healthy, fibers in alarm, substations on quantum keys, sites without comms.
- **Inspector chart**: the white QBER line climbing past the amber warning line and the red 11% abort line.
- **Event log**: the sequence warning, switch to ML-KEM, abort.

## Backup plan

- Record a 60-second screen capture of the script above before the presentation, and keep it on the laptop and the USB stick.
- Take two screenshots for the team's slides: the healthy Chattanooga grid, and the tapped Chickamauga–Hamilton fiber with Hamilton's gold relay rings and the incident card.
- Offline option: Three.js could be saved into the repo so the page runs without internet. Not done yet; ask if you want it.
