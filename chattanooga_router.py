"""
Chattanooga route search: QKD key routing on the real EPB / TVA grid.

Credit: this is a port of Asheb's `dual_ring_router.py` onto the real
Chattanooga graph (`grid-twin/data/networks/chattanooga.json`). From his router
it keeps:
  * an adjustable QBER cutoff, default 11% (the Shor-Preskill limit for BB84);
  * the blocked-link rule: a QKD fiber whose measured QBER is AT or above the
    cutoff is treated as tapped and cannot carry a quantum key;
  * his link cost  km * (1 + 20 * QBER)  (distance with a noise penalty);
  * the ML-KEM (NIST FIPS 203) post-quantum fallback when no quantum path is left.
His ring topology and satellite tier are gone: Chattanooga has neither.

The one design change: FEWEST TRUSTED SITES FIRST.
There are no quantum repeaters, so every intermediate site on a QKD key path
is a trusted relay: it measures the key, then re-encrypts it for the next
fiber. An insider at that site could read the key before re-encryption. So a
route is ranked first by the NUMBER OF INTERMEDIATE SITES (hops), and only
ties are broken by Asheb's cost. This is Dijkstra on the pair (hops, cost),
compared lexicographically. An exact remaining tie is broken by visiting order,
with node ids compared as strings (practically never matters).

Tiers (same order as Asheb's fallback hierarchy):
  1. "qkd":      QKD fibers only, in service, QBER < cutoff. The key is relayed
                 through trusted sites that CAN read it (relays_can_read_key=True).
  2. "pqc":      every fiber still in service (any kind, any QBER). Keys are
                 agreed end to end with ML-KEM, so intermediate sites only forward
                 ciphertext (relays_can_read_key=False).
  3. "islanded": no physical path at all. The site keeps power on local
                 protection and a crew is dispatched.

Details the JavaScript port (grid-twin/src/route.js) must match:
  * km is rounded like JS Math.round(km * 10) / 10;
  * `blocked` is sorted as plain strings (JS default sort: "L145" < "L35");
  * Yen's candidates break exact (hops, km) ties by the link-id sequence as strings.
The JS tests read grid-twin/tests/fixtures/route_cases.json, built from
`fixture_cases()` here plus Aer statevector Grover probabilities by
`python check_grover.py --write-fixture` (needs Qiskit; this file does not).

Standard library only.

    python chattanooga_router.py
"""

import heapq
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NETWORK_PATH = os.path.join(HERE, "grid-twin", "data", "networks", "chattanooga.json")

DEFAULT_CUTOFF = 0.11   # Shor-Preskill limit
QBER_WEIGHT = 20.0      # Asheb's noise penalty: cost = km * (1 + 20 * QBER)
TAP_QBER = 0.268        # Asheb's intercept-resend tap: 1.8% line noise + 25%


def load_network(path=NETWORK_PATH):
    with open(path) as f:
        return json.load(f)


def js_round1(x):
    """Round to 0.1 the way JavaScript's Math.round(x * 10) / 10 does."""
    return math.floor(x * 10 + 0.5) / 10


def label(net, node_id):
    """Readable site name: the short name if the site has one, else its id."""
    for n in net["nodes"]:
        if n["id"] == node_id:
            return n.get("short") or node_id
    return node_id


def _adjacency(net, usable):
    """node id -> list of (link, neighbour id), in the JSON's link order."""
    adj = {n["id"]: [] for n in net["nodes"]}
    for link in net["links"]:
        if usable(link):
            adj[link["a"]].append((link, link["b"]))
            adj[link["b"]].append((link, link["a"]))
    return adj


def _dijkstra(net, start, end, usable, weight, banned_nodes=(), banned_links=()):
    """Lexicographic Dijkstra. weight(link) returns a tuple that is summed
    element-wise along the path. Returns (key, nodes, link ids) or None.
    Ties: heap order on (key, node id as string), first strict improvement wins."""
    adj = _adjacency(net, lambda l: usable(l) and l["id"] not in banned_links)
    if start not in adj or end not in adj or start in banned_nodes:
        return None
    zero = tuple(0 for _ in weight(net["links"][0]))
    best = {start: zero}
    prev = {start: None}
    done = set()
    heap = [(zero, str(start), start)]
    while heap:
        key, _, u = heapq.heappop(heap)
        if u in done:
            continue
        done.add(u)
        if u == end:
            nodes, links, step = [], [], end
            while step is not None:
                nodes.append(step)
                if prev[step] is not None:
                    links.append(prev[step][1])
                    step = prev[step][0]
                else:
                    step = None
            return key, nodes[::-1], links[::-1]
        for link, v in adj[u]:
            if v in done or v in banned_nodes:
                continue
            nk = tuple(a + b for a, b in zip(key, weight(link)))
            if v not in best or nk < best[v]:
                best[v] = nk
                prev[v] = (u, link["id"])
                heapq.heappush(heap, (nk, str(v), v))
    return None


