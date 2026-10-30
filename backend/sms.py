"""EventSync SMS sender (phone OTP).

* Sends a real text message through Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
  (TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID) are set in backend/.env.
* When they are NOT set, the message is printed in the backend console instead (same idea as mailer.py),
  so you can develop and demo the phone-OTP flow for free: copy the 6-digit code from the terminal.
Only the standard library is used (no new pip package).
"""
from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from collections import deque

log = logging.getLogger("eventsync.sms")
CAPTURE: deque = deque(maxlen=50)  # only filled when SMS_CAPTURE=1 (used by the tests)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def configured() -> bool:
    return bool(_env("TWILIO_ACCOUNT_SID") and _env("TWILIO_AUTH_TOKEN") and (_env("TWILIO_FROM") or _env("TWILIO_MESSAGING_SERVICE_SID")))


def send_sms(to: str, text: str) -> bool:
    """Send one text message to `to` (E.164 like +919876543210). True = handed to Twilio (or printed in console mode)."""
    to = (to or "").strip()
    if os.environ.get("SMS_CAPTURE") == "1":
        CAPTURE.append({"to": to, "text": text})
    if not configured():
        bar = "=" * 64
        print(f"\n{bar}\n SMS (Twilio not configured, printed here instead of sent)\n To: {to}\n{bar}\n{text}\n{bar}\n", flush=True)
        return True
    sid, token = _env("TWILIO_ACCOUNT_SID"), _env("TWILIO_AUTH_TOKEN")
    form = {"To": to, "Body": text}
    if _env("TWILIO_MESSAGING_SERVICE_SID"): form["MessagingServiceSid"] = _env("TWILIO_MESSAGING_SERVICE_SID")
    else: form["From"] = _env("TWILIO_FROM")
    req = urllib.request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=urllib.parse.urlencode(form).encode(),
        headers={"Authorization": "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode(), "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except urllib.error.HTTPError as e:
        try: detail = json.loads(e.read().decode()).get("message", "")
        except Exception: detail = ""
        log.error("Twilio rejected the SMS (%s): %s", e.code, detail)
        return False
    except Exception:
        log.exception("could not reach Twilio")
        return False


def send_otp(phone: str, code: str, minutes: int, purpose: str = "signup") -> bool:
    what = "finish creating your account" if purpose == "signup" else "reset your password"
    return send_sms(phone, f"{code} is your EventSync verification code. Use it to {what}. It expires in {minutes} minutes. Do not share this code with anyone.")