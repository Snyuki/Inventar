import * as Dialog from "@radix-ui/react-dialog";
import { X, ScanLine, Keyboard } from "lucide-react";
import { PreferredInput } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  preferredInput: PreferredInput;
  onPreferredInputChange: (value: PreferredInput) => void;
}

export default function SettingsModal({
  open,
  onOpenChange,
  email,
  preferredInput,
  onPreferredInputChange,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl p-6 w-full max-w-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="font-medium text-gray-900">Einstellungen</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6">

            {/* Account */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Account</p>
              <p className="text-sm text-gray-700">{email}</p>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Preferred input method */}
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Standard Eingabemethode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onPreferredInputChange("scanner")}
                  className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border-2 transition-colors ${
                    preferredInput === "scanner"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <ScanLine className="w-5 h-5" />
                  <span className="text-sm font-medium">Barcode Scanner</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPreferredInputChange("manual")}
                  className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border-2 transition-colors ${
                    preferredInput === "manual"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <Keyboard className="w-5 h-5" />
                  <span className="text-sm font-medium">Manuelle Eingabe</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Bestimmt wie der „Item hinzufügen" Dialog standardmäßig öffnet.
              </p>
            </div>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}