from contextlib import asynccontextmanager
from datetime import date
from typing import Optional
import os
import uuid
import re
from datetime import datetime, timezone, timedelta
import httpx
import json
 
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt
from jwt import PyJWKClient
import databases
import sqlalchemy
from pydantic import BaseModel, field_validator, model_validator

from dotenv import load_dotenv

import constants

load_dotenv()

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

database = databases.Database(DATABASE_URL, min_size=1, max_size=5, statement_cache_size=0)
metadata = sqlalchemy.MetaData()

storages_table = sqlalchemy.Table(
    "storages",
    metadata,
    sqlalchemy.Column("id",   sqlalchemy.dialects.postgresql.UUID(as_uuid=False), primary_key=True),
    sqlalchemy.Column("name", sqlalchemy.String, nullable=False, unique=True),
)
 
groups_table = sqlalchemy.Table(
    "item_groups",
    metadata,
    sqlalchemy.Column("id",         sqlalchemy.String,  primary_key=True),
    sqlalchemy.Column("group_name", sqlalchemy.String,  nullable=False),
    sqlalchemy.Column("storage_id", sqlalchemy.dialects.postgresql.UUID(as_uuid=False), sqlalchemy.ForeignKey("storages.id"), nullable=False),
)

items_table = sqlalchemy.Table(
    "items",
    metadata,
    sqlalchemy.Column("id",          sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("group_id",    sqlalchemy.String, sqlalchemy.ForeignKey("item_groups.id"), nullable=False),
    sqlalchemy.Column("kaufdatum",   sqlalchemy.String, nullable=False),  # ISO date
    sqlalchemy.Column("ablaufdatum",      sqlalchemy.String, nullable=True),   # ISO date or NULL
    sqlalchemy.Column("name_to_group_id", sqlalchemy.dialects.postgresql.UUID(as_uuid=False), sqlalchemy.ForeignKey("item_name_to_group_registry.id"), nullable=True),
    sqlalchemy.Column("storage_id",       sqlalchemy.dialects.postgresql.UUID(as_uuid=False), sqlalchemy.ForeignKey("storages.id"), nullable=False),
)

item_name_registry_table = sqlalchemy.Table(
    "item_name_to_group_registry",
    metadata,
    sqlalchemy.Column("id",         sqlalchemy.dialects.postgresql.UUID(as_uuid=False), primary_key=True),
    sqlalchemy.Column("item_name",  sqlalchemy.String, nullable=False, unique=True),
    sqlalchemy.Column("group_id",   sqlalchemy.String, sqlalchemy.ForeignKey("item_groups.id"), nullable=False),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), nullable=True),
    sqlalchemy.Column("ean",        sqlalchemy.String, nullable=True),
    sqlalchemy.Column("auto_restock",   sqlalchemy.Boolean, nullable=False, server_default=sqlalchemy.text("FALSE")),
    sqlalchemy.Column("min_stock",      sqlalchemy.Integer, nullable=True),
    sqlalchemy.Column("restock_target", sqlalchemy.Integer, nullable=True),
)

ean_product_cache_table = sqlalchemy.Table(
    "ean_product_cache",
    metadata,
    sqlalchemy.Column("ean",          sqlalchemy.String,  primary_key=True),
    sqlalchemy.Column("product_name", sqlalchemy.String,  nullable=True),
    sqlalchemy.Column("brand",        sqlalchemy.String,  nullable=True),
    sqlalchemy.Column("quantity",     sqlalchemy.String,  nullable=True),
    sqlalchemy.Column("categories",   sqlalchemy.ARRAY(sqlalchemy.String), nullable=True),
    sqlalchemy.Column("stores",       sqlalchemy.ARRAY(sqlalchemy.String), nullable=True),
    sqlalchemy.Column("nutrition",    sqlalchemy.JSON,    nullable=True),
    sqlalchemy.Column("allergens",    sqlalchemy.ARRAY(sqlalchemy.String), nullable=True),
    sqlalchemy.Column("ingredients",  sqlalchemy.String,  nullable=True),
    sqlalchemy.Column("fetched_at",   sqlalchemy.DateTime(timezone=True), nullable=False),
)

