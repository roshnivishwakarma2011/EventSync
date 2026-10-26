"""EventSync API (Flask). Run: python app.py  (http://localhost:8000). SQLite by default; set DATABASE_URL for MySQL."""
import os, re, secrets, hashlib, hmac, json, base64, logging, urllib.request, datetime as dt
from functools import wraps
from urllib.parse import quote
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from sqlalchemy import create_engine, inspect, text, Column, Integer, String, Text, DateTime, ForeignKey, Float, UniqueConstraint, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker, declarative_base
import jwt
import mailer

load_dotenv()
E = os.environ
log = logging.getLogger("eventsync")
DB = E.get("DATABASE_URL", "sqlite:///./eventsync.db")
SECRET = E.get("JWT_SECRET_KEY", "dev-secret-change-me")
# DB_SSL=1 is needed by hosted MySQL services such as Aiven (they only accept encrypted connections)
engine = create_engine(DB, pool_pre_ping=True, pool_recycle=280, connect_args={"check_same_thread": False} if DB.startswith("sqlite") else ({"ssl": {"check_hostname": False}} if E.get("DB_SSL", "").strip() in ("1", "true", "yes") else {}))
SL = sessionmaker(bind=engine)
Base = declarative_base()
KEY_ID, KEY_SECRET = E.get("RAZORPAY_KEY_ID", "").strip(), E.get("RAZORPAY_KEY_SECRET", "").strip()   # both required for paid events
WEBHOOK_SECRET = E.get("RAZORPAY_WEBHOOK_SECRET", "").strip()                                         # optional: Razorpay -> /api/payments/webhook
GOOGLE_CLIENT_ID = E.get("GOOGLE_CLIENT_ID", "").strip()                                              # optional: "Continue with Google"
UPLOAD_DIR = os.path.abspath(E.get("UPLOAD_DIRECTORY", "./uploads"))
OTP_TTL_MIN, OTP_MAX_TRIES, OTP_MAX_SENDS, OTP_COOLDOWN = 10, 5, 5, 30                                 # code lifetime / wrong guesses / codes per window / seconds between codes
EMAIL_RE = mailer.EMAIL_RE
POINTS = {"register": 10, "attend": 50, "feedback": 10}
LEVELS = [(0, "Explorer"), (101, "Participant"), (301, "Enthusiast"), (701, "Community Builder"), (1500, "Event Master")]
now = lambda: dt.datetime.utcnow()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True); name = Column(String(120)); email = Column(String(190), unique=True, index=True)
    password_hash = Column(String(200)); role = Column(String(20), default="USER"); google_id = Column(String(120), nullable=True)
    xp = Column(Integer, default=0); interests = Column(Text, default=""); created_at = Column(DateTime, default=now)
class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True); title = Column(String(200)); description = Column(Text, default="")
    category = Column(String(60), index=True); tags = Column(String(300), default=""); start = Column(DateTime, index=True)
    venue = Column(String(200), default=""); city = Column(String(80), default="Mumbai", index=True)
    lat = Column(Float, nullable=True); lng = Column(Float, nullable=True)
    price = Column(Integer, default=0); capacity = Column(Integer, default=100); taken = Column(Integer, default=0); status = Column(String(20), default="PUBLISHED", index=True)
    organizer_id = Column(Integer, ForeignKey("users.id")); schedule = Column(Text, default=""); speakers = Column(Text, default="")
    image = Column(String(500), default="")   # "/images/events/x.jpg" (bundled), "/uploads/x.png" (organizer upload) or an https:// URL; empty = category default
class EmailOtp(Base):
    __tablename__ = "email_otps"
    id = Column(Integer, primary_key=True); email = Column(String(190), index=True); purpose = Column(String(20)); code_hash = Column(String(64))
    payload = Column(Text, default=""); attempts = Column(Integer, default=0); sends = Column(Integer, default=0)
    expires_at = Column(DateTime); last_sent_at = Column(DateTime)
class Registration(Base):
    __tablename__ = "event_registrations"; __table_args__ = (UniqueConstraint("user_id", "event_id"),)
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id"), index=True)
    event_id = Column(Integer, ForeignKey("events.id"), index=True); qr_token = Column(String(64), unique=True)
    status = Column(String(20), default="REGISTERED"); checked_in_at = Column(DateTime, nullable=True); created_at = Column(DateTime, default=now)
class Waitlist(Base):
    __tablename__ = "event_waitlists"; __table_args__ = (UniqueConstraint("user_id", "event_id"),)
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id")); event_id = Column(Integer, ForeignKey("events.id"), index=True); created_at = Column(DateTime, default=now)
class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id"), index=True); type = Column(String(30))
    message = Column(String(300)); read = Column(Integer, default=0); created_at = Column(DateTime, default=now)
class PointTx(Base):
    __tablename__ = "point_transactions"
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id"), index=True); reason = Column(String(60)); points = Column(Integer); created_at = Column(DateTime, default=now)
class Certificate(Base):
    __tablename__ = "certificates"; __table_args__ = (UniqueConstraint("user_id", "event_id"),)
    id = Column(Integer, primary_key=True); cid = Column(String(40), unique=True); user_id = Column(Integer, ForeignKey("users.id")); event_id = Column(Integer, ForeignKey("events.id")); issued_at = Column(DateTime, default=now)
class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id"), index=True); event_id = Column(Integer, ForeignKey("events.id"), index=True)
    order_id = Column(String(80), unique=True); payment_id = Column(String(80), nullable=True); amount = Column(Integer); status = Column(String(20), default="CREATED"); created_at = Column(DateTime, default=now)
class Favorite(Base):
    __tablename__ = "event_favorites"; __table_args__ = (UniqueConstraint("user_id", "event_id"),)
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id")); event_id = Column(Integer, ForeignKey("events.id"))
class Memory(Base):
    __tablename__ = "event_memories"
    id = Column(Integer, primary_key=True); event_id = Column(Integer, ForeignKey("events.id"), index=True); user_id = Column(Integer, ForeignKey("users.id"))
    url = Column(String(500)); caption = Column(String(300), default=""); created_at = Column(DateTime, default=now)
class Feedback(Base):
    __tablename__ = "event_feedback"; __table_args__ = (UniqueConstraint("user_id", "event_id"),)
    id = Column(Integer, primary_key=True); user_id = Column(Integer, ForeignKey("users.id")); event_id = Column(Integer, ForeignKey("events.id")); rating = Column(Integer); comment = Column(Text, default="")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024   # uploads (event images) are limited to a few MB
CORS(app, origins=[E.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:5173"])
@app.after_request
def _headers(r): r.headers.setdefault("X-Content-Type-Options", "nosniff"); return r

class Err(Exception):
    def __init__(s, code, msg, status=400): s.code, s.msg, s.status = code, msg, status
def fail(code, msg, status): return jsonify({"success": False, "error": {"code": code, "message": msg}}), status
@app.errorhandler(Err)
def _e(x): return fail(x.code, x.msg, x.status)
@app.errorhandler(HTTPException)
def _h(x): return fail(x.name.upper().replace(" ", "_"), x.description, x.code)
@app.errorhandler(Exception)
def _x(x): app.logger.exception(x); return fail("SERVER_ERROR", "Something went wrong", 500)
def ok(data=None, message="OK", status=200): return jsonify({"success": True, "data": data, "message": message}), status

def S():
    if "s" not in g: g.s = SL()
    return g.s
@app.teardown_appcontext
def _close(_):
    s = g.pop("s", None)
    if s: s.close()

def hp(p, salt=None):
    salt = salt or secrets.token_hex(8)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 120000).hex()
def mk_token(u): return jwt.encode({"sub": str(u.id), "exp": now() + dt.timedelta(hours=12)}, SECRET, algorithm="HS256")
def cur_user():
    try: return S().get(User, int(jwt.decode(request.headers["Authorization"].split()[1], SECRET, algorithms=["HS256"])["sub"]))
    except Exception: return None
def route(path, methods=("GET",), auth=None):
    """auth=None public (user optional) | 'user' login required | ('ORGANIZER','ADMIN') role required"""
    def deco(fn):
        @wraps(fn)
        def w(**kw):
            g.u = cur_user()
            if auth and not g.u: raise Err("UNAUTHORIZED", "Please log in", 401)
            if isinstance(auth, tuple) and g.u.role not in auth: raise Err("FORBIDDEN", "You don't have access to this", 403)
            return fn(**kw)
        app.add_url_rule(path, fn.__name__, w, methods=list(methods)); return fn
    return deco
def body(): return request.get_json(silent=True) or {}
def val(d, k, typ=str, default=None, lo=None, hi=None):
    v = d.get(k, default)
    if v is None: raise Err("VALIDATION_ERROR", f"{k} is required", 422)
    try: v = typ(v)
    except Exception: raise Err("VALIDATION_ERROR", f"{k} is invalid", 422)
    n = len(v) if typ is str else v
    if (lo is not None and n < lo) or (hi is not None and n > hi): raise Err("VALIDATION_ERROR", f"{k} must be between {lo} and {hi}", 422)
    return v
def level(xp):
    cur = [l for l in LEVELS if xp >= l[0]][-1]; nxt = next((l for l in LEVELS if l[0] > xp), None)
    return {"level": LEVELS.index(cur) + 1, "title": cur[1], "floor": cur[0], "next": nxt[0] if nxt else None}
def pub(u): return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "xp": u.xp, "interests": [i for i in (u.interests or "").split(",") if i], **level(u.xp or 0)}
def notify(uid, typ, msg): S().add(Notification(user_id=uid, type=typ, message=msg))
def award(u, reason, pts): S().add(PointTx(user_id=u.id, reason=reason, points=pts)); u.xp += pts; notify(u.id, "ACHIEVEMENT", f"You earned {pts} XP ({reason}).")
def get_event(eid):
    e = S().get(Event, eid)
    if not e: raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    return e
