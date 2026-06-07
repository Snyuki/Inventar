import { Item, ItemGroup, ItemStatus } from "../types";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateId(): string {
  return "id-" + Math.random().toString(36).slice(2, 9);
}

export function itemStatus(item: Item): ItemStatus {
  if (!item.ablaufdatum) return "noexp";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(item.ablaufdatum + "T00:00:00");
  if (exp < now) return "expired";
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 2);
  if (exp <= soon) return "expiring";
  return "ok";
}

export function groupStatus(group: ItemGroup): ItemStatus {
  const statuses = group.items.map(itemStatus);
  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("expiring")) return "expiring";
  return "ok";
}

export function earliestExpiry(group: ItemGroup): string | null {
  const dates = group.items
    .filter(i => i.ablaufdatum)
    .map(i => i.ablaufdatum as string)
    .sort();
  return dates[0] ?? null;
}

export function sortItemsByExpiry(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (!a.ablaufdatum && !b.ablaufdatum) return 0;
    if (!a.ablaufdatum) return 1;
    if (!b.ablaufdatum) return -1;
    return a.ablaufdatum.localeCompare(b.ablaufdatum);
  });
}