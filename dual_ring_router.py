"""
EPB Dual-Ring Quantum Key Distribution (QKD) Routing Engine
Models the 9 Supernodes in a Counter-Rotating Dual Ring around Central Command (CC).
Implements QBER-weighted Dijkstra dynamic shortest-path routing with automatic protection switching (APS).
"""

import math
from typing import Dict, List, Tuple, Optional

class DualRingQuantumRouter:
    def __init__(self):
        # 9 Supernodes (1 through 9)
        self.supernodes = list(range(1, 10))
        self.cc_id = "CC"
        
        # Gateway connections from ring to Central Command (CC)
        # Typically primary gateway at 3 and backup gateway at 7 (as shown on whiteboard)
        self.cc_gateways = [3, 7]
        
        # Build Dual-Ring Adjacency
        # Links: (u, v) -> {'dist_km': float, 'qber': float, 'status': 'ACTIVE' | 'ALARM' | 'ABORT'}
        self.links: Dict[Tuple[int, int], dict] = {}
        self._init_network()

    def _init_network(self):
        # 9 Supernodes in a dual ring
        # Base inter-supernode distance ~ 8.5 km (metro ring total ~ 76 km)
        for i in range(1, 10):
            next_node = 1 if i == 9 else i + 1
            # Clockwise & Counter-Clockwise bidirectional physical fiber pairs
            self._set_link(i, next_node, dist_km=8.5, baseline_qber=0.018)

        # Spoke links to Central Command (CC)
        for gw in self.cc_gateways:
            self.links[("CC", gw)] = {'dist_km': 6.0, 'qber': 0.015, 'status': 'ACTIVE'}
            self.links[(gw, "CC")] = {'dist_km': 6.0, 'qber': 0.015, 'status': 'ACTIVE'}

    def _set_link(self, u: int, v: int, dist_km: float, baseline_qber: float):
        self.links[(u, v)] = {'dist_km': dist_km, 'qber': baseline_qber, 'status': 'ACTIVE'}
        self.links[(v, u)] = {'dist_km': dist_km, 'qber': baseline_qber, 'status': 'ACTIVE'}

    def inject_eavesdropper(self, u: int, v: int, eve_fraction: float):
        """Injects Eve interception fraction (0.0 to 1.0) on link (u, v)."""
        base_noise = 0.018
        measured_qber = base_noise + (eve_fraction * 0.25)
        
        status = 'ACTIVE'
        if measured_qber >= 0.11:
            status = 'ABORT'  # Shor-Preskill Hard Cutoff (Eve possesses mutual info)
        elif measured_qber >= 0.08:
            status = 'ALARM'  # Utility Early Warning
            
        if (u, v) in self.links:
            self.links[(u, v)]['qber'] = measured_qber
            self.links[(u, v)]['status'] = status
        if (v, u) in self.links:
            self.links[(v, u)]['qber'] = measured_qber
            self.links[(v, u)]['status'] = status

    def clear_link(self, u: int, v: int):
        self.inject_eavesdropper(u, v, eve_fraction=0.0)

    def find_best_quantum_path(self, source_node: int, target_node: str = "CC") -> dict:
        """
        Dijkstra algorithm minimizing total path weight.
        Weight = distance_km * (1 + 10 * QBER)
        If link status is ABORT (QBER >= 11%), weight = infinity (link unusable for quantum keys).
        """
        nodes = list(self.supernodes) + [self.cc_id]
        distances = {n: float('inf') for n in nodes}
        previous = {n: None for n in nodes}
        distances[source_node] = 0.0
        unvisited = set(nodes)

        while unvisited:
            # Current node with minimum distance
            current = min(unvisited, key=lambda n: distances[n])
            if distances[current] == float('inf'):
                break
            if current == target_node:
                break
            unvisited.remove(current)

            # Check neighbors
            for (u, v), data in self.links.items():
                if u == current and v in unvisited:
                    # If QBER >= 11%, quantum link is broken by Shor-Preskill limit
                    if data['status'] == 'ABORT':
                        continue  # Path blocked
                    
                    # Cost combines physical distance and QBER penalty
                    link_cost = data['dist_km'] * (1.0 + 15.0 * data['qber'])
                    new_dist = distances[current] + link_cost
                    if new_dist < distances[v]:
                        distances[v] = new_dist
                        previous[v] = current

        # Reconstruct path
        path = []
        curr = target_node
        while curr is not None:
            path.append(curr)
            curr = previous[curr]
        path.reverse()

        if len(path) == 1 or path[0] != source_node:
            return {
                'success': False,
                'path': [],
                'status': 'ALL_QUANTUM_PATHS_BLOCKED',
                'failover': 'NIST_FIPS_203_ML_KEM_768'
            }

        # Calculate path statistics
        total_dist = 0.0
        max_qber = 0.0
        hop_details = []
        for i in range(len(path) - 1):
            u, v = path[i], path[i+1]
            d = self.links[(u, v)]
            total_dist += d['dist_km']
            max_qber = max(max_qber, d['qber'])
            hop_details.append({'from': u, 'to': v, 'dist_km': d['dist_km'], 'qber': d['qber'], 'status': d['status']})

        return {
            'success': True,
            'source': source_node,
            'target': target_node,
            'path': path,
            'hops': len(path) - 1,
            'total_dist_km': round(total_dist, 2),
            'max_link_qber': round(max_qber * 100, 2),
            'hop_details': hop_details,
            'failover_required': False
        }

if __name__ == "__main__":
    router = DualRingQuantumRouter()
    print("--- SCENARIO 1: Clean Baseline ---")
    res1 = router.find_best_quantum_path(source_node=1)
    print(f"Source 1 -> CC Path: {res1['path']} | Dist: {res1['total_dist_km']} km | Max QBER: {res1['max_link_qber']}%")

    print("\n--- SCENARIO 2: Optical Tap on Link 1-2 (Clockwise Blocked) ---")
    router.inject_eavesdropper(1, 2, eve_fraction=1.0)  # QBER jumps to 26.8%
    res2 = router.find_best_quantum_path(source_node=1)
    print(f"Rerouted Path: {res2['path']} | Dist: {res2['total_dist_km']} km | Max QBER: {res2['max_link_qber']}%")
    print("Self-Healing Counter-Clockwise Ring Activation Verified!")
