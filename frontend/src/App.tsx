import { useState, useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Settings, LogOut, Download, SlidersHorizontal, RefreshCw } from "lucide-react";
import LoginScreen from "./components/LoginScreen";
import InventoryView from "./components/InventoryView";
import { PreferredInput, ShoppingListItem, Storage } from "./types";
import { supabase } from "./lib/supabase";
import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { checkWhitelist, fetchGroupTemplates, fetchStorages, savePreferredInput } from "./lib/api";
import { DEFAULT_STORAGE } from "./lib/constants";
import ShoppingListView from "./components/ShoppingListView";
import SettingsModal from "./components/SettingsModal";


export default function App() {
  // Auth
  const [session, setSession]               = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth]     = useState(false);
  const [authError, setAuthError]           = useState<string | null>(null);
  const [preferredInput, setPreferredInput] = useState<PreferredInput>("scanner");

  // Storage
  const [storages, setStorages]               = useState<Storage[]>([]);
  const [activeStorageId, setActiveStorageId] = useState<string | null>(null);
  const [activeView, setActiveView]           = useState<"inventory" | "shopping-list">("inventory");

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Data
  const [groupTemplates, setGroupTemplates] = useState<string[]>([]);

  // Toast
  const [toast, setToast]     = useState<string | null>(null);
  const toastTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Auth handlers --------------------------------------------------
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
            applyUserPrefs(session);
          }
        } catch (e) {
          console.error("Whitelist check failed:", e);
          setSession(session);
          applyUserPrefs(session);
        }
      } else {
        setSession(null);
      }
      setCheckingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  // ---- Setting Handlers -----------------------------------------------
  const handlePreferredInputChange = async (value: PreferredInput) => {
    setPreferredInput(value);
    try {
      await savePreferredInput(value);
    } catch (e) {
      console.error("Failed to save preference:", e);
    }
  };
  
  const applyUserPrefs = (session: Session) => {
    const savedPref = session.user.user_metadata?.preferred_input;
    if (savedPref === "scanner" || savedPref === "manual") {
      setPreferredInput(savedPref);
    }
  };

  // ---- Load storages once authenticated -------------------------------
  useEffect(() => {
    if (!session) return;
    fetchStorages().then(data => {
      setStorages(data);
      const defaultStorage = data.find(s => s.name === DEFAULT_STORAGE) ?? data[0];
      if (defaultStorage) setActiveStorageId(defaultStorage.id);
    }).catch(console.error);
  }, [session]);

  // Populate GroupTemplates
  useEffect(() => {
    if (!session) return;
    fetchGroupTemplates().then(setGroupTemplates).catch(console.error);
  }, [session]);

  // ---- Toast ----------------------------------------------------------
  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  };

  const handleAutoRestock = (entry: ShoppingListItem) => {
    showToast(`${entry.item_name} zur Einkaufsliste hinzugefügt (×${entry.quantity})`);
  };

  // ---- Guards ---------------------------------------------------------
  if (checkingAuth) return null;
  // ---- Login Screen ---------------------------------------------------
  if (!session) return <LoginScreen error={authError ?? undefined}/>;

  const activeStorage = storages.find(s => s.id === activeStorageId);

  // ---- Render ---------------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Navbar ── */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Left: title */}
            <div className="flex-1">
              <button
                onClick={() => {
                  const defaultStorage = storages.find(s => s.name === DEFAULT_STORAGE) ?? storages[0];
                  if (defaultStorage) setActiveStorageId(defaultStorage.id);
                  setActiveView("inventory");
                }}
                className="text-gray-900 transition-colors"
              >
                Inventar
              </button>
            </div>

            {/* Center: Storage Switch */}
            {/* Desktop (sm+): inline buttons */}
            <div className="hidden sm:flex items-center gap-1">
              {storages.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setActiveStorageId(s.id); setActiveView("inventory"); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    s.id === activeStorageId && activeView === "inventory"
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.name}
                </button>
              ))}
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <button
                onClick={() => setActiveView("shopping-list")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeView === "shopping-list"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Einkaufsliste
              </button>
            </div>

            {/* Mobile (< sm): dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white">
                  {activeView === "shopping-list" ? "Einkaufsliste" : (activeStorage?.name ?? "Storage")}
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="bg-white rounded-xl shadow-lg border border-gray-200 p-1 z-50 min-w-[140px]">
                  {storages.map(s => (
                    <DropdownMenu.Item
                      key={s.id}
                      onClick={() => { setActiveStorageId(s.id); setActiveView("inventory"); }}
                      className={`flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer outline-none ${
                        s.id === activeStorageId && activeView === "inventory"
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {s.name}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                  <DropdownMenu.Item
                    onClick={() => setActiveView("shopping-list")}
                    className={`flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer outline-none ${
                      activeView === "shopping-list"
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Einkaufsliste
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* Right: Email + Settings */}
            <div className="flex-1 flex items-center justify-end gap-2">
              <span className="hidden sm:block text-sm text-gray-500">{session?.user.email}</span>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="min-w-[170px] bg-white rounded-xl shadow-lg border border-gray-200 p-1 z-50">
                    <DropdownMenu.Item
                      onClick={() => setSettingsOpen(true)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer outline-none"
                    >
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
      <div className="flex-1 flex items-start justify-center p-4 sm:p-8">
        {activeView === "shopping-list" ? (
          <ShoppingListView />
        ) : (
          activeStorageId && (
            <InventoryView
              key={activeStorageId}
              storageId={activeStorageId}
              groupTemplates={groupTemplates}
              onAutoRestock={handleAutoRestock}
              preferredInput={preferredInput}
            />
          )
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-100 bg-white">
        <span>© {new Date().getFullYear()} Snyuki</span>
        <span className="mx-2">·</span>
        <span>v{__APP_VERSION__}</span>
      </footer>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-gray-900 text-white text-sm rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <RefreshCw className="w-4 h-4 text-blue-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        email={session?.user.email ?? ""}
        preferredInput={preferredInput}
        onPreferredInputChange={handlePreferredInputChange}
      />

    </div>
  );
}