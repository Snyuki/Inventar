import { Item, ItemGroup } from "../types";
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
            // Handle Fastapi validation errors
            if (typeof body.detail === "string") {
                message = body.detail;
            } else if (Array.isArray(body.detail)) {
                message = body.detail.map((e: any) => e.msg).join(", ");
            }
        } catch {
            throw new Error("Errorhandling failed.");
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
 
export async function createGroup(groupName: string): Promise<ItemGroup> {
  const res = await fetch(`${BASE_URL}/groups`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ group_name: groupName }),
  });
  const g = await handleResponse(res);
  return { id: g.id, groupName: g.group_name, items: [] };
}

export async function fetchGroups(): Promise<ItemGroup[]> {
    const res = await fetch(`${BASE_URL}/groups`, {
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
        id: i.id, name: i.name, kaufdatum: i.kaufdatum, ablaufdatum: i.expiry_date ?? null,
    }))};
}

export async function addItem(
    groupId: string,
    name: string,
    ablaufdatum: string | null
): Promise<Item> {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/items`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ name, ablaufdatum: ablaufdatum || null }),
    });
    const i = await handleResponse(res);
    return {
        id: i.id,
        name: i.name,
        kaufdatum: i.kaufdatum,
        ablaufdatum: i.ablaufdatum ?? null,
    }
}

export async function updateItem(
  itemId: string,
  name: string,
  ablaufdatum: string | null
): Promise<Item> {
  const res = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: "PUT",
    headers: await headers(),
    body: JSON.stringify({ name, ablaufdatum: ablaufdatum || null }),
  });
  const i = await handleResponse(res);
  return { id: i.id, name: i.name, kaufdatum: i.kaufdatum, ablaufdatum: i.ablaufdatum ?? null };
};
 
export async function deleteItem(itemId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/items/${itemId}`, {
    method: "DELETE",
    headers: await headers(),
  });
  await handleResponse(res);
}