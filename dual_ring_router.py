"""
EPB Generalized Quantum Mesh & Dual-Ring Router
Supports:
1. Arbitrary Start Node and End Node routing.
2. Dynamic configurable QBER threshold (default 11% Shor-Preskill bound, fully adjustable).
3. Any link with QBER >= threshold is marked INACCESSIBLE (tapped).
4. Multi-path Dijkstra search for optimal lowest-QBER / shortest distance path.
5. Autonomous Fallback Hierarchy when ground paths are severed:
   - Tier 1: Ground Quantum Link (Clockwise or Counter-Clockwise)
   - Tier 2: Free-Space Optics LEO Quantum Satellite Hub (Orbital Teleportation Tie)
   - Tier 3: NIST FIPS 203 (ML-KEM-768) Post-Quantum Cryptographic Tunnel
"""

import math
from typing import Dict, List, Tuple, Optional, Any, Union

class QuantumMeshRouter:
    def __init__(self, default_qber_threshold: float = 0.11):
        # 9 Transmission Supernodes + Central Command (CC) + Orbital Satellite Hub
        self.supernodes = list(range(1, 10))
        self.cc_id = "CC"
        self.satellite_id = "SAT_LEO"
        
        self.qber_threshold = default_qber_threshold
        
        # Gateway connections from ring to Central Command (CC)
        self.cc_gateways = [3, 7]
        
        # Network graph: (u, v) -> {'dist_km': float, 'qber': float, 'type': 'fiber' | 'satellite'}
        self.links: Dict[Tuple[Any, Any], dict] = {}
        self._init_network()

    def _init_network(self):
        self.links.clear()
        # 1. 9 Supernodes in a dual ring (~8.5 km between adjacent supernodes)
        for i in range(1, 10):
            next_node = 1 if i == 9 else i + 1
            self._set_link(i, next_node, dist_km=8.5, baseline_qber=0.018, link_type='fiber')

        # 2. Gateways to Central Command
        for gw in self.cc_gateways:
            self._set_link("CC", gw, dist_km=6.0, baseline_qber=0.015, link_type='fiber')

        # 3. Free-Space Optical Satellite Links (LEO Satellite at 500 km altitude, slant range ~550 km)
        # All supernodes and CC have uplink/downlink optical ground stations (OGS)
        all_ground_nodes = list(self.supernodes) + [self.cc_id]
        for node in all_ground_nodes:
            # Satellite free-space QBER ~ 2.5% (atmospheric turbulence & background solar/lunar noise)
            self._set_link(node, self.satellite_id, dist_km=550.0, baseline_qber=0.025, link_type='satellite')

    def _set_link(self, u: Any, v: Any, dist_km: float, baseline_qber: float, link_type: str):
        self.links[(u, v)] = {'dist_km': dist_km, 'qber': baseline_qber, 'type': link_type, 'tapped': False}
        self.links[(v, u)] = {'dist_km': dist_km, 'qber': baseline_qber, 'type': link_type, 'tapped': False}

    def set_qber_threshold(self, threshold: float):
        """Configure the cutoff threshold (e.g. 0.08 for utility alarm, 0.11 for Shor-Preskill)."""
        self.qber_threshold = max(0.01, min(0.50, threshold))

    def set_link_qber(self, u: Any, v: Any, qber: float):
        """Directly set measured QBER on a link."""
        if (u, v) in self.links:
            self.links[(u, v)]['qber'] = qber
            self.links[(v, u)]['qber'] = qber
            self.links[(u, v)]['tapped'] = (qber >= self.qber_threshold)
            self.links[(v, u)]['tapped'] = (qber >= self.qber_threshold)

    def inject_eavesdropper(self, u: Any, v: Any, eve_intercept_prob: float = 1.0):
        """Simulate an active Eve intercept-resend attack. QBER = base + eve_prob * 25%."""
        base_noise = 0.018 if (u, v) in self.links and self.links[(u, v)]['type'] == 'fiber' else 0.025
        measured_qber = base_noise + (eve_intercept_prob * 0.25)
        self.set_link_qber(u, v, measured_qber)

    def clear_link(self, u: Any, v: Any):
        base_noise = 0.018 if (u, v) in self.links and self.links[(u, v)]['type'] == 'fiber' else 0.025
        self.set_link_qber(u, v, base_noise)

    def clear_all_attacks(self):
        for (u, v), data in self.links.items():
            base_noise = 0.018 if data['type'] == 'fiber' else 0.025
            data['qber'] = base_noise
            data['tapped'] = False

    def find_best_path(self, start_node: Any, end_node: Any, allow_satellite: bool = True) -> dict:
        """
        Finds the optimal path between start_node and end_node.
        Algorithm:
        1. First attempts to find a pure Ground Fiber Path (Dijkstra minimizing distance + QBER).
           Any fiber link with QBER >= self.qber_threshold is treated as INACCESSIBLE (infinite weight).
        2. If all ground paths are blocked, attempts Tier 2: Free-Space LEO Quantum Satellite Hub.
        3. If satellite is unavailable or blocked, fails over to Tier 3: NIST FIPS 203 (ML-KEM-768).
        """
        # --- PHASE 1: Ground-Only Dijkstra Search ---
        ground_nodes = list(self.supernodes) + [self.cc_id]
        if start_node not in ground_nodes or end_node not in ground_nodes:
            return {'success': False, 'error': f"Invalid start ({start_node}) or end ({end_node}) node."}

        ground_path = self._dijkstra(start_node, end_node, exclude_satellite=True)

        if ground_path is not None:
            return self._build_path_summary(ground_path, tier="TIER_1_GROUND_QUANTUM_FIBER")

        # --- PHASE 2: Satellite Free-Space Quantum Teleportation Hub ---
        if allow_satellite:
            sat_link_in = self.links.get((start_node, self.satellite_id))
            sat_link_out = self.links.get((self.satellite_id, end_node))

            # Check if both uplink and downlink are below QBER threshold
            if (sat_link_in and sat_link_in['qber'] < self.qber_threshold and
                sat_link_out and sat_link_out['qber'] < self.qber_threshold):
                
                sat_path = [start_node, self.satellite_id, end_node]
                return self._build_path_summary(
                    sat_path, 
                    tier="TIER_2_LEO_SATELLITE_QUANTUM_LINK",
                    note="All ground optical fiber lines severed or tapped. Entangled photons distributed via Free-Space Satellite Hub."
                )

        # --- PHASE 3: NIST Post-Quantum Cryptography Failover ---
        return {
            'success': False,
            'start_node': start_node,
            'end_node': end_node,
            'path': [],
            'tier': "TIER_3_PQC_FAILOVER",
            'status': "ALL_QUANTUM_PATHS_INACCESSIBLE",
            'qber_threshold_used': self.qber_threshold,
            'failover_protocol': "NIST_FIPS_203_ML_KEM_768_TUNNEL",
            'explanation': f"Every ground path between {start_node} and {end_node} exceeds the {round(self.qber_threshold*100, 1)}% QBER cutoff. Traffic automatically encrypted with ML-KEM-768 lattice cryptography to prevent grid blackout."
        }

    def _dijkstra(self, src: Any, tgt: Any, exclude_satellite: bool = True) -> Optional[List[Any]]:
        nodes = list(self.supernodes) + [self.cc_id]
        if not exclude_satellite:
            nodes.append(self.satellite_id)

        dist = {n: float('inf') for n in nodes}
        prev = {n: None for n in nodes}
        dist[src] = 0.0
        unvisited = set(nodes)

        while unvisited:
            curr = min(unvisited, key=lambda n: dist[n])
            if dist[curr] == float('inf'):
                break
            if curr == tgt:
                break
            unvisited.remove(curr)

            for (u, v), data in self.links.items():
                if u == curr and v in unvisited:
                    if exclude_satellite and data['type'] == 'satellite':
                        continue

                    # If link QBER crosses threshold, link is INACCESSIBLE (blocked)
                    if data['qber'] >= self.qber_threshold:
                        continue

                    # Cost combines physical latency with QBER penalty
                    weight = data['dist_km'] * (1.0 + 20.0 * data['qber'])
                    new_dist = dist[curr] + weight
                    if new_dist < dist[v]:
                        dist[v] = new_dist
                        prev[v] = curr

        # Reconstruct path
        path = []
        step = tgt
        while step is not None:
            path.append(step)
            step = prev[step]
        path.reverse()

        if len(path) <= 1 or path[0] != src:
            return None
        return path

    def _build_path_summary(self, path: List[Any], tier: str, note: str = "") -> dict:
        total_dist = 0.0
        max_qber = 0.0
        hops = []

        for i in range(len(path) - 1):
            u, v = path[i], path[i+1]
            data = self.links[(u, v)]
            total_dist += data['dist_km']
            max_qber = max(max_qber, data['qber'])
            hops.append({
                'from': u,
                'to': v,
                'dist_km': data['dist_km'],
                'qber_pct': round(data['qber'] * 100, 2),
                'type': data['type'],
                'status': 'SECURE' if data['qber'] < 0.08 else ('ALARM' if data['qber'] < self.qber_threshold else 'BLOCKED')
            })

        return {
            'success': True,
            'start_node': path[0],
            'end_node': path[-1],
            'path': path,
            'hop_count': len(path) - 1,
            'tier': tier,
            'total_dist_km': round(total_dist, 2),
            'max_link_qber_pct': round(max_qber * 100, 2),
            'qber_threshold_used_pct': round(self.qber_threshold * 100, 2),
            'note': note,
            'hops': hops
        }


