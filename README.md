<h1 align="center">✅ TaskSync</h1>
<h3 align="center">Real-Time Full-Stack Task Manager</h3>

<p align="center">
  A full-stack personal task manager for your laptop and phone — built with <b>FastAPI</b>, <b>PostgreSQL</b>, <b>JWT authentication</b>, <b>real-time WebSocket sync</b>, and an <b>installable PWA</b> frontend.
</p>

<p align="center"><a href="https://daily-tasks-onb4.onrender.com"><b>🌐 Live Demo</b></a> · <a href="SETUP.md"><b>📘 Setup Guide</b></a></p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?logo=sqlalchemy&logoColor=white" alt="SQLAlchemy">
  <img src="https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white" alt="JWT">
  <img src="https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white" alt="PWA">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License">
</p>

---

## 📸 Screenshots

| Light mode | Dark mode |
|---|---|
| ![TaskSync Today view in light mode](docs/screenshots/desktop.jpg) | ![TaskSync All open view in dark mode](docs/screenshots/dark-mode.jpg) |

---

## ✨ Features

**🔐 Accounts & Security**
- Register and log in with email and password
- Passwords stored only as **bcrypt** hashes
- **JWT** access tokens (OAuth2 password flow), valid 7 days by default
- Change password and **delete account** (removes all of that user's tasks) from the user menu
- **Rate limiting** on login and sign-up to stop password guessing and spam accounts
- Refuses to start in production without a strong `SECRET_KEY`
- Config switch to turn off new sign-ups

**📝 Tasks**
- Title, notes, due date and priority (high / medium / low)
- Each user sees only their own tasks
- **Today**, **Upcoming**, **All open** and **Completed** views
- Daily progress bar, search and priority filter
- Edit dialog, delete with **Undo**, clear completed

**⚡ Experience**
- **Real-time sync** across windows and devices via WebSockets
- Light and dark mode
- Keyboard shortcuts: `N` new task, `/` search
- Responsive phone layout, **installable as an app (PWA)**
- Interactive API docs at `/docs` (Swagger) and `/redoc`

---

## 🛠️ Tech Stack

> **Backend:** Python (FastAPI) · **Frontend:** JavaScript, HTML, CSS — GitHub's language bar shows both because this is a full-stack project.

| Layer | Technology |
|---|---|
| Language | Python 3.13 (works on 3.10+) |
| Web framework | FastAPI |
| Server | Uvicorn |
| Database | PostgreSQL |
| ORM & driver | SQLAlchemy 2 + psycopg 3 |
| Validation | Pydantic 2 + email-validator |
| Auth | bcrypt (passwords), PyJWT (tokens), OAuth2 password flow |
| Real-time | WebSockets (FastAPI / Uvicorn) |
| Config | python-dotenv (`.env`) |
| Frontend | Plain HTML, CSS and JavaScript — no build step, no Node.js |
| PWA | Web app manifest + service worker |
| Hosting | Render (Blueprint: web service + managed PostgreSQL) |
| Remote access (optional) | Tailscale private network |

---

## 🏗️ Architecture

```mermaid
flowchart TD
  A["Browser / Phone PWA<br/>static/index.html · app.js"] -->|HTTPS / REST| B["FastAPI · main.py"]
  A <-->|"WebSocket /ws"| R["realtime.py<br/>per-user change events"]
  B --> R
  B --> S["security.py<br/>bcrypt + JWT"]
  B --> V["schemas.py<br/>Pydantic validation"]
  B --> M["SQLAlchemy<br/>models.py · database.py"]
  M --> P[("PostgreSQL<br/>taskdb")]
```

- **Login:** `/auth/login` verifies the bcrypt hash and returns a signed JWT, sent as `Authorization: Bearer <token>`.
- **Protected routes:** `get_current_user` decodes the JWT; every task query is filtered by `owner_id`.
- **Real-time:** after a create, update or delete, the server notifies all of that user's open WebSockets and each window re-fetches. Other users receive nothing.
- **PWA:** the manifest and service worker make the app installable. Only static assets are cached — task data always comes live from the server.

---

## 📁 Project Structure

```
tasksync/
├── .env.example          # Template for environment variables (no secrets)
├── .gitignore
├── .python-version       # Python version for cloud hosts
├── requirements.txt      # Pinned Python dependencies
├── render.yaml           # Render Blueprint: one-click cloud deploy
├── Procfile              # Start command for Railway / Heroku-style hosts
├── start.bat             # Windows: start the server and open the browser
└── app/
    ├── __init__.py
    ├── database.py       # PostgreSQL connection, one session per request
    ├── models.py         # Tables: users, tasks
    ├── schemas.py        # Request/response models and validation
    ├── security.py       # Password hashing, JWT create/verify, current user
    ├── ratelimit.py      # Login and sign-up rate limits
    ├── realtime.py       # WebSocket connection manager
    ├── main.py           # API endpoints, UI routes, schema upgrades
    └── static/
        ├── index.html    # Login screen, app layout, dialogs
        ├── styles.css    # Light/dark themes, phone layout
        ├── app.js        # Views, tasks, live sync
        ├── sw.js         # Service worker
        ├── manifest.webmanifest
        └── icons/
```

---

## 🚀 Getting Started

> 📘 **Full setup guide:** deployment to Render, phone install, API reference and troubleshooting are in [SETUP.md](SETUP.md).

### Prerequisites
- Python 3.10+
- PostgreSQL (default port 5432)

### 1. Clone and install
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

### 2. Create the database
```bash
psql -U postgres -c "CREATE DATABASE taskdb;"
```

### 3. Configure environment
```bash
cp .env.example .env      # Windows: Copy-Item .env.example .env
```

| Variable | Description | Example / default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://postgres:PASSWORD@localhost:5432/taskdb` |
| `SECRET_KEY` | Signs JWTs — long and random | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Login lifetime | `10080` (7 days) |
| `ALLOW_REGISTRATION` | Allow new sign-ups | `true` |
| `APP_ENV` | `production` refuses to start without a strong `SECRET_KEY` | `development` |
| `MAX_TASKS_PER_USER` | Per-account task limit | `5000` |

`DATABASE_URL` also accepts the `postgres://` and `postgresql://` URLs that cloud hosts provide. Tables are created automatically on first start.

### 4. Run
```bash
uvicorn app.main:app --reload
```

| URL | Description |
|---|---|
| http://127.0.0.1:8000 | Web app |
| http://127.0.0.1:8000/docs | Swagger API docs |
| http://127.0.0.1:8000/redoc | ReDoc API docs |

On Windows you can also just double-click `start.bat`.

---

## 📡 API Reference

Task and user endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/auth/config` | Whether registration is enabled |
| `POST` | `/auth/register` | Create account `{email, password}` → 201 |
| `POST` | `/auth/login` | OAuth2 form login → `{access_token, token_type}` |
| `GET` | `/users/me` | Current user |
| `POST` | `/users/me/password` | Change password → 204 |
| `DELETE` | `/users/me` | Delete account and all its tasks `{password}` → 204 |
| `POST` | `/tasks` | Create task → 201 |
| `GET` | `/tasks` | List tasks — filters: `completed`, `priority`, `q`, `skip`, `limit` |
| `GET` | `/tasks/{id}` | Get one task |
| `PATCH` | `/tasks/{id}` | Update any field (`null` clears due date) |
| `DELETE` | `/tasks/{id}` | Delete task → 204 |
| `WS` | `/ws` | Real-time events: `created` / `updated` / `deleted` |
| `GET` | `/health` | Health check (app + database) |

Too many login or sign-up attempts return `429` with a `Retry-After` header.

<details>
<summary><b>Example task object</b></summary>

```json
{
  "id": 4,
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "completed": false,
  "priority": "medium",
  "due_date": "2026-10-13",
  "completed_at": null,
  "created_at": "2026-10-13T00:08:42+05:30"
}
```
</details>

<details>
<summary><b>WebSocket protocol</b></summary>

1. Connect to `/ws` and send `{"token": "<access_token>"}` within 10 seconds.
2. Server replies `{"event": "ready"}`; an invalid token closes with code `4401`.
3. Each change to your tasks pushes `{"event": "created" | "updated" | "deleted", "task_id": 12}`.
4. The client sends `"ping"` every 25 seconds to keep the connection alive.
</details>

---

## 🗄️ Database Schema

**users** — `id` (PK) · `email` (unique) · `hashed_password`

**tasks** — `id` (PK) · `title` · `description` · `completed` · `priority` · `due_date` (indexed) · `completed_at` · `created_at` · `owner_id` → `users.id` (cascade delete)

On startup the app creates missing tables and adds any new columns to existing tables without losing data.

---

## 🧪 Testing

Verified scenarios against PostgreSQL include: registration, duplicate email (400), login, wrong password (401), missing token (401), pagination, filters, `completed_at` handling, clearing due dates, invalid priority (422), delete (204), **access to another user's task (404)**, password change, WebSocket push, **no cross-user push**, bad WebSocket token (4401), sign-ups disabled (403), account deletion (tasks and login removed), login brute force and sign-up flood limits (429), health check, and production `SECRET_KEY` enforcement.

---

## ☁️ Deploy to the Cloud

Run it online so anyone with the link can sign up and manage their own tasks from any phone, with no laptop needed. The included [`render.yaml`](./render.yaml) creates the web service **and** a PostgreSQL database, and generates a random `SECRET_KEY`.

1. Sign in to [Render](https://render.com) with GitHub.
2. **New → Blueprint** → select this repository → **Apply**.
3. After the first deploy (about 3–5 minutes) the app is live at `https://daily-tasks-xxxx.onrender.com` (the service name comes from `render.yaml`; the app's screens are titled "Daily Tasks").
4. Share the link. Each person taps **Create account**, then **Add to Home Screen** to install it.

**Free-tier notes:** the free web service sleeps after 15 minutes idle (the next visit takes about a minute), and Render's free PostgreSQL expires after 30 days. For a lasting free database, create one on [Neon](https://neon.tech) and set its connection string as `DATABASE_URL` in the service's Environment settings.

---

## 📱 Use It on Your Phone (private, from your own PC)

Alternatively, share a locally running app with only your own devices using [Tailscale](https://tailscale.com), with no public exposure or port forwarding:

```bash
tailscale serve --bg 8000
tailscale serve status   # shows your private https://<pc>.<tailnet>.ts.net URL
```

Open that URL on your phone (with Tailscale on) and choose **Add to Home Screen** to install it.

---

## 🔒 Security Notes

- `.env` is git-ignored — never commit secrets
- Use a long random `SECRET_KEY`
- For a private single-user install, set `ALLOW_REGISTRATION=false` after creating your account
- On a public deployment, set `APP_ENV=production` (done automatically by `render.yaml`)
- For a local install, share remotely only via Tailscale; don't port-forward 8000

---

## 🗺️ Roadmap

- [ ] Reminders and browser notifications
- [ ] Recurring tasks, tags and projects
- [ ] Database migrations with Alembic
- [ ] Automated test suite with pytest + GitHub Actions CI
- [ ] Docker setup
- [x] Cloud deployment config (Render Blueprint) with managed PostgreSQL
- [ ] Password reset by email

---

## 👤 Author

**Anshul**
- GitHub: [@AnshulHR26](https://github.com/AnshulHR26)
- LinkedIn: [linkedin.com/in/anshul-953281210](https://www.linkedin.com/in/anshul-953281210/)
- Email: [anshulhr76@gmail.com](mailto:anshulhr76@gmail.com)

## 📄 License

Licensed under the [MIT License](./LICENSE).
