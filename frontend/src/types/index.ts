export interface Item {
  id: string;
  name: string;
  ablaufdatum: string | null;  // ISO date string "YYYY-MM-DD"
  kaufdatum: string;          // ISO date string "YYYY-MM-DD" — auto-set on creation
}

export interface ItemGroup {
  id: string;
  groupName: string;
  items: Item[];
}

export type ItemStatus = "expired" | "expiring" | "ok" | "noexp";