off_category_mapping_table = sqlalchemy.Table(
    "off_category_mapping",
    metadata,
    sqlalchemy.Column("off_category",   sqlalchemy.String, primary_key=True),
    sqlalchemy.Column("app_group_name", sqlalchemy.String, nullable=False),
)

crud_logs_table = sqlalchemy.Table(
    "crud_logs",
    metadata,
    sqlalchemy.Column("id",          sqlalchemy.dialects.postgresql.UUID(as_uuid=False), primary_key=True, server_default=sqlalchemy.text("gen_random_uuid()")),
    sqlalchemy.Column("timestamp",   sqlalchemy.DateTime(timezone=True), nullable=False, server_default=sqlalchemy.text("now()")),
    sqlalchemy.Column("user_email",  sqlalchemy.String, nullable=False),
    sqlalchemy.Column("action",      sqlalchemy.String, nullable=False),
    sqlalchemy.Column("entity_type", sqlalchemy.String, nullable=False),
    sqlalchemy.Column("entity_id",   sqlalchemy.String, nullable=False),
    sqlalchemy.Column("payload",     sqlalchemy.JSON,   nullable=True),
)

shopping_list_table = sqlalchemy.Table(
    "shopping_list",
    metadata,
    sqlalchemy.Column("id",          sqlalchemy.dialects.postgresql.UUID(as_uuid=False), primary_key=True, server_default=sqlalchemy.text("gen_random_uuid()")),
    sqlalchemy.Column("created_at",  sqlalchemy.DateTime(timezone=True), nullable=False, server_default=sqlalchemy.text("now()")),
    sqlalchemy.Column("item_name",   sqlalchemy.String, nullable=False),
    sqlalchemy.Column("quantity",    sqlalchemy.Integer, nullable=False, server_default=sqlalchemy.text("1")),
    sqlalchemy.Column("source",      sqlalchemy.String, nullable=False, server_default=sqlalchemy.text("'manual'")),
    sqlalchemy.Column("registry_id", sqlalchemy.dialects.postgresql.UUID(as_uuid=False), nullable=True),
    sqlalchemy.Column("checked_off", sqlalchemy.Boolean, nullable=False, server_default=sqlalchemy.text("FALSE")),
)

sync_url = DATABASE_URL.replace("+asyncpg", "")
engine = sqlalchemy.create_engine(sync_url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"DEBUG SUPABASE_URL: {SUPABASE_URL}")
    print(f"DEBUG JWKS_URL: {JWKS_URL}")
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
    ean: str | None = None

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
    auto_restock: bool = False

class ItemUpdate(BaseModel):
    name: str
    ablaufdatum: Optional[str] = None
    ean: str | None = None
    auto_restock: bool = False
    min_stock: Optional[int] = None
    restock_target: Optional[int] = None

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

    @model_validator(mode="after")
    def validate_restock_fields(self):
        """
        Ensures min_stock and restock_target are provided when auto_restock is enabled,
        and that restock_target is greater than min_stock.
        """
        if self.auto_restock:
            if self.min_stock is None or self.restock_target is None:
                raise ValueError("Mindestbestand und Zielbestand sind erforderlich wenn Auto-Restock aktiviert ist")
            if self.restock_target <= self.min_stock:
                raise ValueError("Zielbestand muss größer als der Mindestbestand sein")
        return self
    
class GroupOut(BaseModel):
    id: str
    group_name: str
    items: list[ItemOut]

class GroupIn(BaseModel):
    group_name: str

class GroupUpdate(BaseModel):
    group_name: str

class StorageOut(BaseModel):
    id: str
    name: str

class BarcodeResult(BaseModel):
    ean: str
    product_name: str | None
    brand: str | None
    quantity: str | None
    suggested_group: str | None
    from_cache: bool

class ShoppingListItemIn(BaseModel):
    item_name: str
    quantity: int = 1
    registry_id: Optional[str] = None  # None for temporary/unknown items

class ShoppingListItemOut(BaseModel):
    id: str
    item_name: str
    quantity: int
    source: str
    registry_id: Optional[str]
    checked_off: bool
    created_at: str

class ShoppingListItemPatch(BaseModel):
    checked_off: Optional[bool] = None
    quantity: Optional[int] = None

