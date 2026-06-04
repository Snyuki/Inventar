import * as Accordion from "@radix-ui/react-accordion";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { format } from "date-fns";
import {
  ChevronDown,
  Edit,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addItem,
  createGroup,
  deleteItem,
  fetchGroups,
  fetchItemSuggestions,
  fetchRestockSettings,
  updateItem,
} from "../lib/api";
import { earliestExpiry, groupStatus, itemStatus } from "../lib/utils";
import { Item, ItemGroup, ShoppingListItem } from "../types";
import BarcodeScanner from "./BarcodeScanner";
import NumberScrollPicker from "./NumberScrollPicker";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
type EditTarget   = { groupId: string; item: Item } | null;
type DeleteTarget = { groupId: string; itemId: string } | null;
type ATGTarget    = string | null;

interface VisualGroup {
  key: string;
  name: string;
  ablaufdatum: string | null;
  count: number;
  representativeId: string; // ID of one item, used for edit/delete
  groupId: string;
  groupName: string;
  autoRestock: boolean;
}

interface Props {
  storageId: string;
  groupTemplates: string[];
  onAutoRestock?: (entry: ShoppingListItem) => void;
}


export default function InventoryView({ storageId, groupTemplates, onAutoRestock }: Props) {
  // Data
  const [groups, setGroups]                 = useState<ItemGroup[]>([]);
  const [dataError, setDataError]           = useState<string | null>(null);
  const [formError, setFormError]           = useState<string | null>(null);

  // Dialogs
  const [addOpen,      setAddOpen]                = useState(false);
  const [editOpen,     setEditOpen]               = useState(false);
  const [atgOpen,      setAtgOpen]                = useState(false);
  const [scannerOpen, setScannerOpen]             = useState(false);
  const [deleteOpen,   setDeleteOpen]             = useState(false);
  const [editTarget,   setEditTarget]             = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget]           = useState<DeleteTarget>(null);
  const [atgTarget,    setAtgTarget]              = useState<ATGTarget>(null);
  const [dataLoading, setDataLoading]             = useState(false);
  const [deleteLoading, setDeleteLoading]         = useState(false);
  const [insertItemLoading, setInsertItemLoading] = useState(false); 

  // Form fields
  const [newGroup,   setNewGroup]             = useState("");
  const [newName,    setNewName]              = useState("");
  const [newExpiry,  setNewExpiry]            = useState("");
  const [editName,   setEditName]             = useState("");
  const [editExpiry, setEditExpiry]           = useState("");
  const [atgExpiry,  setAtgExpiry]            = useState("");
  const [newCount,  setNewCount]              = useState(1);
  const [atgCount,  setAtgCount]              = useState(1);
  const [atgName, setAtgName]                 = useState("");

  // Barcode
  const [scannedEan, setScannedEan]   = useState<string | null>(null);
  const [eanNotFound, setEanNotFound] = useState<string | null>(null);

  // Autocomplete
  const [nameSuggestions, setNameSuggestions] = useState<Array<{ name: string; groupName: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Restock
  const [editAutoRestock,   setEditAutoRestock]   = useState(false);
  const [editMinStock,      setEditMinStock]       = useState<number | null>(null);
  const [editRestockTarget, setEditRestockTarget] = useState<number | null>(null);
  const [restockLoading,    setRestockLoading]    = useState(false);

  // UI state
  const [search,        setSearch]        = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  // Swipe-to-delete state
  const [swipeState, setSwipeState] = useState<{
    itemId: string;
    offset: number;
    rowWidth: number;
  } | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // ---- Data loading ---------------------------------------------------
  // Load Inventory
  useEffect(() => {
      setDataLoading(true);
      setDataError(null);
      fetchGroups(storageId)
      .then(setGroups)
      .catch(() => setDataError("Failed to load inventory. Is the backend running?"))
      .finally(() => setDataLoading(false));
  }, [storageId]);

  // ---- Filter helpers -------------------------------------------------
  const toggleFilter = (f: string) =>
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const filters = [
    { id: "expired",  label: "Expired",      color: "red"    },
    { id: "expiring", label: "Expiring Soon", color: "yellow" },
    { id: "ok",       label: "Not Expired",   color: "green"  },
    { id: "noexp",    label: "No Expiry",     color: "gray"   },
    { id: "auto_restock", label: "Auto-Restock",   color: "blue"   },
  ];

    // ---- Swipe helpers --------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent, itemId: string) => {
    const target = e.currentTarget.closest(".swipeable-item") as HTMLElement;
    if (!target) return;
    setTouchStart(e.touches[0].clientX);
    setSwipeState({ itemId, offset: 0, rowWidth: target.offsetWidth });
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null || !swipeState) return;
    const diff = touchStart - e.touches[0].clientX;
    if (diff > 0) setSwipeState(s => s ? { ...s, offset: Math.min(diff, s.rowWidth) } : s);
  };
  const handleTouchEnd = (groupId: string, itemId: string) => {
    if (swipeState?.itemId === itemId && swipeState.offset >= swipeState.rowWidth * 0.5)
      deleteItemDirectly(groupId, itemId);
    setSwipeState(null); setTouchStart(null);
  };
  const handleMouseDown = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    const target = e.currentTarget.closest(".swipeable-item") as HTMLElement;
    if (!target) return;
    setTouchStart(e.clientX);
    setSwipeState({ itemId, offset: 0, rowWidth: target.offsetWidth });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (touchStart === null || !swipeState) return;
    const diff = touchStart - e.clientX;
    if (diff > 0) setSwipeState(s => s ? { ...s, offset: Math.min(diff, s.rowWidth) } : s);
  };
  const handleMouseUp = (groupId: string, itemId: string) => {
    if (swipeState?.itemId === itemId && swipeState.offset >= swipeState.rowWidth * 0.5)
      deleteItemDirectly(groupId, itemId);
    setSwipeState(null); setTouchStart(null);
  };

  const swipeStyle = (itemId: string) => ({
    transform:  swipeState?.itemId === itemId ? `translateX(-${swipeState.offset}px)` : "translateX(0)",
    transition: swipeState?.itemId === itemId ? "none" : "transform 0.2s ease-out",
  });

  // ---- Autocomplete ---------------------------------------------------
  const handleNewNameChange = async (currentNewName: string) => {
    setNewName(currentNewName);
    if (currentNewName.trim().length === 0) {
      setNameSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const suggestions = await fetchItemSuggestions(currentNewName.trim());
      setNameSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } catch (e) {
      setNameSuggestions([]);
      setShowSuggestions(false);
      console.log("Couldnt set Suggestions: ", e);
    }
  }

  const handleSuggestionSelect = (suggestion: { name: string; groupName: string }) => {
    setNewName(suggestion.name);
    setNewGroup(suggestion.groupName);
    setNameSuggestions([]);
    setShowSuggestions(false);
  }

  // ---- CRUD -----------------------------------------------------------
  const deleteItemDirectly = async (groupId: string, itemId: string) => {
    try {
      const result = await deleteItem(itemId);
      setGroups(prev =>
        prev
          .map(g => g.id === groupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g)
          .filter(g => g.items.length > 0)
      );
      if (result?.shopping_list_entry && onAutoRestock) {
        onAutoRestock(result.shopping_list_entry);
      }
    } catch {
      alert("Failed to delete item.");
    }
  };

  const handleAddItem = async () => {
    if (!newGroup.trim() || !newName.trim()) return;
    setFormError(null);
    setInsertItemLoading(true);
    try {
      const existingGroup = groups.find(g => g.groupName.toLowerCase() === newGroup.trim().toLowerCase());
      
      if (existingGroup) {
        // Promise.all gives race conditions so generic loop
        const newItems: Item[] = [];
        for (let i = 0; i < newCount; i++) {
          const item = await addItem(storageId, existingGroup.id, newName.trim(), newExpiry || null, scannedEan);
          newItems.push(item);
        }
        setGroups(prev => prev.map(g => g.id === existingGroup.id ? { ...g, items: [...g.items, ...newItems] } : g));
      } else {
        const group = await createGroup(storageId, newGroup.trim());   // Note: This is the active groups; not the templates
        const newItems: Item[] = [];
        for (let i = 0; i < newCount; i++) {
          const item = await addItem(storageId, group.id, newName.trim(), newExpiry || null);
          newItems.push(item);
        }
        setGroups(prev => [...prev, { ...group, items: newItems }]);
      }

      setNewGroup("");
      setNewName("");
      setNewExpiry("");
      setNewCount(1);
      setScannedEan(null);
      setAddOpen(false);
    } catch (e: any) {
      if (e.status === 409 && e.detail?.correct_group_name) {
        // Auto switch group name and inform the user
        setNewGroup(e.detail.correct_group_name)
        setFormError(`"${newName.trim()}" gehört zur Gruppe "${e.detail.correct_group_name}". Gruppe wurde automatisch angepasst — bitte erneut bestätigen.`)
      } else {
        setFormError(e instanceof Error ? e.message : "Failed to add item.");
      }
    } finally {
      setInsertItemLoading(false);
    }
  };

  const handleAddToGroup = async () => {
    if (!atgTarget) return;
    setFormError(null);
    const group = groups.find(g => g.id === atgTarget);
    if (!group) return;
    try {
      const newItems = await Promise.all(
        Array.from({ length: atgCount }, (_, i) =>
          addItem(storageId, group.id, atgName.trim() || group.groupName, atgExpiry || null, scannedEan)
        )
      );
      setGroups(prev => prev.map(g => g.id === atgTarget ? { ...g, items: [...g.items, ...newItems] } : g));
      
      setAtgExpiry("");
      setAtgName("");
      setAtgCount(1);
      setScannedEan(null);
      setAtgOpen(false);

    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to add item.");
    }
  };

  const openEdit = async (groupId: string, item: Item) => {
    setEditTarget({ groupId, item });
    setEditName(item.name);
    setEditExpiry(item.ablaufdatum ?? "");
    setEditAutoRestock(false);
    setEditMinStock(null);
    setEditRestockTarget(null);
    setEditOpen(true);
    setRestockLoading(true);
    try {
      const settings = await fetchRestockSettings(item.id);
      setEditAutoRestock(settings.auto_restock);
      setEditMinStock(settings.min_stock);
      setEditRestockTarget(settings.restock_target);
    } catch {
      // Non-critical — restock settings default to off
    } finally {
      setRestockLoading(false);
    }
};

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setFormError(null);
    try {
      const updated = await updateItem(
        editTarget.item.id,
        editName.trim(),
        editExpiry || null,
        editAutoRestock,
        editMinStock,
        editRestockTarget,
      );
      setGroups(prev => prev.map(g =>
        g.id === editTarget.groupId
          ? { ...g, items: g.items.map(i => i.id === updated.id ? updated : i) }
          : g
      ));
      setEditOpen(false);
    } catch (e: any) {
      if (e.status === 409 && e.detail?.correct_group_name) {
        setFormError(`"${editName.trim()}" gehört bereits zur Gruppe "${e.detail.correct_group_name}". Umbenennung nicht möglich.`);
      } else {
        setFormError(e instanceof Error ? e.message : "Failed to save changes.");
      }
    }
  };

  const openDelete = (groupId: string, itemId: string) => {
    setDeleteTarget({ groupId, itemId }); setDeleteOpen(true);
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setFormError(null);
    try {
      const result = await deleteItem(deleteTarget.itemId);
      setGroups(prev =>
        prev
          .map(g => g.id === deleteTarget.groupId
            ? { ...g, items: g.items.filter(i => i.id !== deleteTarget.itemId) }
            : g)
          .filter(g => g.items.length > 0)
      );
      setDeleteOpen(false);
      if (result?.shopping_list_entry && onAutoRestock) {
        onAutoRestock(result.shopping_list_entry);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to delete item.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ---- Derived data ---------------------------------------------------
  const isSearching = search.trim() !== "" || activeFilters.length > 0;

  const searchResults = useMemo(() => {
    const q = search.toLowerCase();
    const allItems: Array<{ item: Item; groupName: string; groupId: string }> = [];
    groups.forEach(group =>
      group.items.forEach(item => {
        const s = itemStatus(item);
        const matchText   = !q || item.name.toLowerCase().includes(q) || group.groupName.toLowerCase().includes(q);
        const matchFilter = activeFilters.length === 0 ||
          activeFilters.includes(s) ||
          (activeFilters.includes("ok") && s === "expiring") ||
          (activeFilters.includes("auto_restock") && item.auto_restock);
        if (matchText && matchFilter) allItems.push({ item, groupName: group.groupName, groupId: group.id });
      })
    );
    const byGroup = new Map<string, { groupName: string; items: Item[] }>();
    for (const { item, groupName, groupId } of allItems) {
      if (!byGroup.has(groupId)) byGroup.set(groupId, { groupName, items: [] });
      byGroup.get(groupId)!.items.push(item);
    }
    const result: VisualGroup[] = [];
    for (const [groupId, { groupName, items }] of byGroup) {
      result.push(...toVisualGroups(items, groupId, groupName));
    }
    return result;
  }, [search, groups, activeFilters]);

  // ---- Style helpers --------------------------------------------------
  const filterBtnClass = (id: string, color: string) => {
    const base   = "px-3 py-1 rounded-full text-sm transition-colors border-0 cursor-pointer";
    const active = activeFilters.includes(id);
    const map: Record<string, string> = {
      red:    active ? "bg-red-600 text-white"    : "bg-red-100 text-red-700 hover:bg-red-200",
      yellow: active ? "bg-yellow-500 text-white" : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
      green:  active ? "bg-green-600 text-white"  : "bg-green-100 text-green-700 hover:bg-green-200",
      gray:   active ? "bg-gray-600 text-white"   : "bg-gray-100 text-gray-700 hover:bg-gray-200",
      blue:   active ? "bg-blue-600 text-white"   : "bg-blue-100 text-blue-700 hover:bg-blue-200",
    };
    return `${base} ${map[color]}`;
  };

  const itemDateInfo = (item: Item) => {
    const s = itemStatus(item);
    const cls    = s === "expired" ? "text-red-600 font-medium" : s === "expiring" ? "text-yellow-600 font-medium" : "text-gray-500";
    const suffix = s === "expired" ? " (Expired)" : s === "expiring" ? " (Expiring Soon)" : "";
    
    let label = "Not set";
    if (item.ablaufdatum) {
      const parsed = new Date(item.ablaufdatum + "T00:00:00");
      label = isNaN(parsed.getTime())
        ? "Ungültiges Datum"
        : format(parsed, "dd.MM.yyyy") + suffix
    }
    return { cls, label, s };
  };

  // ---- Sub-components -------------------------------------------------
  function CountPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
    const counts = Array.from({ length: 20 }, (_, i) => i + 1);
    const selectedRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      selectedRef.current?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
    }, [value]);

    return (
      <div>
        <label className="block mb-2 text-sm text-gray-700">Anzahl</label>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {counts.map(n => (
            <button
              key={n}
              ref={n === value ? selectedRef : null}
              type="button"
              onClick={() => onChange(n)}
              className={`flex-shrink-0 w-10 h-10 rounded-lg text-sm font-medium snap-start transition-colors
                ${value === n
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function toVisualGroups(items: Item[], groupId: string, groupName: string): VisualGroup[] {
    const map = new Map<string, VisualGroup>();
    for (const item of items) {
      const key = `${groupId}::${item.name}::${item.ablaufdatum ?? ""}`;
      if (map.has(key)) {
        map.get(key)!.count++;
      } else {
        map.set(key, {
          key,
          name: item.name,
          ablaufdatum: item.ablaufdatum,
          count: 1,
          representativeId: item.id,
          groupId,
          groupName,
          autoRestock: item.auto_restock,
        });
      }
    }
    return Array.from(map.values());
  }

  // ---- Render ---------------------------------------------------------
  return (
    <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1>Inventory List</h1>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          onClick={() => { setNewGroup(""); setNewName(""); setNewExpiry(""); setAddOpen(true); setScannerOpen(true); }}
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Search + Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map(f => (
            <button key={f.id} className={filterBtnClass(f.id, f.color)} onClick={() => toggleFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {dataLoading && (
        <div className="text-center py-8 text-gray-500">Loading inventory...</div>
      )}
      {dataError && (
        <div className="text-center py-8 text-red-500">{dataError}</div>
      )}

      {/* ── Search/filter mode: flat list ── */}
      {!dataLoading && !dataError && (isSearching ? (
        <div className="space-y-2">
          {searchResults.length > 0 ? searchResults.map(vg => {
            const { cls, label, s } = itemDateInfo({ id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "", auto_restock: vg.autoRestock });
            const border = s === "expired" ? "border-red-400" : s === "expiring" ? "border-yellow-400" : "border-gray-200";
            const bg     = s === "expired" ? "bg-red-50"      : s === "expiring" ? "bg-yellow-50"      : "bg-white";
            return (
              <div key={vg.key} className={`relative overflow-hidden rounded border swipeable-item ${border}`}>
                <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-6">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div
                  className={`flex flex-col xs:flex-row xs:items-center xs:justify-between p-3 bg-white relative gap-1 xs:gap-0`}
                  style={swipeStyle(vg.representativeId)}
                  onTouchMove={swipeState?.itemId === vg.representativeId ? handleTouchMove : undefined}
                  onTouchEnd={swipeState?.itemId === vg.representativeId ? () => handleTouchEnd(vg.groupId, vg.representativeId) : undefined}
                  onMouseMove={swipeState?.itemId === vg.representativeId ? handleMouseMove : undefined}
                  onMouseUp={swipeState?.itemId === vg.representativeId ? () => handleMouseUp(vg.groupId, vg.representativeId) : undefined}
                  onMouseLeave={() => { if (swipeState?.itemId === vg.representativeId) handleMouseUp(vg.groupId, vg.representativeId); }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 text-sm">{vg.name}</span>
                    {vg.count > 1 && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex-shrink-0">×{vg.count}</span>
                    )}
                    {vg.autoRestock && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-600 rounded-full text-xs font-medium flex-shrink-0">
                        <RefreshCw className="w-2.5 h-2.5" />
                        auto
                      </span>
                    )}
                  </div>
                  {/* Bottom row: date + action buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <span className={`text-sm ${cls}`}>{label}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(vg.groupId, { id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "", auto_restock: vg.autoRestock })}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openDelete(vg.groupId, vg.representativeId); }}
                        onTouchStart={e => handleTouchStart(e, vg.representativeId)}
                        onMouseDown={e => handleMouseDown(e, vg.representativeId)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer select-none"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="text-center py-8 text-gray-500">No items found matching your criteria</div>
          )}
        </div>
      ) : (
        /* ── Default: grouped accordion ── */
        <Accordion.Root type="multiple" className="space-y-3">
          {groups.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Keine Items in diesem Lagerort.</p>
            </div>
          )}
          {groups.map(group => {
            const gs  = groupStatus(group);
            const exp = earliestExpiry(group);
            const subText     = exp ? `Expires: ${format(new Date(exp + "T00:00:00"), "dd.MM.yyyy")}` : "No expiry dates set";
            const groupBorder = gs === "expired" ? "border-red-400 bg-red-50/50" : gs === "expiring" ? "border-yellow-400 bg-yellow-50/50" : "border-gray-200";
            const headerBg    = gs === "expired" ? "bg-red-50 hover:bg-red-100"  : gs === "expiring" ? "bg-yellow-50 hover:bg-yellow-100"  : "bg-white hover:bg-gray-50";

            return (
              <Accordion.Item key={group.id} value={group.id} className={`border rounded-lg overflow-hidden ${groupBorder}`}>
                <Accordion.Trigger className={`w-full flex items-center justify-between p-4 transition-colors group text-left ${headerBg}`}>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{group.groupName}</span>
                      </div>
                      <span className="text-sm text-gray-500">{subText}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); setAtgTarget(group.id); setAtgExpiry(""); setAtgName(group.groupName); setAtgOpen(true); setScannerOpen(true); }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setAtgTarget(group.id); setAtgExpiry(""); setAtgName(group.groupName); setAtgOpen(true); setScannerOpen(true); } }}
                      className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                      {group.items.length}
                    </span>
                    <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-data-[state=open]:rotate-180" />
                  </div>
                </Accordion.Trigger>

                <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  <div className="bg-gray-50 p-4 border-t border-gray-200">
                    <div className="space-y-2">
                      {toVisualGroups(group.items, group.id, group.groupName).map(vg => {
                        const { cls, label, s } = itemDateInfo({ id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "", auto_restock: vg.autoRestock });
                        return (
                          <div key={vg.key} className="relative overflow-hidden rounded border border-gray-200 swipeable-item">
                            <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-6">
                              <Trash2 className="w-5 h-5 text-white" />
                            </div>
                            <div
                              className="flex flex-col xs:flex-row xs:items-center xs:justify-between p-3 bg-white relative gap-1 xs:gap-0"
                              style={swipeStyle(vg.representativeId)}
                              onTouchMove={swipeState?.itemId === vg.representativeId ? handleTouchMove : undefined}
                              onTouchEnd={swipeState?.itemId === vg.representativeId ? () => handleTouchEnd(vg.groupId, vg.representativeId) : undefined}
                              onMouseMove={swipeState?.itemId === vg.representativeId ? handleMouseMove : undefined}
                              onMouseUp={swipeState?.itemId === vg.representativeId ? () => handleMouseUp(vg.groupId, vg.representativeId) : undefined}
                              onMouseLeave={() => { if (swipeState?.itemId === vg.representativeId) handleMouseUp(vg.groupId, vg.representativeId); }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-gray-900 text-sm">{vg.name}</span>
                                {vg.count > 1 && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex-shrink-0">×{vg.count}</span>
                                )}
                                {vg.autoRestock && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-600 rounded-full text-xs font-medium flex-shrink-0">
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    auto
                                  </span>
                                )}
                              </div>
                              {/* Bottom row: date + action buttons */}
                              <div className="flex items-center justify-between xs:justify-end gap-2">
                                <span className={`text-sm ${cls}`}>{label}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => openEdit(vg.groupId, { id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "", auto_restock: vg.autoRestock })}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); openDelete(vg.groupId, vg.representativeId); }}
                                    onTouchStart={e => handleTouchStart(e, vg.representativeId)}
                                    onMouseDown={e => handleMouseDown(e, vg.representativeId)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer select-none"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            );
          })}
        </Accordion.Root>
      ))}

      {/* ── Add Item dialog ── */}
      <Dialog.Root open={addOpen} onOpenChange={(open) => { 
        setAddOpen(open);
        if (!open) setFormError(null); setNewCount(1); setNameSuggestions([]); setShowSuggestions(false); setScannerOpen(false); setScannedEan(null); setEanNotFound(null); ;
        }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95" aria-describedby={undefined}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-medium text-gray-900">Add New Item</Dialog.Title>
              <Dialog.Close asChild><button className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></Dialog.Close>
            </div>
            <div className="space-y-4">
              {scannerOpen && (
                <BarcodeScanner
                  onResult={(name, ean, suggestedGroup) => {
                    if (name) setNewName(name); else setEanNotFound(ean);
                    if (suggestedGroup) setNewGroup(suggestedGroup);
                    setScannedEan(ean || null);
                    setScannerOpen(false);
                  }}
                  onSkip={() => setScannerOpen(false)}
                />
              )}
              {!scannerOpen && (
              <div className="relative">
                <label className="block mb-2 text-sm text-gray-700">Item Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => handleNewNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g., Milch, Gouda, Butter"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showSuggestions && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {nameSuggestions.map(s => (
                      <button
                        key={`${s.name}-${s.groupName}`}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleSuggestionSelect(s)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-gray-900">{s.name}</span>
                        <span className="text-sm text-gray-400">{s.groupName}</span>
                      </button>
                    ))}
                  </div>
                )}
                {eanNotFound && (
                  <p className="text-xs text-yellow-600 mt-1 ml-1">
                    Produkt für EAN {eanNotFound} nicht gefunden.
                  </p>
                )}
              </div>
              )}
              <div>
                <label className="block mb-2 text-sm text-gray-700">Group Name</label>
                <select
                  value={newGroup}
                  onChange={e => setNewGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Select a group --</option>
                  {groupTemplates.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-2 text-sm text-gray-700">Expiry Date <span className="text-gray-400">(optional)</span></label>
                <input type="date" value={newExpiry} onChange={e => setNewExpiry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <CountPicker value={newCount} onChange={setNewCount} />
              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <button
                onClick={handleAddItem}
                disabled={insertItemLoading || !newGroup.trim() || !newName.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {insertItemLoading ? "Wird hinzugefügt..." : "Add Item"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Add to Group dialog ── */}
      <Dialog.Root open={atgOpen} onOpenChange={(open) => { 
        setAtgOpen(open); 
        if (!open) setFormError(null); setAtgCount(1); setAtgName(""); setScannerOpen(false); setScannedEan(null); setEanNotFound(null);
        }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95" aria-describedby={undefined}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-medium text-gray-900">Add Item to Group</Dialog.Title>
              <Dialog.Close asChild><button className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></Dialog.Close>
            </div>
            <div className="space-y-4">
              {scannerOpen && (
                <BarcodeScanner
                  onResult={(name, ean, _suggestedGroup) => {
                    if (name) setAtgName(name); else setEanNotFound(ean);
                    setScannedEan(ean || null);
                    setScannerOpen(false);
                  }}
                  onSkip={() => setScannerOpen(false)}
                />
              )}
              {!scannerOpen && (
              <div>
                <label className="block mb-2 text-sm text-gray-700">Item Name</label>
                <input
                  type="text"
                  value={atgName}
                  onChange={e => setAtgName(e.target.value)}
                  placeholder={`e.g. ${atgTarget ? groups.find(g => g.id === atgTarget)?.groupName : ""}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {eanNotFound && (
                  <p className="text-xs text-yellow-600 mt-1 ml-1">
                    Produkt für EAN {eanNotFound} nicht gefunden.
                  </p>
                )}
              </div>
              )}
              <div>
                <label className="block mb-2 text-sm text-gray-700">Expiry Date <span className="text-gray-400">(optional)</span></label>
                <input 
                  type="date" 
                  value={atgExpiry} 
                  onChange={e => setAtgExpiry(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>
              <CountPicker value={atgCount} onChange={setAtgCount} />
              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <button onClick={handleAddToGroup} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Add Item</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Edit dialog ── */}
      <Dialog.Root open={editOpen} onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
              setFormError(null);
              setEditAutoRestock(false);
              setEditMinStock(null);
              setEditRestockTarget(null);
          }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95" aria-describedby={undefined}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-medium text-gray-900">Edit Item</Dialog.Title>
              <Dialog.Close asChild><button className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></Dialog.Close>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm text-gray-700">Item Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block mb-2 text-sm text-gray-700">Expiry Date <span className="text-gray-400">(optional)</span></label>
                <input type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* Auto-restock toggle */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                <div>
                <p className="text-sm font-medium text-gray-700">Auto-Restock</p>
                <p className="text-xs text-gray-400">Automatisch zur Einkaufsliste hinzufügen</p>
                </div>
                <button
                  type="button"
                  disabled={restockLoading}
                  onClick={() => setEditAutoRestock(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    editAutoRestock ? "bg-blue-600" : "bg-gray-200"
                  } ${restockLoading ? "opacity-50" : ""}`}
                >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  editAutoRestock ? "translate-x-6" : "translate-x-1"
                }`} />
                </button>
              </div>

              {editAutoRestock && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex justify-center gap-8 pt-1">
                    <NumberScrollPicker
                      value={editMinStock ?? 1}
                      onChange={v => setEditMinStock(v)}
                      min={1}
                      max={20}
                      label="Auffüllen bei"
                    />
                    <NumberScrollPicker
                      value={editRestockTarget ?? 2}
                      onChange={v => setEditRestockTarget(v)}
                      min={1}
                      max={20}
                      label="Auffüllen auf"
                    />
                  </div>
                </div>
                  )}
              </div>

              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <button onClick={handleSaveEdit} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Delete confirm ── */}
      <AlertDialog.Root open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setFormError(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <AlertDialog.Title className="font-medium text-gray-900 mb-2">Delete Item</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialog.Description>
            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
            <div className="flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button onClick={handleDelete} disabled={deleteLoading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">{deleteLoading ? "Löschen..." : "Löschen"}</button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}