KNOWN_CATEGORIES = {"technology", "business", "design", "cultural", "sports", "workshops", "hackathons", "networking"}
SEED_IMAGES = {"AI Innovation Hackathon": "ai-hackathon", "Machine Learning Workshop": "ml-workshop", "Future of Web Development": "web-workshop", "Cybersecurity Night": "cybersecurity-night",
               "Cloud Native Meetup": "cloud-conf", "Design Systems Jam": "design-meetup", "Startup Pitch Day": "startup-summit", "Mumbai Marathon Warmup": "marathon"}
def event_image(e):
    """Every event gets a picture: its own image, or a default banner for its category."""
    if e.image: return e.image
    slug = re.sub(r"[^a-z0-9]+", "-", (e.category or "").lower()).strip("-")
    return f"/images/events/default-{slug if slug in KNOWN_CATEGORIES else 'general'}.jpg"
def clean_image(v):
    v = str(v or "").strip()
    if not v: return ""
    if len(v) > 500 or not re.match(r"^(/images/events/[\w.-]+|/uploads/[0-9a-f]{24}\.\w+|https?://[^\s<>\"']+)$", v): raise Err("VALIDATION_ERROR", "image must be an uploaded image, a bundled banner or an http(s) link", 422)
    return v
def sniff_image(b):
    """File type from the first bytes (never trust the filename). SVG is deliberately not allowed."""
    if b[:8] == b"\x89PNG\r\n\x1a\n": return "png"
    if b[:3] == b"\xff\xd8\xff": return "jpg"
    if b[:6] in (b"GIF87a", b"GIF89a"): return "gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "webp"
    return None
def parse_speaker(x):
    n, _, rest = x.partition("::"); d, _, bio = rest.partition("::")
    return {"name": n.strip(), "designation": d.strip() or "Speaker", "bio": bio.strip()}
def clean_schedule(items):
    out = []
    for it in (items if isinstance(items, list) else [])[:30]:
        if not isinstance(it, dict): continue
        t = str(it.get("startTime", ""))[:5]; title = str(it.get("title", "")).replace("|", " ").strip()[:120]
        if re.fullmatch(r"\d{2}:\d{2}", t) and title: out.append(f"{t} {title}")
    return "|".join(out)
def clean_speakers(items):
    out = []
    for it in (items if isinstance(items, list) else [])[:20]:
        if not isinstance(it, dict): continue
        f = lambda k, n: str(it.get(k, "")).replace("|", " ").replace("::", " ").strip()[:n]
        if f("name", 80): out.append("::".join([f("name", 80), f("designation", 80), f("bio", 200)]).rstrip(":"))
    return "|".join(out)
def ev(e, u=None):
    s = S(); avg, cnt = s.query(func.avg(Feedback.rating), func.count(Feedback.id)).filter(Feedback.event_id == e.id).one(); org = s.get(User, e.organizer_id) if e.organizer_id else None
    d = {"id": e.id, "title": e.title, "description": e.description or "", "category": e.category, "tags": e.tags or "", "start": e.start.isoformat(), "venue": e.venue or "", "city": e.city or "",
         "lat": e.lat, "lng": e.lng, "price": e.price or 0, "capacity": e.capacity, "attending": e.taken or 0, "full": (e.taken or 0) >= e.capacity, "status": e.status, "image": event_image(e),
         "organizer": org.name if org else "EventSync Organizer", "avg_rating": round(float(avg), 1) if avg else None, "rating_count": cnt,
         "schedule": [x.split(" ", 1) for x in (e.schedule or "").split("|") if x], "speakers": [parse_speaker(x) for x in (e.speakers or "").split("|") if x.strip()]}
    if u:
        r = s.query(Registration).filter_by(user_id=u.id, event_id=e.id).first(); w = s.query(Waitlist).filter_by(user_id=u.id, event_id=e.id).first()
        d["registered"] = bool(r and r.status != "CANCELLED"); d["checked_in"] = bool(r and r.status == "CHECKED_IN")
        d["waitlist_position"] = s.query(Waitlist).filter(Waitlist.event_id == e.id, Waitlist.id <= w.id).count() if w else None
    return d

# ---------- auth / users ----------
def otp_hash(email, code): return hmac.new(SECRET.encode(), f"{email}|{code}".encode(), hashlib.sha256).hexdigest()
def issue_otp(email, purpose, payload=""):
    """Create (or refresh) the single pending 6-digit code for this email + purpose and return it. Only a keyed hash of the code is stored."""
    s = S(); row = s.query(EmailOtp).filter_by(email=email, purpose=purpose).first(); t = now()
    if row and row.last_sent_at:
        wait = OTP_COOLDOWN - (t - row.last_sent_at).total_seconds()
        if wait > 0: raise Err("OTP_COOLDOWN", f"Please wait {int(wait) + 1} seconds before asking for another code.", 429)
        if row.expires_at and row.expires_at > t and (row.sends or 0) >= OTP_MAX_SENDS: raise Err("OTP_LIMIT", "Too many codes requested. Please try again in a few minutes.", 429)
    if not row: row = EmailOtp(email=email, purpose=purpose, sends=0); s.add(row)
    if not row.expires_at or row.expires_at <= t: row.sends = 0           # a new window starts once the previous code expired
    code = f"{secrets.randbelow(10 ** 6):06d}"
    row.code_hash, row.payload, row.attempts, row.sends = otp_hash(email, code), payload, 0, (row.sends or 0) + 1
    row.last_sent_at, row.expires_at = t, t + dt.timedelta(minutes=OTP_TTL_MIN); s.commit()
    return code
def check_otp(email, purpose, code):
    """Validate a code. Returns the stored payload and consumes the code. 5 wrong guesses burn it."""
    s = S(); row = s.query(EmailOtp).filter_by(email=email, purpose=purpose).first(); code = re.sub(r"\D", "", str(code))
    if not row or not row.expires_at or row.expires_at <= now():
        if row: s.delete(row); s.commit()
        raise Err("OTP_EXPIRED", "That code has expired. Please request a new one.", 400)
    if (row.attempts or 0) >= OTP_MAX_TRIES: s.delete(row); s.commit(); raise Err("OTP_LOCKED", "Too many wrong attempts. Please request a new code.", 429)
    if not hmac.compare_digest(row.code_hash or "", otp_hash(email, code)):
        row.attempts = (row.attempts or 0) + 1; left = OTP_MAX_TRIES - row.attempts
        if left <= 0: s.delete(row)
        s.commit(); raise Err("OTP_INVALID", f"That code is not right. {left} attempt{'s' if left != 1 else ''} left." if left > 0 else "Too many wrong attempts. Please request a new code.", 400)
    payload = row.payload or ""; s.delete(row); s.commit(); return payload
