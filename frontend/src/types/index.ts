export interface Item {
  id: string;
  name: string;
  ablaufdatum: string | null;  // ISO date string "YYYY-MM-DD"
  kaufdatum: string;          // ISO date string "YYYY-MM-DD" — auto-set on creation
  auto_restock: boolean;
}

export interface ItemGroup {
  id: string;
  groupName: string;
  items: Item[];
}

export interface Storage {
  id: string;
  name: string;
}

export type ItemStatus = "expired" | "expiring" | "ok" | "noexp";

export interface RestockSettings {
    auto_restock: boolean;
    min_stock: number | null;
    restock_target: number | null;
}

export interface ShoppingListItem {
    id: string;
    item_name: string;
    quantity: number;
    source: string;
    registry_id: string | null;
    checked_off: boolean;
    created_at: string;
}

export interface DeleteItemResult {
  shopping_list_entry: ShoppingListItem | null;
}

export interface BarcodeResult {
    ean: string;
    product_name: string | null;
    brand: string | null;
    quantity: string | null;
    suggested_group: string | null;
    from_cache: boolean;
}