# Inventar

An inventory web app.
This is currently accessable at https://inventar-frontend-iota.vercel.app

---

## Project Structure

```
inventar/
├── frontend/          React + TypeScript + Vite + TailwindCSS
│   └── src/
│       ├── App.tsx                   Main app component
│       ├── components/
│       │   └── LoginScreen.tsx       Login page
│       ├── types/index.ts            Shared TypeScript types
│       └── lib/utils.ts              Helper functions
└── backend/           Python FastAPI + SQLite
    ├── main.py
    └── requirements.txt
```

---

## Quick Start

For Dev:
```bash
./start.sh
```

---

## Running the Full Stack

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
API is now at http://localhost:8000.  
Docs at http://localhost:8000/docs.

### Frontend (with backend)
```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to the FastAPI backend automatically.

---

## Auth

### Whitelist approach (invite-only)
In Supabase → Auth → Settings you can restrict sign-ups. For a stricter whitelist:
- Keep a `allowed_users` table in your database
- In the backend `get_current_user` function, check the JWT's email against that table
- This means you control access entirely from the backend, not the frontend

---

## Deployment

| Part      | Recommended host         | Notes                          |
|-----------|--------------------------|--------------------------------|
| Frontend  | **Vercel**   | Free-Tier; Auto-deploy from GitHub  |
| Backend   | **Render**    | Free-Tier; Auto-Deploy from GitHub      |
| Database  | **Supabase**    | PostgreSQL |

For the iPad: just navigate to your deployed URL in Safari and use
**Add to Home Screen** → it will work like a native app.

---

## Item data model

| Field        | Type          | Notes                              |
|--------------|---------------|------------------------------------|
| `id`         | string        | UUID                               |
| `name`       | string        | e.g. "Milk – Carton 1"             |
| `kaufdatum`  | ISO date      | Auto-set on creation; not shown yet |
| `ablaufdatum`| ISO date/null | Optional; set manually on add      |

Items are grouped by product type. The group accordion shows count and earliest expiry.  
Expiry colouring: 🔴 Expired · 🟡 Expiring within 2 days · ⚪ OK · ⬛ No date set.
