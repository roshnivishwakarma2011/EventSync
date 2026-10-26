# EventSync deployment and validation notes

## Project architecture
- Frontend: Next.js + React (`frontend/`)
- Backend: Flask + SQLAlchemy (`backend/`)
- Database: SQLite by default for local development; MySQL via `DATABASE_URL`
- Frontend-to-backend proxy: Next.js `/flask/*` rewrite using `BACKEND_URL`

## Environment setup
1. Copy `backend/.env.example` to `backend/.env`.
2. Set `DATABASE_URL` to your MySQL connection URL, URL-encoding special characters in the username/password.
3. Set a long random `JWT_SECRET_KEY`.
4. Configure SMTP variables if OTP signup and ticket email delivery are required.
5. Add Razorpay test credentials to `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` for paid-event testing.
6. Copy `frontend/.env.example` to `frontend/.env.local` and set `BACKEND_URL` to the Flask API origin.
7. Set `FRONTEND_URL` and `APP_URL` in the backend environment to the deployed frontend origin.

Never commit `.env`, `.env.local`, database files, or production secrets.

## Local startup
- Backend: from `backend/`, install `requirements.txt`, then run `python app.py`.
- Frontend: from `frontend/`, run `npm install`, then `npm run dev`.
- Open `http://localhost:3000`. The frontend proxies API requests to Flask at `http://localhost:8000`.

## Venue map
The event detail venue card now embeds a Google Maps location search using the event's saved latitude/longitude when present, otherwise its venue/address/city. It also provides Google Maps and directions links. This search-embed fallback does not require a browser Google Maps API key. A venue address that is incomplete or ambiguous can still resolve to the wrong place; use a full venue address for best results.

## Registration and payments
- The existing event detail page's Register button calls the Flask registration endpoint.
- Free events register directly.
- Paid events first request a server-created Razorpay order and then open Razorpay Checkout; the checkout script-load failure now returns a visible error instead of leaving the UI waiting forever.
- Razorpay test credentials and a public webhook endpoint are needed to test the payment lifecycle. Do not use live credentials for testing.
- This source archive does not include credentials or a deployed database. Real payment capture, webhook delivery, email delivery, MySQL connectivity, and production hosting must be tested in your own configured environment.

## Validation status
- Python syntax compilation was run for `backend/app.py`, `backend/mailer.py`, and `backend/test_smoke.py`.
- The backend smoke test could not be executed in this environment because Flask and the packages in `backend/requirements.txt` are not installed, and package installation is blocked by the environment's network restrictions.
- The Next.js production build/typecheck was not run because frontend `node_modules` are not present and package installation is unavailable here.
- Therefore this archive contains targeted fixes and static validation, not a claim that every end-to-end scenario has been runtime-tested. Run the smoke test and frontend checks after installing dependencies locally before deployment.
