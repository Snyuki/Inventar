import { useState, useEffect } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Settings, LogOut, Download, SlidersHorizontal } from "lucide-react";
import LoginScreen from "./components/LoginScreen";
import InventoryView from "./components/InventoryView";
import { Storage } from "./types";
import { supabase } from "./lib/supabase";
import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { checkWhitelist, fetchStorages } from "./lib/api";
import { DEFAULT_STORAGE } from "./lib/constants";


export default function App() {
  // Auth
  const [session, setSession]           = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [authError, setAuthError]       = useState<string | null>(null);

  // Storage
  const [storages, setStorages]                 = useState<Storage[]>([]);
  const [activeStorageId, setActiveStorageId] = useState<string | null>(null);


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

  const handleLogout = async () => { 
    await supabase.auth.signOut();
    setSession(null);
  };

  // ---- Load storages once authenticated --------------------------------
  useEffect(() => {
    if (!session) return;
    fetchStorages().then(data => {
      setStorages(data);
      // Default storage
      const defaultStorage = data.find(s => s.name === DEFAULT_STORAGE) ?? data[0];
      if (defaultStorage) setActiveStorageId(defaultStorage.id);
    }).catch(console.error);
  }, [session]);


  // Guards
  // ---- Show nothing while checking for an existing session ---------
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
              <h2 className="text-gray-900">Inventar</h2>
            </div>

            {/* Center: Storage Switch */}
            {/* Desktop (sm+): inline buttons */}
            <div className="hidden sm:flex items-center gap-1">
              {storages.map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveStorageId(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    s.id === activeStorageId
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {/* Mobile (< sm): dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white">
                  {activeStorage?.name ?? "Storage"}
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
                      onClick={() => setActiveStorageId(s.id)}
                      className={`flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer outline-none ${
                        s.id === activeStorageId
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {s.name}
                    </DropdownMenu.Item>
                  ))}
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
      <div className="flex-1 flex items-start justify-center p-4 sm:p-8">
        {activeStorageId && (
          <InventoryView key={activeStorageId} storageId={activeStorageId} />
        )}
      </div>
 
      {/* ── Footer ── */}
      <footer className="text-center py-3 text-xs text-gray-400 border-t border-gray-100 bg-white">
        <span>© {new Date().getFullYear()} Snyuki</span>
        <span className="mx-2">·</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}