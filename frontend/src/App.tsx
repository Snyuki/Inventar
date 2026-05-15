import { useState, useMemo, useEffect, useRef } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  Plus,
  Trash2,
  X,
  Edit,
  Search,
  Settings,
  LogOut,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { format, parse } from "date-fns";
import LoginScreen from "./components/LoginScreen";
import { Item, ItemGroup } from "./types";
import {
  itemStatus,
  groupStatus,
  earliestExpiry,
  today,
} from "./lib/utils";
import { supabase } from './lib/supabase'
import { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { checkWhitelist, fetchGroups, createGroup, addItem, updateItem, deleteItem, updateGroup, fetchGroupTemplates, fetchItemSuggestions } from "./lib/api";


// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------
type EditTarget   = { groupId: string; item: Item } | null;
type DeleteTarget = { groupId: string; itemId: string } | null;
type ATGTarget    = string | null;

export default function App() {
  // Auth
  const [session, setSession]           = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [authError, setAuthError]       = useState<string | null>(null);

  // Data
  const [groups, setGroups]                 = useState<ItemGroup[]>([]);
  const [groupTemplates, setGroupTemplates] = useState<string[]>([]);
  const [dataError, setDataError]           = useState<string | null>(null);
  const [formError, setFormError]           = useState<string | null>(null);

  // Dialogs
  const [addOpen,      setAddOpen]                = useState(false);
  const [editOpen,     setEditOpen]               = useState(false);
  const [atgOpen,      setAtgOpen]                = useState(false);
  const [deleteOpen,   setDeleteOpen]             = useState(false);
  const [renameGroupOpen, setRenameGroupOpen]     = useState(false);
  const [editTarget,   setEditTarget]             = useState<EditTarget>(null);
  const [deleteTarget, setDeleteTarget]           = useState<DeleteTarget>(null);
  const [atgTarget,    setAtgTarget]              = useState<ATGTarget>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<{ id: string; name: string } | null>(null);
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
  const [renameGroupName, setRenameGroupName] = useState("");

  // Autocomplete
  const [nameSuggestions, setNameSuggestions] = useState<Array<{ name: string; groupName: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  // ---- Auth handlers --------------------------------------------------
  // Handle login and session
  useEffect(() => {
    setCheckingAuth(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      if (session) {
        try {
          const allowed = await checkWhitelist(session.access_token);
          if (!allowed) {
            await supabase.auth.signOut();
            setSession(null);
            setAuthError("Access denied. You are not on the invited list.");
          } else {
            setSession(session);
            setAuthError(null);
          }
        } catch (e) {
          console.error("Whitelist check failed:", e);
          setSession(session);
        }
      } else {
        setSession(null);
      }
      setCheckingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load Group Templates
  useEffect(() => {
    if (!session) return;
    fetchGroupTemplates().then(setGroupTemplates).catch(console.error);
  }, [session]);

  // Load Inventory
  useEffect(() => {
    if (!session) return;
    setDataLoading(true);
    setDataError(null);
    fetchGroups()
    .then(setGroups)
    .catch(() => setDataError("Failed to load inventory. Is the backend running?"))
    .finally(() => setDataLoading(false));
  }, [session]);

  const handleLogout = async () => { 
    await supabase.auth.signOut();
    setSession(null);
  };

  // ---- Filter helpers -------------------------------------------------
  const toggleFilter = (f: string) =>
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const filters = [
    { id: "expired",  label: "Expired",      color: "red"    },
    { id: "expiring", label: "Expiring Soon", color: "yellow" },
    { id: "ok",       label: "Not Expired",   color: "green"  },
    { id: "noexp",    label: "No Expiry",     color: "gray"   },
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
      await deleteItem(itemId);
      setGroups(prev =>
        prev
          .map(g => g.id === groupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g)
          .filter(g => g.items.length > 0)
      );
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
          const item = await addItem(existingGroup.id, newName.trim(), newExpiry || null);
          newItems.push(item);
        }
        setGroups(prev => prev.map(g => g.id === existingGroup.id ? { ...g, items: [...g.items, ...newItems] } : g));
      } else {
        const group = await createGroup(newGroup.trim());   // Note: This is the active groups; not the templates
        const newItems: Item[] = [];
        for (let i = 0; i < newCount; i++) {
          const item = await addItem(group.id, newName.trim(), newExpiry || null);
          newItems.push(item);
        }
        setGroups(prev => [...prev, { ...group, items: newItems }]);
      }

      setNewGroup("");
      setNewName("");
      setNewExpiry("");
      setNewCount(1);
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
          addItem(group.id, atgName.trim() || group.groupName, atgExpiry || null)
        )
      );
      setGroups(prev => prev.map(g => g.id === atgTarget ? { ...g, items: [...g.items, ...newItems] } : g));
      
      setAtgExpiry("");
      setAtgName("");
      setAtgCount(1);
      setAtgOpen(false);

    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to add item.");
    }
  };

  const openEdit = (groupId: string, item: Item) => {
    setEditTarget({ groupId, item });
    setEditName(item.name);
    setEditExpiry(item.ablaufdatum ?? "");
    setEditOpen(true);
  };

  const handleRenameGroup = async () => {
    if (!renameGroupTarget || !renameGroupName.trim()) return;
    setFormError(null);
    try {
      const updated = await updateGroup(renameGroupTarget.id, renameGroupName.trim());
      setGroups(prev => prev.map(g => g.id === updated.id ? { ...g, groupName: updated.groupName } : g));
      setRenameGroupOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to rename group.")
    }
  }

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    setFormError(null);
    try {
      const updated = await updateItem(editTarget.item.id, editName.trim(), editExpiry || null);
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
      await deleteItem(deleteTarget.itemId);
      setGroups(prev =>
        prev
          .map(g => g.id === deleteTarget.groupId
            ? { ...g, items: g.items.filter(i => i.id !== deleteTarget.itemId) }
            : g)
          .filter(g => g.items.length > 0)
      );
      setDeleteOpen(false);
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
        const matchFilter = activeFilters.length === 0 || activeFilters.includes(s) ||
          (activeFilters.includes("ok") && s === "expiring");
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

  interface VisualGroup {
    key: string;
    name: string;
    ablaufdatum: string | null;
    count: number;
    representativeId: string; // ID of one item, used for edit/delete
    groupId: string;
    groupName: string;
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
        });
      }
    }
    return Array.from(map.values());
  }

  // ---- Show nothing while checking for an existing session ---------
  if (checkingAuth) return null;
  // ---- Login Screen ---------------------------------------------------
  if (!session) return <LoginScreen error={authError ?? undefined}/>;

  // ---- Render ---------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Navbar ── */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h2 className="text-gray-900">Inventar</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{session?.user.email}</span>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="min-w-[170px] bg-white rounded-xl shadow-lg border border-gray-200 p-1 z-50">
                    <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer outline-none">
                      <SlidersHorizontal className="w-4 h-4" /> Settings
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer outline-none">
                      <Download className="w-4 h-4" /> Export data
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg cursor-pointer outline-none"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1>Inventory List</h1>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              onClick={() => { setNewGroup(""); setNewName(""); setNewExpiry(""); setAddOpen(true); }}
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
                const { cls, label, s } = itemDateInfo({ id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "" });
                const border = s === "expired" ? "border-red-400" : s === "expiring" ? "border-yellow-400" : "border-gray-200";
                const bg     = s === "expired" ? "bg-red-50"      : s === "expiring" ? "bg-yellow-50"      : "bg-white";
                return (
                  <div key={vg.key} className={`relative overflow-hidden rounded border swipeable-item ${border}`}>
                    <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-6">
                      <Trash2 className="w-5 h-5 text-white" />
                    </div>
                    <div
                      className={`flex items-center justify-between p-3 relative ${bg}`}
                      style={swipeStyle(vg.representativeId)}
                      onTouchMove={swipeState?.itemId === vg.representativeId ? handleTouchMove : undefined}
                      onTouchEnd={swipeState?.itemId === vg.representativeId ? () => handleTouchEnd(vg.groupId, vg.representativeId) : undefined}
                      onMouseMove={swipeState?.itemId === vg.representativeId ? handleMouseMove : undefined}
                      onMouseUp={swipeState?.itemId === vg.representativeId ? () => handleMouseUp(vg.groupId, vg.representativeId) : undefined}
                      onMouseLeave={() => { if (swipeState?.itemId === vg.representativeId) handleMouseUp(vg.groupId, vg.representativeId); }}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900">{vg.name}</span>
                          {vg.count > 1 && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">×{vg.count}</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">Gruppe: {vg.groupName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm ${cls}`}>{label}</span>
                        <button onClick={() => openEdit(vg.groupId, { id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "" })} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors">
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
                );
              }) : (
                <div className="text-center py-8 text-gray-500">No items found matching your criteria</div>
              )}
            </div>
          ) : (
            /* ── Default: grouped accordion ── */
            <Accordion.Root type="multiple" className="space-y-3">
              {groups.map(group => {
                const gs  = groupStatus(group);
                const exp = earliestExpiry(group);
                const subText     = exp ? `Expires: ${format(new Date(exp + "T00:00:00"), "dd.MM.yyyy")}` : "No expiry dates set";
                const groupBorder = gs === "expired" ? "border-red-400 bg-red-50/50" : gs === "expiring" ? "border-yellow-400 bg-yellow-50/50" : "border-gray-200";
                const headerBg    = gs === "expired" ? "bg-red-50 hover:bg-red-100"  : gs === "expiring" ? "bg-yellow-50 hover:bg-yellow-100"  : "bg-white hover:bg-gray-50";

                return (
                  <Accordion.Item key={group.id} value={group.id} className={`border rounded-lg overflow-hidden ${groupBorder}`}>
                    <Accordion.Trigger className={`w-full flex items-center justify-between p-4 transition-colors group ${headerBg}`}>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-start">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{group.groupName}</span>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); setRenameGroupTarget({ id: group.id, name: group.groupName }); setRenameGroupName(group.groupName); setRenameGroupOpen(true); }}
                              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setRenameGroupTarget({ id: group.id, name: group.groupName }); setRenameGroupName(group.groupName); setRenameGroupOpen(true); } }}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </div>
                          </div>
                          <span className="text-sm text-gray-500">{subText}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); setAtgTarget(group.id); setAtgExpiry(""); setAtgName(group.groupName); setAtgOpen(true); }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setAtgTarget(group.id); setAtgExpiry(""); setAtgName(group.groupName); setAtgOpen(true); } }}
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
                            const { cls, label, s } = itemDateInfo({ id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "" });
                            return (
                              <div key={vg.key} className="relative overflow-hidden rounded border border-gray-200 swipeable-item">
                                <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-6">
                                  <Trash2 className="w-5 h-5 text-white" />
                                </div>
                                <div
                                  className="flex items-center justify-between p-3 bg-white relative"
                                  style={swipeStyle(vg.representativeId)}
                                  onTouchMove={swipeState?.itemId === vg.representativeId ? handleTouchMove : undefined}
                                  onTouchEnd={swipeState?.itemId === vg.representativeId ? () => handleTouchEnd(vg.groupId, vg.representativeId) : undefined}
                                  onMouseMove={swipeState?.itemId === vg.representativeId ? handleMouseMove : undefined}
                                  onMouseUp={swipeState?.itemId === vg.representativeId ? () => handleMouseUp(vg.groupId, vg.representativeId) : undefined}
                                  onMouseLeave={() => { if (swipeState?.itemId === vg.representativeId) handleMouseUp(vg.groupId, vg.representativeId); }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-900">{vg.name}</span>
                                    {vg.count > 1 && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">×{vg.count}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm ${cls}`}>{label}</span>
                                    <button onClick={() => openEdit(vg.groupId, { id: vg.representativeId, name: vg.name, ablaufdatum: vg.ablaufdatum, kaufdatum: "" })} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors">
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
        </div>
      </div>

      {/* ── Add Item dialog ── */}
      <Dialog.Root open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setFormError(null); setNewCount(1); setNameSuggestions([]); setShowSuggestions(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95" aria-describedby={undefined}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-medium text-gray-900">Add New Item</Dialog.Title>
              <Dialog.Close asChild><button className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></Dialog.Close>
            </div>
            <div className="space-y-4">
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
              </div>
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
      <Dialog.Root open={atgOpen} onOpenChange={(open) => { setAtgOpen(open); if (!open) setFormError(null); setAtgCount(1); setAtgName(""); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95" aria-describedby={undefined}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-medium text-gray-900">Add Item to Group</Dialog.Title>
              <Dialog.Close asChild><button className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></Dialog.Close>
            </div>
            <div className="space-y-4">
            <div>
              <label className="block mb-2 text-sm text-gray-700">Item Name</label>
              <input
                type="text"
                value={atgName}
                onChange={e => setAtgName(e.target.value)}
                placeholder={`e.g. ${atgTarget ? groups.find(g => g.id === atgTarget)?.groupName : ""}`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
              <div>
                <label className="block mb-2 text-sm text-gray-700">Expiry Date <span className="text-gray-400">(optional)</span></label>
                <input type="date" value={atgExpiry} onChange={e => setAtgExpiry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
      <Dialog.Root open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setFormError(null); }}>
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
              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}
              <button onClick={handleSaveEdit} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Changes</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Edit Group Name dialog ── */}
      <Dialog.Root open={renameGroupOpen} onOpenChange={(open) => { setRenameGroupOpen(open); if (!open) setFormError(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95" aria-describedby={undefined}>
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="font-medium text-gray-900">Rename Group</Dialog.Title>
              <Dialog.Close asChild><button className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button></Dialog.Close>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm text-gray-700">Group Name</label>
                <input
                  type="text"
                  value={renameGroupName}
                  onChange={e => setRenameGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <button onClick={handleRenameGroup} disabled={!renameGroupName.trim()} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
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

      {/* ── Footer ── */}
      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-100 bg-white">
        <span>© {new Date().getFullYear()} Snyuki</span>
        <span className="mx-2">·</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}
