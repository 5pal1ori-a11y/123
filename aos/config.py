from dotenv import load_dotenv
load_dotenv() # .env 파일 내용을 환경변수로 불러옵니다.

import os
import secrets

CWDIR = os.path.dirname(os.path.abspath(__file__))
_SK_FILE = os.path.join(CWDIR, "database", ".secret_key")

_PLACEHOLDER_PEPPER = "CHANGE-THIS-PEPPER-BEFORE-DEPLOY"
_PLACEHOLDER_LICENSE = "CHANGE-THIS-LICENSE-SECRET"

RESERVED_SLUGS = frozenset({
    "www", "admin", "mail", "ftp", "api", "static", "setup", "status",
    "ns1", "ns2", "cdn", "assets", "platform",
})

BRAND = "APPLE VEND"


def _env(*names, default=""):
    for name in names:
        v = os.environ.get(name)
        if v:
            return v
    return default


def _load_or_make_secret():
    env = _env("APVEND_SECRET_KEY", "WOOBOT_SECRET_KEY")
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


def _truthy(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


SECRET_KEY = _load_or_make_secret()
PASSWORD_PEPPER = _env("APVEND_PEPPER", "WOOBOT_PEPPER") or _PLACEHOLDER_PEPPER
LICENSE_SECRET = _env("APVEND_LICENSE_SECRET", "WOOBOT_LICENSE_SECRET") or _PLACEHOLDER_LICENSE

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "5001"))
DEBUG = _truthy("DEBUG", False)

BASE_DOMAIN = (os.environ.get("BASE_DOMAIN") or "apvend.xyz").strip().lower()
PREFERRED_URL_SCHEME = (os.environ.get("PREFERRED_URL_SCHEME") or "https").strip().lower()

PLATFORM_ADMIN_ID = os.environ.get("PLATFORM_ADMIN_ID", "")
PLATFORM_ADMIN_PASSWORD = os.environ.get("PLATFORM_ADMIN_PASSWORD", "")

# 사이트 등록 웹훅 / 라이센스 발급 웹훅 URL은 더 이상 코드에 저장하지 않습니다.
# database/webhook_settings.json 에 저장되며, /noah 페이지(허용된 IP만 접근 가능)에서
# 설정합니다. webhook_settings.py 참고.

# /noah 웹훅 설정 페이지 접근을 허용할 IP (apex 도메인에서만 동작)
NOAH_ALLOWED_IP = os.environ.get("NOAH_ALLOWED_IP", "58.237.232.106").strip()

ALLOW_INSECURE_DEFAULTS = os.environ.get("ALLOW_INSECURE_DEFAULTS", "") == "1"
AOS_DISABLE = os.environ.get("AOS_DISABLE", "") == "1"

SESSION_COOKIE_SECURE = _truthy("SESSION_COOKIE_SECURE", True)

TRUST_CF_IP = _truthy("TRUST_CF_IP", False)
ALLOW_DUPLICATE_IP_REGISTRATION = _truthy("ALLOW_DUPLICATE_IP_REGISTRATION", True)

LOGIN_MAX_FAILS = 5
LOGIN_LOCKOUT_MINUTES = 15
SESSION_LIFETIME_MINUTES = 60

MAX_BUY_AMOUNT = 10000

SETUP_RATE_LIMIT = 5
SETUP_RATE_WINDOW_SEC = 15 * 60
REGISTER_RATE_LIMIT = 8
REGISTER_RATE_WINDOW_SEC = 15 * 60
PLATFORM_LOGIN_RATE_LIMIT = 8
PLATFORM_LOGIN_RATE_WINDOW_SEC = 15 * 60


def store_public_url(slug: str, path: str = "/") -> str:
    if not path.startswith("/"):
        path = "/" + path
    return f"{PREFERRED_URL_SCHEME}://{slug}.{BASE_DOMAIN}{path}"


def assert_secure():
    if ALLOW_INSECURE_DEFAULTS:
        return
    missing = []
    if PASSWORD_PEPPER == _PLACEHOLDER_PEPPER:
        missing.append("APVEND_PEPPER")
    if LICENSE_SECRET == _PLACEHOLDER_LICENSE:
        missing.append("APVEND_LICENSE_SECRET")
    if not PLATFORM_ADMIN_ID or not PLATFORM_ADMIN_PASSWORD:
        missing.append("PLATFORM_ADMIN_ID / PLATFORM_ADMIN_PASSWORD")
    if missing:
        raise SystemExit(
            "운영 시크릿이 기본값입니다. " + ", ".join(missing) +
            " 를 설정하거나 로컬은 ALLOW_INSECURE_DEFAULTS=1 을 사용하세요."
        )