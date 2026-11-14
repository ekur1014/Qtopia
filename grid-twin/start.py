"""Start Grid Twin with one command and open it in the browser.

    python3 grid-twin/start.py          # from the repo root (or `python3 start.py` inside grid-twin/)

If Qiskit, CUDA-Q or Guppy are installed, the live bridge starts too and fibers can be re-run as real
quantum code from the page. Otherwise it serves the page alone, which does everything else.
No server at all: open grid_twin.html (the single-file copy at the top of the repo) with a double-click.
"""

import functools
import http.server
import pathlib
import socket
import sys
import threading
import webbrowser

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent  # serve the whole project: home page, map, lab, deck, and the grid under /grid-twin/


def free_port(preferred=8000):
    for port in (preferred, 0):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return s.getsockname()[1]
            except OSError:
                continue
    raise RuntimeError("no free port")


def main():
    port = free_port(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
    url = f"http://localhost:{port}/grid-twin/"
    try:
        sys.path.insert(0, str(HERE / "sim"))
        import live_server  # needs numpy; the quantum frameworks themselves are optional

        handler = functools.partial(live_server.Handler, directory=str(ROOT))
        mode = "with live quantum frameworks: " + (", ".join(live_server.engines.available().values()) or "none installed")
    except Exception:  # missing packages: serve the page on its own
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        mode = "page only (install numpy and qiskit for the live quantum-code buttons)"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Grid Twin: {url}  ({mode})\nPress Ctrl+C to stop.")
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