class RestockSettingsOut(BaseModel):
    auto_restock: bool
    min_stock: Optional[int]
    restock_target: Optional[int]

class DeleteItemOut(BaseModel):
    shopping_list_entry: Optional[ShoppingListItemOut] = None

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/auth/check")
async def auth_check(user: str = Depends(get_current_user)):
    """
    Returns 200 if the JWT is valid and the user is whitelisted.
    """
    return {"allowed": True, "email": user}


@app.get("/api/storages", response_model=list[StorageOut])
async def list_storages(user: str = Depends(get_current_user)):
    """
    :returns: All availabe storages
    """
    rows = await database.fetch_all(storages_table.select().order_by(storages_table.c.name))
    return [StorageOut(id=str(r["id"]), name=r["name"]) for r in rows]


@app.get("/api/storages/{storage_id}/groups", response_model=list[GroupOut])
async def list_groups(storage_id: str, user: str = Depends(get_current_user)):
    """
    Return all groups and their items for a specific storage.
    """
    group_rows = await database.fetch_all(
        groups_table.select().where(groups_table.c.storage_id == storage_id)
    )
    result = []
    for g in group_rows:
        item_rows = await database.fetch_all("""
            SELECT i.id, r.item_name AS name, i.kaufdatum, i.ablaufdatum, r.auto_restock
            FROM items i
            JOIN item_name_to_group_registry r ON i.name_to_group_id = r.id
            WHERE i.group_id = :group_id
            AND i.storage_id = :storage_id
            ORDER BY
                CASE WHEN i.ablaufdatum IS NULL THEN 1 ELSE 0 END,
                i.ablaufdatum ASC
        """, values={"group_id": g["id"], "storage_id": storage_id})
        result.append(GroupOut(
            id=g["id"],
            group_name=g["group_name"],
            items=[ItemOut(
                id=i["id"],
                name=i["name"],
                kaufdatum=i["kaufdatum"],
                ablaufdatum=i["ablaufdatum"],
                auto_restock=i["auto_restock"],
            ) for i in item_rows],
        ))
    return result


@app.post("/api/storages/{storage_id}/groups", response_model=GroupOut, status_code=201)
async def create_group(storage_id: str, body: GroupIn, user: str = Depends(get_current_user)):
    existing = await database.fetch_one(
        groups_table.select().where(
            (groups_table.c.group_name == body.group_name) &
            (groups_table.c.storage_id == storage_id)
        )
    )
    if existing:
        raise HTTPException(409, f"Group '{body.group_name}' already exists in this storage")

    gid = str(uuid.uuid4())
    await database.execute(groups_table.insert().values(
        id=gid, group_name=body.group_name, storage_id=storage_id
    ))
    await log_action(user, "CREATE", "group", gid, {"group_name": body.group_name, "storage_id": storage_id})
    return GroupOut(id=gid, group_name=body.group_name, items=[])


