"""Run:  python test_smoke.py      (uses a throwaway SQLite file; sends no real email or payments)"""
import os, re, sys, io, json, time, hmac, hashlib, sqlite3, subprocess, tempfile
for k in ("SMTP_HOST", "GOOGLE_CLIENT_ID", "RAZORPAY_WEBHOOK_SECRET"): os.environ.pop(k, None)
os.environ.update(DATABASE_URL="sqlite:///./test_tmp.db", RAZORPAY_KEY_ID="rzp_test_dummy", RAZORPAY_KEY_SECRET="test_secret_123", UPLOAD_DIRECTORY="./test_uploads", JWT_SECRET_KEY="test-secret")
if os.path.exists("test_tmp.db"): os.remove("test_tmp.db")

import mailer
SENT = []
mailer.send_mail = lambda to, subject, text, html=None, images=None, attachments=None: (SENT.append({"to": to, "subject": subject, "text": text, "html": html, "att": [a[0] for a in attachments or []]}), True)[1]
import app as A
app = A.app; c = app.test_client()

FAKE_RZP = []
def fake_razorpay(path, payload):
    FAKE_RZP.append((path, payload))
    return {"id": "order_" + str(len(FAKE_RZP))} if path == "orders" else {"id": "rfnd_1"}
A.razorpay = fake_razorpay

def call(m, p, tok=None, j=None, **kw):
    r = getattr(c, m)(p, json=j, headers={"Authorization": "Bearer " + tok} if tok else {}, **kw); return r.status_code, r.get_json(silent=True)
L = lambda e, pw="demo1234": call("post", "/api/auth/login", j={"email": e, "password": pw})[1]["data"]["token"]
U, O = L("demo@eventsync.dev"), L("organizer@eventsync.dev")
res = []
def check(name, got, want):
    good = got == want; res.append(good); print(("PASS " if good else "FAIL ") + name, "" if good else f"(got {got!r}, want {want!r})"); return good
def wait_mail(subject_part, to=None, secs=3):
    end = time.time() + secs
    while time.time() < end:
        for m in SENT:
            if subject_part in m["subject"] and (to is None or m["to"] == to): return m
        time.sleep(.05)
    return None
def code_for(to):
    m = [x for x in SENT if x["to"] == to and "verification code" in x["subject"]][-1]; return re.search(r"\b(\d{6})\b", m["subject"]).group(1)

# ---------------------------------------------------------------- existing behaviour
check("bad login", call("post", "/api/auth/login", j={"email": "x@y.z", "password": "nope1234"})[0], 401)
check("search", call("get", "/api/events?search=AI")[1]["data"]["total"] >= 2, True)
check("register (free event)", call("post", "/api/events/3/register", U)[0], 201)
check("ticket email sent on registration", bool(wait_mail("Your ticket: Future of Web Development", "demo@eventsync.dev")), True)
tm = wait_mail("Your ticket: Future of Web Development"); check("ticket carries a calendar invite", "event.ics" in tm["att"], True)
check("duplicate register", call("post", "/api/events/3/register", U)[1]["error"]["code"], "ALREADY_REGISTERED")
check("full -> register blocked", call("post", "/api/events/1/register", U)[1]["error"]["code"], "EVENT_FULL")
check("waitlist #1", call("post", "/api/events/1/waitlist", U)[1]["data"]["position"], 1)
tok = call("get", "/api/events/3/pass", U)[1]["data"]["qr_token"]
check("user cannot check in", call("post", "/api/checkin", U, {"qr_token": tok})[0], 403)
check("check-in", call("post", "/api/checkin", O, {"qr_token": tok})[0], 200)
check("duplicate check-in", call("post", "/api/checkin", O, {"qr_token": tok})[1]["error"]["code"], "ALREADY_CHECKED_IN")
certs = call("get", "/api/certificates", U)[1]["data"]
check("certificate issued", len(certs), 1)
check("certificate has organizer", certs[0]["organizer"], "Meera Organizer")
check("certificate verifies", call("get", "/api/certificates/verify/" + certs[0]["id"])[1]["data"]["valid"], True)
check("XP awarded (240+10+50)", call("get", "/api/me", U)[1]["data"]["xp"], 300)
check("/api/me includes email", call("get", "/api/me", U)[1]["data"]["email"], "demo@eventsync.dev")
check("recommendations", len(call("get", "/api/recommendations", U)[1]["data"]) > 0, True)
check("notifications", len(call("get", "/api/notifications", U)[1]["data"]) >= 3, True)
an = call("get", "/api/organizer/events/2/analytics", O)[1]["data"]
check("organizer analytics", an["attendance"], 0)
check("analytics has a 30-day series", len(an["series"]), 30)
check("admin blocked for user", call("get", "/api/admin/analytics", U)[0], 403)
check("create event as user blocked", call("post", "/api/events", U, {"title": "x"})[0], 403)
check("AI chat", len(call("post", "/api/ai/chat", U, {"message": "Show me AI events"})[1]["data"]["events"]) > 0, True)
check("cancel promotes waitlist", call("delete", "/api/events/3/register", U)[0], 200)

