# server/metrics.py
# Lightweight Prometheus-compatible metrics collector (no external deps)
import time
import threading
from collections import defaultdict
from typing import Dict, Tuple

_lock = threading.Lock()

class MetricsCollector:
    def __init__(self):
        self._requests_total: Dict[str, int] = defaultdict(int)
        self._errors_total: Dict[str, int] = defaultdict(int)
        self._latencies: Dict[str, list[float]] = defaultdict(list)
        self._active_requests: int = 0
        self._start_time: float = time.time()

    def inc_request(self, method: str, path: str):
        with _lock:
            self._requests_total[f"{method} {path}"] += 1

    def inc_error(self, method: str, path: str):
        with _lock:
            self._errors_total[f"{method} {path}"] += 1

    def observe_latency(self, method: str, path: str, seconds: float):
        with _lock:
            key = f"{method} {path}"
            self._latencies[key].append(seconds)
            if len(self._latencies[key]) > 100:
                self._latencies[key] = self._latencies[key][-100:]

    def inc_active(self):
        with _lock:
            self._active_requests += 1

    def dec_active(self):
        with _lock:
            self._active_requests -= 1

    def uptime_seconds(self) -> float:
        return time.time() - self._start_time

    def generate_prometheus(self) -> str:
        with _lock:
            lines: list[str] = []
            lines.append("# HELP stargazer_requests_total Total request count")
            lines.append("# TYPE stargazer_requests_total counter")
            for label, count in sorted(self._requests_total.items()):
                method, path = label.split(" ", 1)
                lines.append(f'stargazer_requests_total{{method="{method}",path="{path}"}} {count}')

            lines.append("# HELP stargazer_errors_total Total error count")
            lines.append("# TYPE stargazer_errors_total counter")
            for label, count in sorted(self._errors_total.items()):
                method, path = label.split(" ", 1)
                lines.append(f'stargazer_errors_total{{method="{method}",path="{path}"}} {count}')

            lines.append("# HELP stargazer_request_latency_seconds Request latency histogram")
            lines.append("# TYPE stargazer_request_latency_seconds histogram")
            for label, lats in sorted(self._latencies.items()):
                method, path = label.split(" ", 1)
                for p, v in [("50", 0.5), ("90", 0.9), ("99", 0.99)]:
                    if lats:
                        sorted_lats = sorted(lats)
                        idx = min(int(len(sorted_lats) * v), len(sorted_lats) - 1)
                        lines.append(
                            f'stargazer_request_latency_seconds{{method="{method}",path="{path}",quantile="{p}"}} {sorted_lats[idx]:.4f}'
                        )

            lines.append("# HELP stargazer_active_requests Active requests")
            lines.append("# TYPE stargazer_active_requests gauge")
            lines.append(f"stargazer_active_requests {self._active_requests}")

            lines.append("# HELP stargazer_uptime_seconds Backend uptime")
            lines.append("# TYPE stargazer_uptime_seconds counter")
            lines.append(f"stargazer_uptime_seconds {self.uptime_seconds():.0f}")

            return "\n".join(lines) + "\n"


metrics = MetricsCollector()
