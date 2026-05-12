# Inventar

A shared inventory tracking application.

Live at: **[inventar-frontend-iota.vercel.app](https://inventar-frontend-iota.vercel.app)**

---

## Tech Stack

| Part | Technology |
|------|-----------|
| Frontend | React + TypeScript + Vite + TailwindCSS |
| Backend | Python + FastAPI + uvicorn |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (Google OAuth) |

---

## Deployment

| Part | Host | Notes |
|------|------|-------|
| Frontend | [Vercel](https://vercel.com) | Free tier, auto-deploys from GitHub |
| Backend | [Render](https://render.com) | Free tier, auto-deploys from GitHub |
| Database | [Supabase](https://supabase.com) | PostgreSQL |

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project
- ngrok (optional, for access from other devices on your network)

### Quick Start

```bash
./start.sh
```

This starts the backend, frontend, and ngrok tunnel simultaneously.

### Manual Setup

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API runs at `http://localhost:8000`  
Interactive docs at `http://localhost:8000/docs`

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to the FastAPI backend automatically.

### Environment Variables

**`backend/.env`:**
```env
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://xxxx.supabase.co
WHITELIST=email1@gmail.com,email2@gmail.com
```

**`frontend/.env`:**
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000/api   # optional, defaults to /api proxy
```

---

## Auth

Login is restricted to Google accounts whose email is in the `WHITELIST` environment variable. The whitelist is checked on the backend — unauthorized users receive a 403 even with a valid Supabase session.

---

## Data Model

### Groups
Items are organised into groups by product name (e.g. "Milk"). A group is automatically created when the first item is added and deleted when the last item is removed.

### Items

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Auto-generated |
| `name` | string | e.g. "Milk" |
| `kaufdatum` | ISO date | Set automatically on creation |
| `ablaufdatum` | ISO date / null | Optional, set manually |

Items with the same name and expiry date within a group are visually grouped with a count badge (e.g. ×3).

---

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/Snyuki/Inventar/issues).  
Please use the provided issue templates.