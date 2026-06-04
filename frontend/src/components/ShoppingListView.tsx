import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Check,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  addShoppingListItem,
  clearCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchItemSuggestions,
  fetchShoppingList,
  patchShoppingListItem,
} from "../lib/api";
import NumberScrollPicker from "./NumberScrollPicker";
import { ShoppingListItem } from "../types";

export default function ShoppingListView() {
  const [items, setItems]                     = useState<ShoppingListItem[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);

  // Manual add form
  const [addName, setAddName]                 = useState("");
  const [addQty, setAddQty]                   = useState(1);
  const [adding, setAdding]                   = useState(false);
  const [addError, setAddError]               = useState<string | null>(null);

  // Autocomplete
  const [suggestions, setSuggestions]         = useState<Array<{ name: string; groupName: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsTimeoutRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirmations
  const [deleteTarget, setDeleteTarget]       = useState<ShoppingListItem | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Inline quantity edit
  const [editingId, setEditingId]             = useState<string | null>(null);
  const [editingQty, setEditingQty]           = useState(1);

  // ── Load ──────────────────────────────────────────────────────────────
  const load = async () => {
    try {
      const data = await fetchShoppingList();
      setItems(data);
    } catch (e: any) {
      setError(e.message ?? "Fehler beim Laden der Einkaufsliste");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Autocomplete ──────────────────────────────────────────────────────
  const handleNameChange = async (value: string) => {
    setAddName(value);
    setAddError(null);
    if (value.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const results = await fetchItemSuggestions(value);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch {
      setSuggestions([]);
    }
  };

  const handleSuggestionSelect = (name: string) => {
    setAddName(name);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Add item ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addName.trim()) { setAddError("Bitte einen Namen eingeben"); return; }
    if (addQty < 1)      { setAddError("Menge muss mindestens 1 sein"); return; }
    setAdding(true);
    setAddError(null);
    try {
      const item = await addShoppingListItem(addName.trim(), addQty);
      setItems(prev => {
        const idx = prev.findIndex(i => i.id === item.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = item;
          return updated;
        }
        return [item, ...prev];
      });
      setAddName("");
      setAddQty(1);
    } catch (e: any) {
      setAddError(e.message ?? "Fehler beim Hinzufügen");
    } finally {
      setAdding(false);
    }
  };

  // ── Check off ─────────────────────────────────────────────────────────
  const handleCheckOff = async (item: ShoppingListItem) => {
    try {
      const updated = await patchShoppingListItem(item.id, { checked_off: !item.checked_off });
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e: any) {
      setError(e.message ?? "Fehler");
    }
  };

  // ── Delete (with confirmation) ─────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShoppingListItem(deleteTarget.id);
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
    } catch (e: any) {
      setError(e.message ?? "Fehler beim Löschen");
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── Clear checked (with confirmation) ─────────────────────────────────
  const confirmClearChecked = async () => {
    try {
      await clearCheckedShoppingListItems();
      setItems(prev => prev.filter(i => !i.checked_off));
    } catch (e: any) {
      setError(e.message ?? "Fehler beim Leeren");
    } finally {
      setClearConfirmOpen(false);
    }
  };

  // ── Inline quantity edit ───────────────────────────────────────────────
  const startEdit = (item: ShoppingListItem) => {
    setEditingId(item.id);
    setEditingQty(item.quantity);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const updated = await patchShoppingListItem(editingId, { quantity: editingQty });
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e: any) {
      setError(e.message ?? "Fehler beim Speichern");
    } finally {
      setEditingId(null);
    }
  };

  const unchecked = items.filter(i => !i.checked_off);
  const checked   = items.filter(i =>  i.checked_off);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-gray-700" />
          <h2 className="text-xl font-semibold text-gray-900">Einkaufsliste</h2>
        </div>
        <button
          onClick={() => setClearConfirmOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors ${
            checked.length === 0 ? "invisible pointer-events-none" : ""
          }`}
        >
          <Trash2 className="w-4 h-4" />
          Erledigte löschen ({checked.length})
        </button>
      </div>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Item hinzufügen</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={addName}
              onChange={e => handleNameChange(e.target.value)}
              onBlur={() => {
                suggestionsTimeoutRef.current = setTimeout(() => setShowSuggestions(false), 150);
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="z.B. Milch, Butter..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showSuggestions && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map(s => (
                  <button
                    key={s.name}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleSuggestionSelect(s.name)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-sm text-gray-900">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.groupName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantity stepper */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setAddQty(q => Math.max(1, q - 1))}
              className="px-2 py-2 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="px-3 text-sm font-medium text-gray-800 min-w-[2rem] text-center">{addQty}</span>
            <button
              type="button"
              onClick={() => setAddQty(q => q + 1)}
              className="px-2 py-2 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {adding ? "..." : "Add"}
          </button>
        </div>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Lädt...
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Einkaufsliste ist leer</p>
        </div>
      )}

      {/* Unchecked items */}
      {unchecked.length > 0 && (
        <div className="space-y-2">
          {unchecked.map(item => (
            <ShoppingListRow
              key={item.id}
              item={item}
              onCheckOff={handleCheckOff}
              onDeleteRequest={setDeleteTarget}
              onEdit={startEdit}
              isEditing={editingId === item.id}
              editingQty={editingQty}
              onEditChange={setEditingQty}
              onEditSave={saveEdit}
              onEditCancel={() => setEditingId(null)}
            />
          ))}
        </div>
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1">Erledigt</p>
          {checked.map(item => (
            <ShoppingListRow
              key={item.id}
              item={item}
              onCheckOff={handleCheckOff}
              onDeleteRequest={setDeleteTarget}
              onEdit={startEdit}
              isEditing={editingId === item.id}
              editingQty={editingQty}
              onEditChange={setEditingQty}
              onEditSave={saveEdit}
              onEditCancel={() => setEditingId(null)}
            />
          ))}
        </div>
      )}

      {/* ── Delete single confirmation ── */}
      <AlertDialog.Root open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <AlertDialog.Title className="font-medium text-gray-900 mb-2">Eintrag löschen</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-gray-600 mb-6">
              „{deleteTarget?.item_name}" aus der Einkaufsliste entfernen?
            </AlertDialog.Description>
            <div className="flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                  Abbrechen
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  Löschen
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* ── Clear checked confirmation ── */}
      <AlertDialog.Root open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <AlertDialog.Title className="font-medium text-gray-900 mb-2">Erledigte löschen</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-gray-600 mb-6">
              {checked.length} erledigte {checked.length === 1 ? "Eintrag" : "Einträge"} unwiderruflich löschen?
            </AlertDialog.Description>
            <div className="flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                  Abbrechen
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button onClick={confirmClearChecked} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                  Alle löschen
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

    </div>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────
interface ShoppingListRowProps {
  item: ShoppingListItem;
  onCheckOff: (item: ShoppingListItem) => void;
  onDeleteRequest: (item: ShoppingListItem) => void;
  onEdit: (item: ShoppingListItem) => void;
  isEditing: boolean;
  editingQty: number;
  onEditChange: (qty: number) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function ShoppingListRow({
  item,
  onCheckOff,
  onDeleteRequest,
  onEdit,
  isEditing,
  editingQty,
  onEditChange,
  onEditSave,
  onEditCancel,
}: ShoppingListRowProps) {
  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 space-y-3">
        {/* Name row */}
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium text-gray-900">{item.item_name}</span>
          {item.source === "auto" && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
              <RefreshCw className="w-2.5 h-2.5" />
              auto
            </span>
          )}
        </div>
        {/* Picker */}
        <div className="flex justify-center">
          <NumberScrollPicker
            value={editingQty}
            onChange={onEditChange}
            min={1}
            max={50}
            label="Menge"
          />
        </div>
        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onEditCancel}
            className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={onEditSave}
            className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            Speichern
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 transition-colors ${
      item.checked_off ? "border-gray-100 opacity-60" : "border-gray-200"
    }`}>
      {/* Check button */}
      <button
        onClick={() => onCheckOff(item)}
        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
          item.checked_off
            ? "bg-green-500 border-green-500 text-white"
            : "border-gray-300 hover:border-green-400"
        }`}
      >
        {item.checked_off && <Check className="w-3.5 h-3.5" />}
      </button>

      {/* Name + auto badge */}
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${item.checked_off ? "line-through text-gray-400" : "text-gray-900"}`}>
          {item.item_name}
        </span>
        {item.source === "auto" && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
            <RefreshCw className="w-2.5 h-2.5" />
            auto
          </span>
        )}
      </div>

      {/* Quantity badge */}
      <span className="text-sm font-semibold text-gray-700 bg-gray-100 rounded-full px-2.5 py-0.5 min-w-[2rem] text-center">
        ×{item.quantity}
      </span>

      {/* Edit */}
      <button
        onClick={() => onEdit(item)}
        className="flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors"
      >
        <Pencil className="w-4 h-4" />
      </button>

      {/* Delete */}
      <button
        onClick={() => onDeleteRequest(item)}
        className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}