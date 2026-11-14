# Grid Twin: demo script

A 60-second live demo for the Solution & Technology slide, plus setup and a backup plan.

## Before you present

1. Start the page: `cd grid-twin && python3 -m http.server 8000`, open http://localhost:8000, and let the intro flight finish.
2. **It needs internet**: Three.js and the fonts load from public CDNs. Test on the venue Wi-Fi. If it is unreliable, have the backup ready (below).
3. Set the browser to full screen. Close other tabs so the animation stays smooth.
4. If clicking a fiber is awkward on the projector, use **Find a fiber or site** in the panel instead. The browser console also has one-liners:
   ```js
   gridTwin.tap("L5", 1)        // full tap on the North–West fiber
   gridTwin.tap("L11", 1)       // full tap on CC2–S6: S6's key reroutes through S1
   gridTwin.select("node", "S6")
   gridTwin.quarantine("P4")    // cut the Downtown sub-unit's only link
   ```

## The script (about 60 seconds)

| Time | Do | Say |
|---|---|---|
| 0:00 | Page at rest, nothing selected | "This is a city utility's communication network. Green fibers run quantum key distribution, BB84, live. Purple links use post-quantum cryptography." |
| 0:10 | Press **2** (Eavesdrop), click the CC2–S6 fiber (L11) | "I'm tapping this fiber: an eavesdropper measures every photon." |
| 0:15 | Point at the fiber turning amber, then red; point at the event log | "The error rate jumps from 3.3%, its normal noise, to about 27%. Within seconds it's flagged. Notice the fiber stays up: it just stops trusting quantum keys and switches to ML-KEM, so an attacker can't use our alarm to cut communications." |
| 0:30 | Press **1**, click substation **S6** | "S6 still gets a quantum key, now relayed through S1. That gold ring is a trusted node: it holds the key for a moment, so it must be physically secured. That's the trusted-node problem." |
| 0:40 | Remove the tap (click the fiber again with tool 2, or "Remove all taps"); set the tap slider to **5%** and tap another fiber | "A careful spy taps only 5%. Now the error rate stays inside normal noise: physics alone can't catch her quickly. That's why the threshold comes from each fiber's own baseline, and why privacy amplification matters." |
| 0:55 | Press **3**, click a purple sub-unit link | "And if we quarantine a link, traffic reroutes. A site with no path left loses communications, but never power." |
| Optional | Tick **Teleportation view**, select S6 | "If these fibers ran entanglement-based QKD, every fiber under 11% could supply entangled pairs. S6 can be reached by entanglement swapping through S1, and S1 never sees the key: no trusted node." |

## What to point at

- **Network now** cards: fibers healthy, fibers in alarm, substations on quantum keys, sites without comms.
- **Inspector chart**: the white QBER line climbing past the amber warning line and the red 11% abort line.
- **Event log**: the sequence warning, switch to ML-KEM, abort.

## Backup plan

- Record a 60-second screen capture of the script above before the presentation, and keep it on the laptop and the USB stick.
- Take two screenshots for the deck: the healthy network, and the tapped fiber with S6's relay ring and the event log.
- Offline option: Three.js could be saved into the repo so the page runs without internet. Not done yet; ask if you want it.
