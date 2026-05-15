from contextlib import asynccontextmanager
from datetime import date
from typing import Optional
import os
import uuid
import re
from datetime import datetime, timezone, timedelta
 
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt
from jwt import PyJWKClient
import databases
import sqlalchemy
from pydantic import BaseModel, field_validator

from dotenv import load_dotenv

import constants

load_dotenv()

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

database = databases.Database(DATABASE_URL, min_size=1, max_size=5, statement_cache_size=0)
metadata = sqlalchemy.MetaData()

groups_table = sqlalchemy.Table(
    "item_groups",
    metadata,
    sqlalchemy.Column("id",         sqlalchemy.String,  primary_key=True),
    sqlalchemy.Column("group_name", sqlalchemy.String,  nullable=False),
)

items_table = sqlalchemy.Table(
    "items",
    metadata,
    sqlalchemy.Column("id",          sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("group_id",    sqlalchemy.String, sqlalchemy.ForeignKey("item_groups.id"), nullable=False),
    sqlalchemy.Column("kaufdatum",   sqlalchemy.String, nullable=False),  # ISO date
    sqlalchemy.Column("ablaufdatum", sqlalchemy.String, nullable=True),   # ISO date or NULL
    sqlalchemy.Column("name_to_group_id", sqlalchemy.String, sqlalchemy.ForeignKey("item_name_to_group_registry.id"), nullable=True),
)

item_name_registry_table = sqlalchemy.Table(
    "item_name_to_group_registry",
    metadata,
    sqlalchemy.Column("id",         sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("item_name",  sqlalchemy.String, nullable=False, unique=True),
    sqlalchemy.Column("group_id",   sqlalchemy.String, sqlalchemy.ForeignKey("item_groups.id"), nullable=False),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), nullable=True),
)

sync_url = DATABASE_URL.replace("+asyncpg", "")
engine = sqlalchemy.create_engine(sync_url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    metadata.create_all(engine)
    await database.connect()
    yield
    await database.disconnect()


app = FastAPI(title="Fridge Inventory API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        os.getenv("FRONTEND_URL", "")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Auth - Supabase JWT via JWKS
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
WHITELIST: set[str] = set(
    e.strip().lower()
    for e in os.getenv("WHITELIST", "").split(",")
    if e.strip()
)

bearer_scheme = HTTPBearer()
jwks_client = PyJWKClient(JWKS_URL)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """
    Verifies the Supabase JWT from the Authorization: Bearer <token> header.
    Returns the user's email on success, raises 401/403 on failure.
    """
    try:
        signing_key =jwks_client.get_signing_key_from_jwt(credentials.credentials)
        payload = pyjwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["HS256", "ES256"],
            audience="authenticated",
        )
    except Exception as e:
        print(f"JWT error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    
    email: str | None = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token contains no email",
        )
 
    if WHITELIST and email.lower() not in WHITELIST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )
 
    return email.lower()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ItemIn(BaseModel):
    name: str
    ablaufdatum: Optional[str] = None   # "YYYY-MM-DD" or null

    @field_validator("ablaufdatum")
    @classmethod
    def validate_ablaufdatum(cls, v):
        if v is None:
            return v
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Ablaufdatum must be in YYYY-MM-DD format")
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Invalid date: {v}")
        return v

class ItemOut(BaseModel):
    id: str
    name: str
    kaufdatum: str
    ablaufdatum: Optional[str]

class GroupOut(BaseModel):
    id: str
    group_name: str
    items: list[ItemOut]

class GroupIn(BaseModel):
    group_name: str

class GroupUpdate(BaseModel):
    group_name: str

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/auth/check")
async def auth_check(user: str = Depends(get_current_user)):
    """
    Returns 200 if the JWT is valid and the user is whitelisted.
    """
    return {"allowed": True, "email": user}

