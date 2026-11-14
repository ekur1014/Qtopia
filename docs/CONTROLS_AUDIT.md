# Controls audit (usability)

Date: 2026-11-14. Method: read the code, then drove every page in headless Chrome at 1440×900, 1280×720 (projector) and 375×812 (phone), clicking controls via JS and checking screenshots, focus, console errors and state (`window.gridTwin.state()`).

**Out of scope:** the live grid's 3D camera (drag, pan, rotate, zoom), the dock's camera buttons and the new Move / Rotate tools. Another engineer was changing those during the audit, so the legend, dock and toolbar layout changed between runs.

**No console errors** on any page. The only failed request is `grid-twin/api/engines` (404), which is expected without `start.py`; the engine buttons stay hidden as intended.

Severity: **High** = blocks or misleads a first-time judge · **Medium** = confusing · **Low** = polish. The tables list only problems.

---

## Live grid (grid-twin/index.html)

| Control | Problem | Sev | Concrete fix |
|---|---|---|---|
| **Selecting anything** (click a fiber, **Tap a fiber for me**, an incident card, `?select=` deep link, Find a fiber or site) | The **Selected** inspector is built at y≈1220 inside a panel 812 px tall (at 1440×900), and the panel never scrolls. A judge clicks a fiber and nothing visibly changes in the panel. The same happens on arrival from the map's "Open this fiber in the live grid". | High | Move the `Selected` section to directly under `Try it`, above `Find a route`. As well, on every selection change call `inspector.scrollIntoView({block: "nearest", behavior: "smooth"})` inside the panel. |
| **Space key** / **Pause** | `keydown` on window catches Space everywhere except inputs and selects. If a button has focus (for example after clicking **Eavesdrop** or **Tap a fiber for me**), Space pauses the simulation and swallows the button press. In Simple mode the Pause button is hidden (`q-adv`) and nothing on screen says "paused": the grid just freezes (verified: QBER stops changing, button reads "Resume" but is hidden). | High | Skip the Space shortcut when `e.target.closest("button, a, [role=switch]")`. Show a pill over the 3D view while paused: **"Paused · press Space or click Resume"**, with a **Resume** button, in both modes. Take the Pause button out of `q-adv`. |
| **Incident card** at 1280×720 | The card list is capped at about 210 px tall. The active card is cut mid-sentence after "Rerouted", and the **Recommended** stage and the **Quarantine fiber** button sit in an inner scroll with no scrollbar or cue. On a projector the judge never sees the response finish. At 1440×900 the card's button row also overlapped the legend. | High | In an active card, show only the latest 2 stages plus a link **"Show all 6 steps"**. Keep `.btns` outside the scrolling area, pinned to the bottom of the card. |
| **Show this route** | The result renders at y≈958 on a 900 px window, below the panel's fold. The button itself sits on the bottom edge. Only the button's text change ("Route shown on the map") confirms the click. | Medium | After `route-show`, scroll `[data-route]` into view inside the panel. Rename the pressed state to **"Route shown · scroll for details"**, or put the pill and km line next to the button. |
| **Decoy traffic** (inspector) | On L1, L4, L10, L33 and L39 the click is refused ("T11 would have no other route"). The reason goes only to the Event log, which is Detailed-only, so in Simple mode the button does nothing. | Medium | When `sitesStrandedWithout()` is non-empty, render the button disabled, labelled **"Decoy traffic (not possible: T11 has no other route)"**. Or show the refusal inline under the button for 4 s. |
| **Remove all taps** / **Restore all fibers** | These are the only reset controls. They sit at the bottom of the panel (y≈1550), and each resets only half the demo: taps or quarantines. Decoys, incident cards and the route stay. There is no one-click "start over" between judges. | Medium | Add **"Reset demo"** under **Tap a fiber for me**. It removes taps, restores fibers, ends operator decoys, clears incidents and the route, and resumes. Keep the two specific buttons. |
| **Find a fiber or site** (select) | Hidden in Simple mode, although it is the only way to select without hunting in 3D, and the only keyboard path to a fiber. | Medium | Show it in Simple mode, just under `Selected`, labelled **"Find a fiber or site"**. Reset it to "Choose…" when the selection is cleared (it currently keeps the old value after Esc). |
| **Range sliders** (cutoff, eavesdropper, alarm sensitivity) | `input[type=range] { outline: none }` hides keyboard focus completely. | Medium | Add `input[type=range]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px var(--ok); }` and the `-moz-` equivalent. |
| **Eavesdropper slider** | The note "Applies to new taps, and to the selected fiber's tap" is hard to parse. **Tap a fiber for me** ignores the slider (it always taps 100%). The section sits below the inspector, far from the Eavesdrop tool it configures. | Medium | Label it **"Spy strength for the next tap"** with the note *"Also changes the selected fiber's tap."* Have **Tap a fiber for me** use the slider value, or say "(100%)" on the button. Move the section above `Find a route`. |
| **Eavesdrop tool, clicking a site** | It logs "Taps go on fibers: click a link, not a site" to the Event log, which is Detailed-only. In Simple mode there is no feedback. | Low | Show this in `#hint-text` for 3 s instead of, or as well as, the log. |
| **Inspector buttons** (Place tap, Remove tap, Decoy, Quarantine, Restore) | Each click rebuilds the inspector HTML, so keyboard focus drops to `<body>` (verified). | Low | After the rebuild, refocus the button with the same `data-id` and the toggled `data-action`, or the first button in `.btns`. |
| **Quarantined fiber inspector** | It still shows "Secret key left after privacy amplification 58%" and the frozen chart. | Low | When quarantined, hide `sf`, `sfbar` and the chart. Show "No key: fiber out of service". |
| **QBER chart** | In Simple mode it has no legend or axis label (the legend is `q-adv`), so the dashed lines mean nothing. | Low | Show the 4-item legend in both modes, with "error rate" in place of "QBER". |
| **Resolved incident card** | After **Remove all taps** + **Restore**, the card still says "the tap is still there, so expect a new alarm". | Low | Rebuild the restored stage text from the current `s.eve`, or append "Tap since removed." |
| **Incident cards** (click to select) | The `<article>` is clickable but has no `tabindex` or role, so it is not keyboard reachable. | Low | Put the title in a `<button class="incident__select">Select L6</button>`. |
| **Inspect / Eavesdrop tools** | The active state is shown by fill only, with no `aria-pressed`. | Low | Set `aria-pressed` in `setTool()`. Eavesdrop already turns red, so visually it is fine. |
| **Theme** | Two theme buttons on one screen (top bar moon and dock "Dark"). | Low | Drop the dock's theme button. **T** and the top bar cover it. |
| **Buttons** (`.btn`, incident `.btn`) | 30–34 px and about 26 px tall, under the 32 px target. | Low | `.btn { min-height: 36px }`, incident buttons `min-height: 32px`. |
| **Keyboard shortcut list** | Shown only in Detailed mode, and only while nothing is selected. | Low | Add a one-line strip to the Simple-mode empty inspector: **"Keys: 1 Inspect · 2 Eavesdrop · Space pause · Esc clear"**. |
| **Fiber tooltip** | It uses "QBER" in Simple mode and does not say it is clickable (the map's tooltip does). | Low | Change to "error rate 2.8% (normal 2.7%) · click to inspect". |
| **Screen gate** (< 1024×600) | A dead end on phones: no link out. | Medium | Add **"Open the real map instead"** → `../chattanooga_quantum_map.html` and **"Back to home"**. |

## Real map (chattanooga_quantum_map.html)

| Control | Problem | Sev | Concrete fix |
|---|---|---|---|
| **Open this fiber in the live grid** | It sits below the fold (y≈1212 at 900 px), under the spy slider and fact list. It also drops the spy: a judge who set 60% arrives at a clean fiber, and the inspector is off-screen there too (see the live grid, row 1). | Medium | Move the button directly under the status box, above the slider's fact list. Append `&tap=<0–1>` to the URL and have `main.js` apply it (`gridTwin.tap(id, f)`). Label it **"Open this fiber in the live grid (spy 60%)"** when the spy is set. |
| **Spy slider** + **fiber picker / line click** | The spy value is global: picking another fiber keeps the old spy. Verified: the new fiber opens straight into "No key possible". After a pick from the list, the aside also scrolls so the status is out of view. | Medium | Reset `tap = 0` in `select()` when the fiber changes. Don't scroll the aside on pick, or scroll to the card top. |
| **Substations** (map dots) | They can be clicked but not reached by keyboard, and the list picker covers fibers only. | Low | Add a site option group to the picker, or `keyboard: true` markers. |
| **Find a route in the live grid** | It lands at the top of the live grid; the route section is a scroll away. | Low | Link to `grid-twin/index.html?panel=route` and scroll that section into view on load. |
| **Spy detected** wording | The threshold here is +1.4 points; the live grid uses a 4.5σ test; the 2D monitor shows "alarm 4.8%". The same fiber can be "Spy detected" here and quiet in the grid. | Low | In Simple mode, change the status to **"Spy likely (quick estimate)"**. |

## Photon line (bb84_visualizer.html)

| Control | Problem | Sev | Concrete fix |
|---|---|---|---|
| **Eve taps the fiber** + **Send 200 at once** | The tallies run across Eve off and on. Following the page's own "Try it" (send, then turn on Eve and send 200) gives about **10%** and the verdict "Errors are showing up", not the >11% "throw this key away" (verified: 10.2% mixed, 28.7% after Clear). This misleads on the page's key point. | High | When the Eve switch changes, clear the tallies automatically and set the caption to "Eve is on. Results cleared, so the error rate below is with Eve only." Or keep two columns: **Without Eve / With Eve**. |
| **Send one photon / Keep sending / Send 200 at once** | Below the fold at 1440×900 (y≈1017). The first screen is title plus empty stage, and the caption says "below". | Medium | Shrink the stage to `min(52vh, 460px)` so the buttons fit on the first screen. Or put **Send one photon** and the Eve switch in the stage card's top bar. |
| **Share of photons Eve grabs** (slider) | Enabled while Eve is off, so it moves without any effect. | Medium | Disable it while the switch is off. Or have any move above 0 switch Eve on, with the label "Eve grabs 20%". |
| **Send one photon** during a round | A second press while a round plays is silently ignored. | Low | Set `disabled` and the label "Playing…" until `land()`. |

## Quantum lab (threejs_quantum_grid.html)

| Control | Problem | Sev | Concrete fix |
|---|---|---|---|
| **Open this route in the live grid** (Teleport tab) | It opens `?select=node:T22`: a site inspector, off-screen, with teleportation view off (that layer is Detailed-only). No route is shown, so the label promises something the grid does not show. | High | Rename it to **"Open Falling Water in the live grid"**. Better, add `&teleport=1` and have `main.js` switch the teleport layer on and scroll to the inspector. |
| **Show the code** (Code tab) | It silently flips the whole site to Detailed mode, saved in `localStorage`, so every other page changes too. | Medium | Reveal the code blocks locally (toggle a class on `#tab-engines`) with the label **"Show the code"** / **"Hide the code"**. Leave the global mode alone. |
| **Catch a spy** sliders | Default spy is 40% here, 0% on the map and photon line, and 100% in the live grid. | Low | Start at 0%, or label the default: "Spy reads 40% (try 0%)". |

## 2D monitor (interactive_grid_monitor.html)

| Control | Problem | Sev | Concrete fix |
|---|---|---|---|
| **Tap this fiber (all photons)** + slider | Below the fold at 900 px (y≈925–970), under three cards. | Low | Move the Eavesdropper card above the error-rate gauge. |
| **Fiber list** | The teleportation fibers t1/t2 ("roadmap") are listed in Simple mode. | Low | Mark those options `q-adv`, or suffix them " (roadmap)". |
| **Top bar** | `data-page="monitor"` is not in the nav, so no tab is current and there is no way back except Home or the banner. | Low | Fine for a prototype. The banner's **Open the live grid →** covers it. |

## Home (index.html) and shared top bar (shared/qbar.js)

| Control | Problem | Sev | Concrete fix |
|---|---|---|---|
| **Top bar on phones** (375 px) | The bar is 657 px wide and clipped with no scroll. **Quantum lab**, **Simple / Detailed** and the theme button cannot be reached. | Medium | Below 700 px, hide `.qbar__name`, make `.qbar__nav` `overflow-x: auto`, and move mode and theme into a **"⋯"** menu. Or collapse the nav into a **"Pages"** `<select>`. |
| **Simple / Detailed** | 26 px tall (target 32). Only the home page explains what it changes. | Low | `padding: 8px 12px`. Add `title="Detailed shows formulas, logs and parameter tables"` on Detailed. |
| **Nav links** | 31 px tall. | Low | `padding: 8px 12px`. |
| **WRITEUP.md, README.md, DESIGN.md, MENTOR_NOTES.md links** | They open raw Markdown, served as plain text. | Low | Build HTML copies in `tools/build_site.sh`, or label the links "(Markdown)". |
| **Download the grid twin** | `grid_twin.html` is a build artifact. It will miss today's camera and panel changes until rebuilt. | Low | Re-run `tools/build_standalone.mjs` after the camera work lands. |

## Cross-page naming

| Concept | Words used now | Use everywhere |
|---|---|---|
| The attacker | spy (map, lab), Eve (photon line, monitor), eavesdropper (grid panel), tap (grid buttons) | **spy**, and **tap** for the act ("Place a tap", "Remove tap") |
| How much it reads | "reads" (map, lab), "intercepts" (grid, monitor), "grabs" (photon line) | **"Spy reads N% of photons"** |
| Undo all taps | "Remove all taps" (grid), "Clear all taps" (monitor) | **Remove all taps** |
| Error rate | "error rate", "QBER", "key bits arrive wrong" | **error rate**, with "(QBER)" only in Detailed |
| Show whole network | Map **Recenter**, live grid **Recenter** (H) | Already consistent. Keep it. |