def find_route(net, start, end, cutoff=DEFAULT_CUTOFF, qber=None, out_of_service=()):
    """Best key route from start to end. qber: {link id: measured QBER}, missing = 0.0.
    out_of_service: link ids that are cut or quarantined."""
    qber = qber or {}
    oos = set(out_of_service)
    q = lambda l: qber.get(l["id"], 0.0)
    by_id = {l["id"]: l for l in net["links"]}
    blocked = sorted(l["id"] for l in net["links"] if l["kind"] == "qkd" and q(l) >= cutoff)

    tiers = [
        ("qkd", lambda l: l["kind"] == "qkd" and l["id"] not in oos and q(l) < cutoff),
        ("pqc", lambda l: l["id"] not in oos),
    ]
    objective = lambda l: (1, l["km"] * (1 + QBER_WEIGHT * q(l)))
    by_km = lambda l: (l["km"],)

    for mode, usable in tiers:
        found = _dijkstra(net, start, end, usable, objective)
        if found is None:
            continue
        _, nodes, links = found
        _, km_nodes, km_links = _dijkstra(net, start, end, usable, by_km)
        return {
            "ok": True,
            "mode": mode,
            "nodes": nodes,
            "links": links,
            "km": js_round1(sum(by_id[i]["km"] for i in links)),
            "max_qber": max((qber.get(i, 0.0) for i in links), default=0.0),
            "relays": nodes[1:-1],
            "relays_can_read_key": mode == "qkd",
            "blocked": blocked,
            "shortest_km_route": {
                "nodes": km_nodes,
                "links": km_links,
                "km": js_round1(sum(by_id[i]["km"] for i in km_links)),
                "intermediate_sites": len(km_nodes) - 2,
            },
        }
    return {
        "ok": False, "mode": "islanded", "nodes": [], "links": [], "km": 0.0,
        "max_qber": 0.0, "relays": [], "relays_can_read_key": False,
        "blocked": blocked, "shortest_km_route": None,
    }


def candidate_routes(net, start, end, k=8, out_of_service=()):
    """Yen's k shortest simple paths over every in-service QKD fiber, ANY QBER
    (QBER decides which are clean: that is Grover's oracle). Ranked by
    (hops, km) lexicographically; exact ties by the link-id sequence as strings.
    Returns up to k dicts {nodes, links, km, hops}."""
    oos = set(out_of_service)
    usable = lambda l: l["kind"] == "qkd" and l["id"] not in oos
    weight = lambda l: (1, l["km"])
    by_id = {l["id"]: l for l in net["links"]}

    def rank(nodes, links):
        return (len(links), sum(by_id[i]["km"] for i in links), tuple(str(i) for i in links))

    first = _dijkstra(net, start, end, usable, weight)
    if first is None:
        return []
    A = [(first[1], first[2])]
    B = []          # heap of (rank, nodes, links)
    seen = {tuple(first[2])}
    while len(A) < k:
        last_nodes, last_links = A[-1]
        for i in range(len(last_nodes) - 1):
            spur = last_nodes[i]
            root_nodes, root_links = last_nodes[: i + 1], last_links[:i]
            banned_links = {p_links[i] for p_nodes, p_links in A
                            if len(p_links) > i and p_links[:i] == root_links}
            found = _dijkstra(net, spur, end, usable, weight,
                              banned_nodes=set(root_nodes[:-1]), banned_links=banned_links)
            if found is None:
                continue
            nodes = root_nodes[:-1] + found[1]
            links = root_links + found[2]
            if tuple(links) not in seen:
                seen.add(tuple(links))
                heapq.heappush(B, (rank(nodes, links), nodes, links))
        if not B:
            break
        _, nodes, links = heapq.heappop(B)
        A.append((nodes, links))
    return [{"nodes": n, "links": l, "hops": len(l),
             "km": js_round1(sum(by_id[i]["km"] for i in l))} for n, l in A]


def grover_iterations(N, M):
    """Grover iterations for M marked items among N: the optimal count
    r = floor(pi / (4 * asin(sqrt(M / N)))). M = 0 uses the M = 1 count (the
    output then stays uniform). The textbook round(pi/4 * sqrt(N/M)) overshoots
    when more than half the items are marked (N = 8, M = 7: 1 iteration, 22%).
    The 1e-9 guards M = N/2, where the quotient is exactly 1 but evaluates to
    0.9999999999999999 in both Python and JavaScript doubles.
    N = 8: M=0 -> 2, M=1 -> 2, M=2..4 -> 1, M=5..8 -> 0."""
    theta = math.asin(math.sqrt(max(M, 1) / N))
    return int(math.floor(math.pi / (4 * theta) + 1e-9))


def grover_success(N, M, r):
    """Exact chance that one measurement after r iterations is a marked item."""
    return math.sin((2 * r + 1) * math.asin(math.sqrt(M / N))) ** 2


def is_clean(net, route, cutoff=DEFAULT_CUTOFF, qber=None, out_of_service=()):
    """Every link on the route is QKD, in service, and under the cutoff."""
    qber = qber or {}
    oos = set(out_of_service)
    by_id = {l["id"]: l for l in net["links"]}
    links = route["links"] if isinstance(route, dict) else route
    return all(by_id[i]["kind"] == "qkd" and i not in oos and qber.get(i, 0.0) < cutoff
               for i in links)