@app.get("/api/groups", response_model=list[GroupOut])
async def list_groups(user: str = Depends(get_current_user)):
    """
    Return all groups
    """
    group_rows = await database.fetch_all(
        groups_table.select()
    )
    result = []
    for g in group_rows:
        item_rows = await database.fetch_all("""
            SELECT i.id, r.item_name AS name, i.kaufdatum, i.ablaufdatum
            FROM items i
            JOIN item_name_to_group_registry r ON i.name_to_group_id = r.id
            WHERE i.group_id = :group_id
        """, values={"group_id": g["id"]})
        result.append(GroupOut(
            id=g["id"],
            group_name=g["group_name"],
            items=[ItemOut(
                id=i["id"],
                name=i["name"],
                kaufdatum=i["kaufdatum"],
                ablaufdatum=i["ablaufdatum"],
            ) for i in item_rows],
        ))
    return result


@app.post("/api/groups", response_model=GroupOut, status_code=201)
async def create_group(body: GroupIn, user: str = Depends(get_current_user)):
    gid = str(uuid.uuid4())
    await database.execute(groups_table.insert().values(
        id=gid, group_name=body.group_name
    ))
    return GroupOut(id=gid, group_name=body.group_name, items=[])


@app.put("/api/groups/{group_id}")
async def update_group(group_id: str, body: GroupUpdate, user: str = Depends(get_current_user)):
    g = await database.fetch_one(
        groups_table.select().where(
            (groups_table.c.id == group_id)
        )
    )
    if not g:
        raise HTTPException(404, "Group not found")
    
    await database.execute(
        groups_table.update().where(groups_table.c.id == group_id).values(group_name=body.group_name)
    )

    item_rows = await database.fetch_all("""
        SELECT i.id, r.item_name AS name, i.kaufdatum, i.ablaufdatum
        FROM items i
        JOIN item_name_to_group_registry r ON i.name_to_group_id = r.id
        WHERE i.group_id = :group_id
    """, values={"group_id": group_id})

    return GroupOut(id=group_id, group_name=body.group_name, items=[
        ItemOut(id=i["id"], name=i["name"], kaufdatum=i["kaufdatum"], ablaufdatum=i["ablaufdatum"])
        for i in item_rows
    ])


@app.post("/api/groups/{group_id}/items", response_model=ItemOut, status_code=201)
async def create_item(group_id: str, body: ItemIn, user: str = Depends(get_current_user)):
    g = await database.fetch_one(
        groups_table.select().where(
            (groups_table.c.id == group_id)     # The 'c' is for 'column'
        )
    )
    if not g:
        raise HTTPException(404, "Group not found")

    # Check if item name already in registry under different group
    existing = await database.fetch_one(
        item_name_registry_table.select().where(
            item_name_registry_table.c.item_name == body.name
        )
    )

    if existing and existing["group_id"] != group_id:
        correct_group = await database.fetch_one(
            groups_table.select().where(groups_table.c.id == existing["group_id"])
        )
        raise HTTPException(409, detail={
            "message": "Item already registered under a different group",
            "correct_group_id": existing["group_id"],
            "correct_group_name": correct_group["group_name"],
        })

    # Register in registry if not yet done
    if not existing:
        reg_id = str(uuid.uuid4())

        # ON CONFLICT DO NOTHING to handle race conditions
        await database.execute("""
            INSERT INTO item_name_to_group_registry (id, item_name, group_id)
            VALUES (:id, :item_name, :group_id)
            ON CONFLICT (item_name) DO NOTHING
        """, values={"id": reg_id, "item_name": body.name, "group_id": group_id})
        
        # Fetch the actual registry entry -> might have been altered by concurrent request
        existing = await database.fetch_one(
            item_name_registry_table.select().where(
                item_name_registry_table.c.item_name == body.name
            )
        )
        reg_id = existing["id"]
    else:
        reg_id = existing["id"]

    
    iid = str(uuid.uuid4())
    kauf = date.today().isoformat()
    await database.execute(items_table.insert().values(
        id=iid, group_id=group_id,
        kaufdatum=kauf, ablaufdatum=body.ablaufdatum,
        name_to_group_id=reg_id,
    ))
    return ItemOut(id=iid, name=body.name, kaufdatum=kauf, ablaufdatum=body.ablaufdatum)


@app.get("/api/group-templates")
async def list_group_templates(user: str = Depends(get_current_user)):
    """
    Return all available group template names in insertion order.
    """
    rows = await database.fetch_all(
        "SELECT group_name FROM group_templates ORDER BY ctid"
    )
    return [row["group_name"] for row in rows]