def send_code(email, name, code, purpose):
    if not mailer.send_otp(email, name, code, OTP_TTL_MIN, purpose):
        S().query(EmailOtp).filter_by(email=email, purpose=purpose).delete(); S().commit()
        raise Err("EMAIL_FAILED", "We couldn't send the verification email. Check the address and try again in a moment.", 502)
def otp_info(email): return {"email": email, "expires_in": OTP_TTL_MIN * 60, "resend_in": OTP_COOLDOWN}
@route("/api/auth/register", ["POST"])
def register():
    """Step 1 of signup: validate, then email a 6-digit code. The account is only created in step 2 (/register/verify)."""
    b = body(); name = val(b, "name", str, None, 2, 120).strip(); email = val(b, "email", str, None, 5, 190).strip().lower(); pw = val(b, "password", str, None, 8, 100)
    if not EMAIL_RE.match(email): raise Err("VALIDATION_ERROR", "Enter a valid email address", 422)
    if S().query(User).filter_by(email=email).first(): raise Err("EMAIL_EXISTS", "Email already exists", 409)
    code = issue_otp(email, "signup", json.dumps({"name": name, "password_hash": hp(pw)})); send_code(email, name, code, "signup")
    return ok(otp_info(email), "We emailed you a 6-digit code", 202)
@route("/api/auth/register/resend", ["POST"])
def register_resend():
    email = val(body(), "email", str, None, 5, 190).strip().lower(); row = S().query(EmailOtp).filter_by(email=email, purpose="signup").first()
    if not row: raise Err("OTP_EXPIRED", "Your signup session expired. Please start again.", 400)
    name = json.loads(row.payload or "{}").get("name", ""); code = issue_otp(email, "signup", row.payload); send_code(email, name, code, "signup")
    return ok(otp_info(email), "New code sent")
@route("/api/auth/register/verify", ["POST"])
def register_verify():
    """Step 2 of signup: the right code creates the account and signs the user in."""
    b = body(); email = val(b, "email", str, None, 5, 190).strip().lower(); code = val(b, "code", str, None, 4, 12)
    p = json.loads(check_otp(email, "signup", code) or "{}"); s = S()
    if not p.get("password_hash") or s.query(User).filter_by(email=email).first(): raise Err("EMAIL_EXISTS", "Email already exists", 409)
    u = User(name=p["name"], email=email, password_hash=p["password_hash"], role="USER", xp=0, interests=""); s.add(u)
    try: s.commit()
    except IntegrityError: s.rollback(); raise Err("EMAIL_EXISTS", "Email already exists", 409)
    return ok({"token": mk_token(u), "user": pub(u)}, "Account created", 201)
@route("/api/auth/forgot", ["POST"])
def forgot():
    """Email a reset code. Always answers the same way so nobody can probe which emails have accounts."""
    email = val(body(), "email", str, None, 5, 190).strip().lower(); u = S().query(User).filter_by(email=email).first()
    if u and u.password_hash:
        try: send_code(email, u.name, issue_otp(email, "reset"), "reset")
        except Err as x:
            if x.code == "EMAIL_FAILED": raise
    return ok(otp_info(email), "If that email has an account, we sent a 6-digit code")
@route("/api/auth/reset", ["POST"])
def reset_password():
    b = body(); email = val(b, "email", str, None, 5, 190).strip().lower(); code = val(b, "code", str, None, 4, 12); pw = val(b, "password", str, None, 8, 100)
    check_otp(email, "reset", code); u = S().query(User).filter_by(email=email).first()
    if not u: raise Err("OTP_EXPIRED", "That code has expired. Please request a new one.", 400)
    u.password_hash = hp(pw); S().commit(); return ok(None, "Password updated. You can sign in now.")
@route("/api/auth/google", ["POST"])
def google_login():
    """Verifies a Google Identity Services ID token with Google, then signs the user in (creating the account on first use)."""
    if not GOOGLE_CLIENT_ID: raise Err("GOOGLE_UNAVAILABLE", "Google sign-in isn't set up on this server.", 501)
    cred = val(body(), "credential", str, None, 20, 5000)
    try: info = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/tokeninfo?id_token=" + quote(cred, safe=""), timeout=10))
    except Exception: raise Err("GOOGLE_FAILED", "Google sign-in failed. Please try again.", 401)
    if info.get("aud") != GOOGLE_CLIENT_ID or str(info.get("email_verified")).lower() != "true" or not info.get("email") or not info.get("sub"): raise Err("GOOGLE_FAILED", "Google sign-in failed. Please try again.", 401)
    email, sub, s = str(info["email"]).lower(), str(info["sub"]), S()
    u = s.query(User).filter_by(google_id=sub).first() or s.query(User).filter_by(email=email).first()
    if not u: u = User(name=str(info.get("name") or email.split("@")[0])[:120], email=email, password_hash="", google_id=sub, role="USER", xp=0, interests=""); s.add(u)
    elif not u.google_id: u.google_id = sub
    s.commit(); return ok({"token": mk_token(u), "user": pub(u)}, "Signed in with Google")
@route("/api/auth/login", ["POST"])
def login():
    b = body(); u = S().query(User).filter_by(email=str(b.get("email", "")).lower()).first(); pw = str(b.get("password", ""))
    if not u or not u.password_hash or not secrets.compare_digest(hp(pw, u.password_hash.split("$")[0]), u.password_hash): raise Err("INVALID_CREDENTIALS", "Invalid credentials", 401)
    return ok({"token": mk_token(u), "user": pub(u)})
@route("/api/me", auth="user")
def me(): return ok(pub(g.u))
@route("/api/interests")
def interests(): return ok(["AI", "Machine Learning", "Web Development", "Cybersecurity", "Cloud", "Design", "Business", "Gaming", "Robotics", "Startups", "Sports", "Music", "Photography"])
@route("/api/users/interests", ["PUT", "POST"], auth="user")
def set_interests():
    l = body().get("interests")
    if not isinstance(l, list): raise Err("VALIDATION_ERROR", "interests must be a list", 422)
    g.u.interests = ",".join(str(i).strip()[:40] for i in l[:20]); S().commit(); return ok(pub(g.u), "Interests updated")

