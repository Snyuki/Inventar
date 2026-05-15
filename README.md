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
Dev will be hosted at: **[https://delicious-overheat-headway.ngrok-free.dev/](https://delicious-overheat-headway.ngrok-free.dev/)** (or any ngrok url you use)

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
FRONTEND_URL=https://your-vercel-url.vercel.app
```

**`frontend/.env`:**
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:8000/api   # optional, defaults to /api proxy
```

---

## Versioning
 
This project uses manual semantic versioning (Major.Minor.Patch). The version is read from `frontend/package.json` at build time and displayed in the app footer.
 
To release a new version:
 
```bash
git add -A
git commit -m "#<ticket-nr> <Fixed|Implemented>" # Depending on bug or feature ticket
bump-version 0.3.0   # alias -> updates package.json
git add frontend/package.json
git commit -m "Bump Version to 0.3.0"
git push
```

`bump-version` is defined as an alias. In this case for a fish shell:
 
```fish
function bump-version
    set toplevel (git rev-parse --show-toplevel)
    cd $toplevel/frontend
    npm version $argv[1] --no-git-tag-version
    cd $toplevel
end
```
 
---


## Auth

Login is restricted to Google accounts whose email is in the `WHITELIST` environment variable. The whitelist is enforced on the backend — unauthorized users receive a 403 even with a valid Supabase session. The whitelist check runs on every fresh login. On page reload, the existing Supabase session is trusted directly without querying the backend.

---

## Data Model
 
### group_templates
 
Predefined list of allowed group names. Seeded once and used to populate the group dropdown in the UI. Can be extended directly in the database.
 
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated |
| group_name | TEXT | Unique, e.g. "Milch", "Käse", "Sonstiges" |
 
### item_groups
 
Active groups — groups that currently have at least one item. Automatically created when the first item of a group is added, and deleted when the last item is removed.
 
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR | Auto-generated |
| group_name | VARCHAR | Matches a group_templates entry |
 
### item_name_to_group_registry
 
Maps item names to their group. Enforces that a given item name can only ever belong to one group. New entries receive a `created_at` timestamp used for the grace period logic.
 
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated |
| item_name | TEXT | Unique across the entire inventory |
| group_id | TEXT | FK to item_groups |
| created_at | TIMESTAMPTZ | Set on first insert |
 
### items
 
Individual item instances. Multiple rows can share the same `name_to_group_id` (same product, different expiry dates or multiple units).
 
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR | Auto-generated |
| group_id | VARCHAR | FK to item_groups |
| name_to_group_id | UUID | FK to item_name_to_group_registry |
| kaufdatum | VARCHAR | ISO date, set automatically on creation |
| ablaufdatum | VARCHAR | ISO date or NULL, set manually |
 
---
 
## Item-Group Link Behaviour
 
When a user adds an item name that has not been seen before, a new entry is created in `item_name_to_group_registry` linking that name to its group permanently.
 
If the user deletes the last item of that name within *15 minutes* of the link being created, the registry entry is also deleted, allowing the name to be re-assigned to a different group. After 15 minutes, the link is permanent and can only be changed via an admin SQL script.
 
---
 
## Database Views
 
The following views are available in Supabase for monitoring and data quality checks:
 
| View | Description |
|------|-------------|
| v_inventory | All items with group, name, dates, days until expiry and status |
| v_expired_items | Items past their expiry date |
| v_expiring_soon | Items expiring within the next 3 days |
| v_group_summary | Per-group item count, earliest expiry, expired and expiring soon counts |
| v_empty_groups | Groups with no items |
| v_registry_overview | All item-group links with age and grace period status |
| v_recently_added_links | Registry entries added within the last 15 minutes |
| v_items_without_registry_link | Items with no registry link (legacy data indicator) |
| v_orphaned_groups | Groups with no items (same as v_empty_groups) |

---

## Admin Scripts
 
Located in `scripts/` (git-ignored). Run directly in Supabase SQL Editor.
 
| Script | Description |
|--------|-------------|
| admin_move_item_to_new_group.sql | Move an item name and all its instances to a different group |
| admin_remove_item_completely.sql | Remove an item name and all its instances including the registry link |
| admin_remove_orphaned_groups.sql | Remove orphaned groups and registry entries with no items |
 
---

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/Snyuki/Inventar/issues).  
Please use the provided issue templates.