@app.put("/api/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: str, body: ItemIn, user: str = Depends(get_current_user)):
    row = await database.fetch_one(
        items_table.select()
        .where(items_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Item not found")
    
    current_registry_entry = await database.fetch_one(
        item_name_registry_table.select().where(
            item_name_registry_table.c.id == row["name_to_group_id"]
        )
    )
    current_name = current_registry_entry["item_name"] if current_registry_entry else None
    
    # If name changed
    if body.name != current_name:
        existing = await database.fetch_one(
            item_name_registry_table.select().where(
                item_name_registry_table.c.item_name == body.name
            )
        )

        if existing and existing["group_id"] != row["group_id"]:
            correct_group = await database.fetch_one(
                groups_table.select().where(
                    groups_table.c.id == existing["group_id"]
                )
            )
            raise HTTPException(409, detail={
                "message": "Item already registered under a different group",
                "correct_group_id": existing["group_id"],
                "correct_group_name": correct_group["group_name"],
            })
        
        # Update registry if name changed to unknown name
        if existing:
            reg_id = existing["id"]
        else:
            reg_id = str(uuid.uuid4())
            await database.execute(item_name_registry_table.insert().values(
                id=reg_id, item_name=body.name, group_id=row["group_id"]
            ))

        await database.execute(items_table.update().where(items_table.c.id == item_id).values(
            name=body.name, ablaufdatum=body.ablaufdatum, name_to_group_id=reg_id
        ))
    else:
        await database.execute(
            items_table.update().where(items_table.c.id == item_id).values(
                ablaufdatum=body.ablaufdatum
            )
        )

    return ItemOut(id=item_id, name=body.name, kaufdatum=row["kaufdatum"], ablaufdatum=body.ablaufdatum)


@app.delete("/api/items/{item_id}", status_code=204)
async def delete_item(item_id: str, user: str = Depends(get_current_user)):
    row = await database.fetch_one(
        items_table.select()
        .where(items_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Item not found")
    
    group_id = row["group_id"]
    name_to_group_id = row["name_to_group_id"]

    # Delete Item
    await database.execute(items_table.delete().where(items_table.c.id == item_id))

    # Check if group is now empty
    if name_to_group_id:
        remaining_with_same_name = await database.fetch_val(
            "SELECT COUNT(*) FROM items WHERE name_to_group_id = :reg_id",
            values={"reg_id": name_to_group_id}
        )

        if remaining_with_same_name == 0:
            # Check timestamp
            registry_row = await database.fetch_one(
                item_name_registry_table.select().where(
                    item_name_registry_table.c.id == name_to_group_id
                )
            )
            if registry_row and registry_row["created_at"]:
                age = datetime.now(timezone.utc) - registry_row["created_at"]
                if age <= timedelta(minutes=constants.REGISTRY_GRACE_PERIOD_MINUTES):
                    # Within grace period -> delete registry entry aswell
                    await database.execute(
                        item_name_registry_table.delete().where(
                            item_name_registry_table.c.id == name_to_group_id
                        )
                    )
    else:
        # This should not happen in normal operation (as with every error),
        # as all items should have a registry link.
        # -> Log but don't block the deletion to avoid user-facing errors.
        print(f"Warning: Item {item_id} has no name_to_group_id — possible legacy data.")
    

    # Delete group if it's now empty
    remaining_in_group = await database.fetch_val(
        "SELECT COUNT(*) FROM items WHERE group_id = :gid",
        values={"gid": group_id}
    )
    if remaining_in_group == 0:
        await database.execute(groups_table.delete().where(groups_table.c.id == row["group_id"]))


@app.get("/api/items/suggestions")
async def item_suggestions(q: str = "", user: str = Depends(get_current_user)):
    """
    Return distinct item names matching the query with their group name.
    """
    rows = await database.fetch_all("""
        SELECT r.item_name, g.group_name
        FROM item_name_to_group_registry r
        JOIN item_groups g ON r.group_id = g.id
        WHERE LOWER(r.item_name) LIKE LOWER(:pattern)
        ORDER BY r.item_name
        LIMIT 10
    """, values={"pattern": f"%{q}%"})
    return [{"name": row["item_name"], "groupName": row["group_name"]} for row in rows]


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}
