from contextlib import asynccontextmanager
from datetime import date
from typing import Optional
import os
import uuid
 
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt
from jwt import PyJWKClient
import databases
import sqlalchemy
from pydantic import BaseModel

from dotenv import load_dotenv

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
    sqlalchemy.Column("name",        sqlalchemy.String, nullable=False),
    sqlalchemy.Column("kaufdatum",   sqlalchemy.String, nullable=False),  # ISO date
    sqlalchemy.Column("ablaufdatum", sqlalchemy.String, nullable=True),   # ISO date or NULL
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
    allow_origins=["http://localhost:5173"],  # Vite dev server
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
        item_rows = await database.fetch_all(
            items_table.select().where(items_table.c.group_id == g["id"])
        )
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


@app.post("/api/groups/{group_id}/items", response_model=ItemOut, status_code=201)
async def create_item(group_id: str, body: ItemIn, user: str = Depends(get_current_user)):
    g = await database.fetch_one(
        groups_table.select().where(
            (groups_table.c.id == group_id)
        )
    )
    if not g:
        raise HTTPException(404, "Group not found")

    iid = str(uuid.uuid4())
    kauf = date.today().isoformat()
    await database.execute(items_table.insert().values(
        id=iid, group_id=group_id, name=body.name,
        kaufdatum=kauf, ablaufdatum=body.ablaufdatum,
    ))
    return ItemOut(id=iid, name=body.name, kaufdatum=kauf, ablaufdatum=body.ablaufdatum)


@app.put("/api/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: str, body: ItemIn, user: str = Depends(get_current_user)):
    row = await database.fetch_one(
        items_table.select()
        .where(items_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Item not found")
    await database.execute(
        items_table.update().where(items_table.c.id == item_id).values(
            name=body.name, ablaufdatum=body.ablaufdatum
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
    await database.execute(items_table.delete().where(items_table.c.id == item_id))

    # Delete group if it's now empty
    remaining = await database.fetch_all(
        items_table.select().where(items_table.c.group_id == row["group_id"])
    )
    if not remaining:
        await database.execute(groups_table.delete().where(groups_table.c.id == row["group_id"]))


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}
