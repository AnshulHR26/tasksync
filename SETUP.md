# TaskSync Setup Guide

Run the FastAPI + PostgreSQL task manager on your own computer, or deploy it to Render with one Blueprint.

**Just want to try it?** Open the live demo and create an account — nothing to install.

- 🌐 **Live demo:** https://daily-tasks-onb4.onrender.com
- 💻 **Code:** https://github.com/AnshulHR26/tasksync

> **First visit slow?** The demo runs on Render's free tier and sleeps when idle. The first load can take about a minute.

## Contents

0. [What you get](#0-what-you-get)
1. [Prerequisites](#1-prerequisites)
2. [Run locally](#2-run-locally)
3. [Deploy to Render](#3-deploy-to-render)
4. [Install on your phone](#4-install-on-your-phone)
5. [API reference](#5-api-reference)
6. [Project structure](#6-project-structure)
7. [Troubleshooting](#7-troubleshooting)
8. [Security checklist](#8-security-checklist)

---

## 0. What you get

| Tasks | Accounts | Experience |
|---|---|---|
| Title, notes, due date, priority | Email + password sign-up | Real-time sync across devices (WebSockets) |
| Today, Upcoming, All open, Completed views | bcrypt hashes, JWT logins (7 days) | Light and dark mode |
| Search, priority filter, progress bar | Change password, delete account | Shortcuts: `N` new task, `/` search |
| Delete with Undo, clear completed | Rate-limited login and sign-up | Installable phone app (PWA) |

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Python | 3.10+ (3.13 recommended) | `python --version` |
| PostgreSQL | 14+ | `psql --version` |
| Git | any | `git --version` |

No Node.js or build step is needed. The frontend is plain HTML, CSS and JavaScript served by FastAPI.

## 2. Run locally

### Clone and install

```bash
git clone https://github.com/AnshulHR26/tasksync.git
cd tasksync
python -m venv venv

# Windows (PowerShell)
.\venv\Scripts\Activate.ps1
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Create the database

```bash
psql -U postgres -c "CREATE DATABASE taskdb;"
```

Prefer a GUI? In pgAdmin, right-click **Databases → Create → Database** and name it `taskdb`.

### Create your `.env`

```bash
cp .env.example .env    # Windows: Copy-Item .env.example .env
```

Generate a secret key and paste it into `.env` as `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

| Variable | What it does | Local value |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | `postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/taskdb` |
| `SECRET_KEY` | Signs login tokens | the value you generated |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | How long a login lasts | `10080` (7 days). Falls back to 30 minutes if unset. |
| `ALLOW_REGISTRATION` | Allow new sign-ups | `true` |
| `APP_ENV` | `production` refuses a weak key | `development` |
| `MAX_TASKS_PER_USER` | Task limit per account (optional, not in `.env.example`; add it to change it) | `5000` |

`DATABASE_URL` also accepts the `postgres://` and `postgresql://` URLs that cloud hosts hand out; the app converts them for you.

> **Keep it private.** `.env` is git-ignored. Never commit it.

### Start the app

```bash
uvicorn app.main:app --reload
```

| URL | Page |
|---|---|
| http://127.0.0.1:8000 | App |
| http://127.0.0.1:8000/docs | Swagger API docs (try requests in the browser) |
| http://127.0.0.1:8000/redoc | ReDoc API docs |
| http://127.0.0.1:8000/health | Health check (app + database) |

On Windows you can double-click `start.bat` instead. It opens the browser for you, and if the server is already running it just opens the page. Tables are created automatically on first start. Stop the server with `Ctrl+C`.

## 3. Deploy to Render

`render.yaml` is a Render Blueprint. It creates the web service (`daily-tasks`) and a PostgreSQL database (`daily-tasks-db`), and generates `SECRET_KEY` for you. You don't need to set any variables by hand.

1. Push the code to your own GitHub account (fork `AnshulHR26/tasksync`, or push your clone).
2. Sign in to [render.com](https://render.com) with GitHub.
3. **New → Blueprint** → choose the `tasksync` repository → **Apply**.
4. Wait 3–5 minutes for the first deploy.
5. Open the service URL shown in the dashboard (`https://daily-tasks-xxxx.onrender.com`).
6. Open `/health` on that URL. It should return `{"status":"ok"}`.

| Variable | Set by `render.yaml` to |
|---|---|
| `DATABASE_URL` | the Blueprint's database connection string |
| `SECRET_KEY` | a generated random value |
| `APP_ENV` | `production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` |
| `ALLOW_REGISTRATION` | `true` |

### Updating the live app

`autoDeploy` is on, so every push to `main` redeploys automatically. Check **Events** in the Render dashboard to confirm.

```bash
git add .
git commit -m "your message"
git push
```

### Free-tier limits

- The web service sleeps after 15 minutes idle. The next visit takes about a minute.
- Render's free PostgreSQL expires after 30 days. For a lasting free database, create one on [Neon](https://neon.tech) and set it as `DATABASE_URL` under the service's **Environment** tab. Paste Neon's connection string as-is (keep `?sslmode=require`).
- Login and sign-up rate limits are kept in memory, so they reset when the service restarts or sleeps.

### Other hosts

The `Procfile` works on Railway and Heroku-style hosts. Add a PostgreSQL database there and set `DATABASE_URL`, `SECRET_KEY` and `APP_ENV=production` yourself. `.python-version` pins Python 3.13.

## 4. Install on your phone

1. Open the app URL in Chrome (Android) or Safari (iPhone).
2. Tap **Create account** and sign in.
3. Android: menu **⋮ → Install app** (or **Add to Home screen**). iPhone: **Share → Add to Home Screen**.

Installing needs HTTPS, so it works on the Render URL or through Tailscale, not on plain `http://192.168…` addresses. Tasks you change on the phone appear instantly on your other open devices.

**Private alternative with no cloud:** run the app on your PC and reach it only from your own devices through [Tailscale](https://tailscale.com). Install Tailscale on the PC and phone, sign in to the same account, then on the PC:

```bash
tailscale serve --bg 8000
tailscale serve status
```

Open the `https://…ts.net` address that `status` prints on your phone. Your PC has to be on and running the app.

## 5. API reference

Task and user endpoints need `Authorization: Bearer <token>`. Get a token from `/auth/login`, or click **Authorize** in `/docs`.

| Method | Endpoint | Does |
|---|---|---|
| `GET` | `/auth/config` | Whether sign-up is open |
| `POST` | `/auth/register` | Create account `{email, password}` |
| `POST` | `/auth/login` | OAuth2 form login → `access_token` |
| `GET` | `/users/me` | Current user |
| `POST` | `/users/me/password` | Change password |
| `DELETE` | `/users/me` | Delete account and all its tasks |
| `POST` | `/tasks` | Create task |
| `GET` | `/tasks` | List tasks. Filters: `completed`, `priority`, `q`, `skip`, `limit` (default 10, max 1000) |
| `GET` | `/tasks/{id}` | One task |
| `PATCH` | `/tasks/{id}` | Update any field |
| `DELETE` | `/tasks/{id}` | Delete task |
| `WS` | `/ws` | Live events. Send `{"token": "…"}` first, then receive `created` / `updated` / `deleted` |
| `GET` | `/health` | Health check |

Quick test from a terminal:

```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -d "username=you@example.com&password=yourpassword"
```

## 6. Project structure

```
tasksync/
├── .env.example      variable template (no secrets)
├── requirements.txt  pinned dependencies
├── render.yaml       Render Blueprint
├── Procfile          Railway / Heroku start command
├── start.bat         Windows one-click start
└── app/
    ├── main.py       API routes, UI routes
    ├── database.py   PostgreSQL connection
    ├── models.py     users, tasks tables
    ├── schemas.py    validation
    ├── security.py   bcrypt + JWT
    ├── ratelimit.py  login / sign-up limits
    ├── realtime.py   WebSocket manager
    └── static/       index.html, app.js, styles.css, sw.js, manifest, icons
```

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `Activate.ps1 cannot be loaded` (Windows) | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in PowerShell, then activate again. |
| `psql` is not recognized | Add PostgreSQL's `bin` folder to PATH (e.g. `C:\Program Files\PostgreSQL\16\bin`), or create the database in pgAdmin. |
| `connection refused` on start | PostgreSQL isn't running, or `DATABASE_URL` has the wrong password or port. |
| `database "taskdb" does not exist` | Run the create-database step above. |
| Password has `@`, `#` or `:` | URL-encode it in `DATABASE_URL` (`@` → `%40`, `#` → `%23`). |
| Port 8000 already in use | Another copy is running. Close it, or use another port: `uvicorn app.main:app --reload --port 8001`. |
| App refuses to start in production | `SECRET_KEY` is missing, still the placeholder, or shorter than 32 characters. |
| `429 Too Many Requests` | Too many attempts: 20 logins per 5 min per IP, 8 per 5 min per account, 5 sign-ups per hour per IP. Wait for the `Retry-After` time. |
| Sign-up button missing | `ALLOW_REGISTRATION` is `false`. |
| "Task limit reached" | Delete or clear completed tasks, or raise `MAX_TASKS_PER_USER`. |
| Logged out unexpectedly | The token expired, or `SECRET_KEY` changed. Sign in again. |
| Changes don't sync live | Refresh the page. If your session expired, the app logs you out and asks you to sign in again. |
| Phone doesn't offer Install | The page must be on HTTPS (Render or Tailscale URL). |
| Render page loads slowly | The free instance was asleep. Wait about a minute. |
| Live app shows old code | Check Render **Events** for a failed build, then **Manual Deploy → Deploy latest commit**. On the phone, close and reopen the app so the service worker picks up new files. |

## 8. Security checklist

- [ ] `.env` is not committed
- [ ] `SECRET_KEY` is long and random
- [ ] `APP_ENV=production` on any public server (set by `render.yaml`)
- [ ] For a private install, set `ALLOW_REGISTRATION=false` after creating your account
- [ ] Never port-forward 8000 — use Tailscale for remote access
- [ ] Use a strong, unique password for your TaskSync account

---

TaskSync · [MIT License](LICENSE) · [Source code](https://github.com/AnshulHR26/tasksync) · [Portfolio](https://github.com/AnshulHR26/projects-portfolio) · [Live demo](https://daily-tasks-onb4.onrender.com)
