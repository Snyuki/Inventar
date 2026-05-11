# Inventar

An inventory web app.

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

## Quick Start (MVP with mock data)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and log in with `max@example.com`.

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

## Auth: Replacing the stub with Google OAuth

### What to do

1. Create a **Supabase** project at https://supabase.com (free tier)
2. Enable **Google** as an OAuth provider in Auth → Providers
3. Add your Google OAuth Client ID + Secret from Google Cloud Console
4. Install the Supabase client:
   ```bash
   npm install @supabase/supabase-js
   ```
5. Create `frontend/src/lib/supabase.ts`:
   ```ts
   import { createClient } from '@supabase/supabase-js';
   export const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY
   );
   ```
6. Replace the demo login in `LoginScreen.tsx` with:
   ```ts
   await supabase.auth.signInWithOAuth({ provider: 'google' });
   ```
7. On the backend, verify the Supabase JWT instead of the stub.

### Whitelist approach (invite-only)
In Supabase → Auth → Settings you can restrict sign-ups. For a stricter whitelist:
- Keep a `allowed_users` table in your database
- In the backend `get_current_user` function, check the JWT's email against that table
- This means you control access entirely from the backend, not the frontend

---

## Connecting Frontend to Backend

In `App.tsx`, replace the mock data and CRUD handlers with API calls.

Example for loading groups:
```ts
// Add this hook at the top of App()
useEffect(() => {
  fetch('/api/groups', { headers: { 'X-User-Email': user! } })
    .then(r => r.json())
    .then(data => setGroups(data.map(backendToFrontend)));
}, [user]);
```

A full API client file (`src/lib/api.ts`) is the recommended next step.

---

## Deployment

| Part      | Recommended host         | Notes                          |
|-----------|--------------------------|--------------------------------|
| Frontend  | **Vercel** or Netlify    | Free, auto-deploy from GitHub  |
| Backend   | **Render** or Railway    | Free tier, Docker support      |
| Database  | Supabase (PostgreSQL)    | PostgreSQL in DATABASE_URL |

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