# ---------------------------------------------------------------- OTP signup
new = "newuser@example.com"
check("signup: short password rejected", call("post", "/api/auth/register", j={"name": "New User", "email": new, "password": "short"})[0], 422)
check("signup: bad email rejected", call("post", "/api/auth/register", j={"name": "New User", "email": "nope", "password": "longenough1"})[0], 422)
st, d = call("post", "/api/auth/register", j={"name": "New User", "email": new, "password": "longenough1"})
check("signup step 1 -> 202 (no account yet)", st, 202)
check("signup: no token before verification", "token" in (d["data"] or {}), False)
check("signup: cannot log in before verifying", call("post", "/api/auth/login", j={"email": new, "password": "longenough1"})[0], 401)
check("signup: code emailed", bool(wait_mail("verification code", new)), True)
good = code_for(new); bad = "000000" if good != "000000" else "111111"
check("signup: wrong code rejected", call("post", "/api/auth/register/verify", j={"email": new, "code": bad})[1]["error"]["code"], "OTP_INVALID")
check("signup: resend too soon is throttled", call("post", "/api/auth/register/resend", j={"email": new})[0], 429)
st, d = call("post", "/api/auth/register/verify", j={"email": new, "code": good})
check("signup step 2 -> account + token", (st, bool(d["data"]["token"])), (201, True))
check("signup: code is single-use", call("post", "/api/auth/register/verify", j={"email": new, "code": good})[0], 400)
check("signup: can log in now", call("post", "/api/auth/login", j={"email": new, "password": "longenough1"})[0], 200)
check("signup: email now taken", call("post", "/api/auth/register", j={"name": "Dup", "email": new, "password": "longenough1"})[0], 409)
# brute force: 5 wrong guesses burn the code
brute = "brute@example.com"; call("post", "/api/auth/register", j={"name": "Brute Force", "email": brute, "password": "longenough1"}); real = code_for(brute)
for _ in range(5): call("post", "/api/auth/register/verify", j={"email": brute, "code": "999999" if real != "999999" else "888888"})
check("signup: 5 wrong guesses burn the code", call("post", "/api/auth/register/verify", j={"email": brute, "code": real})[0], 400)

# ---------------------------------------------------------------- forgot / reset password
call("post", "/api/auth/forgot", j={"email": new}); check("reset: code emailed", bool(wait_mail("verification code", new, 2)), True)
check("reset: unknown email gets the same answer", call("post", "/api/auth/forgot", j={"email": "ghost@example.com"})[0], 200)
check("reset: no email sent to unknown address", [m for m in SENT if m["to"] == "ghost@example.com"], [])
check("reset: wrong code", call("post", "/api/auth/reset", j={"email": new, "code": "123456", "password": "brandnew123"})[0] in (400, 429), True)
rc = [x for x in SENT if x["to"] == new and "verification code" in x["subject"]][-1]; rc = re.search(r"\b(\d{6})\b", rc["subject"]).group(1)
check("reset: right code changes password", call("post", "/api/auth/reset", j={"email": new, "code": rc, "password": "brandnew123"})[0], 200)
check("reset: new password works", call("post", "/api/auth/login", j={"email": new, "password": "brandnew123"})[0], 200)
check("reset: old password stops working", call("post", "/api/auth/login", j={"email": new, "password": "longenough1"})[0], 401)