# --- The demo: Asheb's four tests on real Chattanooga sites, plus islanding ---

START, END = "T3", "T20"   # Bradley (TVA 500 kV) -> Chickamauga control center


def _describe(net, r):
    names = " -> ".join(label(net, n) for n in r["nodes"]) or "(none)"
    out = [f"  mode: {r['mode']}" + ("" if r["ok"] else "  (no physical path)")]
    if r["ok"]:
        out.append(f"  route: {names}")
        out.append(f"  links: {', '.join(r['links'])} | {r['km']} km | highest QBER {r['max_qber']:.1%}")
        who = "can read the key (trusted QKD relays)" if r["relays_can_read_key"] \
            else "forward ML-KEM ciphertext only (cannot read the key)"
        out.append(f"  intermediate sites: {len(r['relays'])} "
                   f"[{', '.join(label(net, n) for n in r['relays'])}], {who}")
    if r["blocked"]:
        out.append(f"  QKD links blocked by the cutoff: {', '.join(r['blocked'])}")
    return "\n".join(out)


def demo_cases(net):
    """The five scenarios, as (name, start, end, cutoff, qber, out_of_service)."""
    base = find_route(net, START, END)
    tapped = base["links"][0]   # the first fiber out of the start site
    # Test 3: tap every QKD fiber touching the start, so no clean QKD route exists.
    start_qkd = [l["id"] for l in net["links"]
                 if l["kind"] == "qkd" and START in (l["a"], l["b"])]
    start_all = [l["id"] for l in net["links"] if START in (l["a"], l["b"])]
    noisy = base["links"][1]    # a fiber on the baseline route, measured at 8.5%
    return [
        ("1 clean baseline", START, END, 0.11, {}, []),
        (f"2 tap {tapped} at 26.8%", START, END, 0.11, {tapped: TAP_QBER}, []),
        ("3 every QKD fiber at the start tapped -> ML-KEM", START, END, 0.11,
         {i: TAP_QBER for i in start_qkd}, []),
        (f"4 strict 7% cutoff, {noisy} at 8.5%", START, END, 0.07, {noisy: 0.085}, []),
        (f"4b control: 11% cutoff, {noisy} at 8.5%", START, END, 0.11, {noisy: 0.085}, []),
        ("5 every link at the start out of service -> islanded", START, END, 0.11, {}, start_all),
    ]


# Grover candidates pair (3b notebook). Bradley -> Chickamauga is a poor Grover
# example: most single taps leave M = 4 or 6 of its 8 candidates clean, where
# Grover is no better than guessing (50%; 75% at 0 iterations). Falling
# Water -> Oglethorpe with L14 (T24 - Sequoyah Nuclear, on its best route) tapped
# leaves M = 3 of 8 clean: one Grover iteration, 84% chance of a clean pick.
GROVER_START, GROVER_END, GROVER_TAP = "T22", "T4", "L14"


def fixture_cases(net):
    """Route cases and Yen candidates for grid-twin/tests/fixtures/route_cases.json."""
    cases = []
    for name, s, e, cutoff, qber, oos in demo_cases(net):
        r = find_route(net, s, e, cutoff=cutoff, qber=qber, out_of_service=oos)
        cases.append({
            "name": name, "start": s, "end": e, "cutoff": cutoff,
            "qber": qber, "out_of_service": oos,
            "expect": {k: r[k] for k in ("mode", "nodes", "links", "relays")},
            "detail": {k: r[k] for k in ("ok", "km", "max_qber", "relays_can_read_key",
                                         "blocked", "shortest_km_route")},
        })
    cands = candidate_routes(net, GROVER_START, GROVER_END, k=8)
    tap = {GROVER_TAP: TAP_QBER}
    return {
        "cases": cases,
        "candidates": {
            "start": GROVER_START, "end": GROVER_END, "k": 8,
            "routes": [c["links"] for c in cands],
            "example_qber": tap,
            "example_clean": [i for i, c in enumerate(cands) if is_clean(net, c, qber=tap)],
        },
    }


if __name__ == "__main__":
    net = load_network()
    print("=" * 72)
    print(f"CHATTANOOGA ROUTE SEARCH: {label(net, START)} ({START}) -> "
          f"{label(net, END)} ({END}, control center)")
    print("Fewest intermediate (trusted) sites first, then km x (1 + 20 x QBER)")
    print("=" * 72)
    for name, s, e, cutoff, qber, oos in demo_cases(net):
        r = find_route(net, s, e, cutoff=cutoff, qber=qber, out_of_service=oos)
        print(f"\n[TEST {name}] cutoff {cutoff:.0%}")
        print(_describe(net, r))
        if name.startswith("1 "):
            sk = r["shortest_km_route"]
            print(f"  shortest by distance: {' -> '.join(label(net, n) for n in sk['nodes'])} "
                  f"({sk['km']} km, {sk['intermediate_sites']} intermediate sites)")
            print(f"  fewest sites:         {len(r['relays'])} intermediate sites, {r['km']} km")
