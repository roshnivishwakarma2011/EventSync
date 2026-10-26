"""EventSync mailer.

* Sends real email over SMTP when SMTP_HOST is set (see .env.example).
* When SMTP is NOT configured it prints each email to the backend console instead, so signup / OTP
  still works while you develop (copy the 6-digit code from the terminal).
Only the standard library is required; QR codes in tickets use the small `segno` package if installed.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import smtplib
import ssl
import threading
from collections import deque
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

log = logging.getLogger("eventsync.mail")
EMAIL_RE = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$")
CAPTURE: deque = deque(maxlen=50)  # only filled when MAIL_CAPTURE=1 (used by the tests)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def configured() -> bool:
    return bool(_env("SMTP_HOST"))


def app_url() -> str:
    return (_env("APP_URL") or "http://localhost:3000").rstrip("/")


# --------------------------------------------------------------------------- sending
def send_mail(to: str, subject: str, text: str, html: str | None = None,
              images: dict[str, bytes] | None = None, attachments: list[tuple] | None = None) -> bool:
    """Send one email. images: {cid: png_bytes}; attachments: [(filename, bytes, maintype, subtype)].
    Returns True when the message was handed to the SMTP server (or printed in console mode)."""
    to = (to or "").strip()
    if not EMAIL_RE.match(to):
        log.warning("not sending email: invalid recipient %r", to)
        return False
    subject = re.sub(r"[\r\n]+", " ", subject).strip()
    sender = _env("MAIL_FROM") or _env("SMTP_USER") or "no-reply@eventsync.local"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((_env("MAIL_FROM_NAME") or "EventSync", sender))
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
        body = msg.get_body(preferencelist=("html",))
        for cid, data in (images or {}).items():
            body.add_related(data, "image", "png", cid=f"<{cid}>")
    for filename, data, maintype, subtype in attachments or []:
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)

    if os.environ.get("MAIL_CAPTURE") == "1":
        CAPTURE.append({"to": to, "subject": subject, "text": text, "html": html, "images": list((images or {}).keys()),
                        "attachments": [a[0] for a in attachments or []]})

    if not configured():
        bar = "=" * 64
        print(f"\n{bar}\n EMAIL (SMTP not configured, printed here instead of sent)\n To:      {to}\n Subject: {subject}\n{bar}\n{text}\n{bar}\n", flush=True)
        return True

    host = _env("SMTP_HOST")
    port = int(_env("SMTP_PORT") or 587)
    mode = (_env("SMTP_SECURITY") or ("ssl" if port == 465 else "starttls")).lower()
    user = _env("SMTP_USER")
    password = _env("SMTP_PASSWORD")
    if "gmail" in host.lower():
        password = password.replace(" ", "")  # Google shows app passwords in groups of 4
    try:
        ctx = ssl.create_default_context()
        server = smtplib.SMTP_SSL(host, port, timeout=15, context=ctx) if mode == "ssl" else smtplib.SMTP(host, port, timeout=15)
        with server:
            if mode == "starttls":
                server.starttls(context=ctx)
            if user:
                server.login(user, password)
            server.send_message(msg)
        return True
    except Exception:
        log.exception("could not send email to %s", to)
        return False


def run_in_background(fn, *args, **kwargs) -> None:
    def _go():
        try:
            fn(*args, **kwargs)
        except Exception:
            log.exception("background email failed")
    threading.Thread(target=_go, daemon=True).start()


# --------------------------------------------------------------------------- building blocks
def qr_png(data: str) -> bytes | None:
    """PNG bytes of a QR code, or None if the optional `segno` package is not installed."""
    try:
        import segno
    except ImportError:
        log.warning("segno is not installed, tickets will be emailed without the QR image (pip install segno)")
        return None
    buf = io.BytesIO()
    segno.make_qr(data, error="m").save(buf, kind="png", scale=7, border=2, dark="#151128", light="#ffffff")
    return buf.getvalue()


def _ics_escape(s: str) -> str:
    return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def ics_bytes(uid: str, title: str, start: datetime, hours: int, venue: str, url: str) -> bytes:
    f = "%Y%m%dT%H%M%S"
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EventSync//Ticket//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
             f"UID:{uid}@eventsync", f"DTSTAMP:{datetime.utcnow().strftime(f)}Z", f"DTSTART:{start.strftime(f)}",
             f"DTEND:{(start + timedelta(hours=hours)).strftime(f)}", f"SUMMARY:{_ics_escape(title)}", f"LOCATION:{_ics_escape(venue)}",
             f"DESCRIPTION:{_ics_escape('Your EventSync pass: ' + url)}", f"URL:{url}", "END:VEVENT", "END:VCALENDAR"]
    return ("\r\n".join(lines) + "\r\n").encode()


def _shell(title: str, inner: str) -> str:
    """Email-safe (table + inline CSS) dark card with the EventSync header."""
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#070a13;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070a13;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0d1220;border:1px solid #1f2842;border-radius:20px;overflow:hidden;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#c8cfdd;">
<tr><td style="background-color:#7c5cff;background-image:linear-gradient(90deg,#7c5cff,#00d4ff);padding:20px 28px;font-size:18px;font-weight:800;letter-spacing:1px;color:#ffffff;">EVENTSYNC</td></tr>
<tr><td style="padding:30px 28px 8px 28px;"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#ffffff;">{escape(title)}</h1></td></tr>
{inner}
<tr><td style="padding:18px 28px 26px 28px;font-size:11px;color:#5b6577;border-top:1px solid #1f2842;">You received this email because of activity on your EventSync account.</td></tr>
</table></td></tr></table></body></html>"""


