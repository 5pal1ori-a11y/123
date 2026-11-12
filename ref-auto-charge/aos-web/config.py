import os
import secrets

CWDIR = os.path.dirname(os.path.abspath(__file__))
_SK_FILE = os.path.join(CWDIR, "database", ".secret_key")


def _load_or_make_secret():
    env = os.environ.get("APPLE_SECRET_KEY")
    if env:
        return env
    try:
        if os.path.isfile(_SK_FILE):
            with open(_SK_FILE, "r", encoding="utf-8") as f:
                v = f.read().strip()
                if v:
                    return v
        os.makedirs(os.path.dirname(_SK_FILE), exist_ok=True)
        v = secrets.token_hex(32)
        with open(_SK_FILE, "w", encoding="utf-8") as f:
            f.write(v)
        return v
    except Exception:
        return secrets.token_hex(32)


def _env_bool(name, default="0"):
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


SECRET_KEY = _load_or_make_secret()
PASSWORD_PEPPER = os.environ.get("APPLE_PEPPER") or "CHANGE-THIS-PEPPER-BEFORE-DEPLOY"
LICENSE_SECRET = os.environ.get("APPLE_LICENSE_SECRET") or "CHANGE-THIS-LICENSE-SECRET"

# 공개 도메인 (예: secvpn.shop)
DOMAIN = (os.environ.get("APPLE_DOMAIN") or "secvpn.shop").strip().lower()
PUBLIC_BASE_URL = (os.environ.get("APPLE_PUBLIC_URL") or f"https://{DOMAIN}").rstrip("/")

HOST = os.environ.get("APPLE_HOST", "0.0.0.0")
PORT = int(os.environ.get("APPLE_PORT", "5000"))
DEBUG = _env_bool("APPLE_DEBUG", "0")

# 로컬 HTTP에서는 0 유지. 서버(HTTPS)에서는 deploy/.env 에 APPLE_COOKIE_SECURE=1
SESSION_COOKIE_SECURE = _env_bool("APPLE_COOKIE_SECURE", "0")

# Cloudflare / Nginx 등 리버스 프록시 사용 시 deploy/.env 에서 1
BEHIND_PROXY = _env_bool("APPLE_BEHIND_PROXY", "0")
TRUST_CF_IP = _env_bool("APPLE_TRUST_CF_IP", "0")

ALLOW_DUPLICATE_IP_REGISTRATION = _env_bool("APPLE_ALLOW_DUP_IP", "1")

LOGIN_MAX_FAILS = int(os.environ.get("APPLE_LOGIN_MAX_FAILS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.environ.get("APPLE_LOGIN_LOCKOUT", "15"))
SESSION_LIFETIME_MINUTES = int(os.environ.get("APPLE_SESSION_MINUTES", "60"))

MAX_BUY_AMOUNT = int(os.environ.get("APPLE_MAX_BUY", "10000"))
