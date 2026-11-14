# Technologies from the notebook page: what we can do with each, ranked

Source: the notebook page `Idea/tech-ideas-notebook.jpg` (Three.js, make an artifact, visualization linked with real-time code runs, CUDA-Q, Guppy (Quantinuum), Next.js + Vercel, TanStack, vector search / GraphQL (AI)), plus "we can do stuff on a GPU" and the mentors' OpenInfraMap tip. Saturday 14 November 2026.

Ranked by what each adds to **our pitch by Sunday 9 AM**, given the mentors' advice to "do less better": a judge should see a real grid defending itself, backed by real quantum code.

| Rank | Technology | Status | What we can do with it | Worth it before the deadline? |
|---|---|---|---|---|
| 1 | **Three.js** | Done | The 3D hero: Tennessee Quantum Grid (real Chattanooga EPB/TVA grid), live BB84 on every QKD fiber, taps, automatic response | Already the centerpiece |
| 2 | **OpenInfraMap / OpenStreetMap data** (mentor tip) | Done | Real substations and lines (117 sites around Chattanooga, 33 on Tennessee's 500 kV backbone), real line lengths, imported with `grid-twin/tools/import_osm.mjs` | Yes: the mentors said a real map overlay is what EPB will care about |
| 3 | **Visualization linked with real-time code runs** | Done | Any fiber re-runs as real quantum code from the page: Qiskit Aer, CUDA-Q, Guppy/Selene, qBraid's IonQ and QIR simulators, and the team's notebook 1 (locally and on qBraid) | Yes: it is the proof that the picture is real physics |
| 4 | **Make an artifact** | Done | A private link to the whole app; share it from its Share menu. Plus `grid_twin.html`, one file teammates double-click | Yes, share it with the team |
| 5 | **CUDA-Q on a GPU** | CPU done; GPU not yet | See "GPU" below: run the network's entanglement-swapping routes as circuits, and many fibers in parallel | Only if a GPU machine is available tonight (we have no NVIDIA GPU locally) |
| 6 | **Guppy (Quantinuum)** | Done | BB84 in Guppy on the Selene emulator, the Helios software stack. Next: Selene's noise models, or a Nexus job | Done is enough; mention it on the technology slide |
| 7 | **Next.js + Vercel** | Vercel set up (static site, no Next.js) | A public URL: `vercel.json` builds the whole site with `tools/build_site.sh`; no environment variables needed | Deploy from the team's Vercel account |
| 8 | **Vector search / GraphQL (AI)** | Not done | "Ask the grid": which substations depend on a relay, what changed in the last minute, which sites a fiber cut would strand | Stretch only: it widens scope, which the mentors warned against |
| 9 | **TanStack** | Not needed | Data fetching, tables and routing for a React app. We have no React app | No |

## Detail per technology

### 1. Three.js
**What it is:** the standard WebGL library for 3D in the browser.
**What we did:** the whole visualizer. Light theme by default, view dock (zoom, fit, focus, cinematic orbit), incident cards, real line routes drawn as cables.
**Further options:** a basemap (river, roads) under the real grid, for orientation. Fly-in from the Tennessee view to Chattanooga as an intro.

### 2. OpenInfraMap / OpenStreetMap (from the mentor recording)
**What it is:** OpenInfraMap draws OpenStreetMap's power data. We query the same data through the Overpass API. Licence: ODbL, credit shown on screen.
**What we did:** imported every substation and power line in the Chattanooga area, and Tennessee's 500 kV backbone.
- **QKD backbone:** 161 kV and above, where the substations are TVA and EPB transmission sites.
- **ML-KEM:** the 46 kV lines to EPB distribution substations, following the mentors' advice of no QKD to neighborhoods.
**What it shows that a made-up map cannot:**
- **Chattanooga:** real line lengths (median 3.5 km, longest 22 km) are all far inside fiber QKD's reach.
- **Statewide:** 8 of 38 spans are longer than 80 km. That is exactly where trusted relays or repeaters come in; satellites would only matter here, and will probably be dropped.
**Caveat:** real control-center locations are not public, so the two key hubs (Chickamauga and Oglethorpe) are our assumption. Fiber is assumed to run along every power line (OPGW).

### 3. Visualization linked with real-time code runs
**What it is:** `grid-twin/sim/live_server.py` serves the page and runs a fiber's current noise and tap as real quantum programs.
**Measured** (one fiber, 40% tap, theory 12.64%): Qiskit 13.52%, CUDA-Q 12.11%, Guppy 11.15%, qBraid IonQ simulator 12.55% (job `ionq:ionq:sim:simulator-a7ae-qjob-6af89d21c8f5265fb3f1dcf7`; corrected 14 Nov, see BUILD_LOG), qBraid QIR simulator 12.96%, team notebook 1 on qBraid QIR 12.48%.
**Further options:** run on the hero's real fibers (it already works for any fiber); add the GPU target below.

### 4. Make an artifact
**What it is:** a hosted private page.
**What we did:** the app is published at https://claude.ai/artifact/RMHGPbTvUVXPvKpzXgE6pH. Teammates can open it once it is shared from its Share menu. `grid_twin.html` at the repo root is the offline-friendly equivalent.

### 5. CUDA-Q, and "we can do stuff on a GPU"
**What it is:** NVIDIA's quantum programming platform. We run it on the CPU simulator today (`qpp-cpu`).
**GPU targets** (need an NVIDIA GPU):
- `nvidia`: state vector, roughly up to 30-plus qubits on one GPU.
- `nvidia --option mgpu`: several GPUs.
- `tensornet` / `tensornet-mps`: tensor networks, for many more qubits on suitable circuits.
- `nvidia-mqpu`: each GPU acts as a separate QPU, running circuits in parallel.

**What a GPU would actually buy us** (honest version: single-fiber BB84 is tiny and does not need one):
1. **Whole-network entanglement swapping as one circuit.** The teleportation view's routes (e.g. a substation reached through two swaps) could run as real multi-qubit circuits with noise per hop, instead of the closed-form composition we use now. Most useful for long routes on the 500 kV view.
2. **Every fiber at once.** `nvidia-mqpu` runs each fiber's BB84 circuit batch on its own simulated QPU, so the whole Chattanooga network's 34 QKD fibers could be re-checked against real code in one go.
3. **The teammate's Grover notebook (2b)** at more qubits, for the "harvest now, decrypt later" slide.

**Where to get a GPU:** not on this Mac (no NVIDIA GPU). Options:
- **qBraid Lab GPU instances:** our sponsor. Check the compute profiles and credits first.
- **A cloud GPU.**

**Recommendation:** item 2 is the one that fits the story. Only attempt it if a GPU instance is up early tonight.

### 6. Guppy (Quantinuum)
**What it is:**
- **Guppy:** Quantinuum's Python-embedded language for their next-generation stack, released August 2025.
- **Selene:** its open-source emulator, which reproduces Helios-style measurement-dependent control flow.
- **Nexus:** Quantinuum's cloud platform.

**What we did:** BB84 written in Guppy, with Eve really measuring the photon and every coin flip happening inside the emulator.
**Further options:**
- **Selene's noise models:** a hardware-like error rate for the fiber's endpoints.
- **Nexus:** submitting to Helios, which needs access we do not have.

### 7. Next.js + Vercel
**What it is:** a React framework, plus a host that gives any project a public URL.
**What we can do:** the shortcut is to deploy `grid-twin/` as a static site, which needs no Next.js port.
**Limits:** the live quantum-code buttons need the Python server, which Vercel will not run (CUDA-Q and Selene are too heavy for serverless functions). The public page would run everything except those buttons, exactly like `grid_twin.html`.
**Needs:** your Vercel account; we would not create one.

### 8. Vector search / GraphQL (AI)
**What it is:**
- **GraphQL:** a typed query layer.
- **Vector search:** finds things by meaning, for plain-language questions.

**What we can do:** an "Ask the grid" box. A cheap version needs no AI: a few fixed question types answered by the graph functions we already have. Examples are relays of a site, sites stranded by a fiber, and fibers in alarm.
**Recommendation:** after the deck, if at all. It is scope creep by the mentors' standard.

### 9. TanStack
**What it is:** TanStack Query, Table, Router and Start, for React apps.
**Recommendation:** not needed. Revisit only if the project becomes a multi-page React product.

## The satellite question (from the mentor recordings)

**The note we keep: the satellite layer will probably be taken out unless we find a quantum application only a satellite can serve.**
- **What the mentors said:** satellites belong on the roadmap. They matter at statewide scale, after first showing whether long fiber with repeaters is too expensive.
- **The useful reference:** China's Beijing–Shanghai backbone.
  - About 2,000 km of fiber with 32 trusted relays, roughly 70 km apart (34 to 89 km).
  - The Micius satellite (about 500 km up) extends it as one more trusted node.
- **What that means for us:** fiber QKD covers our real Chattanooga grid easily. Tennessee's 500 kV backbone has 8 spans over 80 km that would need relays: that is the only place a satellite argument could start.

## Sources

- CUDA-Q simulation backends and tensor-network simulators: https://nvidia.github.io/cuda-quantum/latest/using/backends/sims/tnsims.html, https://nvidia.github.io/cuda-quantum/0.7.1/using/backends/simulators.html
- Quantinuum Guppy and Selene: https://www.quantinuum.com/blog/built-for-all-introducing-our-new-software-stack, https://www.quantinuum.com/blog/guppy-programming-the-next-generation-of-quantum-computers, https://docs.quantinuum.com/product-updates/posts/systems_4_2026/
- EPB and IonQ in Chattanooga: https://fiberbroadband.org/2025/04/25/epb-and-ionq-partner-to-establish-chattanooga-as-the-first-quantum-computing-and-networking-hub-in-the-u-s/, https://www.hpcwire.com/off-the-wire/ionq-launches-quantum-innovation-center-with-epb-in-chattanooga/
- Beijing–Shanghai backbone and Micius: https://arxiv.org/pdf/2212.10820, https://postquantum.com/quantum-networks/china-quantum-networking-qkd/
- OpenInfraMap: https://openinframap.org/#11.68/35.0463/-85.2892/A,B,L,P (link from the mentor folder); data © OpenStreetMap contributors, ODbL
