"""Grid Twin with live quantum frameworks: serves the page and lets it re-run a fiber on Qiskit Aer, NVIDIA CUDA-Q
or Quantinuum Guppy (Selene), so what is on screen can be checked against real quantum code in real time.

    python sim/live_server.py            # then open http://localhost:8000
    python sim/live_server.py 8137       # another port

API (JSON):
    GET  /api/engines   -> {"engines": {"qiskit": "Qiskit Aer", ...}}
    POST /api/bb84      {"engine": "cudaq", "line_error": 0.033, "eve_fraction": 0.4, "rounds": 4000}
                        -> {"sifted": ..., "errors": ..., "qber": ..., "expected": ..., "ms": ..., ...}

Without this server (plain `python -m http.server`), the page works the same and simply hides the
framework buttons. The server only listens on 127.0.0.1.
"""

import functools
import http.server
import json
import pathlib
import sys
import threading
import traceback

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import engines  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAX_ROUNDS = 20000
_lock = threading.Lock()  # the frameworks are not all thread-safe; run one job at a time


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/engines":
            return self._json(200, {"engines": engines.available()})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/bb84":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(min(length, 10000)) or b"{}")
            engine = str(req.get("engine", ""))
            if engine not in engines.available():
                return self._json(400, {"error": f"engine not available: {engine}"})
            p = float(req.get("line_error", 0))
            f = float(req.get("eve_fraction", 0))
            rounds = int(req.get("rounds", 4000))
            if not (0 <= p <= 0.5 and 0 <= f <= 1 and 1 <= rounds <= MAX_ROUNDS):
                return self._json(400, {"error": "out of range: 0<=line_error<=0.5, 0<=eve_fraction<=1, 1<=rounds<=20000"})
            seed = int(req.get("seed", 0)) or int.from_bytes(__import__("os").urandom(4), "little")
            with _lock:
                result = engines.run(engine, p, f, rounds, seed)
            return self._json(200, result)
        except Exception as exc:  # report, do not crash the server
            traceback.print_exc()
            return self._json(500, {"error": f"{type(exc).__name__}: {exc}"})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print("frameworks available:", ", ".join(engines.available().values()) or "none")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(ROOT)))
    print(f"Grid Twin live: http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
