import json
import logging
import threading
import urllib.error
import urllib.request

import config

log = logging.getLogger("apvend.webhooks")

DISCORD_PREFIXES = (
    "https://discord.com/api/webhooks/",
    "https://discord.com/api/v10/webhooks/",
    "https://discordapp.com/api/webhooks/",
    "https://discordapp.com/api/v10/webhooks/",
)

COMPONENTS_FLAG = 32768
ACCENT_COLOR = 12494759
USER_AGENT = "DiscordBot (https://discord.com, 1.0)"


def is_allowed_webhook_url(url: str) -> bool:
    if not url:
        return False
    u = url.strip().split("?")[0]
    return any(u.startswith(p) for p in DISCORD_PREFIXES)


def normalize_webhook_url(url: str) -> str:
    u = (url or "").strip()
    replacements = (
        ("https://discord.com/api/webhooks/", "https://discord.com/api/v10/webhooks/"),
        ("https://discordapp.com/api/webhooks/", "https://discord.com/api/v10/webhooks/"),
        ("https://discordapp.com/api/v10/webhooks/", "https://discord.com/api/v10/webhooks/"),
    )
    for old, new in replacements:
        if u.startswith(old):
            u = new + u[len(old):]
            break
    return u


def with_components_url(url: str) -> str:
    u = normalize_webhook_url(url)
    if not u:
        return u
    if "with_components=" in u.lower():
        return u
    return u + ("&" if "?" in u else "?") + "with_components=true"


def build_component_payload(title, body, *, as_code=False, username=None):
    title = " ".join(str(title or config.BRAND).split())[:200]
    body = str(body or "")[:3500]
    inner = f"**내용**\n```\n{body}\n```" if as_code else f"**내용**\n{body}"
    return {
        "username": username or config.BRAND,
        "flags": COMPONENTS_FLAG,
        "components": [
            {
                "type": 17,
                "accent_color": ACCENT_COLOR,
                "spoiler": False,
                "components": [
                    {"type": 10, "content": f"## {title}"},
                    {"type": 14, "divider": True, "spacing": 1},
                    {"type": 10, "content": inner},
                ],
            }
        ],
    }


def send_webhook(url, content, *, as_code=False, username=None, title=None):
    if not url:
        return
    if not is_allowed_webhook_url(url):
        log.warning("rejected non-discord webhook url")
        return
    payload = build_component_payload(
        title or config.BRAND,
        content,
        as_code=as_code,
        username=username,
    )
    exec_url = with_components_url(url)

    def _send():
        try:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(
                exec_url,
                data=data,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": USER_AGENT,
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", errors="replace")[:400]
            except Exception:
                pass
            log.error("webhook send failed HTTP %s: %s", e.code, detail)
        except Exception:
            log.exception("webhook send failed")

    try:
        threading.Thread(target=_send, daemon=True).start()
    except Exception:
        log.exception("webhook thread failed")


def format_store_register(slug, store_name, expire, admin_id, bank_enabled, license_id):
    url = config.store_public_url(slug)
    bank = "ON" if bank_enabled else "OFF"
    return (
        f"사이트        {url}\n"
        f"이름          {store_name}\n"
        f"서브도메인    {slug}\n"
        f"만료일        {expire}\n"
        f"관리자 ID     {admin_id}\n"
        f"계좌충전      {bank}\n"
        f"라이선스 ID   {license_id}\n"
        f"\n"
        f"관리자 비밀번호는 해시로만 저장되어 웹훅에 포함되지 않습니다.\n"
        f"초기화: python admin_tool.py resetpw {slug} {admin_id} <새비밀번호>"
    )


def format_purchase_detail(slug, uid, product_name, amount, bought_str, when=""):
    stock = (bought_str or "").strip() or "(없음)"
    when_line = f"시각      {when}\n" if when else ""
    return (
        f"스토어    {slug}\n"
        f"구매자    {uid}\n"
        f"상품      {product_name}\n"
        f"수량      {amount}\n"
        f"{when_line}"
        f"\n"
        f"{stock}"
    )


def format_license_issue(items, expire_days, note):
    lines = ["라이센스"]
    for i, (key, _payload) in enumerate(items, 1):
        lines.append(f"{i}. {key}")
    keys = "\n".join(lines)
    note_s = note or "-"
    return (
        f"유효기간: {expire_days}일 (서버 등록 시점부터 적용) | 메모: {note_s} | 수량: {len(items)}\n"
        f"\n"
        f"{keys}"
    )