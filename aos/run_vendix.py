"""
Vendix Pushbullet AOS bridge.

Polls Vendix for shops that saved a Pushbullet token and keeps a
WebSocket open per shop. Forwards bank pushes to /api/charges/auto.

shops.json formats:

  # Poll mode (recommended) — picks up newly saved tokens automatically
  {
    "origin": "https://vendix.team",
    "bridgeSecret": "<AUTH_SECRET or AOS_BRIDGE_SECRET>",
    "pollSeconds": 15
  }

  # Legacy static list
  [
    { "slug": "myshop", "pushbulletToken": "o.xxx", "origin": "https://vendix.team" }
  ]

Usage:
  py -3 -u run_vendix.py
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

try:
    import websocket as _ws_mod
except ImportError:
    _ws_mod = None

CWDIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, CWDIR)
import aos  # noqa: E402


def _read_dev_vars_secret() -> str:
    """Optional: load AUTH_SECRET / AOS_BRIDGE_SECRET from nearby env files"""
    candidates = [
        os.path.join(CWDIR, ".dev.vars"),
        os.path.join(CWDIR, ".env.local"),
        os.path.join(CWDIR, "..", ".dev.vars"),
        os.path.join(CWDIR, "..", ".env.local"),
        os.path.join(CWDIR, "..", "..", ".dev.vars"),
        os.path.join(CWDIR, "..", "..", ".env.local"),
        r"C:\vendix\.dev.vars",
        r"C:\vendix\.env.local",
    ]
    for path in candidates:
        try:
            if not os.path.isfile(path):
                continue
            with open(path, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
            found_auth = ""
            found_aos = ""
            for line in lines:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key == "AOS_BRIDGE_SECRET" and val:
                    found_aos = val
                elif key == "AUTH_SECRET" and val:
                    found_auth = val
            if found_aos:
                return found_aos
            if found_auth:
                return found_auth
        except Exception:
            continue
    return ""


def _post_vendix(origin: str, slug: str, token: str, push: dict) -> None:
    origins = []
    for o in (
        "https://vendix.team",
        (origin or "").rstrip("/"),
        "https://vendix.tyopal18.workers.dev",
    ):
        o = (o or "").rstrip("/")
        if o and o not in origins:
            origins.append(o)

    body = json.dumps(
        {"push": push, "pushbulletToken": token},
        ensure_ascii=False,
    ).encode("utf-8")
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36 VendixAosBridge/1.0"
        ),
        "x-orel-shop": slug,
        "x-vendix-shop": slug,
        "Authorization": f"Bearer {token}",
    }

    last_err = None
    for base in origins:
        url = base + "/api/charges/auto"
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=25) as res:
                raw = res.read().decode("utf-8", errors="replace")
                print(f"[ok] {slug} via {base} → {res.status} {raw[:220]}")
                return
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            print(f"[http {e.code}] {slug} via {base} {raw[:220]}")
            last_err = e
            if e.code in (403, 429, 503) and ("1010" in raw or "cloudflare" in raw.lower()):
                continue
            if e.code in (400, 401, 404):
                return
        except Exception as e:
            print(f"[err] {slug} via {base} {e}")
            last_err = e
    if last_err:
        print(f"[fail] {slug} all origins failed")


def _run_shop(shop: dict, stop: threading.Event) -> None:
    slug = str(shop.get("slug") or "").strip()
    token = str(shop.get("pushbulletToken") or shop.get("token") or "").strip()
    origin = str(shop.get("origin") or f"https://{slug}.vendix.team").strip()
    if not slug or len(token) < 10:
        print(f"[skip] bad shop config: {shop!r}")
        return
    if _ws_mod is None or not hasattr(_ws_mod, "WebSocketApp"):
        print(aos._WS_HINT if hasattr(aos, "_WS_HINT") else "pip install websocket-client")
        return

    backoff = 2
    while not stop.is_set():
        def on_message(ws, message, _slug=slug, _token=token, _origin=origin):
            if stop.is_set():
                try:
                    ws.close()
                except Exception:
                    pass
                return
            try:
                obj = json.loads(message)
                if obj.get("type") != "push":
                    return
                push = obj.get("push") or {}
                name, count = aos._parse_push(push)
                if not name or not count:
                    return
                print(f"[push] {_slug} {name} {count}원")
                _post_vendix(_origin, _slug, _token, push)
            except Exception as e:
                print(f"[on_message] {_slug} {e}")

        def on_error(ws, error, _slug=slug):
            print(f"[ws error] {_slug} {error}")

        def on_close(ws, *args, _slug=slug):
            print(f"[ws closed] {_slug}")

        def on_open(ws, _slug=slug):
            print(f"[ws open] {_slug}")

        try:
            ws = _ws_mod.WebSocketApp(
                "wss://stream.pushbullet.com/websocket/" + token,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
                on_open=on_open,
            )
            ws.run_forever()
        except Exception as e:
            print(f"[ws connect] {slug} {e}")
        if stop.is_set():
            break
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)


def _fetch_remote_shops(origin: str, bridge_secret: str) -> list[dict]:
    url = origin.rstrip("/") + "/api/charges/auto/bridges"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "User-Agent": "VendixAosBridge/1.0",
            "x-vendix-bridge-secret": bridge_secret,
            "Authorization": f"Bearer {bridge_secret}",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as res:
        data = json.loads(res.read().decode("utf-8", errors="replace"))
    shops = data.get("shops") if isinstance(data, dict) else None
    if not isinstance(shops, list):
        return []
    out = []
    for row in shops:
        if not isinstance(row, dict):
            continue
        slug = str(row.get("slug") or "").strip()
        token = str(row.get("pushbulletToken") or "").strip()
        if not slug or len(token) < 8:
            continue
        out.append(
            {
                "slug": slug,
                "pushbulletToken": token,
                "origin": str(row.get("origin") or origin).strip() or origin,
            }
        )
    return out


class ShopSupervisor:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        # slug -> {token, stop, thread}
        self._running: dict[str, dict] = {}

    def sync(self, shops: list[dict]) -> None:
        desired: dict[str, dict] = {}
        for shop in shops:
            slug = str(shop.get("slug") or "").strip()
            token = str(shop.get("pushbulletToken") or shop.get("token") or "").strip()
            if not slug or len(token) < 10:
                continue
            desired[slug] = shop

        with self._lock:
            # stop removed / token-changed
            for slug, state in list(self._running.items()):
                want = desired.get(slug)
                cur_token = str(state.get("token") or "")
                new_token = str((want or {}).get("pushbulletToken") or (want or {}).get("token") or "")
                if not want or new_token != cur_token:
                    print(f"[sync] stop {slug}" + (" (token changed)" if want else ""))
                    state["stop"].set()
                    del self._running[slug]

            # start new
            for slug, shop in desired.items():
                if slug in self._running:
                    continue
                stop = threading.Event()
                token = str(shop.get("pushbulletToken") or shop.get("token") or "").strip()
                t = threading.Thread(target=_run_shop, args=(shop, stop), daemon=True, name=f"pb-{slug}")
                self._running[slug] = {"token": token, "stop": stop, "thread": t}
                t.start()
                print(f"[sync] start {slug}")

            print(f"[sync] listening {len(self._running)} shop(s): {', '.join(sorted(self._running)) or '(none)'}")

    def stop_all(self) -> None:
        with self._lock:
            for slug, state in list(self._running.items()):
                state["stop"].set()
            self._running.clear()


def _load_config():
    cfg_path = os.path.join(CWDIR, "shops.json")
    if not os.path.isfile(cfg_path):
        print("Create aos/shops.json (see shops.example.json)")
        return None
    with open(cfg_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # Legacy: plain list of shops
    if isinstance(raw, list):
        return {"mode": "static", "shops": raw, "pollSeconds": 0, "origin": "https://vendix.team", "bridgeSecret": ""}

    if not isinstance(raw, dict):
        print("shops.json must be an object or list")
        return None

    origin = str(raw.get("origin") or "https://vendix.team").strip()
    poll = int(raw.get("pollSeconds") or 15)
    secret = str(raw.get("bridgeSecret") or raw.get("secret") or "").strip()
    if not secret:
        secret = _read_dev_vars_secret()
    static_shops = raw.get("shops")
    if not isinstance(static_shops, list):
        static_shops = []

    if secret:
        return {
            "mode": "poll",
            "origin": origin,
            "bridgeSecret": secret,
            "pollSeconds": max(5, poll),
            "shops": static_shops,
        }

    if static_shops:
        return {"mode": "static", "shops": static_shops, "pollSeconds": 0, "origin": origin, "bridgeSecret": ""}

    print("shops.json needs bridgeSecret (or AUTH_SECRET in .dev.vars) for poll mode, or a shops list")
    return None


def main() -> int:
    cfg = _load_config()
    if not cfg:
        return 1

    supervisor = ShopSupervisor()
    stop = threading.Event()

    if cfg["mode"] == "static":
        supervisor.sync(cfg["shops"])
        print(f"Static mode — {len(cfg['shops'])} shop(s). Ctrl+C to stop.")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            stop.set()
            supervisor.stop_all()
            print("stopping…")
        return 0

    origin = cfg["origin"]
    secret = cfg["bridgeSecret"]
    poll = cfg["pollSeconds"]
    print(f"Poll mode → {origin}/api/charges/auto/bridges every {poll}s")

    try:
        while not stop.is_set():
            try:
                remote = _fetch_remote_shops(origin, secret)
                # merge optional local extras
                by_slug = {s["slug"]: s for s in remote}
                for s in cfg.get("shops") or []:
                    if isinstance(s, dict) and s.get("slug"):
                        by_slug[str(s["slug"]).strip()] = s
                supervisor.sync(list(by_slug.values()))
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", errors="replace")
                print(f"[poll http {e.code}] {raw[:200]}")
            except Exception as e:
                print(f"[poll err] {e}")
            time.sleep(poll)
    except KeyboardInterrupt:
        supervisor.stop_all()
        print("stopping…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
