import json
import logging
import threading
import sqlite3
import os
import time
import re as _re

log = logging.getLogger("apvend.aos")

try:
    import websocket as _ws_mod
except ImportError:
    _ws_mod = None

_WS_HINT = (
    "AOS 자동충전은 websocket-client 패키지가 필요합니다. "
    "현재는 다른 'websocket' 패키지가 설치되어 WebSocketApp 을 찾을 수 없습니다. "
    "서버를 끈 뒤 실행하세요: pip uninstall -y websocket websocket-client && pip install websocket-client"
)


def _websocket_app():
    if _ws_mod is None or not hasattr(_ws_mod, "WebSocketApp"):
        return None
    return _ws_mod.WebSocketApp


class _Skip(Exception):
    pass

CWDIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(CWDIR, "database")

_lock = threading.Lock()
_listeners = {}


def _store_db_path(slug: str) -> str:
    return os.path.join(DB_DIR, f"store_{slug}.db")


def _nowstr():
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def norm_name(s: str) -> str:
    return " ".join((s or "").split())


def _send_webhook(url: str, text: str):
    try:
        from webhooks import send_webhook
        send_webhook(url, text, title="계좌충전 자동승인")
    except Exception:
        log.exception("aos webhook send failed")


def _parse_push(push: dict):
    raw_body = str(push.get("body", ""))
    body = raw_body.replace("\n", " ")
    title = str(push.get("title", ""))
    pkg = str(push.get("package_name", ""))
    app_name = str(push.get("application_name", ""))
    msg = body.replace("원", "").replace(",", "").split(" ")
    name, count = "", 0

    try:
        if pkg == "com.IBK.SmartPush.app":
            sp = body.split(" ")
            name = sp[2]
            v = sp[1].replace("원", "").replace(",", "")
            if v.isdigit():
                count = int(v)

        elif pkg == "com.kbstar.kbbank":
            v = title.split(" ")[1].replace(",", "").replace("원", "")
            if v.isdigit():
                count = int(v)
            name = body.split(" ")[4]

        elif app_name == "NH올원뱅크":
            si = raw_body.find("입금")
            if si >= 0:
                si = si + 2
                ei = raw_body.find("원", si)
                amt = raw_body[si:ei].strip().replace(",", "")
                if amt.isdigit():
                    count = int(amt)
            last = raw_body.split("\n")[-1]
            parts = last.split()
            if len(parts) >= 2:
                name = parts[-2]
            elif parts:
                name = parts[0]

        elif pkg in ("com.nh.mobilenoti", "nh.smart.banking", "nh.smart.nhcok"):
            if len(msg) >= 6:
                name = msg[5]
                v = msg[1].replace("입금", "").replace("원", "").replace(",", "")
                if v.isdigit():
                    count = int(v)

        elif pkg == "com.wooribank.smart.npib":
            sp = body.split(" ")
            if len(sp) >= 6:
                name = sp[1]
                v = sp[5].replace("원", "").replace(",", "")
                if v.isdigit():
                    count = int(v)

        elif pkg == "com.kakaobank.channel":
            parts = body.split(" ")
            if parts:
                name = parts[0]
            tparts = title.split(" ")
            if len(tparts) >= 2:
                v = tparts[1].replace(",", "").replace("원", "")
                if v.isdigit():
                    count = int(v)

        elif pkg == "com.kebhana.hanapush":
            parts = body.split(" ")
            if parts:
                name = parts[0]
            rv = list(reversed(parts))
            if len(rv) >= 6:
                v = rv[5].replace("원", "").replace(",", "")
                if v.isdigit():
                    count = int(v)

        elif pkg == "com.kbstar.starpush":
            parts = body.split(" ")
            if len(parts) >= 6 and parts[5].replace(",", "").isdigit():
                name = parts[3]
                count = int(parts[5].replace(",", ""))

        elif pkg == "com.kbankwith.smartbank":
            parts = body.split(" ")
            if len(parts) >= 3:
                v = parts[1].replace(",", "").replace("원", "")
                if v.isdigit():
                    name = parts[2]
                    count = int(v)

        elif pkg == "com.shinhan.sbanking":
            parts = body.split(" ")
            if len(parts) >= 2:
                v = parts[0].replace(",", "").replace("원", "")
                if v.isdigit():
                    name = parts[1]
                    count = int(v)

        elif pkg == "viva.republica.toss":
            cand = _re.findall(r"(\d+)", body.replace(",", ""))
            if cand:
                count = int(cand[0])
            if "님" in title:
                name = title.split("님")[0]
            elif msg:
                name = msg[0]

        elif pkg == "com.smg.mgnoti":
            parts = body.split(" ")
            if len(parts) >= 2:
                v = parts[1].replace(",", "").replace("원", "")
                if v.isdigit() and parts:
                    name = str(parts[-1])
                    count = int(v)

        elif pkg == "com.kbstar.reboot":
            parts = body.split(" ")
            if len(parts) > 1:
                raw = str(parts[1].replace(",", ""))[:-2]
                if raw.isdigit():
                    name = str(parts[0])[:-2]
                    count = int(raw)
    except Exception:
        log.exception("aos parse failed")
        return "", 0

    return norm_name(name), int(count or 0)


