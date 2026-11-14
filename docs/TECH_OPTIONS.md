# Technology options: what each idea would take, and what we did

From the team's notebook page (`Idea/tech-ideas-notebook.jpg`) and Saturday's chat ideas. Status as of Saturday 14 November 2026.

| Idea | Status | What it gives us | Where |
|---|---|---|---|
| Three.js | **Done** | The 3D Grid Twin | `grid-twin/` |
| Make an artifact | **Done** | A shareable private link to Grid Twin (share it from the page's Share menu) | https://claude.ai/artifact/RMHGPbTvUVXPvKpzXgE6pH |
| Visualization linked with real-time code runs | **Done** | Any fiber can be re-run from the page as 4,000 photons of real quantum code, with the result shown beside the live value and the theory | `grid-twin/sim/live_server.py` |
| Run a link on qBraid | **Done** | The page can send a fiber's photons as a real job to qBraid's free IonQ simulator | `grid-twin/sim/engines.py` (`qbraid`) |
| The team's own notebook 1 | **Ready** | The page runs the team's `encode()`/`measure()`; waits for the TODOs to be filled | `grid-twin/sim/engines.py` (`notebook1`) |
| CUDA-Q (NVIDIA) | **Done** | BB84 as a CUDA-Q kernel (CUDA-Q 0.16, CPU simulator, no GPU needed) | `grid-twin/sim/engines.py` |
| Guppy (Quantinuum) | **Done** | BB84 written in Guppy and run on Quantinuum's open-source Selene emulator, coin flips included | `grid-twin/sim/engines.py` |
| Import the network from a data set; more and bigger nodes | **Done** | IEEE 14/30/57/118/300-bus public test grids, selectable in the page | `grid-twin/tools/import_ieee.mjs` |
| Decoy traffic instead of cutting a line | **Done** | Runs automatically as part of the incident response, with an estimate of the tap's strength | `grid-twin/src/main.js`, `DESIGN.md` (Automatic response) |
| Route real traffic with a decision model | **Done** (weighted shortest path) | Real traffic avoids suspicious fibers before they alarm | `DESIGN.md` §10 |
| Next.js + Vercel | Not done; optional | A public URL and a React app structure | see below |
| TanStack | Not needed | Data fetching and tables for a React app | see below |
| Vector search / GraphQL (AI) | Not done; possible stretch | Ask the network questions in plain language | see below |

## The live-code bridge in practice

Run `python sim/live_server.py 8000` (Python with Qiskit, CUDA-Q and Guppy installed) and open the page. In a fiber's inspector, **Run this fiber as real quantum code** sends the fiber's current noise and tap to each framework. Measured on Saturday, L11 at a 40% tap (theory 12.64%): Qiskit Aer 13.52% in 20 ms, CUDA-Q 12.11% in 154 ms, Guppy on Selene 11.15% in 1.3 s, each on about 2,000 sifted bits (±0.7%).

How each framework models the tap, for anyone asked:

- **Qiskit**: a real mid-circuit measurement in Eve's basis.
- **CUDA-Q**: Eve's measurement as a copy into an ancilla qubit nobody reads; Bob sees exactly the same statistics.
- **Guppy**: the most literal version: Eve measures the photon (Guppy's linear types consume it) and sends a fresh one in the state she saw. Even Alice's bits and bases come from measuring qubits inside the emulator.

## Next.js + Vercel

**What it would take**: port the page into a Next.js app (the physics modules are plain JavaScript and move over unchanged), push it to a Vercel project, and point a domain at it. One to two hours, plus a Vercel account (yours; we would not create one).

**What it gives**: a public URL anyone can open without being invited, which an artifact link needs you to share first. The live-code bridge would not move: Vercel cannot run CUDA-Q or Selene, so the framework buttons would still need the local Python server, or a separate host for it.

**Recommendation**: only if the team wants a public URL for the deck. The artifact already gives a shareable link.

## TanStack

TanStack (Query, Table, Router) is for React apps that fetch and tabulate data. Grid Twin has no React and fetches a handful of JSON files once. It would add weight without a feature. Revisit only if the page grows into a multi-view React app.

## Vector search / GraphQL (AI)

**Idea**: let an operator ask the network questions ("which substations depend on S1 as a trusted relay?", "what changed in the last minute?").

**What it would take**: GraphQL would put a typed query layer over the network and the live state (a small schema for sites, fibers, alarms and paths). Vector search would let free-text questions find the right site, fiber or log event. Either needs a server; an AI model would turn questions into queries.

**Recommendation**: a stretch goal after the deck is done. A lighter version that fits the deadline: an "Ask the network" box that answers a few fixed question types (relays of a site, sites stranded by a fiber, fibers in alarm) with the graph functions we already have.

## "jev or laya"

These names did not match a tool we could identify. If they are libraries or models, tell us which; the routing cost function in `src/response.js` is the single place a different decision model would plug in (a learned policy, a linear program, or a QAOA formulation as in UTC's original Problem 2).
