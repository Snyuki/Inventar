import { BarcodeResult, DeleteItemResult, Item, ItemGroup, RestockSettings, ShoppingListItem, Storage, PreferredInput } from "../types";
import { supabase } from "./supabase";

// Fallback to /api for dev stage
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

async function headers() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? '';
    console.log("Token:", token ? "present" : "MISSING", "Session:", data.session?.user?.email)
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
    };
}

/*
* Does the error handling
* 
* Parameters: Response
* Returns: Content depending on response
* Throws: Error if Response is an Error
*/
async function handleResponse(res: Response): Promise<any> {
    if (!res.ok) {
        let message = `Request fehlgeschlafen (${res.status})`;
        try {
            const body = await res.json();
            
            // Throw structured error in case of 409
            if (res.status === 409) {
                throw { status: 409, detail: body.detail };
            }

            // Handle Fastapi validation errors
            if (typeof body.detail === "string") {
                message = body.detail;
            } else if (Array.isArray(body.detail)) {
                message = body.detail.map((e: any) => e.msg.replace(/^Value error,\s*/i, "")).join(", ");
            }
        } catch (e: any) {
            if (e.status === 409) throw e;      // Rethrow 409 conflict error again
        }
        throw new Error(message);
    }
    // 204 has no content -> no parsing
    if (res.status === 204) return null;
    return res.json();
};

export async function checkWhitelist(token: string): Promise<boolean> {
    const res = await fetch(`${BASE_URL}/auth/check`, {
        method: "GET",
        headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        },
    });
    return res.ok;
}

export async function savePreferredInput(value: PreferredInput): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: { preferred_input: value },
  });
  if (error) throw new Error(error.message);
}

export async function fetchStorages(): Promise<Storage[]> {
    const res = await fetch(`${BASE_URL}/storages`, {
        headers: await headers(),
    });
    const data = await handleResponse(res);
    return data.map((storage: any) => ({ id: storage.id, name: storage.name }));
}
 
export async function createGroup(storageId: string, groupName: string): Promise<ItemGroup> {
  const res = await fetch(`${BASE_URL}/storages/${storageId}/groups`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ group_name: groupName }),
  });
  const g = await handleResponse(res);
  return { id: g.id, groupName: g.group_name, items: [] };
}

export async function fetchGroups(storageId: string): Promise<ItemGroup[]> {
    const res = await fetch(`${BASE_URL}/storages/${storageId}/groups`, {
        headers: await headers(),
    });
    const data = await handleResponse(res);
    return data.map((g: any) => ({
        id: g.id,
        groupName: g.group_name,
        items: g.items.map((i: any) => ({
            id: i.id,
            name: i.name,
            kaufdatum: i.kaufdatum,
            ablaufdatum: i.ablaufdatum ?? null,
            auto_restock: i.auto_restock ?? false,
        })),
    }));
}

export async function updateGroup(groupId: string, groupName: string): Promise<ItemGroup> {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`, {
        method: "PUT",
        headers: await headers(),
        body: JSON.stringify({ group_name: groupName}),
    });
    const g = await handleResponse(res);
    return { id: g.id, groupName: g.group_name, items: g.items.map((i: any) => ({
        id: i.id, name: i.name, kaufdatum: i.kaufdatum,
        ablaufdatum: i.ablaufdatum ?? null,
        auto_restock: i.auto_restock ?? false,
    }))};
}

export async function fetchGroupTemplates(): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/group-templates`, {
        headers: await headers(),
    });
    return handleResponse(res);
}

export async function addItem(
    storageId: string,
    groupId: string,
    name: string,
    ablaufdatum: string | null,
    ean: string | null = null
): Promise<Item> {
    const res = await fetch(`${BASE_URL}/storages/${storageId}/groups/${groupId}/items`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ name, ablaufdatum: ablaufdatum || null, ean }),
    });
    const i = await handleResponse(res);
    return {
        id: i.id,
        name: i.name,
        kaufdatum: i.kaufdatum,
        ablaufdatum: i.ablaufdatum ?? null,
        auto_restock: i.auto_restock ?? false,
    }
}

export async function updateItem(
  itemId: string,
  name: string,
  ablaufdatum: string | null,
  auto_restock: boolean = false,
  min_stock: number | null = null,
  restock_target: number | null = null,
): Promise<Item> {
  const res = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify({ name, ablaufdatum: ablaufdatum || null, auto_restock, min_stock, restock_target }),
  });
  const i = await handleResponse(res);
  return { id: i.id, name: i.name, kaufdatum: i.kaufdatum, ablaufdatum: i.ablaufdatum ?? null, auto_restock: i.auto_restock ?? false };
}
 
export async function deleteItem(itemId: string): Promise<DeleteItemResult> {
  const res = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: "DELETE",
    headers: await headers(),
  });
  return handleResponse(res);
}

export async function fetchItemSuggestions(query: string): Promise<Array<{ name: string; groupName: string }>> {
    const res = await fetch(`${BASE_URL}/items/suggestions?q=${encodeURIComponent(query)}`, {
        headers: await headers(),
    });
    return handleResponse(res);
}

export async function lookupBarcode(ean: string): Promise<BarcodeResult> {
    const res = await fetch(`${BASE_URL}/barcode/${ean}`, {
        headers: await headers(),
    });
    return handleResponse(res);
}
 

// ---------------------------------------------------------------------------
// Shopping List
// ---------------------------------------------------------------------------
 
 
export async function fetchShoppingList(): Promise<ShoppingListItem[]> {
    const res = await fetch(`${BASE_URL}/shopping-list`, {
        headers: await headers(),
    });
    return handleResponse(res);
}
 
export async function addShoppingListItem(item_name: string, quantity: number): Promise<ShoppingListItem> {
    const res = await fetch(`${BASE_URL}/shopping-list`, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ item_name, quantity }),
    });
    return handleResponse(res);
}
 
export async function patchShoppingListItem(id: string, updates: { checked_off?: boolean; quantity?: number }): Promise<ShoppingListItem> {
    const res = await fetch(`${BASE_URL}/shopping-list/${id}`, {
        method: "PATCH",
        headers: await headers(),
        body: JSON.stringify(updates),
    });
    return handleResponse(res);
}
 
export async function deleteShoppingListItem(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/shopping-list/${id}`, {
        method: "DELETE",
        headers: await headers(),
    });
    await handleResponse(res);
}
 
export async function clearCheckedShoppingListItems(): Promise<void> {
    const res = await fetch(`${BASE_URL}/shopping-list`, {
        method: "DELETE",
        headers: await headers(),
    });
    await handleResponse(res);
}

export async function fetchRestockSettings(itemId: string): Promise<RestockSettings> {
    const res = await fetch(`${BASE_URL}/items/${itemId}/restock-settings`, {
        headers: await headers(),
    });
    return handleResponse(res);
}