def _approve_match(slug: str, matched_name: str, amount: int):
    path = _store_db_path(slug)
    if not os.path.isfile(path):
        return None
    want_name = norm_name(matched_name)
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.isolation_level = "IMMEDIATE"
    webhook = None
    uid = None
    try:
        with con:
            rows = con.execute("SELECT * FROM bankwait ORDER BY day ASC;").fetchall()
            row = None
            for r in rows:
                if norm_name(r["name"]) == want_name and int(r["amount"]) == int(amount):
                    row = r
                    break
            if not row:
                raise _Skip()
            uid = row["id"]
            con.execute("UPDATE users SET money = money + ? WHERE id=?;",
                        (amount, uid))
            info = con.execute("SELECT * FROM info;").fetchone()
            try:
                clog = json.loads(info["chargelog"] or "[]")
            except Exception:
                clog = []
            clog.append([_nowstr(), uid, matched_name, "계좌충전 자동승인(AOS)", str(amount)])
            con.execute("UPDATE info SET chargelog=?;",
                        (json.dumps(clog, ensure_ascii=False),))
            cur = con.execute("DELETE FROM bankwait WHERE id=?;", (uid,))
            if cur.rowcount != 1:
                raise _Skip()
            webhook = info["adminlogwebhk"]
    except _Skip:
        return None
    except Exception:
        log.exception("aos approve failed slug=%s", slug)
        return None
    finally:
        con.close()
    return webhook, uid, matched_name, amount


def _approve(slug: str, uid: str, matched_name: str, amount: int):
    """Compat wrapper: match specific uid + amount."""
    path = _store_db_path(slug)
    if not os.path.isfile(path):
        return None
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.isolation_level = "IMMEDIATE"
    try:
        with con:
            row = con.execute("SELECT * FROM bankwait WHERE id=?;", (uid,)).fetchone()
            if not row:
                raise _Skip()
            if int(row["amount"]) != int(amount):
                raise _Skip()
            con.execute("UPDATE users SET money = money + ? WHERE id=?;",
                        (amount, uid))
            info = con.execute("SELECT * FROM info;").fetchone()
            try:
                clog = json.loads(info["chargelog"] or "[]")
            except Exception:
                clog = []
            clog.append([_nowstr(), uid, matched_name, "계좌충전 자동승인(AOS)", str(amount)])
            con.execute("UPDATE info SET chargelog=?;",
                        (json.dumps(clog, ensure_ascii=False),))
            cur = con.execute("DELETE FROM bankwait WHERE id=?;", (uid,))
            if cur.rowcount != 1:
                raise _Skip()
            return info["adminlogwebhk"]
    except _Skip:
        return None
    except Exception:
        log.exception("aos approve failed slug=%s uid=%s", slug, uid)
        return None
    finally:
        con.close()


def ensure_listener(slug: str, bankpin: str) -> bool:
    pin = (bankpin or "").strip()
    if not pin or len(pin) < 10:
        return False
    if _websocket_app() is None:
        log.error(_WS_HINT)
        return False

    with _lock:
        st = _listeners.get(slug)
        if st and st.get("token") == pin and st.get("thread") and st["thread"].is_alive():
            return True
        if st:
            st["stop"].set()
            ws = st.get("ws")
            if ws:
                try:
                    ws.close()
                except Exception:
                    pass
        stop = threading.Event()
        state = {"token": pin, "stop": stop, "thread": None, "ws": None}
        t = threading.Thread(target=_run_forever, args=(slug, pin, state), daemon=True)
        state["thread"] = t
        _listeners[slug] = state
        t.start()
        return True


def start_listener(slug: str, bankpin: str, uid: str = "", expected_name: str = "",
                   expected_amount: int = 0, timeout_sec: int = 180):
    return ensure_listener(slug, bankpin)


def _run_forever(slug: str, bankpin: str, state: dict):
    WsApp = _websocket_app()
    if WsApp is None:
        log.error(_WS_HINT)
        return
    backoff = 2
    while not state["stop"].is_set():
        def on_message(ws, message):
            if state["stop"].is_set():
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
                name, count = _parse_push(push)
                if not name or not count:
                    return
                result = _approve_match(slug, name, int(count))
                if not result:
                    return
                webhook, uid, matched, amount = result
                _send_webhook(
                    webhook,
                    f"[{slug}][계좌충전자동승인] {uid} +{amount}원 ({matched})"
                )
            except Exception:
                log.exception("aos on_message slug=%s", slug)

        def on_error(ws, error):
            log.warning("aos ws error slug=%s err=%s", slug, error)

        def on_close(ws, *args):
            log.info("aos ws closed slug=%s", slug)

        def on_open(ws):
            log.info("aos ws open slug=%s", slug)

        try:
            ws = WsApp(
                "wss://stream.pushbullet.com/websocket/" + bankpin,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
                on_open=on_open,
            )
            state["ws"] = ws
            ws.run_forever()
        except Exception:
            log.exception("aos ws connect failed slug=%s", slug)
            if _websocket_app() is None:
                break
        if state["stop"].is_set():
            break
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)
