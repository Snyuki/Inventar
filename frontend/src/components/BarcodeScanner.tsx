import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { Camera, Loader2 } from "lucide-react";
import { lookupBarcode } from "../lib/api";

interface BarcodeScannerProps {
  onResult: (productName: string, ean: string, suggestedGroup: string | null) => void;
  onSkip: () => void;
}

type ScanPhase =
  | { status: "scanning" }
  | { status: "found"; ean: string }
  | { status: "loading" }
  | { status: "error"; message: string };

export default function BarcodeScanner({ onResult, onSkip }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const hasScannedRef = useRef(false);
  const [phase, setPhase] = useState<ScanPhase>({ status: "scanning" });

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    hasScannedRef.current = false;

    if (!videoRef.current) return;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, async (result, err) => {
        if (err && !(err instanceof NotFoundException)) return;
        if (!result) return;
        if (hasScannedRef.current) return;

        hasScannedRef.current = true;
        const ean = result.getText();
        setPhase({ status: "found", ean });

        BrowserMultiFormatReader.releaseAllStreams();

        setPhase({ status: "loading" });
        try {
          const data = await lookupBarcode(ean);
          onResult(data.product_name ?? "", ean, data.suggested_group ?? null);
        } catch {
          setPhase({ status: "error", message: "Netzwerkfehler beim Abfragen der Produktdatenbank." });
        }
      })
      .catch((err) => {
        console.error("Camera error:", err);
        setPhase({ status: "error", message: "Kamera konnte nicht geöffnet werden. Bitte Berechtigung prüfen." });
      });

    return () => {
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Camera className="w-4 h-4" />
          Barcode scannen
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 underline"
        >
          Überspringen
        </button>
      </div>

      <div className="relative w-full rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />

        {phase.status === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 h-1/3 border-2 border-white/70 rounded-md" />
          </div>
        )}

        {phase.status === "loading" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <span className="text-white text-sm">Produkt wird gesucht...</span>
          </div>
        )}

        {phase.status === "found" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
            <span className="text-white font-medium">EAN: {phase.ean}</span>
          </div>
        )}
      </div>

      {phase.status === "error" && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {phase.message}
          <button
            type="button"
            onClick={onSkip}
            className="block mt-2 underline text-red-700"
          >
            Manuell eingeben
          </button>
        </div>
      )}

      {phase.status === "scanning" && (
        <p className="text-xs text-gray-400 text-center">
          Barcode in den Rahmen halten
        </p>
      )}
    </div>
  );
}