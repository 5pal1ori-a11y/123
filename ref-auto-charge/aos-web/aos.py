import json
import ssl
import time
import threading
import sqlite3
import os

try:
    import websocket
except ImportError:  # optional until AOS auto-charge is used
    websocket = None

from discord_webhook import DiscordWebhook, DiscordEmbed


CWDIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(CWDIR, "database")


def _store_db_path(slug: str) -> str:
    return os.path.join(DB_DIR, f"store_{slug}.db")


def _nowstr():
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _send_webhook(url: str, text: str):
    if not url:
        return
    try:
        wh = DiscordWebhook(url=url, content=text)
        wh.execute()
    except Exception:
        pass


def _parse_push(push: dict):
    body = str(push.get("body", "")).replace("\n", " ")
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
            si = body.find("입금") + 2
            ei = body.find("원", si)
            amt = body[si:ei].strip().replace(",", "")
            if amt.isdigit():
                count = int(amt)
            last = body.split("\n")[-1]
            parts = last.split()
            if len(parts) >= 2:
                name = parts[-2]

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
            import re as _re
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
        pass

    return name.strip(), int(count or 0)


def _approve(slug: str, uid: str, matched_name: str, amount: int):
    path = _store_db_path(slug)
    if not os.path.isfile(path):
        return None
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        with con:
            row = con.execute("SELECT * FROM bankwait WHERE id=?;", (uid,)).fetchone()
            if not row:
                return None
            if int(row["amount"]) != int(amount):
                return None
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
            con.execute("DELETE FROM bankwait WHERE id=?;", (uid,))
            return info["adminlogwebhk"]
    finally:
        con.close()


def start_listener(slug: str, bankpin: str, uid: str, expected_name: str,
                   expected_amount: int, timeout_sec: int = 180):
    if websocket is None:
        return
    if not bankpin or len(bankpin) < 10:
        return

    def _run():
        stop = {"done": False}

        def on_message(ws, message):
            if stop["done"]:
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
                if name != expected_name:
                    return
                if int(count) != int(expected_amount):
                    return
                webhook = _approve(slug, uid, name, int(count))
                if webhook is not None:
                    _send_webhook(
                        webhook,
                        f"[{slug}][계좌충전자동승인] {uid} +{count}원 ({name})"
                    )
                stop["done"] = True
                try:
                    ws.close()
                except Exception:
                    pass
            except Exception:
                pass

        def on_error(ws, error):
            pass

        def on_close(ws, *args):
            pass

        def _timeout():
            time.sleep(timeout_sec)
            stop["done"] = True
            try:
                ws.close()
            except Exception:
                pass

        try:
            ws = websocket.WebSocketApp(
                "wss://stream.pushbullet.com/websocket/" + bankpin,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )
            t = threading.Thread(target=_timeout, daemon=True)
            t.start()
            ws.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE})
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()
