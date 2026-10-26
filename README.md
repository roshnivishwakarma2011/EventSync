# EventSync — complete website (Next.js frontend + Flask backend)

```
eventsync/
├── backend/    Python + Flask API (SQLite by default, MySQL optional)  -> http://localhost:8000
├── frontend/   Next.js + React website (the full EventSync UI)         -> http://localhost:3000
├── start-all.bat / start-all.sh         starts both
├── start-backend.bat / start-backend.sh
└── start-frontend.bat / start-frontend.sh
```

## Run it (first time)
Install **Python 3.10+** and **Node 20+**, then:

- Windows: double-click `start-all.bat`
- Mac/Linux: `bash start-all.sh`

Open **http://localhost:3000**. Demo data is created automatically.
Demo logins (password `demo1234`): `demo@eventsync.dev` (attendee), `organizer@eventsync.dev`, `admin@eventsync.dev`

(Or run `start-backend` and `start-frontend` in two separate terminals.)


## Settings (backend/.env)
Copy `backend/.env.example` to `backend/.env` and fill in what you need. Nothing is required to just try the site.

**Email (OTP codes + tickets).** Without `SMTP_HOST`, emails are printed in the backend terminal, so you can copy the 6-digit code from there. For real email with Gmail: turn on 2-step verification, create an *App password* at https://myaccount.google.com/apppasswords, then set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASSWORD=<app password>`, `MAIL_FROM=you@gmail.com`.

**Razorpay.** Put your Test Mode `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `backend/.env` and restart. Paid events then open the real Razorpay checkout (test card `4111 1111 1111 1111`, any future date, any CVV, OTP `1234` or "Success" on the test bank page). Without keys, paid events show "payments aren't switched on" and nothing can be bought. There is no demo/mock payment any more. Optional webhook: Razorpay Dashboard > Webhooks > URL `https://YOUR-BACKEND/api/payments/webhook`, event `payment.captured`, and the same secret in `RAZORPAY_WEBHOOK_SECRET`.

**Upgrading an older MySQL database.** The backend now adds missing columns itself on start (`users.role`, `events.image`, the `email_otps` table, ...). If you ran the earlier `razorpay_setup.sql` I sent, run `DROP TABLE payments;` once and restart so the correct table is created.

**Refunds.** Cancelling a paid ticket refunds it through Razorpay when the event is at least 24 hours away (change `REFUND_HOURS` in `app.py`); later cancellations are not refunded. If an organizer cancels an event, every paid attendee is refunded. A refund that Razorpay rejects is marked `REFUND_DUE` in the `payments` table so you can refund it from the dashboard.

**Roles.** New accounts are attendees. An admin (`admin@eventsync.dev`) opens the Admin page and picks *Organizer* in the "Newest members" list. Organizers can save drafts, publish, edit events, upload banners and event photos, and check people in by scanning the QR with the camera (Chrome/Edge/Android, over https or localhost) or pasting the token.

**Certificates.** Dashboard > Certificates > *Download PDF* opens a printable certificate; choose "Save as PDF" in the print dialog.

**Tests.** `cd backend && python test_smoke.py` runs a self-contained check of signup OTP, payments, images, uploads and the database upgrade (no real email or Razorpay is contacted).

## How the two parts connect
The browser calls `/flask/...` on the frontend; `next.config.ts` forwards that to the Flask server (`BACKEND_URL`, default `http://localhost:8000`), so there is no CORS setup.
`frontend/src/lib/flask-adapter.ts` translates what the UI asks for into the Flask endpoints and reshapes the responses.

## Deploy (free: Vercel + Render + Aiven MySQL)
See the step-by-step guide the assistant sent with this project. In short: database on Aiven (set `DB_SSL=1`), backend on Render, frontend on Vercel. Notes: Render's free plan blocks the usual SMTP ports (25/465/587), so use an email service that offers port 2525 (e.g. Brevo); and its disk is wiped on every restart, so organizer image uploads vanish. Use bundled banners or paste an https image link on the free plan.

## Deploy (details)
1. **Backend (Render / Railway / any Python host)** — root directory `backend`, build `pip install -r requirements.txt`, start `gunicorn app:app`.
   Environment variables: `JWT_SECRET_KEY` (long random string), `DATABASE_URL` (optional MySQL, e.g. `mysql+pymysql://user:pass@host:3306/eventsync`), and for payments `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`.
2. **Frontend (Vercel)** — root directory `frontend`, framework Next.js. Environment variable: `BACKEND_URL` = your deployed backend URL (no trailing slash). Deploy.
3. Change the seeded demo passwords (or remove the seed users) before sharing publicly.

## What the backend does not provide (so the UI handles it gracefully)
Still not included: the "People you may meet" feature, photo uploads by attendees (only organizers add event photos), and in-app chat.


## Event catalogue and admin approval

- On first startup, the backend seeds the database to **at least 100 published demo events**. Existing user-created events are preserved; the seeder only inserts missing sample records and does not duplicate them on later restarts.
- Organizer-created events are saved as `PENDING_REVIEW` and are not visible in the public event catalogue until an administrator approves them.
- Sign in as the admin (`admin@eventsync.dev`, demo password `demo1234` only for a fresh demo database) and open `/admin`.
- Use **Accept & publish** to approve an event, or **Reject** to reject it. The backend checks the event state and admin role; it also sends an in-app notification to the organizer.
- Admin-created events are published immediately. Organizer drafts remain drafts until submitted for review.

## Troubleshooting: event details show 404

The event details route is `http://localhost:3000/events/<event-id>` (for example, `http://localhost:3000/events/3`). The Next.js route is `frontend/src/app/events/[id]/page.tsx`; it fetches the record from Flask at `GET http://localhost:8000/api/events/3`.

1. Start the Flask backend and open `http://localhost:8000/api/health`. Confirm `status` is `up`, `database` is the expected database type (`mysql` when using MySQL), and `event_count` is at least 100 for the bundled demo catalogue.
2. Open `http://localhost:8000/api/events` and check that the event's `id` is exactly the number in the event card URL.
3. Open `http://localhost:8000/api/events/3` directly. If it returns `EVENT_NOT_FOUND`, the connected database does not contain event ID 3, or the event is private (draft, pending review, or rejected).
4. Ensure `backend/.env` contains the correct `DATABASE_URL` for the same MySQL database used by your existing event data. Restart Flask after changing it. Do not create a second empty database or replace your existing database.
5. Ensure `frontend/.env.local` has `BACKEND_URL=http://localhost:8000`, then restart Next.js.

The event details page now displays the API's diagnostic message instead of silently treating every API/network failure as an event-not-found result. `/api/health` reports the database dialect and event count, but never exposes credentials.