# ---------------------------------------------------------------- real Razorpay only (no demo mode)
N = L(new, "brandnew123")
check("paid event blocks free register", call("post", "/api/events/2/register", N)[1]["error"]["code"], "PAYMENT_REQUIRED")
A.KEY_ID, keep = "", A.KEY_ID
check("no keys -> payments refuse (no mock)", call("post", "/api/events/2/payment/order", N)[1]["error"]["code"], "PAYMENTS_NOT_CONFIGURED")
A.KEY_ID = keep
st, d = call("post", "/api/events/2/payment/order", N); o = d["data"]
check("order created for 499 INR", (st, o["amount"], "mock" in o, o["key_id"]), (201, 49900, False, "rzp_test_dummy"))
sig = lambda oid, pid: hmac.new(b"test_secret_123", f"{oid}|{pid}".encode(), hashlib.sha256).hexdigest()
check("verify without signature rejected", call("post", "/api/payments/verify", N, {"order_id": o["order_id"], "payment_id": "pay_1"})[0], 422)
check("verify with forged signature rejected", call("post", "/api/payments/verify", N, {"order_id": o["order_id"], "payment_id": "pay_1", "signature": "f" * 64})[1]["error"]["code"], "PAYMENT_FAILED")
check("still not registered after forged payment", call("get", "/api/events/2/pass", N)[0], 404)
check("another user cannot use my order", call("post", "/api/payments/verify", U, {"order_id": o["order_id"], "payment_id": "pay_1", "signature": sig(o["order_id"], "pay_1")})[0], 404)
check("verify with real signature -> registered", call("post", "/api/payments/verify", N, {"order_id": o["order_id"], "payment_id": "pay_1", "signature": sig(o["order_id"], "pay_1")})[0], 201)
check("pass available after payment", call("get", "/api/events/2/pass", N)[0], 200)
check("verifying twice is harmless", call("post", "/api/payments/verify", N, {"order_id": o["order_id"], "payment_id": "pay_1", "signature": sig(o["order_id"], "pay_1")})[0], 201)
check("paid ticket email says ₹499", "₹499" in (wait_mail("Your ticket: Machine Learning Workshop", new)["html"] or ""), True)
# seat disappears between order and payment -> automatic refund
cap1 = call("post", "/api/events", O, {"title": "Tiny Paid Event", "category": "Workshops", "start": "2030-05-01T10:00", "capacity": 1, "price": 100})[1]["data"]["id"]
ob = call("post", f"/api/events/{cap1}/payment/order", N)[1]["data"]; oa = call("post", f"/api/events/{cap1}/payment/order", U)[1]["data"]
check("first buyer gets the last seat", call("post", "/api/payments/verify", U, {"order_id": oa["order_id"], "payment_id": "pay_A", "signature": sig(oa["order_id"], "pay_A")})[0], 201)
st, d = call("post", "/api/payments/verify", N, {"order_id": ob["order_id"], "payment_id": "pay_B", "signature": sig(ob["order_id"], "pay_B")})
check("second buyer is refunded automatically", (st, d["error"]["code"]), (409, "PAYMENT_REFUNDED"))
check("refund was requested from Razorpay", ("payments/pay_B/refund", {"amount": 10000}) in FAKE_RZP, True)
# webhook
check("webhook off without secret", call("post", "/api/payments/webhook", data=b"{}")[0], 404)
A.WEBHOOK_SECRET = "whsec_test"; ow = call("post", "/api/events/5/payment/order", U); check("(free event has no order)", ow[0], 400)
paid2 = call("post", "/api/events/4/payment/order", U)[1]["data"]
payload = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_W", "order_id": paid2["order_id"], "amount": 29900}}}}).encode()
check("webhook with bad signature rejected", c.post("/api/payments/webhook", data=payload, headers={"X-Razorpay-Signature": "bad"}).status_code, 400)
check("webhook with good signature accepted", c.post("/api/payments/webhook", data=payload, headers={"X-Razorpay-Signature": hmac.new(b"whsec_test", payload, hashlib.sha256).hexdigest()}).status_code, 200)
check("webhook registered the buyer", call("get", "/api/events/4/pass", U)[0], 200)
A.WEBHOOK_SECRET = ""

# ---------------------------------------------------------------- images
evs = call("get", "/api/events?limit=50")[1]["data"]["items"]
check("every event has an image", all(e["image"] for e in evs), True)
check("seeded event has its own banner", [e["image"] for e in evs if e["title"] == "AI Innovation Hackathon"][0], "/images/events/ai-hackathon.jpg")
mk = call("post", "/api/events", O, {"title": "No Image Event", "category": "Technology", "start": "2030-01-01T10:00", "capacity": 5})
check("create event", mk[0], 201); check("category default banner is used", mk[1]["data"]["image"], "/images/events/default-technology.jpg")
check("unknown category -> general banner", call("post", "/api/events", O, {"title": "Odd One", "category": "Zzz", "start": "2030-01-01T10:00"})[1]["data"]["image"], "/images/events/default-general.jpg")
check("bad image value rejected", call("post", "/api/events", O, {"title": "Bad Img", "category": "Technology", "start": "2030-01-01T10:00", "image": "javascript:alert(1)"})[0], 422)
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
st, d = call("post", "/api/uploads/event-image", O, data={"file": (io.BytesIO(PNG), "banner.png")}, content_type="multipart/form-data")
check("organizer can upload a PNG", st, 201); url = d["data"]["url"]
check("uploaded file is served", (c.get(url).status_code, c.get(url).data[:4]), (200, b"\x89PNG"))
check("uploads reject non-images", call("post", "/api/uploads/event-image", O, data={"file": (io.BytesIO(b"<svg onload=alert(1)>"), "x.svg")}, content_type="multipart/form-data")[0], 415)
check("users cannot upload", call("post", "/api/uploads/event-image", U, data={"file": (io.BytesIO(PNG), "a.png")}, content_type="multipart/form-data")[0], 403)
check("path traversal blocked", c.get("/uploads/..%2fapp.py").status_code in (404, 400), True)