# --------------------------------------------------------------------------- the emails
def send_otp(to: str, name: str, code: str, minutes: int, purpose: str) -> bool:
    what = "finish creating your account" if purpose == "signup" else "reset your password"
    subject = f"{code} is your EventSync verification code"
    first = (name or "there").split(" ")[0]
    text = (f"Hi {first},\n\nYour EventSync verification code is: {code}\n\nEnter it to {what}. "
            f"It expires in {minutes} minutes.\n\nIf you didn't ask for this, you can ignore this email, nobody can use your account without the code.\n")
    inner = f"""<tr><td style="padding:6px 28px 4px 28px;font-size:15px;line-height:1.6;">Hi {escape(first)}, enter this code to {what}:</td></tr>
<tr><td align="center" style="padding:14px 28px;"><div style="display:inline-block;background:#151b30;border:1px solid #2a3556;border-radius:14px;padding:16px 28px;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#ffffff;">{escape(code)}</div></td></tr>
<tr><td style="padding:0 28px 18px 28px;font-size:13px;color:#9aa4b2;">This code expires in {minutes} minutes. If you didn't request it, you can safely ignore this email.</td></tr>"""
    return send_mail(to, subject, text, _shell("Verify your email" if purpose == "signup" else "Reset your password", inner))


def send_ticket(to: str, name: str, event: dict, reg_id: str, token: str, paid: int = 0) -> bool:
    """event: {id, title, start(datetime), venue, city, price}. Sends the QR pass + a calendar invite."""
    title = event["title"]
    start: datetime = event["start"]
    where = ", ".join(x for x in [event.get("venue"), event.get("city")] if x) or "Online"
    when_date = start.strftime("%A, %d %B %Y")
    when_time = start.strftime("%I:%M %p").lstrip("0")
    link = f"{app_url()}/dashboard?tab=passes"
    amount = f"₹{paid:,}" if paid else "Free"
    first = (name or "there").split(" ")[0]

    payload = json.dumps({"es": "pass", "t": token, "e": str(event["id"])}, separators=(",", ":"))  # same payload the website's QR uses
    qr = qr_png(payload)
    images = {"qr": qr} if qr else {}

    rows = "".join(
        f'<tr><td style="padding:7px 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#5b6577;width:90px;">{k}</td>'
        f'<td style="padding:7px 0;font-size:15px;color:#ffffff;font-weight:600;">{escape(v)}</td></tr>'
        for k, v in [("Date", when_date), ("Time", when_time), ("Venue", where), ("Ticket", amount)])
    qr_block = (f'<img src="cid:qr" width="190" height="190" alt="Your QR pass" style="display:block;margin:0 auto;border-radius:6px;">'
                if qr else '<div style="font-size:13px;color:#151128;">Open your pass in the app to see your QR code.</div>')
    inner = f"""<tr><td style="padding:2px 28px 4px 28px;font-size:15px;line-height:1.6;">Hi {escape(first)}, you're registered for <b style="color:#ffffff;">{escape(title)}</b>.</td></tr>
<tr><td style="padding:10px 28px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">{rows}</table></td></tr>
<tr><td align="center" style="padding:10px 28px 6px 28px;"><div style="display:inline-block;background:#ffffff;border-radius:16px;padding:16px;">{qr_block}</div></td></tr>
<tr><td align="center" style="padding:10px 28px 4px 28px;font-size:12px;color:#9aa4b2;">Pass ID <b style="font-family:Consolas,Menlo,monospace;color:#ffffff;">{escape(reg_id)}</b> · show this QR at the entrance</td></tr>
<tr><td align="center" style="padding:18px 28px 22px 28px;"><a href="{escape(link)}" style="display:inline-block;background-color:#7c5cff;background-image:linear-gradient(90deg,#7c5cff,#00d4ff);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 26px;border-radius:12px;">Open my pass</a></td></tr>"""
    text = (f"Hi {first},\n\nYou're registered for {title}.\n\nDate:  {when_date}\nTime:  {when_time}\nVenue: {where}\nTicket: {amount}\n"
            f"Pass ID: {reg_id}\n\nOpen your QR pass any time: {link}\nThe QR code is attached to the HTML version of this email. A calendar invite (.ics) is attached.\n")
    ics = ics_bytes(reg_id, title, start, 3, where, link)
    return send_mail(to, f"Your ticket: {title}", text, _shell("You're in! 🎟️", inner), images=images, attachments=[("event.ics", ics, "text", "calendar")])
