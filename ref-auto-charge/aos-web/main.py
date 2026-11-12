from flask import (
    Flask, Blueprint, render_template, request, session, redirect,
    url_for, abort, g
)
from datetime import timedelta, datetime
from functools import wraps
import sqlite3
import os
import re
import json
import hashlib
import hmac
import secrets
import random
import threading
from discord_webhook import DiscordWebhook, DiscordEmbed

import config
import randomstring
import license as lic
import aos


app = Flask(__name__)
app.secret_key = config.SECRET_KEY
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=config.SESSION_COOKIE_SECURE,
    PERMANENT_SESSION_LIFETIME=timedelta(minutes=config.SESSION_LIFETIME_MINUTES),
    PREFERRED_URL_SCHEME="https" if config.PUBLIC_BASE_URL.startswith("https://") else "http",
)

if config.BEHIND_PROXY:
    try:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
    except Exception:
        pass

CWDIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(CWDIR, "database")
STORES_FILE = os.path.join(DB_DIR, "stores.json")
os.makedirs(DB_DIR, exist_ok=True)

# Windows(CP949) 환경에서도 템플릿 한글이 깨지지 않도록 UTF-8(+BOM)로 로드
from jinja2 import FileSystemLoader
app.jinja_loader = FileSystemLoader(
    os.path.join(CWDIR, "templates"),
    encoding="utf-8-sig",
)


@app.after_request
def _force_utf8(resp):
    ct = (resp.content_type or "").lower()
    if ct.startswith("text/html") and "charset" not in ct:
        resp.headers["Content-Type"] = "text/html; charset=utf-8"
    return resp


@app.context_processor
def inject_site():
    return {
        "SITE_DOMAIN": config.DOMAIN,
        "PUBLIC_BASE_URL": config.PUBLIC_BASE_URL,
    }

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,19}$")


