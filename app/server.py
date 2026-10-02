"""Dependency-free local web server for the water heater decision demo."""

from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path

from model.optimize import recommend_configuration
from model.scenario import HouseholdNeeds


INDEX = Path(__file__).with_name("index.html")


class Handler(BaseHTTPRequestHandler):
    def _respond(self, status: int, payload: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self._respond(200, INDEX.read_bytes(), "text/html; charset=utf-8")
        elif self.path == "/api/health":
            self._respond(200, b'{"status":"ok"}', "application/json")
        else:
            self._respond(404, b"Not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        if self.path != "/api/recommend":
            self._respond(404, b"Not found", "text/plain; charset=utf-8")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 10000:
                raise ValueError("Request body must be between 1 and 10,000 bytes")
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            needs = HouseholdNeeds(
                shower_minutes=tuple(float(value) for value in request["shower_minutes"]),
                max_wait_minutes=int(request.get("max_wait_minutes", 15)),
                flow_l_min=float(request.get("flow_l_min", 5)),
                inlet_c=float(request.get("inlet_c", 15)),
                ambient_c=float(request.get("ambient_c", 20)),
                max_volume_l=float(request.get("max_volume_l", 50)),
                tariff_hkd_per_kwh=float(request.get("tariff_hkd_per_kwh", 1.4)),
            )
            result = recommend_configuration(needs)
            payload = json.dumps(asdict(result), ensure_ascii=False, allow_nan=False).encode()
            self._respond(200, payload, "application/json; charset=utf-8")
        except (KeyError, TypeError, ValueError, OverflowError) as exc:
            payload = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
            self._respond(400, payload, "application/json; charset=utf-8")


def main() -> None:
    address = "127.0.0.1", 8765
    server = ThreadingHTTPServer(address, Handler)
    print(f"TankWise is running at http://{address[0]}:{address[1]}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