# ---------- events ----------
@route("/api/events")
def events():
    a = request.args; s = S()
    try: limit = min(max(int(a.get("limit", 12)), 1), 100); page = max(int(a.get("page", 1)), 1)
    except ValueError: raise Err("VALIDATION_ERROR", "page and limit must be numbers", 422)
    q = s.query(Event).filter(Event.status.in_(["PUBLISHED", "FULL", "LIVE"])); sr = a.get("search", "")
    if sr: q = q.filter(Event.title.ilike(f"%{sr}%") | Event.tags.ilike(f"%{sr}%") | Event.description.ilike(f"%{sr}%"))
    if a.get("category"): q = q.filter(Event.category == a["category"])
    if a.get("city"): q = q.filter(Event.city == a["city"])
    q = q.order_by({"upcoming": Event.start.asc(), "recent": Event.id.desc()}.get(a.get("sort", "trending"), Event.taken.desc()))
    total = q.count()
    return ok({"items": [ev(e, g.u) for e in q.offset((page - 1) * limit).limit(limit).all()], "total": total, "page": page, "pages": -(-total // limit)})
@route("/api/events/<int:eid>")
def event(eid):
    e = get_event(eid); s = S()
    if e.status in ("DRAFT", "PENDING_REVIEW", "REJECTED") and not (g.u and (g.u.role == "ADMIN" or e.organizer_id == g.u.id)): raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    d = ev(e, g.u)
    d["memories"] = [{"id": m.id, "url": m.url, "caption": m.caption or ""} for m in s.query(Memory).filter_by(event_id=eid).order_by(Memory.id.desc()).limit(30)]
    d["reviews"] = [{"id": f.id, "rating": f.rating, "comment": f.comment or "", "user": u.name if u else "Attendee"} for f, u in s.query(Feedback, User).outerjoin(User, User.id == Feedback.user_id).filter(Feedback.event_id == eid).order_by(Feedback.id.desc()).limit(20).all()]
    mine = s.query(Feedback).filter_by(user_id=g.u.id, event_id=eid).first() if g.u else None
    d["my_review"] = {"id": mine.id, "rating": mine.rating, "comment": mine.comment or ""} if mine else None
    d["waitlist_size"] = s.query(func.count(Waitlist.id)).filter_by(event_id=eid).scalar()
    return ok(d)
def parse_start(v):
    try: return dt.datetime.fromisoformat(str(v).replace("Z", ""))
    except ValueError: raise Err("VALIDATION_ERROR", "start must be a valid date", 422)
@route("/api/events", ["POST"], auth=("ORGANIZER", "ADMIN"))
def create_event():
    b = body(); start = parse_start(b.get("start"))
    e = Event(title=val(b, "title", str, None, 3, 200), description=str(b.get("description", ""))[:5000], category=val(b, "category", str, None, 1, 60), start=start, venue=str(b.get("venue", ""))[:200],
              capacity=val(b, "capacity", int, 100, 1, 100000), price=val(b, "price", int, 0, 0, 1000000), tags=str(b.get("tags", ""))[:300], city=str(b.get("city", "") or "Mumbai")[:80], organizer_id=g.u.id,
              schedule=clean_schedule(b.get("schedule")) or "10:00 Registration|10:30 Opening|11:00 Keynote|12:00 Workshop", speakers=clean_speakers(b.get("speakers")), image=clean_image(b.get("image")),
              status=("DRAFT" if str(b.get("status", "")).upper() == "DRAFT" else ("PUBLISHED" if g.u.role == "ADMIN" else "PENDING_REVIEW")))
    S().add(e); S().commit()
    if e.status == "PENDING_REVIEW":
        for admin_user in S().query(User).filter_by(role="ADMIN").all():
            notify(admin_user.id, "EVENT_REVIEW", f"New event submitted for approval: {e.title}")
    return ok(ev(e, g.u), "Event submitted for admin approval" if e.status == "PENDING_REVIEW" else "Event created successfully", 201)
@route("/api/events/<int:eid>", ["PATCH"], auth=("ORGANIZER", "ADMIN"))
def update_event(eid):
    e = get_event(eid); b = body(); s = S()
    if g.u.role != "ADMIN" and e.organizer_id != g.u.id: raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    if e.status == "CANCELLED": raise Err("EVENT_CANCELLED", "A cancelled event can't be edited", 409)
    old = (e.start, e.venue, e.city)
    if "title" in b: e.title = val(b, "title", str, None, 3, 200)
    if "description" in b: e.description = str(b["description"])[:5000]
    if "category" in b: e.category = val(b, "category", str, None, 1, 60)
    if "start" in b: e.start = parse_start(b["start"])
    if "venue" in b: e.venue = str(b["venue"])[:200]
    if "city" in b: e.city = str(b["city"] or "Mumbai")[:80]
    if "tags" in b: e.tags = str(b["tags"])[:300]
    if "price" in b: e.price = val(b, "price", int, 0, 0, 1000000)
    if "capacity" in b:
        e.capacity = val(b, "capacity", int, 100, 1, 100000)
        if e.capacity < e.taken: raise Err("VALIDATION_ERROR", f"{e.taken} people are already registered, capacity can't go below that", 422)
    if "image" in b: e.image = clean_image(b["image"])
    new_status = str(b.get("status", "")).upper()
    if new_status in ("DRAFT", "PUBLISHED") and e.status in ("DRAFT", "PUBLISHED") and new_status != e.status:
        if new_status == "DRAFT" and (e.taken or 0) > 0: raise Err("VALIDATION_ERROR", "This event already has registrations, so it can't go back to draft", 422)
        e.status = new_status
    if "schedule" in b: e.schedule = clean_schedule(b["schedule"])
    if "speakers" in b: e.speakers = clean_speakers(b["speakers"])
    if e.status != "DRAFT" and old != (e.start, e.venue, e.city):
        for r in s.query(Registration).filter(Registration.event_id == eid, Registration.status != "CANCELLED").all(): notify(r.user_id, "EVENT_UPDATE", f"{e.title}: the date or venue changed. Check the event page.")
    s.commit(); return ok(ev(e, g.u), "Event updated")
def save_image(f):
    """Validate (magic bytes, 4 MB) and store an uploaded picture. Returns its /uploads/... URL."""
    data = f.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024: raise Err("FILE_TOO_LARGE", "Image must be 4 MB or smaller", 413)
    kind = sniff_image(data)
    if not kind: raise Err("INVALID_FILE", "Please upload a PNG, JPG, WebP or GIF image", 415)
    os.makedirs(UPLOAD_DIR, exist_ok=True); name = f"{secrets.token_hex(12)}.{kind}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as out: out.write(data)
    return "/uploads/" + name
@route("/api/uploads/event-image", ["POST"], auth=("ORGANIZER", "ADMIN"))
def upload_event_image():
    f = request.files.get("file")
    if not f: raise Err("VALIDATION_ERROR", "file is required", 422)
    return ok({"url": save_image(f)}, "Uploaded", 201)
def mem(m, e, attended=False):
    return {"id": m.id, "url": m.url, "caption": m.caption or "", "created_at": (m.created_at or now()).isoformat(), "event_id": e.id, "event": e.title, "event_date": e.start.date().isoformat(), "attended": attended}
@route("/api/events/<int:eid>/memories", ["POST"], auth=("ORGANIZER", "ADMIN"))
def add_memory(eid):
    e = get_event(eid)
    if g.u.role != "ADMIN" and e.organizer_id != g.u.id: raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    f = request.files.get("file")
    if not f: raise Err("VALIDATION_ERROR", "file is required", 422)
    m = Memory(event_id=eid, user_id=g.u.id, url=save_image(f), caption=str(request.form.get("caption", "")).strip()[:300]); S().add(m); S().commit()
    return ok(mem(m, e), "Photo added", 201)
@route("/api/memories/<int:mid>", ["DELETE"], auth=("ORGANIZER", "ADMIN"))
def delete_memory(mid):
    m = S().get(Memory, mid); e = S().get(Event, m.event_id) if m else None
    if not m or (g.u.role != "ADMIN" and e.organizer_id != g.u.id): raise Err("NOT_FOUND", "Photo not found", 404)
    S().delete(m); S().commit(); return ok(None, "Photo removed")
@route("/api/memories")
def memories():
    s = S(); mine = {r.event_id for r in s.query(Registration).filter_by(user_id=g.u.id, status="CHECKED_IN")} if g.u else set()
    rows = s.query(Memory, Event).join(Event, Event.id == Memory.event_id).filter(Event.status != "DRAFT").order_by(Memory.id.desc()).limit(60).all()
    return ok([mem(m, e, e.id in mine) for m, e in rows])
@route("/uploads/<name>")
def serve_upload(name):
    if not re.fullmatch(r"[0-9a-f]{24}\.(png|jpg|gif|webp)", name): raise Err("NOT_FOUND", "Not found", 404)
    return send_from_directory(UPLOAD_DIR, name, max_age=86400)
@route("/api/events/<int:eid>", ["DELETE"], auth=("ORGANIZER", "ADMIN"))
def cancel_event(eid):
    e = get_event(eid)
    if g.u.role != "ADMIN" and e.organizer_id != g.u.id: raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    if e.status == "CANCELLED": return ok(None, "Event cancelled")
    e.status = "CANCELLED"; s = S(); refunded = 0
    for r in s.query(Registration).filter(Registration.event_id == eid, Registration.status != "CANCELLED").all():
        note = ""
        for pay in s.query(Payment).filter_by(user_id=r.user_id, event_id=eid, status="PAID").all():
            refunded += 1; note = " Your payment is being refunded." if refund_payment(pay) else " We'll refund your payment manually."
        notify(r.user_id, "EVENT_CANCELLED", f"{e.title} was cancelled." + note)
    s.commit(); return ok(None, "Event cancelled" + (f", {refunded} payment(s) refunded" if refunded else ""))

# ---------- registration / waitlist / pass / check-in ----------
def issue_ticket(u, e, r):
    """Email the QR pass + calendar invite in the background (plain values only, the thread has no database session)."""
    info = {"id": e.id, "title": e.title, "start": e.start, "venue": e.venue or "", "city": e.city or ""}
    mailer.run_in_background(mailer.send_ticket, u.email, u.name, info, f"ES-{e.start.year}-{r.id:04d}", r.qr_token, e.price or 0)
def do_register(u, eid):
    """Register user `u` for event `eid` (seat, payment and duplicate checks included) and email the ticket."""
    e = get_event(eid); s = S()
    if e.status == "DRAFT": raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    if e.status == "CANCELLED": raise Err("EVENT_CANCELLED", "This event was cancelled", 409)
    r = s.query(Registration).filter_by(user_id=u.id, event_id=eid).first()
    if r and r.status != "CANCELLED": raise Err("ALREADY_REGISTERED", "Already registered", 409)
    if e.taken >= e.capacity: raise Err("EVENT_FULL", "Event is full. Join the waitlist.", 409)
    if (e.price or 0) > 0 and not s.query(Payment).filter_by(user_id=u.id, event_id=eid, status="PAID").first(): raise Err("PAYMENT_REQUIRED", "Payment is required for this event", 402)
    if r: r.status = "REGISTERED"
    else: r = Registration(user_id=u.id, event_id=eid, qr_token=secrets.token_urlsafe(24)); s.add(r); award(u, "Registration", POINTS["register"])
    e.taken += 1; notify(u.id, "REGISTRATION", f"You're registered for {e.title}. Your pass is ready."); s.commit()
    issue_ticket(u, e, r); return r
@route("/api/events/<int:eid>/register", ["POST"], auth="user")
def reg(eid): do_register(g.u, eid); return ok(None, "Registered", 201)

# ---------- paid events: Razorpay (no demo/mock mode: without keys, paid events simply can't be bought) ----------
def razorpay(path, payload):
    req = urllib.request.Request("https://api.razorpay.com/v1/" + path, data=json.dumps(payload).encode(), headers={
        "Content-Type": "application/json", "Authorization": "Basic " + base64.b64encode(f"{KEY_ID}:{KEY_SECRET}".encode()).decode()})
    return json.load(urllib.request.urlopen(req, timeout=15))
REFUND_HOURS = 24      # cancelling at least this long before the start refunds the ticket
def refund_payment(p):
    """Refund a PAID payment through Razorpay. True = refunded. On failure it is marked REFUND_DUE so you can refund it from the Razorpay dashboard."""
    try: razorpay(f"payments/{p.payment_id}/refund", {"amount": p.amount}); p.status = "REFUNDED"; return True
    except Exception: log.exception("refund failed for payment %s: refund it from the Razorpay dashboard", p.payment_id); p.status = "REFUND_DUE"; return False
def complete_payment(u, p, pid):
    """Called only after the payment is proven (checkout signature or Razorpay webhook): mark it PAID, register the buyer, refund if the seat is gone."""
    s = S()
    if p.status in ("REFUNDED", "REFUND_DUE"): raise Err("PAYMENT_REFUNDED", "This payment is being refunded because the event had no seats left.", 409)
    if p.status != "PAID": p.status, p.payment_id = "PAID", pid; s.commit()
    try: do_register(u, p.event_id)
    except Err as x:
        if x.code == "ALREADY_REGISTERED": return                     # verifying twice is harmless
        if x.code in ("EVENT_FULL", "EVENT_CANCELLED"):
            try: razorpay(f"payments/{p.payment_id}/refund", {"amount": p.amount}); p.status = "REFUNDED"
            except Exception: log.exception("refund failed for payment %s: refund it from the Razorpay dashboard", p.payment_id); p.status = "REFUND_DUE"
            s.commit(); raise Err("PAYMENT_REFUNDED", "Sorry, this event just sold out or was cancelled. Your payment is being refunded to your original payment method.", 409)
        raise
@route("/api/events/<int:eid>/payment/order", ["POST"], auth="user")
def pay_order(eid):
    e = get_event(eid); s = S()
    if (e.price or 0) <= 0: raise Err("FREE_EVENT", "This event is free. Register directly.", 400)
    if e.status == "DRAFT": raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    if e.status == "CANCELLED": raise Err("EVENT_CANCELLED", "This event was cancelled", 409)
    r = s.query(Registration).filter_by(user_id=g.u.id, event_id=eid).first()
    if r and r.status != "CANCELLED": raise Err("ALREADY_REGISTERED", "Already registered", 409)
    if e.taken >= e.capacity: raise Err("EVENT_FULL", "Event is full. Join the waitlist.", 409)
    if not (KEY_ID and KEY_SECRET): raise Err("PAYMENTS_NOT_CONFIGURED", "Online payments aren't switched on yet. Please contact the organizer.", 503)
    amount = e.price * 100                                   # paise
    try: oid = razorpay("orders", {"amount": amount, "currency": "INR", "receipt": f"es-{e.id}-{g.u.id}-{secrets.token_hex(3)}"})["id"]
    except Exception: app.logger.exception("razorpay order failed"); raise Err("PAYMENT_GATEWAY_ERROR", "Could not start payment. Please try again.", 502)
    s.add(Payment(user_id=g.u.id, event_id=eid, order_id=oid, amount=amount)); s.commit()
    return ok({"order_id": oid, "amount": amount, "currency": "INR", "key_id": KEY_ID, "event": e.title, "name": g.u.name, "email": g.u.email}, "Order created", 201)
@route("/api/payments/verify", ["POST"], auth="user")
def pay_verify():
    b = body(); oid = val(b, "order_id", str, None, 1, 80); pid = val(b, "payment_id", str, None, 1, 80); sig = val(b, "signature", str, None, 1, 200)
    p = S().query(Payment).filter_by(order_id=oid, user_id=g.u.id).first()
    if not p: raise Err("ORDER_NOT_FOUND", "Payment order not found", 404)
    if not (KEY_ID and KEY_SECRET): raise Err("PAYMENTS_NOT_CONFIGURED", "Online payments aren't switched on yet.", 503)
    good = hmac.new(KEY_SECRET.encode(), f"{oid}|{pid}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(good, sig): raise Err("PAYMENT_FAILED", "Payment verification failed", 400)
    complete_payment(g.u, p, pid); return ok(None, "Registered", 201)
@route("/api/payments/webhook", ["POST"])
def pay_webhook():
    """Optional safety net: if a buyer closes the tab right after paying, Razorpay calls this and we still register them.
    Needs RAZORPAY_WEBHOOK_SECRET and a public URL (set it in Razorpay Dashboard -> Webhooks -> payment.captured)."""
    if not WEBHOOK_SECRET: raise Err("NOT_FOUND", "Not found", 404)
    raw = request.get_data(); good = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(good, request.headers.get("X-Razorpay-Signature", "")): raise Err("BAD_SIGNATURE", "Invalid signature", 400)
    try: data = json.loads(raw or b"{}")
    except ValueError: data = {}
    if data.get("event") in ("payment.captured", "order.paid"):
        ent = ((data.get("payload") or {}).get("payment") or {}).get("entity") or {}; s = S()
        p = s.query(Payment).filter_by(order_id=ent.get("order_id")).first()
        if p and ent.get("id") and ent.get("amount") == p.amount:
            try: complete_payment(s.get(User, p.user_id), p, ent["id"])
            except Err: pass
    return ok(None)

@route("/api/events/<int:eid>/register", ["DELETE"], auth="user")
def cancel(eid):
    s = S(); e = get_event(eid); r = s.query(Registration).filter_by(user_id=g.u.id, event_id=eid).first()
    if not r or r.status != "REGISTERED": raise Err("REGISTRATION_NOT_FOUND", "Registration not found", 404)
    r.status = "CANCELLED"; e.taken -= 1; refund_note = ""
    if (e.price or 0) > 0:
        pay = s.query(Payment).filter_by(user_id=g.u.id, event_id=eid, status="PAID").order_by(Payment.id.desc()).first()
        if pay:
            if e.start - now() >= dt.timedelta(hours=REFUND_HOURS):
                refund_note = " Your payment is being refunded to your original payment method (5-7 working days)." if refund_payment(pay) else " We'll refund your payment manually, it can take a couple of days."
            else: pay.status = "NO_REFUND"; refund_note = f" No refund, because the event starts in less than {REFUND_HOURS} hours."
            notify(g.u.id, "REGISTRATION", f"Your ticket for {e.title} was cancelled.{refund_note}")
    w = s.query(Waitlist).filter_by(event_id=eid).order_by(Waitlist.id).first(); promoted = None
    if w:
        promoted = s.query(Registration).filter_by(user_id=w.user_id, event_id=eid).first()
        if promoted: promoted.status = "REGISTERED"
        else: promoted = Registration(user_id=w.user_id, event_id=eid, qr_token=secrets.token_urlsafe(24)); s.add(promoted)
        e.taken += 1; notify(w.user_id, "WAITLIST", f"A seat opened. You're in for {e.title}!"); s.delete(w)
    s.commit()
    if promoted: issue_ticket(s.get(User, promoted.user_id), e, promoted)
    return ok(None, "Registration cancelled." + refund_note)
@route("/api/events/<int:eid>/waitlist", ["POST"], auth="user")
def join_wait(eid):
    e = get_event(eid); s = S()
    if e.taken < e.capacity: raise Err("WAITLIST_UNAVAILABLE", "Seats are available. Register instead.", 409)
    if s.query(Waitlist).filter_by(user_id=g.u.id, event_id=eid).first(): raise Err("ALREADY_WAITLISTED", "Already on the waitlist", 409)
    w = Waitlist(user_id=g.u.id, event_id=eid); s.add(w); s.commit()
    return ok({"position": s.query(Waitlist).filter(Waitlist.event_id == eid, Waitlist.id <= w.id).count()}, "Added to waitlist", 201)
@route("/api/events/<int:eid>/waitlist", ["DELETE"], auth="user")
def leave_wait(eid): S().query(Waitlist).filter_by(user_id=g.u.id, event_id=eid).delete(); S().commit(); return ok(None, "Removed from waitlist")
@route("/api/events/<int:eid>/pass", auth="user")
def get_pass(eid):
    e = get_event(eid); r = S().query(Registration).filter_by(user_id=g.u.id, event_id=eid).first()
    if not r or r.status == "CANCELLED": raise Err("REGISTRATION_NOT_FOUND", "Register first to get a pass", 404)
    return ok({"qr_token": r.qr_token, "registration_id": f"ES-{e.start.year}-{r.id:04d}", "participant": g.u.name, "event": e.title, "start": e.start.isoformat(), "venue": e.venue, "status": r.status})
@route("/api/checkin", ["POST"], auth=("ORGANIZER", "ADMIN"))
def checkin():
    s = S(); r = s.query(Registration).filter_by(qr_token=str(body().get("qr_token", ""))).first()
    if not r or r.status == "CANCELLED": raise Err("INVALID_PASS", "Invalid pass", 404)
    e = s.get(Event, r.event_id)
    if g.u.role != "ADMIN" and e.organizer_id != g.u.id: raise Err("WRONG_EVENT", "This pass is for another organizer's event", 403)
    if r.status == "CHECKED_IN": raise Err("ALREADY_CHECKED_IN", "Already checked in", 409)
    r.status, r.checked_in_at = "CHECKED_IN", now(); a = s.get(User, r.user_id); award(a, "Attendance", POINTS["attend"])
    if not s.query(Certificate).filter_by(user_id=a.id, event_id=e.id).first():
        s.add(Certificate(cid=f"CERT-{secrets.token_hex(5).upper()}", user_id=a.id, event_id=e.id)); notify(a.id, "CERTIFICATE", f"Your certificate for {e.title} is available.")
    notify(a.id, "CHECKIN", f"Checked in to {e.title}."); s.commit()
    return ok({"participant": a.name, "event": e.title}, "Checked in")

# ---------- discovery / gamification / notifications / certificates ----------
def recommend(u):
    s = S(); mine = [i.lower() for i in u.interests.split(",") if i]; fav = {f.event_id for f in s.query(Favorite).filter_by(user_id=u.id)}
    reg = {r.event_id for r in s.query(Registration).filter_by(user_id=u.id)}; out = []
    for e in s.query(Event).filter(Event.status.in_(["PUBLISHED", "FULL"]), Event.start >= now()).limit(200):
        if e.id in reg: continue
        text = f"{e.category} {e.tags} {e.title}".lower(); hit = [i for i in mine if i in text]
        score = 3 * len(hit) + (2 if e.id in fav else 0) + e.taken / max(e.capacity, 1) + max(0, 1 - (e.start - now()).days / 60)
        d = ev(e, u); d["reason"] = f"Because you like {hit[0]}" if hit else "Trending"; out.append((score, d))
    return [d for _, d in sorted(out, key=lambda x: -x[0])[:6]]
@route("/api/recommendations", auth="user")
def recs(): return ok(recommend(g.u))
@route("/api/events/<int:eid>/favorite", ["POST"], auth="user")
def fav(eid):
    get_event(eid)
    if not S().query(Favorite).filter_by(user_id=g.u.id, event_id=eid).first(): S().add(Favorite(user_id=g.u.id, event_id=eid)); S().commit()
    return ok(None, "Saved")
@route("/api/events/<int:eid>/favorite", ["DELETE"], auth="user")
def unfav(eid): S().query(Favorite).filter_by(user_id=g.u.id, event_id=eid).delete(); S().commit(); return ok(None, "Removed")
@route("/api/users/favorites", auth="user")
def favs(): return ok([ev(S().get(Event, f.event_id), g.u) for f in S().query(Favorite).filter_by(user_id=g.u.id)])
@route("/api/leaderboard")
def board(): return ok([{"rank": i + 1, "id": x.id, "name": x.name, "xp": x.xp or 0, "title": level(x.xp or 0)["title"]} for i, x in enumerate(S().query(User).order_by(User.xp.desc()).limit(10))])
@route("/api/notifications", auth="user")
def notes(): return ok([{"id": n.id, "type": n.type, "message": n.message, "read": bool(n.read), "created_at": n.created_at.isoformat()} for n in S().query(Notification).filter_by(user_id=g.u.id).order_by(Notification.id.desc()).limit(30)])
@route("/api/notifications/read-all", ["PATCH"], auth="user")
def read_all(): S().query(Notification).filter_by(user_id=g.u.id).update({"read": 1}); S().commit(); return ok(None, "All read")
@route("/api/notifications/<int:nid>/read", ["PATCH"], auth="user")
def read_one(nid): S().query(Notification).filter_by(user_id=g.u.id, id=nid).update({"read": 1}); S().commit(); return ok(None, "Read")
@route("/api/certificates", auth="user")
def my_certs():
    s = S(); out = []
    for c in s.query(Certificate).filter_by(user_id=g.u.id).order_by(Certificate.id.desc()):
        e = s.get(Event, c.event_id); org = s.get(User, e.organizer_id) if e.organizer_id else None
        out.append({"id": c.cid, "event": e.title, "event_id": e.id, "date": e.start.date().isoformat(), "issued": c.issued_at.date().isoformat(), "participant": g.u.name, "organizer": org.name if org else "EventSync"})
    return ok(out)
@route("/api/certificates/verify/<cid>")
def verify(cid):
    s = S(); c = s.query(Certificate).filter_by(cid=cid).first()
    if not c: return ok({"valid": False})
    e = s.get(Event, c.event_id)
    return ok({"valid": True, "participant": s.get(User, c.user_id).name, "event": e.title, "date": e.start.date().isoformat(), "organizer": (s.get(User, e.organizer_id).name if e.organizer_id else "EventSync")})
@route("/api/events/<int:eid>/feedback", ["POST"], auth="user")
def feedback(eid):
    b = body(); s = S(); rating = val(b, "rating", int, None, 1, 5)
    if not s.query(Registration).filter_by(user_id=g.u.id, event_id=eid, status="CHECKED_IN").first(): raise Err("NOT_ATTENDED", "Only attendees can leave feedback", 403)
    if s.query(Feedback).filter_by(user_id=g.u.id, event_id=eid).first(): raise Err("ALREADY_REVIEWED", "Feedback already submitted", 409)
    s.add(Feedback(user_id=g.u.id, event_id=eid, rating=rating, comment=str(b.get("comment", ""))[:1000])); award(g.u, "Feedback", POINTS["feedback"]); s.commit()
    return ok(None, "Thanks for your feedback", 201)

# ---------- AI assistant (rule-based over real data) ----------
@route("/api/ai/chat", ["POST"])
def chat():
    m = val(body(), "message", str, None, 1, 500).lower(); u = g.u
    q = S().query(Event).filter(Event.status.in_(["PUBLISHED", "FULL"]), Event.start >= now())
    if ("interest" in m or "attend" in m or "should i" in m) and u: return ok({"reply": "Here are your best matches:", "events": recommend(u)[:4]})
    if "weekend" in m:
        a = (now() + dt.timedelta(days=(5 - now().weekday()) % 7)).replace(hour=0, minute=0); q = q.filter(Event.start >= a, Event.start < a + dt.timedelta(days=3))
    if "full" in m: q = q.filter(Event.taken >= Event.capacity * 0.8)
    for k in ["ai", "web", "cyber", "cloud", "design", "business", "gaming", "robotics", "startup", "music"]:
        if f" {k}" in f" {m}": q = q.filter(Event.tags.ilike(f"%{k}%") | Event.category.ilike(f"%{k}%") | Event.title.ilike(f"%{k}%")); break
    found = q.order_by(Event.start).limit(4).all()
    return ok({"reply": f"I found {len(found)} event(s) for you:" if found else "I couldn't find a match. Try another topic or date.", "events": [ev(e, u) for e in found]})

# ---------- analytics ----------
@route("/api/organizer/events", auth=("ORGANIZER", "ADMIN"))
def organizer_events():
    """All of this organizer's events, drafts and cancelled ones included (admins see everything)."""
    q = S().query(Event)
    if g.u.role != "ADMIN": q = q.filter(Event.organizer_id == g.u.id)
    return ok([ev(e, g.u) for e in q.order_by(Event.start.desc()).limit(200).all()])
@route("/api/organizer/events/<int:eid>/analytics", auth=("ORGANIZER", "ADMIN"))
def org_analytics(eid):
    e = get_event(eid); s = S()
    if g.u.role != "ADMIN" and e.organizer_id != g.u.id: raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    regs = s.query(func.count(Registration.id)).filter(Registration.event_id == eid, Registration.status != "CANCELLED").scalar()
    att = s.query(func.count(Registration.id)).filter_by(event_id=eid, status="CHECKED_IN").scalar(); avg = s.query(func.avg(Feedback.rating)).filter_by(event_id=eid).scalar()
    days = [(now() - dt.timedelta(days=29 - i)).date() for i in range(30)]; per_day = {d: 0 for d in days}
    for (t,) in s.query(Registration.created_at).filter(Registration.event_id == eid, Registration.created_at >= now() - dt.timedelta(days=30)):
        if t and t.date() in per_day: per_day[t.date()] += 1
    dist = dict(s.query(Feedback.rating, func.count(Feedback.id)).filter_by(event_id=eid).group_by(Feedback.rating).all())
    return ok({"registrations": regs, "attendance": att, "checkin_pct": round(100 * att / regs) if regs else 0, "capacity_usage": round(100 * regs / e.capacity),
               "waitlist": s.query(func.count(Waitlist.id)).filter_by(event_id=eid).scalar(), "avg_rating": round(float(avg), 1) if avg else None,
               "feedback_count": s.query(func.count(Feedback.id)).filter_by(event_id=eid).scalar(), "xp_earned": att * POINTS["attend"] + regs * POINTS["register"],
               "cancellations": s.query(func.count(Registration.id)).filter_by(event_id=eid, status="CANCELLED").scalar(),
               "series": [{"day": d.isoformat(), "registrations": n} for d, n in per_day.items()], "rating_distribution": [{"rating": r, "count": dist.get(r, 0)} for r in (5, 4, 3, 2, 1)]})
@route("/api/organizer/events/<int:eid>/attendees", auth=("ORGANIZER", "ADMIN"))
def org_attendees(eid):
    e = get_event(eid)
    if g.u.role != "ADMIN" and e.organizer_id != g.u.id: raise Err("EVENT_NOT_FOUND", "Event not found", 404)
    rows = S().query(Registration, User).join(User, User.id == Registration.user_id).filter(Registration.event_id == eid).order_by(Registration.id.desc()).limit(1000).all()
    return ok([{"registration_id": f"ES-{e.start.year}-{r.id:04d}", "name": u.name, "email": u.email, "status": r.status, "registered_at": (r.created_at or now()).isoformat(),
                "checked_in_at": r.checked_in_at.isoformat() if r.checked_in_at else None} for r, u in rows])
@route("/api/admin/events/pending", auth=("ADMIN",))
def admin_pending_events():
    rows = S().query(Event).filter(Event.status == "PENDING_REVIEW").order_by(Event.id.asc()).all()
    return ok([ev(e, g.u) for e in rows])

@route("/api/admin/events/<int:eid>/decision", ["PATCH"], auth=("ADMIN",))
def admin_event_decision(eid):
    e = get_event(eid); b = body()
    action = str(b.get("action", "")).strip().lower()
    if e.status != "PENDING_REVIEW":
        raise Err("INVALID_EVENT_STATE", "Only events awaiting review can be accepted or rejected", 409)
    if action == "accept":
        e.status = "PUBLISHED"
        notify(e.organizer_id, "EVENT_APPROVED", f"Your event \"{e.title}\" has been approved and is now public.")
        message = "Event approved and published"
    elif action == "reject":
        e.status = "REJECTED"
        reason = str(b.get("reason", "")).strip()[:300]
        suffix = f" Reason: {reason}" if reason else ""
        notify(e.organizer_id, "EVENT_REJECTED", f"Your event \"{e.title}\" was rejected.{suffix}")
        message = "Event rejected"
    else:
        raise Err("VALIDATION_ERROR", "action must be accept or reject", 422)
    S().commit()
    return ok(ev(e, g.u), message)

@route("/api/admin/analytics", auth=("ADMIN",))
def admin_analytics():
    s = S(); c = lambda m, *f: s.query(func.count(m.id)).filter(*f).scalar(); avg = s.query(func.avg(Feedback.rating)).scalar()
    days = [(now() - dt.timedelta(days=29 - i)).date() for i in range(30)]; per_day = {d: 0 for d in days}
    for (t,) in s.query(Registration.created_at).filter(Registration.created_at >= now() - dt.timedelta(days=30)):
        if t and t.date() in per_day: per_day[t.date()] += 1
    return ok({"users": c(User), "events": c(Event), "active": c(Event, Event.status.in_(["PUBLISHED", "LIVE", "FULL"])), "completed": c(Event, Event.status == "COMPLETED"),
               "registrations": c(Registration), "attendance": c(Registration, Registration.status == "CHECKED_IN"), "avg_rating": round(float(avg), 1) if avg else None,
               "popular_categories": [{"category": k, "count": n} for k, n in s.query(Event.category, func.count(Event.id)).group_by(Event.category).order_by(func.count(Event.id).desc()).limit(5)],
               "registration_trend": [{"day": d.isoformat(), "registrations": n} for d, n in per_day.items()], "recent_users": [{"id": u.id, "name": u.name, "email": u.email, "role": u.role, "joined": (u.created_at or now()).isoformat()} for u in s.query(User).order_by(User.id.desc()).limit(15)]})
@route("/api/admin/users/<int:uid>/role", ["PATCH"], auth=("ADMIN",))
def set_role(uid):
    """Admins make organizers (or other admins). Nobody can change their own role, so the last admin can't lock themselves out."""
    role = val(body(), "role", str, None, 1, 20).upper(); u = S().get(User, uid)
    if role not in ("USER", "ORGANIZER", "ADMIN"): raise Err("VALIDATION_ERROR", "role must be USER, ORGANIZER or ADMIN", 422)
    if not u: raise Err("USER_NOT_FOUND", "User not found", 404)
    if u.id == g.u.id: raise Err("FORBIDDEN", "You can't change your own role", 403)
    u.role = role; notify(u.id, "REMINDER", f"Your EventSync account is now: {role.title()}."); S().commit(); return ok(pub(u), "Role updated")
@route("/api/health")
def health():
    # Include safe database diagnostics so a frontend pointing at the wrong/empty
    # database can be identified without exposing connection credentials.
    s = S()
    return ok({"status": "up", "database": engine.dialect.name,
               "event_count": s.query(func.count(Event.id)).scalar() or 0,
               "email": "smtp" if mailer.configured() else "console",
               "payments": bool(KEY_ID and KEY_SECRET), "google": bool(GOOGLE_CLIENT_ID)})

# ---------- database upkeep + seed ----------
def migrate():
    """create_all() only creates MISSING TABLES, it never changes existing ones. That is what caused "Unknown column 'users.role'".
    This adds any column the models have but the database lacks (safe, additive), and tidies up leftovers of older versions."""
    insp, q = inspect(engine), engine.dialect.identifier_preparer.quote
    with engine.begin() as cx:
        for t in Base.metadata.sorted_tables:
            if not insp.has_table(t.name): continue
            have = {c["name"]: c for c in insp.get_columns(t.name)}
            for c in t.columns:
                if c.name in have: continue
                ddl = c.type.compile(dialect=engine.dialect); d = c.default.arg if c.default is not None and getattr(c.default, "is_scalar", False) else None
                default = f" DEFAULT {d}" if isinstance(d, (int, float)) and not isinstance(d, bool) else (" DEFAULT '" + d.replace("'", "''") + "'" if isinstance(d, str) and d and "TEXT" not in ddl.upper() else "")
                cx.execute(text(f"ALTER TABLE {q(t.name)} ADD COLUMN {q(c.name)} {ddl}{default}")); log.warning("database updated: added %s.%s", t.name, c.name)
            if engine.dialect.name == "mysql":     # columns from an old version that the code no longer fills must not block new rows
                for name, c in have.items():
                    if name not in t.columns and not c["nullable"] and c.get("default") is None and not c.get("autoincrement"):
                        try: cx.execute(text(f"ALTER TABLE {q(t.name)} MODIFY {q(name)} {c['type'].compile(dialect=engine.dialect)} NULL")); log.warning("database updated: %s.%s may now be empty", t.name, name)
                        except Exception: log.exception("could not relax %s.%s", t.name, name)
        if insp.has_table("users"): cx.execute(text("UPDATE users SET role = UPPER(role) WHERE role IN ('user', 'organizer', 'admin')"))   # roles are stored in capitals
def backfill_images(s):
    for e in s.query(Event).filter((Event.image.is_(None)) | (Event.image == "")):
        if e.title in SEED_IMAGES: e.image = f"/images/events/{SEED_IMAGES[e.title]}.jpg"
    s.commit()
def seed():
    Base.metadata.create_all(engine); migrate(); s = SL()
    if not s.query(User).first():
        P = hp("demo1234")
        us = [User(name="Roshni Vishwakarma", email="demo@eventsync.dev", password_hash=P, interests="AI,Web Development,Cloud", xp=240),
              User(name="Meera Organizer", email="organizer@eventsync.dev", password_hash=P, role="ORGANIZER"), User(name="Admin", email="admin@eventsync.dev", password_hash=P, role="ADMIN")]
        us += [User(name=n, email=f"{n.lower()}@example.com", password_hash=P, xp=x) for n, x in [("Aarav", 1850), ("Riya", 1720), ("Neha", 1640), ("Kabir", 1520), ("Anaya", 1470)]]
        s.add_all(us); s.commit(); d = lambda n, h: (now() + dt.timedelta(days=n)).replace(hour=h, minute=0, second=0, microsecond=0)
        sch = "10:00 Registration|10:30 Opening|11:00 Keynote|12:00 Workshop"
        for t, c, tg, n, h, v, cap, tk in [("AI Innovation Hackathon", "Hackathons", "AI,Machine Learning", 5, 10, "IIT Bombay, Powai", 320, 320), ("Machine Learning Workshop", "Workshops", "AI,Machine Learning", 3, 11, "WeWork BKC", 80, 52),
            ("Future of Web Development", "Technology", "Web Development,React", 9, 14, "Jio World Centre", 200, 120), ("Cybersecurity Night", "Technology", "Cybersecurity", 12, 18, "Nesco Goregaon", 150, 140),
            ("Cloud Native Meetup", "Networking", "Cloud,DevOps", 7, 17, "Thane Tech Park", 100, 40), ("Design Systems Jam", "Design", "Design", 15, 10, "Worli Studio", 60, 20),
            ("Startup Pitch Day", "Business", "Startups,Business", 20, 9, "NSE Mumbai", 250, 90), ("Mumbai Marathon Warmup", "Sports", "Sports", 4, 6, "Marine Drive", 500, 210)]:
            s.add(Event(title=t, description=f"{t}: talks, hands-on sessions and people worth meeting.", category=c, tags=tg, start=d(n, h), venue=v, capacity=cap, taken=tk, organizer_id=2, schedule=sch, speakers="Dr. A. Rao|S. Kulkarni|J. D'Souza", lat=19.07, lng=72.87, price={"Machine Learning Workshop": 499, "Cybersecurity Night": 299, "Startup Pitch Day": 799}.get(t, 0), image=f"/images/events/{SEED_IMAGES[t]}.jpg"))
        s.add(Notification(user_id=1, type="REMINDER", message="AI Innovation Hackathon starts soon.")); s.commit()
    # Ensure a useful demo catalogue of at least 100 published events.
    # This is idempotent: existing events are preserved and only missing titles are inserted.
    existing_count = s.query(Event).count()
    if existing_count < 100:
        organizer = s.query(User).filter_by(role="ORGANIZER").order_by(User.id.asc()).first()
        if organizer is None:
            organizer = s.query(User).filter_by(role="ADMIN").first()
        categories = [
            ("Technology", "Web Development,JavaScript", "default-technology.jpg"),
            ("Workshops", "Learning,Hands-on", "default-workshops.jpg"),
            ("Hackathons", "Innovation,Coding", "default-hackathons.jpg"),
            ("Networking", "Community,Meetup", "default-networking.jpg"),
            ("Business", "Startups,Leadership", "default-business.jpg"),
            ("Design", "UI,UX,Creative", "default-design.jpg"),
            ("Sports", "Fitness,Community", "default-sports.jpg"),
            ("Cultural", "Arts,Community", "default-cultural.jpg"),
        ]
        venues = [
            ("Bandra Kurla Complex", 19.0674, 72.8691), ("IIT Bombay, Powai", 19.1334, 72.9133),
            ("Jio World Centre, BKC", 19.0607, 72.8697), ("NESCO, Goregaon", 19.1538, 72.8537),
            ("Marine Drive", 18.9432, 72.8235), ("Andheri East", 19.1197, 72.8697),
            ("Worli", 19.0176, 72.8150), ("Thane", 19.2183, 72.9781),
            ("Vashi, Navi Mumbai", 19.0771, 72.9986), ("Dadar", 19.0178, 72.8478),
        ]
        themes = [
            "AI Builders Meetup", "Full Stack Development Bootcamp", "Cloud Computing Summit",
            "Cybersecurity Awareness Forum", "React and Next.js Workshop", "Python Automation Lab",
            "Data Science Community Day", "Startup Founders Networking", "Product Design Sprint",
            "Digital Marketing Masterclass", "Robotics Innovation Expo", "Open Source Contribution Day",
            "Women in Technology Forum", "Entrepreneurship Pitch Circle", "Mobile App Development Lab",
            "DevOps and CI/CD Workshop", "Blockchain Technology Seminar", "Career Growth Conference",
            "Photography and Visual Arts Meetup", "Community Sports Festival",
        ]
        i = 0
        while s.query(Event).count() < 100:
            category, tags, image_name = categories[i % len(categories)]
            venue, lat, lng = venues[i % len(venues)]
            title = f"{themes[i % len(themes)]} — Edition {i + 1:03d}"
            if s.query(Event).filter_by(title=title).first():
                i += 1
                continue
            start = (now() + dt.timedelta(days=1 + (i % 120))).replace(
                hour=9 + (i % 9), minute=(i % 4) * 15, second=0, microsecond=0
            )
            s.add(Event(
                title=title,
                description=f"Join the EventSync community for {themes[i % len(themes)].lower()}. Learn practical skills, meet new people and take part in interactive sessions.",
                category=category, tags=tags, start=start, venue=venue, city="Mumbai",
                lat=lat + ((i % 5) - 2) * 0.002, lng=lng + ((i % 7) - 3) * 0.002,
                price=0 if i % 3 else 199 + (i % 5) * 100,
                capacity=80 + (i % 8) * 25, taken=0, status="PUBLISHED",
                organizer_id=organizer.id if organizer else None,
                schedule="10:00 Registration|10:30 Opening|11:00 Main Session|12:00 Networking",
                image=f"/images/events/{image_name}"
            ))
            s.flush()
            i += 1
        s.commit()
    backfill_images(s); s.close()
seed()
if not mailer.configured(): log.warning("SMTP is not configured: verification codes and tickets are printed in this window instead of emailed (see .env.example)")
if not (KEY_ID and KEY_SECRET): log.warning("Razorpay keys are not set: paid events cannot be purchased until RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set")
if SECRET == "dev-secret-change-me": log.warning("JWT_SECRET_KEY is not set: using an insecure development key")

if __name__ == "__main__":
    app.run(port=8000, debug=True)
