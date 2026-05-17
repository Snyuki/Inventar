# Inventar

A shared inventory tracking application for multiple storage locations.

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
- A Supabase project (production and dev)
- ngrok (optional, for access from other devices on your network)

### Quick Start

```bash
./start.sh [dev|ngrok|prod]
```

| Mode | Description |
|------|-------------|
| `dev` | Local only, dev database. Backend log in foreground. Open at `http://localhost:5173` |
| `ngrok` | Expose via ngrok tunnel, dev database |
| `prod` | Local frontend and backend against the production database. Requires confirmation. |

Default mode is `dev`.

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

The project uses separate env files for dev and prod stages. Here is an example for production. 

**`backend/.env`** (production):
```env
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://xxxx.supabase.co
WHITELIST=email1@gmail.com,email2@gmail.com
FRONTEND_URL=https://your-vercel-url.vercel.app
```

**`frontend/.env`** (production):
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=/api
```

The start script copies the correct frontend env file to `frontend/.env.local` on each run.

---

## Versioning
 
This project uses manual semantic versioning (Major.Minor.Patch). The version is read from `frontend/package.json` at build time and displayed in the app footer.
 
To release a new version:
 
```bash
git add -A
git commit -m "#<ticket-nr> <Fixed|Implemented>"
bump-version major   # or: minor, patch
git add frontend/package.json
git commit -m "Bump Version to x.y.z"
git push
```

`bump-version` is a fish shell function:
 
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

### storages

The three available storage locations. Seeded once and not user-editable.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated |
| name | TEXT | Unique, e.g. "Kühlschrank", "Tiefkühler", "Abseite" |

### group_templates
 
Predefined list of allowed group names. Seeded once and used to populate the group dropdown in the UI. Can be extended via admin script.
 
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated |
| group_name | TEXT | Unique, e.g. "Milch", "Käse", "Sonstiges" |
 
### item_groups
 
Active groups — groups that currently have at least one item. Automatically created when the first item of a group is added, and deleted when the last item is removed. Each group belongs to a specific storage.
 
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR | Auto-generated |
| group_name | VARCHAR | Matches a group_templates entry |
| storage_id | UUID | FK to storages |
 
### item_name_to_group_registry
 
Maps item names to their group. Enforces that a given item name can only ever belong to one group. New entries receive a `created_at` timestamp used for the grace period logic. Optionally stores the EAN of the product if it was added via barcode scan.
 
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated |
| item_name | TEXT | Unique across the entire inventory |
| group_id | TEXT | FK to item_groups |
| created_at | TIMESTAMPTZ | Set on first insert |
| ean | TEXT | EAN from barcode scan, if available |

### ean_product_cache

Cache for Open Food Facts API lookups. Populated on first scan of a product, used as primary source for subsequent scans of the same EAN.

| Column | Type | Notes |
|--------|------|-------|
| ean | TEXT | Primary key |
| product_name | TEXT | Preferred German name, falls back to generic |
| brand | TEXT | Manufacturer / brand |
| quantity | TEXT | e.g. "500g", "1l" |
| categories | TEXT[] | OFF category tags |
| stores | TEXT[] | Stores where the product is sold |
| nutrition | JSONB | Nutritional values per 100g |
| allergens | TEXT[] | Allergen tags |
| ingredients | TEXT | Full ingredients list |
| fetched_at | TIMESTAMPTZ | Timestamp of last OFF API fetch |

### off_category_mapping

Maps Open Food Facts category tags to the app's own group names. Used to suggest a group when adding a product via barcode scan.

| Column | Type | Notes |
|--------|------|-------|
| off_category | TEXT | Primary key, e.g. "en:cheeses" |
| app_group_name | TEXT | Corresponding app group, e.g. "Käse" |

### items
 
Individual item instances. Multiple rows can share the same `name_to_group_id` (same product, different expiry dates or multiple units).
 
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR | Auto-generated |
| group_id | VARCHAR | FK to item_groups |
| name_to_group_id | UUID | FK to item_name_to_group_registry |
| kaufdatum | VARCHAR | ISO date, set automatically on creation |
| ablaufdatum | VARCHAR | ISO date or NULL, set manually |
| storage_id | UUID | FK to storages |

---

## Barcode Scanning

When adding an item, the app opens a camera view to scan a product barcode. The lookup follows this priority:

1. `item_name_to_group_registry` — if the EAN has been scanned before and assigned to a group, that group is suggested directly.
2. `ean_product_cache` — if the product was previously fetched from Open Food Facts, the cached data is used.
3. Open Food Facts API — fetched on first scan, result stored in `ean_product_cache` for future lookups.

Group suggestion from OFF categories follows this priority:

1. Definitive mapping via EAN in `item_name_to_group_registry`.
2. Category-based suggestion via `off_category_mapping`.
3. No suggestion — user selects the group manually.

---
 
## Item-Group Link Behaviour
 
When a user adds an item name that has not been seen before, a new entry is created in `item_name_to_group_registry` linking that name to its group permanently.
 
If the user deletes the last item of that name within 15 minutes of the link being created, the registry entry is also deleted, allowing the name to be re-assigned to a different group. After 15 minutes, the link is permanent and can only be changed via an admin SQL script.
 
---

## Admin Scripts
 
Located in `scripts/` (git-ignored). Run directly in Supabase SQL Editor.
 
| Script | Description |
|--------|-------------|
| admin_setup_complete.sql | Full schema setup for a fresh Supabase project |
| admin_add_group_to_templates.sql | Add a new group to group_templates |
| create_group_and_migrate_items.sql | Create a group and move specified items from Sonstiges into it |
| admin_move_item_to_new_group.sql | Move an item name and all its instances to a different group |
| admin_remove_item_completely.sql | Remove an item name and all its instances including the registry link |
| admin_remove_orphaned_groups.sql | Remove orphaned groups and registry entries with no items |

---

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/Snyuki/Inventar/issues).  
Please use the provided issue templates.