def load_stores():
    if not os.path.isfile(STORES_FILE):
        return {}
    try:
        with open(STORES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_stores(data):
    with open(STORES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def store_db_path(slug):
    return os.path.join(DB_DIR, f"store_{slug}.db")


def nowstr():
    return datetime.now().strftime('%Y-%m-%d %H:%M')


def getip():
    if config.TRUST_CF_IP:
        cf = request.headers.get("CF-Connecting-IP")
        if cf:
            return cf
    return request.remote_addr or ""


def hash_pw(pw: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        (pw + config.PASSWORD_PEPPER).encode(),
        salt.encode(),
        200_000,
    )
    return f"pbkdf2$200000${salt}${dk.hex()}"


def verify_pw(pw: str, stored: str) -> bool:
    try:
        if stored.startswith("pbkdf2$"):
            _, iters, salt, digest = stored.split("$", 3)
            dk = hashlib.pbkdf2_hmac(
                "sha256",
                (pw + config.PASSWORD_PEPPER).encode(),
                salt.encode(),
                int(iters),
            )
            return hmac.compare_digest(dk.hex(), digest)
        legacy = hashlib.sha512((pw + "saltysalt!@#%!@$!").encode()).hexdigest()
        return hmac.compare_digest(legacy, stored)
    except Exception:
        return False


def safe_json_loads(raw, default):
    if raw is None or raw == "":
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def get_db(slug=None):
    s = slug or g.get("slug")
    if not s:
        abort(404)
    con = sqlite3.connect(store_db_path(s))
    con.row_factory = sqlite3.Row
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(info);").fetchall()]
        if cols and "bankpin" not in cols:
            con.execute("ALTER TABLE info ADD COLUMN bankpin TEXT;")
            con.commit()
    except Exception:
        pass
    return con


def init_store_db(slug: str, shop_name: str, admin_id: str, admin_pw: str,
                  bank_enabled: bool = True):
    con = sqlite3.connect(store_db_path(slug))
    con.row_factory = sqlite3.Row
    with con:
        cur = con.cursor()
        cur.executescript("""
        CREATE TABLE IF NOT EXISTS info (
            name TEXT, webhk TEXT,
            buylog TEXT, chargelog TEXT, banned TEXT, expiredate TEXT,
            music TEXT, announcement TEXT, fee INTEGER, bankaddr TEXT,
            bankpw TEXT, type INTEGER, linking TEXT, background TEXT,
            file TEXT, imgannouncement TEXT, buylogwebhkt TEXT,
            adminlogwebhk TEXT, addstock TEXT, channeltok TEXT, bankmax TEXT,
            bankpin TEXT
        );
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY, name TEXT, description TEXT,
            price INTEGER, url TEXT, stock TEXT
        );
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, pw TEXT, ip TEXT, money INTEGER,
            buylog TEXT, isadmin INTEGER, black TEXT, name TEXT,
            tag TEXT, fail TEXT
        );
        CREATE TABLE IF NOT EXISTS bankwait (
            id TEXT PRIMARY KEY, name TEXT, amount INTEGER, day TEXT
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
            ip TEXT PRIMARY KEY, fails INTEGER, locked_until TEXT
        );
        CREATE TABLE IF NOT EXISTS user_login_attempts (
            user_id TEXT PRIMARY KEY, fails INTEGER, locked_until TEXT
        );
        """)
        try:
            cols = [r[1] for r in cur.execute("PRAGMA table_info(info);").fetchall()]
            if cols and "bankpin" not in cols:
                cur.execute("ALTER TABLE info ADD COLUMN bankpin TEXT;")
        except Exception:
            pass
        cur.execute("DELETE FROM info;")
        cur.execute("""INSERT INTO info
            (name, webhk, buylog, chargelog, banned, expiredate,
             music, announcement, fee, bankaddr, bankpw, type,
             linking, background, file, imgannouncement, buylogwebhkt,
             adminlogwebhk, addstock, channeltok, bankmax, bankpin)
            VALUES (?, '', '', '[]', '', '9999-12-31 00:00',
                    '', '공지가 없습니다.', 0, '', '', ?,
                    '', '', '', '', '',
                    '', '', '', '', '')""",
                    (shop_name, 1 if bank_enabled else 0))
        cur.execute(
            "INSERT INTO users VALUES (?, ?, ?, 0, '[]', 1, '', '', '', '0')",
            (admin_id, hash_pw(admin_pw), request.remote_addr or "")
        )
    con.close()


def get_info():
    con = get_db()
    try:
        return con.execute("SELECT * FROM info LIMIT 1;").fetchone()
    finally:
        con.close()


def search_user(user_id: str):
    con = get_db()
    try:
        return con.execute("SELECT * FROM users WHERE id = ?;", (user_id,)).fetchone()
    finally:
        con.close()


def get_prod(prod_id: str):
    con = get_db()
    try:
        return con.execute("SELECT * FROM products WHERE id = ?;", (prod_id,)).fetchone()
    finally:
        con.close()


def _locked(con, table, key_col, key_val):
    row = con.execute(f"SELECT * FROM {table} WHERE {key_col}=?;", (key_val,)).fetchone()
    if row and row["locked_until"]:
        try:
            until = datetime.strptime(row["locked_until"], '%Y-%m-%d %H:%M:%S')
            return until > datetime.now()
        except Exception:
            return False
    return False


def is_locked(ip, user_id):
    con = get_db()
    try:
        return _locked(con, "login_attempts", "ip", ip) or (
            user_id and _locked(con, "user_login_attempts", "user_id", user_id)
        )
    finally:
        con.close()


def _record_fail(con, table, key_col, key_val):
    row = con.execute(f"SELECT * FROM {table} WHERE {key_col}=?;", (key_val,)).fetchone()
    fails = (row["fails"] if row else 0) + 1
    lock = ""
    if fails >= config.LOGIN_MAX_FAILS:
        lock = (datetime.now() + timedelta(minutes=config.LOGIN_LOCKOUT_MINUTES)).strftime('%Y-%m-%d %H:%M:%S')
        fails = 0
    if row:
        con.execute(f"UPDATE {table} SET fails=?, locked_until=? WHERE {key_col}=?;",
                    (fails, lock, key_val))
    else:
        con.execute(f"INSERT INTO {table} VALUES (?, ?, ?);", (key_val, fails, lock))


def record_fail(ip, user_id):
    con = get_db()
    with con:
        _record_fail(con, "login_attempts", "ip", ip)
        if user_id:
            _record_fail(con, "user_login_attempts", "user_id", user_id)
    con.close()


def clear_fails(ip, user_id):
    con = get_db()
    with con:
        con.execute("DELETE FROM login_attempts WHERE ip=?;", (ip,))
        if user_id:
            con.execute("DELETE FROM user_login_attempts WHERE user_id=?;", (user_id,))
    con.close()


@app.before_request
def csrf_and_session():
    session.permanent = True
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    if request.method == "POST":
        token = None
        if request.is_json:
            payload = request.get_json(silent=True) or {}
            token = payload.get("csrf_token")
        if not token:
            token = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token")
        if not token or not hmac.compare_digest(token, session.get("csrf", "")):
            abort(400, description="CSRF token missing or invalid")


@app.context_processor
def inject_globals():
    return {
        "csrf_token": session.get("csrf", ""),
        "BRAND": "APPLE VEND",
        "slug": g.get("slug"),
    }


store_bp = Blueprint("store", __name__, url_prefix="/s/<slug>")


@store_bp.url_value_preprocessor
def _pull_slug(endpoint, values):
    s = values.pop("slug", None)
    g.slug = s
    stores = load_stores()
    if not s or s not in stores:
        abort(404)
    info = stores[s]
    try:
        exp = datetime.strptime(info["expiredate"], "%Y-%m-%d")
        if datetime.now() > exp + timedelta(days=1):
            g.store_expired = True
        else:
            g.store_expired = False
    except Exception:
        g.store_expired = False
    g.store_meta = info


@store_bp.url_defaults
def _add_slug(endpoint, values):
    if "slug" not in values and g.get("slug"):
        values["slug"] = g.slug


def session_user():
    if not g.get("slug"):
        return None
    users = session.get("users") or {}
    return users.get(g.slug)


def set_session_user(uid):
    users = session.get("users") or {}
    users[g.slug] = uid
    session["users"] = users


def clear_session_user():
    users = session.get("users") or {}
    users.pop(g.slug, None)
    session["users"] = users


def login_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if not session_user():
            return redirect(url_for("store.login"))
        return f(*args, **kwargs)
    return wrap


def admin_required(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        uid = session_user()
        if not uid:
            return redirect(url_for("store.login"))
        u = search_user(uid)
        if not u or u["isadmin"] != 1:
            return redirect(url_for("store.shop"))
        return f(*args, **kwargs)
    return wrap


def license_guard(f):
    @wraps(f)
    def wrap(*args, **kwargs):
        if g.get("store_expired"):
            return render_template("403.html", reason="라이센스가 만료되었습니다."), 403
        return f(*args, **kwargs)
    return wrap


@app.route("/", methods=["GET"])
def root():
    stores = load_stores()
    if not stores:
        return redirect(url_for("setup"))
    return render_template("store_index.html", stores=stores)


@app.route("/setup", methods=["GET", "POST"])
def setup():
    if request.method == "GET":
        return render_template("setup.html")

    license_key = (request.form.get("license") or "").strip()
    slug = (request.form.get("slug") or "").strip().lower()
    store_name = (request.form.get("name") or "").strip()
    admin_id = (request.form.get("adminid") or "").strip().lower()
    admin_pw = request.form.get("adminpw") or ""
    admin_pw2 = request.form.get("adminpwcheck") or ""
    bank_enabled = (request.form.get("bank") or "").strip() == "1"

    payload, err = lic.validate(license_key)
    if err:
        return err
    if not SLUG_RE.match(slug):
        return "스토어 주소(slug)는 3~20자 영문소문자/숫자/하이픈/언더스코어."
    if not (1 <= len(store_name) <= 20):
        return "스토어 이름은 1~20자입니다."
    if not (6 <= len(admin_id) <= 24) or not admin_id.replace("_", "").isalnum():
        return "관리자 ID는 6~24자 (영문/숫자/언더스코어)."
    if not (8 <= len(admin_pw) <= 64):
        return "비밀번호는 8~64자로 설정해주세요."
    if admin_pw != admin_pw2:
        return "비밀번호 확인이 일치하지 않습니다."

    stores = load_stores()
    if slug in stores or os.path.isfile(store_db_path(slug)):
        return "이미 사용 중인 스토어 주소입니다."

    init_store_db(slug, store_name, admin_id, admin_pw, bank_enabled=bank_enabled)
    stores[slug] = {
        "name": store_name,
        "license_id": payload["id"],
        "expiredate": payload["exp"],
        "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    save_stores(stores)
    lic.mark_used(payload["id"], slug)
    return f"ok:{slug}"


@store_bp.route("/", methods=["GET"])
@license_guard
def home():
    if session_user():
        return redirect(url_for("store.announcement"))
    return redirect(url_for("store.login"))


@store_bp.route("/login", methods=["GET", "POST"])
@license_guard
def login():
    info = get_info()
    if info["banned"]:
        return render_template("403.html", reason=info["banned"])

    if request.method == "GET":
        if session_user():
            return redirect(url_for("store.announcement"))
        return render_template("login.html", name=info["name"], background=info["background"])

    ip = getip()
    uid = (request.form.get("id") or "").strip().lower()
    pw = request.form.get("pw") or ""

    if is_locked(ip, uid):
        return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요."

    user = search_user(uid)
    if not user or not verify_pw(pw, user["pw"]):
        record_fail(ip, uid)
        return "아이디 또는 비밀번호가 잘못되었습니다."
    if user["black"]:
        return f"차단된 계정입니다. 사유: {user['black']}"

    clear_fails(ip, uid)
    set_session_user(user["id"])
    send_webhook(info["adminlogwebhk"], f"[{g.slug}] 로그인: {user['id']} (IP {ip})")
    return "ok"


@store_bp.route("/register", methods=["GET", "POST"])
@license_guard
def register():
    info = get_info()
    if info["banned"]:
        return render_template("403.html", reason=info["banned"])

    if request.method == "GET":
        if session_user():
            return redirect(url_for("store.announcement"))
        return render_template("register.html", name=info["name"], background=info["background"])

    uid = (request.form.get("id") or "").strip().lower()
    pw = request.form.get("pw") or ""
    tag = (request.form.get("tag") or "").strip()[:40]

    if not (6 <= len(uid) <= 24) or not uid.replace("_", "").isalnum():
        return "아이디는 6~24자 (영문/숫자/언더스코어)."
    if not (8 <= len(pw) <= 64):
        return "비밀번호는 8~64자."

    if search_user(uid):
        return "이미 존재하는 아이디입니다."

    ip = getip()
    con = get_db()
    try:
        if not config.ALLOW_DUPLICATE_IP_REGISTRATION:
            dup = con.execute("SELECT id FROM users WHERE ip=?;", (ip,)).fetchone()
            if dup:
                return "해당 IP로 이미 가입된 계정이 있습니다."
        with con:
            con.execute("INSERT INTO users VALUES (?, ?, ?, 0, '[]', 0, '', '', ?, '0');",
                        (uid, hash_pw(pw), ip, tag))
    finally:
        con.close()

    set_session_user(uid)
    send_webhook(info["adminlogwebhk"], f"[{g.slug}] 회원가입: {uid} (IP {ip})")
    return "ok"


@store_bp.route("/logout", methods=["GET"])
def logout():
    clear_session_user()
    return redirect(url_for("store.login"))


@store_bp.route("/shop", methods=["GET"])
@license_guard
@login_required
def shop():
    info = get_info()
    if info["banned"]:
        return render_template("403.html", reason=info["banned"])
    user = search_user(session_user())
    con = get_db()
    products = con.execute("SELECT * FROM products;").fetchall()
    con.close()
    return render_template("index.html", name=info["name"], products=products,
                           user_info=user, shopinfo=info, music=info["music"],
                           linking=info["linking"], file=info["file"],
                           channelio=info["channeltok"])


@store_bp.route("/announcement", methods=["GET"])
@license_guard
@login_required
def announcement():
    info = get_info()
    user = search_user(session_user())
    return render_template("announcement.html", name=info["name"], user_info=user,
                           shopinfo=info, announcement=info["announcement"],
                           music=info["music"], linking=info["linking"],
                           file=info["file"], imgannouncement=info["imgannouncement"],
                           channelio=info["channeltok"])


@store_bp.route("/buylog", methods=["GET"])
@license_guard
@login_required
def buylog_page():
    info = get_info()
    user = search_user(session_user())
    mylogs = safe_json_loads(user["buylog"], [])
    all_logs = safe_json_loads(info["buylog"], [])
    return render_template("log.html", name=info["name"], user_info=user,
                           logs=list(reversed(sorted(mylogs))),
                           alllogs=list(reversed(sorted(all_logs))),
                           shopinfo=info, music=info["music"], linking=info["linking"],
                           file=info["file"], channelio=info["channeltok"], type=1)


@store_bp.route("/mypage", methods=["GET"])
@license_guard
@login_required
def mypage():
    info = get_info()
    user = search_user(session_user())
    return render_template("mypage.html", name=info["name"], user_info=user,
                           shopinfo=info, music=info["music"], linking=info["linking"],
                           file=info["file"], channelio=info["channeltok"])


@store_bp.route("/buy", methods=["POST"])
@license_guard
@login_required
def buy():
    data = request.get_json(silent=True) or {}
    prod_id = data.get("id")
    amount = data.get("amount")
    try:
        amount = int(amount)
    except (TypeError, ValueError):
        return "잘못된 요청입니다."
    if not isinstance(prod_id, str) or amount <= 0:
        return "잘못된 요청입니다."
    if amount > config.MAX_BUY_AMOUNT:
        return f"한 번에 구매 가능한 최대 수량은 {config.MAX_BUY_AMOUNT}개입니다."
    prod = get_prod(prod_id)
    if not prod:
        return "존재하지 않는 상품입니다."
    stock_lines = (prod["stock"] or "").split("\n") if prod["stock"] else []
    stock_lines = [s for s in stock_lines if s.strip()]
    if len(stock_lines) < amount:
        return "재고가 부족합니다."
    total = int(prod["price"]) * amount

    uid = session_user()
    con = get_db()
    try:
        with con:
            user = con.execute("SELECT * FROM users WHERE id=?;", (uid,)).fetchone()
            if user["money"] < total:
                return "잔액이 부족합니다."

            random.shuffle(stock_lines)
            bought = stock_lines[:amount]
            remain = stock_lines[amount:]
            bought_str = "\n".join(bought)

            new_money = user["money"] - total
            user_log = safe_json_loads(user["buylog"], [])
            user_log.append([nowstr(), prod["name"], bought_str])

            info = con.execute("SELECT * FROM info;").fetchone()
            info_log = safe_json_loads(info["buylog"], [])
            info_log.append([nowstr(), uid, prod["name"], bought_str])

            con.execute("UPDATE users SET money=?, buylog=? WHERE id=?;",
                        (new_money, json.dumps(user_log, ensure_ascii=False), uid))
            con.execute("UPDATE products SET stock=? WHERE id=?;",
                        ("\n".join(remain), prod_id))
            con.execute("UPDATE info SET buylog=?;",
                        (json.dumps(info_log, ensure_ascii=False),))
    finally:
        con.close()

    info = get_info()
    send_webhook(info["webhk"], f"[{g.slug}] 구매: {uid} — {prod['name']} x{amount}")
    send_webhook(info["adminlogwebhk"],
                 f"[{g.slug}][구매] id={uid}, 상품={prod['name']}, 재고={bought_str}")
    return "ok"


@store_bp.route("/bank", methods=["GET", "POST"])
@license_guard
@login_required
def bank():
    info = get_info()
    if info["type"] != 1:
        abort(404)

    uid = session_user()

    if request.method == "GET":
        user = search_user(uid)
        return render_template("bank.html", name=info["name"], user_info=user,
                               shopinfo=info, music=info["music"], linking=info["linking"],
                               file=info["file"], channelio=info["channeltok"])

    data = request.get_json(silent=True) or {}
    bankname = (data.get("name") or "").strip()[:20]
    amount_s = str(data.get("amount", "")).strip()
    if not bankname or not amount_s.isdigit():
        return "입금자명과 금액을 올바르게 입력해주세요."
    amount = int(amount_s)
    if amount <= 0 or amount > 10_000_000:
        return "금액이 올바르지 않습니다."

    user = search_user(uid)
    if user["black"]:
        return f"차단된 유저입니다. 사유: {user['black']}"

    con = get_db()
    try:
        with con:
            exist = con.execute("SELECT * FROM bankwait WHERE id=?;", (uid,)).fetchone()
            if exist:
                return (f"이미 진행 중인 충전 신청이 있습니다. "
                        f"입금 계좌: {info['bankaddr']} / "
                        f"신청 금액: {exist['amount']}원, 입금자명: {exist['name']}")

            if user["name"] and user["name"] != bankname:
                return "입금자명이 이전과 다릅니다. 관리자에게 문의하세요."
            if not user["name"]:
                con.execute("UPDATE users SET name=? WHERE id=?;", (bankname, uid))
            con.execute("INSERT INTO bankwait VALUES (?, ?, ?, ?);",
                        (uid, bankname, amount, nowstr()))
    finally:
        con.close()

    send_webhook(info["adminlogwebhk"],
                 f"[{g.slug}][계좌충전신청] {uid} — {bankname} / {amount}원")

    bankpin = (info["bankpin"] or "").strip() if "bankpin" in info.keys() else ""
    if bankpin:
        aos.start_listener(g.slug, bankpin, uid, bankname, amount)

    return "ok"


@store_bp.route("/changepw", methods=["POST"])
@license_guard
@login_required
def changepw():
    data = request.get_json(silent=True) or {}
    nowpw = data.get("nowpw") or ""
    newpw = data.get("pw") or ""
    check = data.get("pwcheck") or ""
    uid = session_user()
    user = search_user(uid)
    if not verify_pw(nowpw, user["pw"]):
        return "현재 비밀번호가 틀립니다."
    if newpw != check:
        return "비밀번호 확인이 일치하지 않습니다."
    if not (8 <= len(newpw) <= 64):
        return "비밀번호는 8~64자."
    con = get_db()
    with con:
        con.execute("UPDATE users SET pw=? WHERE id=?;", (hash_pw(newpw), uid))
    con.close()
    info = get_info()
    send_webhook(info["adminlogwebhk"], f"[{g.slug}][비번변경] {uid}")
    clear_session_user()
    return "ok"


@store_bp.route("/admin", methods=["GET"])
@license_guard
@admin_required
def admin_home():
    return redirect(url_for("store.admin_setting"))


@store_bp.route("/admin/setting", methods=["GET", "POST"])
@license_guard
@admin_required
def admin_setting():
    info = get_info()
    if request.method == "GET":
        return render_template("admin_general.html", info=info, server_info=info)

    required = ["name", "buylogwebhk", "announcement", "imgannouncement",
                "buylogwebhkt", "adminlogwebhk", "addstock"]
    for k in required:
        if k not in request.form:
            return "잘못된 접근입니다."
    if not (1 <= len(request.form["name"]) <= 20):
        return "스토어 이름은 1~20자입니다."

    bank_en = info["type"] == 1
    con = get_db()
    with con:
        con.execute("""UPDATE info SET name=?, webhk=?, announcement=?,
                       bankaddr=?, imgannouncement=?, buylogwebhkt=?,
                       adminlogwebhk=?, addstock=?, bankpin=?;""",
                    (request.form["name"], request.form["buylogwebhk"],
                     request.form["announcement"],
                     request.form.get("bankaddr", "") if bank_en else "",
                     request.form["imgannouncement"],
                     request.form["buylogwebhkt"], request.form["adminlogwebhk"],
                     request.form["addstock"],
                     request.form.get("bankpin", "").strip() if bank_en else ""))
    con.close()
    stores = load_stores()
    if g.slug in stores:
        stores[g.slug]["name"] = request.form["name"]
        save_stores(stores)
    return "ok"


@store_bp.route("/admin/manageuser", methods=["GET"])
@license_guard
@admin_required
def admin_manageuser():
    con = get_db()
    users = con.execute("SELECT * FROM users;").fetchall()
    con.close()
    return render_template("admin_manageuser.html", users=users, server_info=get_info())


@store_bp.route("/admin/manageuser_detail", methods=["GET", "POST"])
@license_guard
@admin_required
def admin_manageuser_detail():
    info = get_info()
    if request.method == "GET":
        uid = request.args.get("id", "")
        u = search_user(uid) if uid else None
        if not u:
            return redirect(url_for("store.admin_manageuser"))
        return render_template("admin_manageuser_detail.html", info=u, server_info=info)

    required = ["password", "money", "id", "tag", "black"]
    for k in required:
        if k not in request.form:
            return "잘못된 접근입니다."
    uid = request.form["id"]
    if not search_user(uid):
        return "존재하지 않는 유저입니다."
    if not request.form["money"].isdigit():
        return "잔액은 숫자로만 적어주세요."

    bank_en = info["type"] == 1
    new_name = request.form.get("name", "") if bank_en else ""
    con = get_db()
    with con:
        if bank_en and new_name:
            dup = con.execute("SELECT id FROM users WHERE name=? AND id<>?;",
                              (new_name, uid)).fetchone()
            if dup:
                con.close()
                return "이미 존재하는 입금자명입니다."
        if request.form["password"]:
            if not (8 <= len(request.form["password"]) <= 64):
                return "비밀번호는 8~64자."
            con.execute("""UPDATE users SET pw=?, money=?, black=?, name=?, tag=?
                           WHERE id=?;""",
                        (hash_pw(request.form["password"]),
                         int(request.form["money"]), request.form["black"],
                         new_name, request.form["tag"], uid))
        else:
            con.execute("""UPDATE users SET money=?, black=?, name=?, tag=?
                           WHERE id=?;""",
                        (int(request.form["money"]), request.form["black"],
                         new_name, request.form["tag"], uid))
    con.close()
    return "ok"


@store_bp.route("/admin/manageprod", methods=["GET"])
@license_guard
@admin_required
def admin_manageprod():
    con = get_db()
    products = con.execute("SELECT * FROM products;").fetchall()
    con.close()
    return render_template("admin_manageprod.html", products=products, server_info=get_info())


@store_bp.route("/admin/createprod", methods=["GET", "POST"])
@license_guard
@admin_required
def admin_createprod():
    if request.method == "GET":
        return render_template("admin_createprod.html", server_info=get_info())
    name = (request.form.get("name") or "").strip()
    price = request.form.get("price") or ""
    if not name or len(name) > 40:
        return "상품 이름은 1~40자."
    if not price.isdigit() or not (0 < int(price) <= 10_000_000):
        return "가격은 1원 ~ 1000만원 사이."
    new_id = randomstring.pick(16)
    con = get_db()
    with con:
        con.execute("INSERT INTO products VALUES (?, ?, '', ?, '', '');",
                    (new_id, name, int(price)))
    con.close()
    return "ok"


@store_bp.route("/admin/manageprod_detail", methods=["GET", "POST"])
@license_guard
@admin_required
def admin_manageprod_detail():
    if request.method == "GET":
        pid = request.args.get("id", "")
        p = get_prod(pid) if pid else None
        if not p:
            return redirect(url_for("store.admin_manageprod"))
        return render_template("admin_manageprod_detail.html", info=p, server_info=get_info())

    required = ["name", "description", "photo", "price", "stock", "id"]
    for k in required:
        if k not in request.form:
            return "잘못된 접근입니다."
    pid = request.form["id"]
    prod = get_prod(pid)
    if not prod:
        return "존재하지 않는 상품입니다."
    name = (request.form["name"] or "").strip()
    if not name:
        return "상품 이름을 입력해주세요."
    price = request.form["price"]
    if not price.isdigit() or not (0 < int(price) <= 10_000_000):
        return "가격은 1원 ~ 1000만원 사이."

    con = get_db()
    with con:
        con.execute("""UPDATE products SET name=?, description=?, price=?, url=?, stock=?
                       WHERE id=?;""",
                    (name, request.form["description"], int(price),
                     request.form["photo"], request.form["stock"], pid))
    con.close()

    old_lines = [s for s in (prod["stock"] or "").split("\n") if s.strip()]
    new_lines = [s for s in (request.form["stock"] or "").split("\n") if s.strip()]
    if len(new_lines) > len(old_lines):
        info = get_info()
        added = len(new_lines) - len(old_lines)
        send_webhook(info["addstock"],
                     f"[{g.slug}][입고] {name} +{added}개 (총 {len(new_lines)}개)")
    return "ok"


@store_bp.route("/admin/delete_product", methods=["POST"])
@license_guard
@admin_required
def admin_delete_product():
    pid = request.form.get("id") or ""
    if not get_prod(pid):
        return "존재하지 않는 상품입니다."
    con = get_db()
    with con:
        con.execute("DELETE FROM products WHERE id=?;", (pid,))
    con.close()
    return "ok"


@store_bp.route("/admin/log", methods=["GET"])
@license_guard
@admin_required
def admin_log():
    info = get_info()
    return render_template("admin_log.html",
                           buylog=safe_json_loads(info["buylog"], []),
                           chargelog=safe_json_loads(info["chargelog"], []),
                           server_info=info)


@store_bp.route("/admin/managereq", methods=["GET", "POST"])
@license_guard
@admin_required
def admin_managereq():
    info = get_info()
    if info["type"] != 1:
        abort(404)
    if request.method == "GET":
        con = get_db()
        reqs = con.execute("SELECT * FROM bankwait;").fetchall()
        con.close()
        return render_template("admin_managereq.html", reqs=reqs, server_info=info)

    data = request.get_json(silent=True) or {}
    if data.get("type") not in ("delete", "accept") or not data.get("id"):
        return "잘못된 접근입니다."
    uid = data["id"]
    con = get_db()
    try:
        row = con.execute("SELECT * FROM bankwait WHERE id=?;", (uid,)).fetchone()
        if not row:
            return "존재하지 않는 충전신청입니다."
        with con:
            if data["type"] == "accept":
                con.execute("UPDATE users SET money = money + ? WHERE id=?;",
                            (row["amount"], uid))
                info_row = con.execute("SELECT * FROM info;").fetchone()
                clog = safe_json_loads(info_row["chargelog"], [])
                clog.append([nowstr(), uid, row["name"], "계좌충전 승인", str(row["amount"])])
                con.execute("UPDATE info SET chargelog=?;",
                            (json.dumps(clog, ensure_ascii=False),))
            con.execute("DELETE FROM bankwait WHERE id=?;", (uid,))
    finally:
        con.close()
    if data["type"] == "accept":
        send_webhook(info["adminlogwebhk"],
                     f"[{g.slug}][계좌충전승인] {uid} +{row['amount']}원 ({row['name']})")
    return "ok"


app.register_blueprint(store_bp)


def send_webhook(url, content):
    if not url:
        return
    try:
        def _send():
            try:
                wh = DiscordWebhook(username="APPLE VEND", url=url)
                wh.add_embed(DiscordEmbed(description=str(content)[:1900], color=0x111111))
                wh.execute()
            except Exception:
                pass
        threading.Thread(target=_send, daemon=True).start()
    except Exception:
        pass


@app.errorhandler(400)
def bad_request(e):
    return render_template("404.html", reason=str(getattr(e, "description", ""))), 400


@app.errorhandler(403)
def forbidden(e):
    return render_template("403.html", reason=""), 403


@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404


@app.errorhandler(500)
def server_err(e):
    return render_template("500.html"), 500


@app.route("/ban")
def ban():
    return render_template("ban.html")


if __name__ == "__main__":
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