# ---------------------------------------------------------------- editing + rosters
eid = mk[1]["data"]["id"]
st, d = call("patch", f"/api/events/{eid}", O, {"title": "Renamed Event", "image": url, "capacity": 50, "schedule": [{"title": "Welcome", "startTime": "09:30"}], "speakers": [{"name": "Dr. Test", "designation": "CTO"}]})
check("organizer can edit an event", (st, d["data"]["title"], d["data"]["image"]), (200, "Renamed Event", url))
check("schedule + speakers saved", (d["data"]["schedule"], d["data"]["speakers"][0]["designation"]), ([["09:30", "Welcome"]], "CTO"))
check("users cannot edit", call("patch", f"/api/events/{eid}", U, {"title": "Hacked"})[0], 403)
call("post", f"/api/events/{eid}/register", U); check("capacity can't drop below registrations", call("patch", f"/api/events/{eid}", O, {"capacity": 0})[0], 422)
at = call("get", f"/api/organizer/events/{eid}/attendees", O)[1]["data"]
check("attendee roster", (len(at), at[0]["email"]), (1, "demo@eventsync.dev"))
check("roster is organizer-only", call("get", f"/api/organizer/events/{eid}/attendees", U)[0], 403)
d = call("get", "/api/events/3")[1]["data"]; check("event detail has reviews list", d["reviews"], [])

# ---------------------------------------------------------------- Google sign-in (Google's server is faked)
check("google off without client id", call("post", "/api/auth/google", j={"credential": "x" * 30})[0], 501)
A.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com"
class R:
    def __init__(s, o): s.b = json.dumps(o).encode()
    def read(s, *a): return s.b
real_open = A.urllib.request.urlopen
A.urllib.request.urlopen = lambda url, timeout=0: R({"aud": "cid.apps.googleusercontent.com", "email_verified": "true", "email": "g.user@gmail.com", "sub": "123", "name": "G User"})
st, d = call("post", "/api/auth/google", j={"credential": "x" * 30}); check("google sign-in creates the account", (st, d["data"]["user"]["email"]), (200, "g.user@gmail.com"))
check("google account has no password login", call("post", "/api/auth/login", j={"email": "g.user@gmail.com", "password": ""})[0], 401)
A.urllib.request.urlopen = lambda url, timeout=0: R({"aud": "someone-elses-app", "email_verified": "true", "email": "g.user@gmail.com", "sub": "123"})
check("google token for another app rejected", call("post", "/api/auth/google", j={"credential": "x" * 30})[0], 401)
A.urllib.request.urlopen = real_open; A.GOOGLE_CLIENT_ID = ""