@app.put("/api/groups/{group_id}")
async def update_group(group_id: str, body: GroupUpdate, user: str = Depends(get_current_user)):
    """
    Updates a group.

    :param group_id: The group to update
    :param body: The updated group

    :return: The updated group
    """
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
        SELECT i.id, r.item_name AS name, i.kaufdatum, i.ablaufdatum, r.auto_restock
        FROM items i
        JOIN item_name_to_group_registry r ON i.name_to_group_id = r.id
        WHERE i.group_id = :group_id
        ORDER BY
            CASE WHEN i.ablaufdatum IS NULL THEN 1 ELSE 0 END,
            i.ablaufdatum ASC
    """, values={"group_id": group_id})

    await log_action(user, "UPDATE", "group", group_id, {"group_name": body.group_name})
    return GroupOut(id=group_id, group_name=body.group_name, items=[
        ItemOut(id=i["id"], name=i["name"], kaufdatum=i["kaufdatum"], ablaufdatum=i["ablaufdatum"], auto_restock=i["auto_restock"])
        for i in item_rows
    ])


@app.post("/api/storages/{storage_id}/groups/{group_id}/items", response_model=ItemOut, status_code=201)
async def create_item(storage_id: str, group_id: str, body: ItemIn, user: str = Depends(get_current_user)):
    g = await database.fetch_one(
        groups_table.select().where(
            (groups_table.c.id == group_id) &     # The 'c' is for 'column'
            (groups_table.c.storage_id == storage_id)
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
        if correct_group:
            raise HTTPException(409, detail={
                "message": "Item already registered under a different group",
                "correct_group_id": existing["group_id"],
                "correct_group_name": correct_group["group_name"],
            })
        else:
            # The referenced group no longer exists — update the registry to point to the new group
            await database.execute(
                item_name_registry_table.update()
                .where(item_name_registry_table.c.id == existing["id"])
                .values(group_id=group_id)
            )

    # Register in registry if not yet done
    if not existing:
        reg_id = str(uuid.uuid4())

        # ON CONFLICT DO NOTHING to handle race conditions
        await database.execute("""
            INSERT INTO item_name_to_group_registry (id, item_name, group_id, ean)
            VALUES (:id, :item_name, :group_id, :ean)
            ON CONFLICT (item_name) DO NOTHING
        """, values={"id": reg_id, "item_name": body.name, "group_id": group_id, "ean": body.ean})
        
        # Fetch the actual registry entry -> might have been altered by concurrent request
        existing = await database.fetch_one(
            item_name_registry_table.select().where(
                item_name_registry_table.c.item_name == body.name
            )
        )
        reg_id = existing["id"]
    else:
        reg_id = existing["id"]
        # Set Ean if not in fetched item
        if body.ean and not existing["ean"]:
            await database.execute(
                item_name_registry_table.update().where(
                    item_name_registry_table.c.id == reg_id
                ).values(ean=body.ean)
            )

    iid = str(uuid.uuid4())
    kauf = date.today().isoformat()
    await database.execute(items_table.insert().values(
        id=iid, group_id=group_id,
        kaufdatum=kauf, ablaufdatum=body.ablaufdatum,
        name_to_group_id=reg_id, storage_id=storage_id,
    ))

    await log_action(user, "CREATE", "item", iid, {
        "name": body.name,
        "group_id": group_id,
        "storage_id": storage_id,
        "ablaufdatum": body.ablaufdatum,
        "auto_restock": existing["auto_restock"] if existing else False,
    })

    return ItemOut(
        id=iid,
        name=body.name,
        kaufdatum=kauf,
        ablaufdatum=body.ablaufdatum,
        auto_restock=existing["auto_restock"] if existing else False,
    )


@app.get("/api/group-templates")
async def list_group_templates(user: str = Depends(get_current_user)):
    """
    Return all available group template names in insertion order.
    """
    rows = await database.fetch_all(
        "SELECT group_name FROM group_templates ORDER BY LOWER(group_name) ASC"
    )
    return [row["group_name"] for row in rows]


@app.put("/api/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: str, body: ItemUpdate, user: str = Depends(get_current_user)):
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

    # Update auto-restock settings on registry entry
    current_reg_id = reg_id if 'reg_id' in locals() else row["name_to_group_id"]
    restock_values = {"auto_restock": body.auto_restock}
    if body.min_stock is not None:
        restock_values["min_stock"] = body.min_stock
    if body.restock_target is not None:
        restock_values["restock_target"] = body.restock_target
    await database.execute(
        item_name_registry_table.update()
        .where(item_name_registry_table.c.id == str(current_reg_id))
        .values(**restock_values)
    )

    await log_action(user, "UPDATE", "item", item_id, {
        "name": body.name, "ablaufdatum": body.ablaufdatum,
        "auto_restock": body.auto_restock,
        "min_stock": body.min_stock,
        "restock_target": body.restock_target,
    })
    return ItemOut(id=item_id, name=body.name, kaufdatum=row["kaufdatum"], ablaufdatum=body.ablaufdatum, auto_restock=body.auto_restock)


@app.delete("/api/items/{item_id}", response_model=DeleteItemOut)
async def delete_item(item_id: str, user: str = Depends(get_current_user)):
    row = await database.fetch_one(
        items_table.select()
        .where(items_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Item not found")
    
    group_id = row["group_id"]
    name_to_group_id = row["name_to_group_id"]

    registry_row = await database.fetch_one(
        item_name_registry_table.select().where(
            item_name_registry_table.c.id == row["name_to_group_id"]
        )
    )

    await log_action(user, "DELETE", "item", item_id, {
        "name": registry_row["item_name"] if registry_row else None,
        "group_id": row["group_id"],
        "name_to_group_id": str(name_to_group_id) if name_to_group_id else None,
        "auto_restock": registry_row["auto_restock"] if registry_row else None,
        "min_stock": registry_row["min_stock"] if registry_row else None,
        "restock_target": registry_row["restock_target"] if registry_row else None,
    })

    shopping_list_entry: Optional[ShoppingListItemOut] = None
    if name_to_group_id:
        shopping_list_entry = await trigger_auto_restock(str(name_to_group_id), user)

    # Delete Item
    await database.execute(items_table.delete().where(items_table.c.id == item_id))

    # Check if group is now empty
    if name_to_group_id:
        remaining_with_same_name = await database.fetch_val(
            "SELECT COUNT(*) FROM items WHERE name_to_group_id::text = :reg_id",
            values={"reg_id": str(name_to_group_id)}
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

    return DeleteItemOut(shopping_list_entry=shopping_list_entry)


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


@app.get("/api/barcode/{ean}", response_model=BarcodeResult)
async def lookup_barcode(ean: str, user: str = Depends(get_current_user)):
    """
    Looks up a product by EAN.
    Priority: Own cache -> Open Food Facts DB -> Empty Result.
    Furthermore, resolves a group suggestion via the off_category_mapping table.
    Priority: item_name_to_group_registry -> off_category_mapping -> None
    """

    # Check registry
    registry_entry = await database.fetch_one("""
        SELECT r.item_name, g.group_name
        FROM item_name_to_group_registry r
        JOIN item_groups g ON r.group_id = g.id
        WHERE r.ean = :ean
        LIMIT 1
    """, values={"ean": ean})

    definitive_group = registry_entry["group_name"] if registry_entry else None

    # Search in own cache
    cached = await database.fetch_one(
        ean_product_cache_table.select().where(
            ean_product_cache_table.c.ean == ean
        )
    )

    if cached:
        suggested_group = definitive_group or await resolve_group_suggestion(cached["categories"])
        return BarcodeResult(
            ean=ean,
            product_name=cached["product_name"],
            brand=cached["brand"],
            quantity=cached["quantity"],
            suggested_group=suggested_group,
            from_cache=True,
        )
    
    # No Cache -> Open Food Facts DB
    try:
        async with httpx.AsyncClient(timeout=constants.OFF_QUERY_TIMEOUT_IN_SECONDS) as client:
            res = await client.get(
                f"{constants.OFF_QUERY_BASE_URL}/{ean}?fields={constants.OFF_QUERY_CATEGORIES_STRING}",
                headers={"User-Agent": "InventarApp/1.0 (private use)"},
            )
            data = res.json()
    except Exception:
        raise HTTPException(502, "Open Food Facts API nicht erreichbar.")
    
    if data.get("status") != 1 or not data.get("status_verbose") == "product found" or not data.get("product"):
        # EAN unknown -> Empty reult
        return BarcodeResult(
            ean=ean,
            product_name=None,
            brand=None,
            quantity=None,
            suggested_group=definitive_group,
            from_cache=False,
        )
    
    p = data["product"]

    product_name  = p.get("product_name_de") or p.get("product_name") or None
    brand         = p.get("brands") or None
    quantity      = p.get("quantity") or None
    categories    = p.get("categories_tags") or []
    stores        = p.get("stores_tags") or []
    allergens     = p.get("allergens_tags") or []
    ingredients   = p.get("ingredients_text") or None

    raw_nut = p.get("nutriments") or {}
    nutrition_dict = {k: v for k, v in raw_nut.items() if not k.endswith(("_100g", "_serving", "_unit", "_value"))} or None
    nutrition = json.dumps(nutrition_dict) if nutrition_dict else None

    # Found in OFF DB -> Store in cache
    await database.execute("""
        INSERT INTO ean_product_cache
            (ean, product_name, brand, quantity, categories, stores, nutrition, allergens, ingredients, fetched_at)
        VALUES
            (:ean, :product_name, :brand, :quantity, :categories, :stores, :nutrition, :allergens, :ingredients, :fetched_at)
        ON CONFLICT (ean) DO UPDATE SET
            product_name = EXCLUDED.product_name,
            brand        = EXCLUDED.brand,
            quantity     = EXCLUDED.quantity,
            categories   = EXCLUDED.categories,
            stores       = EXCLUDED.stores,
            nutrition    = EXCLUDED.nutrition,
            allergens    = EXCLUDED.allergens,
            ingredients  = EXCLUDED.ingredients,
            fetched_at   = EXCLUDED.fetched_at
    """, values={
        "ean":          ean,
        "product_name": product_name,
        "brand":        brand,
        "quantity":     quantity,
        "categories":   categories,
        "stores":       stores,
        "nutrition":    nutrition,
        "allergens":    allergens,
        "ingredients":  ingredients,
        "fetched_at":   datetime.now(timezone.utc),
    })

    suggested_group = definitive_group or await resolve_group_suggestion(categories)

    return BarcodeResult(
        ean=ean,
        product_name=product_name,
        brand=brand,
        quantity=quantity,
        suggested_group=suggested_group,
        from_cache=False,
    )


@app.get("/api/shopping-list", response_model=list[ShoppingListItemOut])
async def get_shopping_list(user: str = Depends(get_current_user)):
    """
    Returns all shopping list entries, unchecked first, ordered by creation date.
    """
    rows = await database.fetch_all(
        shopping_list_table.select().order_by(
            shopping_list_table.c.checked_off.asc(),
            shopping_list_table.c.created_at.asc(),
        )
    )
    return [ShoppingListItemOut(
        id=str(r["id"]),
        item_name=r["item_name"],
        quantity=r["quantity"],
        source=r["source"],
        registry_id=str(r["registry_id"]) if r["registry_id"] else None,
        checked_off=r["checked_off"],
        created_at=r["created_at"].isoformat(),
    ) for r in rows]


@app.post("/api/shopping-list", response_model=ShoppingListItemOut, status_code=201)
async def add_shopping_list_item(body: ShoppingListItemIn, user: str = Depends(get_current_user)):
    """
    Manually adds an item to the shopping list.
    If an unchecked entry for the same item already exists, its quantity is incremented instead.
    If no registry_id is provided, attempts to resolve it from the item name registry.
    Items not found in the registry are added as temporary entries (registry_id = NULL).
    """
    # Check if an unchecked entry for this item already exists — update quantity instead
    existing = await database.fetch_one(
        shopping_list_table.select().where(
            (shopping_list_table.c.item_name == body.item_name) &
            (shopping_list_table.c.checked_off == False)
        )
    )
    if existing:
        new_qty = existing["quantity"] + body.quantity
        await database.execute(
            shopping_list_table.update()
            .where(shopping_list_table.c.id == str(existing["id"]))
            .values(quantity=new_qty)
        )
        await log_action(user, "UPDATE", "shopping_list", str(existing["id"]), {
            "item_name": body.item_name, "quantity": new_qty, "source": constants.SHOPPING_LIST_SOURCE_MANUAL
        })
        return ShoppingListItemOut(
            id=str(existing["id"]),
            item_name=existing["item_name"],
            quantity=new_qty,
            source=existing["source"],
            registry_id=str(existing["registry_id"]) if existing["registry_id"] else None,
            checked_off=False,
            created_at=existing["created_at"].isoformat(),
        )

    # Resolve registry_id if not provided
    registry_id = body.registry_id
    if not registry_id:
        reg = await database.fetch_one(
            item_name_registry_table.select().where(
                item_name_registry_table.c.item_name == body.item_name
            )
        )
        registry_id = str(reg["id"]) if reg else None

    sid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await database.execute(shopping_list_table.insert().values(
        id=sid,
        item_name=body.item_name,
        quantity=body.quantity,
        source=constants.SHOPPING_LIST_SOURCE_MANUAL,
        registry_id=registry_id,
        checked_off=False,
        created_at=now,
    ))
    await log_action(user, "CREATE", "shopping_list", sid, {
        "item_name": body.item_name, "quantity": body.quantity, "source": constants.SHOPPING_LIST_SOURCE_MANUAL
    })
    return ShoppingListItemOut(
        id=sid,
        item_name=body.item_name,
        quantity=body.quantity,
        source=constants.SHOPPING_LIST_SOURCE_MANUAL,
        registry_id=registry_id,
        checked_off=False,
        created_at=now.isoformat(),
    )


@app.patch("/api/shopping-list/{item_id}", response_model=ShoppingListItemOut)
async def patch_shopping_list_item(item_id: str, body: ShoppingListItemPatch, user: str = Depends(get_current_user)):
    """
    Partially updates a shopping list entry.
    Supports checking/unchecking and changing the quantity.
    """
    row = await database.fetch_one(
        shopping_list_table.select().where(shopping_list_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Shopping list item not found")

    updates = {}
    if body.checked_off is not None:
        updates["checked_off"] = body.checked_off
    if body.quantity is not None:
        updates["quantity"] = body.quantity

    if updates:
        await database.execute(
            shopping_list_table.update()
            .where(shopping_list_table.c.id == item_id)
            .values(**updates)
        )
        await log_action(user, "UPDATE", "shopping_list", item_id, updates)

    updated = {**dict(row), **updates}
    return ShoppingListItemOut(
        id=str(updated["id"]),
        item_name=updated["item_name"],
        quantity=updated["quantity"],
        source=updated["source"],
        registry_id=str(updated["registry_id"]) if updated["registry_id"] else None,
        checked_off=updated["checked_off"],
        created_at=updated["created_at"].isoformat(),
    )


@app.delete("/api/shopping-list/{item_id}", status_code=204)
async def delete_shopping_list_item(item_id: str, user: str = Depends(get_current_user)):
    """
    Permanently removes a single shopping list entry.
    """
    row = await database.fetch_one(
        shopping_list_table.select().where(shopping_list_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Shopping list item not found")
    await database.execute(
        shopping_list_table.delete().where(shopping_list_table.c.id == item_id)
    )
    await log_action(user, "DELETE", "shopping_list", item_id, {
        "item_name": row["item_name"], "quantity": row["quantity"], "source": row["source"]
    })


@app.delete("/api/shopping-list", status_code=204)
async def clear_checked_shopping_list_items(user: str = Depends(get_current_user)):
    """
    Permanently removes all checked-off entries from the shopping list.
    """
    rows = await database.fetch_all(
        shopping_list_table.select().where(shopping_list_table.c.checked_off == True)
    )
    await database.execute(
        shopping_list_table.delete().where(shopping_list_table.c.checked_off == True)
    )
    await log_action(user, "DELETE", "shopping_list", "bulk", {
        "cleared_count": len(rows), "source": "clear_checked"
    })


@app.get("/api/items/{item_id}/restock-settings", response_model=RestockSettingsOut)
async def get_restock_settings(item_id: str, user: str = Depends(get_current_user)):
    """
    Returns the auto-restock settings for the registry entry linked to this item.
    """
    row = await database.fetch_one(
        items_table.select().where(items_table.c.id == item_id)
    )
    if not row:
        raise HTTPException(404, "Item not found")
    if not row["name_to_group_id"]:
        return RestockSettingsOut(auto_restock=False, min_stock=None, restock_target=None)
    reg = await database.fetch_one(
        item_name_registry_table.select().where(
            item_name_registry_table.c.id == str(row["name_to_group_id"])
        )
    )
    if not reg:
        return RestockSettingsOut(auto_restock=False, min_stock=None, restock_target=None)
    return RestockSettingsOut(
        auto_restock=reg["auto_restock"],
        min_stock=reg["min_stock"],
        restock_target=reg["restock_target"],
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
async def resolve_group_suggestion(categories: list[str] | None) -> str | None:
    """
    Maps a list of Open Food Facts Category tags to the most frequent
    matching app group.
    Returns None if no mapping exists.
    """
    if not categories:
        return None
    
    rows = await database.fetch_all("""
        SELECT app_group_name, COUNT(*) as hits
        FROM off_category_mapping
        WHERE off_category = ANY(:categories)
        GROUP BY app_group_name
        ORDER BY hits DESC, app_group_name ASC
        LIMIT 1
    """, values={"categories": categories})

    if rows:
        return rows[0]["app_group_name"]
    return None


async def get_storage_id(storage_id: str) -> str:
    """
    Resolves a storage id

    :param storage_id: The storage id to resolve
    :returns: The storage id if existing
    :raises 404: If the storage does not exist 
    """
    row = await database.fetch_one(
        storages_table.select().where(storages_table.c.id == storage_id)
    )
    if not row:
        raise HTTPException(404, f"Storage '{storage_id}' not found")
    return storage_id


async def log_action(user: str, action: str, entity_type: str, entity_id: str, payload: dict):
    """
    Writes a CRUD audit log entry. Failures are swallowed so logging never
    breaks the actual operation.
    """
    try:
        await database.execute(crud_logs_table.insert().values(
            user_email=user,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=payload,
        ))
    except Exception as e:
        print(f"Warning: Failed to write audit log: {e}")


async def trigger_auto_restock(registry_id: str, user: str) -> Optional[ShoppingListItemOut]:
    """
    Checks if the remaining stock of an item has fallen below its min_stock threshold.
    If so, calculates the quantity needed to reach restock_target and adds/updates
    a shopping list entry. Should be called after every item deletion.
    """
    reg = await database.fetch_one(
        item_name_registry_table.select().where(
            item_name_registry_table.c.id == registry_id
        )
    )
    if not reg or not reg["auto_restock"]:
        return None
    if reg["min_stock"] is None or reg["restock_target"] is None:
        return None

    # Count remaining stock across all storages
    current_stock = await database.fetch_val(
        "SELECT COUNT(*) FROM items WHERE name_to_group_id::text = :reg_id",
        values={"reg_id": registry_id}
    )

    stock_after_deletion = current_stock - 1
    if stock_after_deletion > reg["min_stock"]:
        return None

    quantity_needed = reg["restock_target"] - stock_after_deletion
    if quantity_needed <= 0:
        return None

    # Check if an unchecked entry already exists — update it instead of inserting
    existing = await database.fetch_one(
        shopping_list_table.select().where(
            (sqlalchemy.cast(shopping_list_table.c.registry_id, sqlalchemy.String) == registry_id) &
            (shopping_list_table.c.checked_off == False)
        )
    )

    if existing:
        if quantity_needed <= existing["quantity"]:
            # Existing quantity is already higher
            return None
        await database.execute(
            shopping_list_table.update()
            .where(shopping_list_table.c.id == str(existing["id"]))
            .values(quantity=quantity_needed)
        )
        await log_action(user, "UPDATE", "shopping_list", str(existing["id"]), {
            "item_name": reg["item_name"],
            "quantity": quantity_needed,
            "source": constants.SHOPPING_LIST_SOURCE_AUTO,
            "reason": "auto_restock_trigger",
            "current_stock": current_stock,
        })
        return ShoppingListItemOut(
            id=str(existing["id"]),
            item_name=existing["item_name"],
            quantity=quantity_needed,
            source=existing["source"],
            registry_id=str(existing["registry_id"]) if existing["registry_id"] else None,
            checked_off=False,
            created_at=existing["created_at"].isoformat(),
        )
    else:
        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await database.execute(shopping_list_table.insert().values(
            id=sid,
            item_name=reg["item_name"],
            quantity=quantity_needed,
            source=constants.SHOPPING_LIST_SOURCE_AUTO,
            registry_id=registry_id,
            checked_off=False,
            created_at=now,
        ))
        await log_action(user, "CREATE", "shopping_list", sid, {
            "item_name": reg["item_name"],
            "quantity": quantity_needed,
            "source": constants.SHOPPING_LIST_SOURCE_AUTO,
            "reason": "auto_restock_trigger",
            "current_stock": current_stock,
        })
        return ShoppingListItemOut(
            id=sid,
            item_name=reg["item_name"],
            quantity=quantity_needed,
            source=constants.SHOPPING_LIST_SOURCE_AUTO,
            registry_id=registry_id,
            checked_off=False,
            created_at=now.isoformat(),
        )