if __name__ == "__main__":
    router = QuantumMeshRouter(default_qber_threshold=0.11)
    
    print("=================================================================")
    print("EPB QUANTUM MESH ROUTER · GENERALIZED MULTI-TIER ENGINE TEST")
    print("=================================================================")

    # Test 1: Arbitrary Start and End (Node 1 -> Node 5)
    print("\n[TEST 1] Clean Baseline: Node 1 -> Node 5")
    res1 = router.find_best_path(start_node=1, end_node=5)
    print(f"Path: {res1['path']} | Tier: {res1['tier']} | Max QBER: {res1['max_link_qber_pct']}% | Dist: {res1['total_dist_km']} km")

    # Test 2: Tap Clockwise Link (1-2) with Threshold = 11%
    print("\n[TEST 2] Tapping Link 1-2 (QBER = 26.8%) -> Auto Counter-Clockwise Reroute")
    router.inject_eavesdropper(1, 2)
    res2 = router.find_best_path(start_node=1, end_node=5)
    print(f"Rerouted Path: {res2['path']} | Tier: {res2['tier']} | Hops: {res2['hop_count']}")

    # Test 3: Partition Ground Network (Cut 1-2 and 1-9) -> Satellite Tier Activation
    print("\n[TEST 3] Severe Partition (Links 1-2 AND 1-9 Cut) -> Satellite Hub Fallback")
    router.inject_eavesdropper(1, 9)
    res3 = router.find_best_path(start_node=1, end_node=5, allow_satellite=True)
    print(f"Satellite Path: {res3['path']} | Tier: {res3['tier']}")
    print(f"Note: {res3['note']}")

    # Test 4: Adjust QBER Threshold Dynamically (e.g., Strict Utility Alarm = 7%)
    print("\n[TEST 4] Dynamic Threshold Adjustment (Strict 7% Alarm)")
    router.clear_all_attacks()
    router.set_link_qber(1, 2, qber=0.085)  # 8.5% noise (would pass 11%, but fails 7%)
    router.set_qber_threshold(0.07)
    res4 = router.find_best_path(start_node=1, end_node=3)
    print(f"Path with 7% threshold: {res4['path']} (Link 1-2 bypassed because 8.5% >= 7.0%)")