# ---------------------------------------------------------------- cancelling a paid ticket, drafts, photo memories, roles
import datetime as _dt
st, d = call("delete", f"/api/events/{cap1}/register", U)
check("cancelling a paid ticket refunds it", (st, ("payments/pay_A/refund", {"amount": 10000}) in FAKE_RZP, "refunded" in d["message"]), (200, True, True))
check("re-registering after a refund needs a new payment", call("post", f"/api/events/{cap1}/register", U)[1]["error"]["code"], "PAYMENT_REQUIRED")
soon = call("post", "/api/events", O, {"title": "Starts Soon", "category": "Workshops", "start": (_dt.datetime.now() + _dt.timedelta(hours=2)).isoformat(timespec="minutes"), "capacity": 5, "price": 50})[1]["data"]["id"]
os_ = call("post", f"/api/events/{soon}/payment/order", U)[1]["data"]
call("post", "/api/payments/verify", U, {"order_id": os_["order_id"], "payment_id": "pay_S", "signature": sig(os_["order_id"], "pay_S")})
st, d = call("delete", f"/api/events/{soon}/register", U)
check("late cancellation: no refund", (st, "No refund" in d["message"], ("payments/pay_S/refund", {"amount": 5000}) in FAKE_RZP), (200, True, False))
ADM = L("admin@eventsync.dev")
dr = call("post", "/api/events", O, {"title": "Secret Draft Event", "category": "Workshops", "start": "2030-06-01T10:00", "capacity": 10, "status": "DRAFT"})[1]["data"]; did = dr["id"]
check("draft is created as DRAFT", dr["status"], "DRAFT")
check("draft hidden from the public list", call("get", "/api/events?search=Secret Draft")[1]["data"]["total"], 0)
check("draft hidden from other users", call("get", f"/api/events/{did}", U)[0], 404)
check("owner can open the draft", call("get", f"/api/events/{did}", O)[0], 200)
check("nobody can register for a draft", call("post", f"/api/events/{did}/register", U)[0], 404)
check("organizer list includes drafts", any(e["id"] == did for e in call("get", "/api/organizer/events", O)[1]["data"]), True)
check("publishing a draft", call("patch", f"/api/events/{did}", O, {"status": "PUBLISHED"})[1]["data"]["status"], "PUBLISHED")
check("published event is public", call("get", "/api/events?search=Secret Draft")[1]["data"]["total"], 1)
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 30
up = lambda tok, data, eid=did: call("post", f"/api/events/{eid}/memories", tok, data=data, content_type="multipart/form-data")
st, d = up(O, {"file": (io.BytesIO(PNG), "a.png"), "caption": "Opening night"}); mid = d["data"]["id"] if st == 201 else 0
check("organizer adds an event photo", st, 201)
check("attendee cannot add event photos", up(U, {"file": (io.BytesIO(PNG), "a.png")})[0], 403)
check("non-image rejected", up(O, {"file": (io.BytesIO(b"<svg onload=alert(1)>"), "a.png")})[0], 415)
check("photo appears in the gallery", any(m["id"] == mid and m["caption"] == "Opening night" for m in call("get", "/api/memories")[1]["data"]), True)
check("photo appears on the event page", len(call("get", f"/api/events/{did}", O)[1]["data"]["memories"]), 1)
check("organizer removes the photo", call("delete", f"/api/memories/{mid}", O)[0], 200)
nid = call("get", "/api/me", N)[1]["data"]["id"]
check("user cannot change roles", call("patch", f"/api/admin/users/{nid}/role", U, {"role": "ADMIN"})[0], 403)
check("admin cannot change own role", call("patch", f"/api/admin/users/{call('get', '/api/me', ADM)[1]['data']['id']}/role", ADM, {"role": "USER"})[0], 403)
check("bad role rejected", call("patch", f"/api/admin/users/{nid}/role", ADM, {"role": "ROOT"})[0], 422)
check("new user cannot host before promotion", call("post", "/api/events", N, {"title": "Nope Event", "category": "Workshops", "start": "2030-07-01T10:00"})[0], 403)
check("admin promotes user to organizer", call("patch", f"/api/admin/users/{nid}/role", ADM, {"role": "ORGANIZER"})[0], 200)
check("promoted user can host", call("post", "/api/events", N, {"title": "My First Event", "category": "Workshops", "start": "2030-07-01T10:00"})[0], 201)

check("health", call("get", "/api/health")[1]["data"]["status"], "up")

# ---------------------------------------------------------------- automatic database upgrade (the "Unknown column users.role" bug)
with tempfile.TemporaryDirectory() as tmp:
    legacy = os.path.join(tmp, "old.db"); cx = sqlite3.connect(legacy)
    cx.executescript("""CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(120), email VARCHAR(200) UNIQUE, password_hash VARCHAR(255), interests TEXT, is_admin BOOLEAN, created_at DATETIME);
                        INSERT INTO users (name, email, password_hash, interests, is_admin, created_at) VALUES ('Old User', 'old@example.com', 'x$y', '', 0, '2025-01-01 00:00:00');""")
    cx.commit(); cx.close()
    code = "import app as A\nfrom sqlalchemy import inspect\ni = inspect(A.engine)\nprint('COLS', sorted(c['name'] for c in i.get_columns('users')))\nprint('ROLE', A.SL().query(A.User).first().role)\nprint('IMG', 'image' in [c['name'] for c in i.get_columns('events')])"
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{legacy}")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, cwd=os.path.dirname(os.path.abspath(__file__)))
    check("old database is upgraded automatically", ("'role'" in out.stdout and "'google_id'" in out.stdout and "'xp'" in out.stdout and "ROLE USER" in out.stdout and "IMG True" in out.stdout), True)
    if out.returncode: print(out.stderr[-800:])

print(f"\n{sum(res)}/{len(res)} passed")
for f in ("test_tmp.db",):
    if os.path.exists(f): os.remove(f)
import shutil; shutil.rmtree("test_uploads", ignore_errors=True)
sys.exit(0 if all(res) else 1)
