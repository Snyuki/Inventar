import { useEffect, useRef } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
}

const ITEM_H   = 44;
const VISIBLE  = 5;
const SPACER_H = ITEM_H * Math.floor(VISIBLE / 2); // 88px

export default function NumberScrollPicker({ value, onChange, min, max, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const numbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  // Set initial scroll position on mount (no animation)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = (value - min) * ITEM_H;
  }, []);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const newVal = Math.min(max, Math.max(min, idx + min));
    if (newVal !== value) onChange(newVal);
  };

  const scrollTo = (n: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: (n - min) * ITEM_H, behavior: "smooth" });
    onChange(n);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <div className="relative" style={{ width: 64, height: ITEM_H * VISIBLE }}>

        {/* Selection highlight band */}
        <div
          className="absolute left-0 right-0 pointer-events-none bg-blue-50 border-y border-blue-200 z-10"
          style={{ top: SPACER_H, height: ITEM_H }}
        />

        {/* Scrollable list */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-scroll"
          style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" } as React.CSSProperties}
        >
          <div style={{ height: SPACER_H }} />
          {numbers.map(n => (
            <div
              key={n}
              onClick={() => scrollTo(n)}
              style={{ height: ITEM_H, scrollSnapAlign: "center" } as React.CSSProperties}
              className={`flex items-center justify-center cursor-pointer select-none transition-colors ${
                n === value
                  ? "text-blue-600 font-semibold text-lg"
                  : "text-gray-400 text-base"
              }`}
            >
              {n}
            </div>
          ))}
          <div style={{ height: SPACER_H }} />
        </div>

        {/* Top fade */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none z-20"
          style={{ height: SPACER_H, background: "linear-gradient(to bottom, white 40%, transparent)" }}
        />
        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none z-20"
          style={{ height: SPACER_H, background: "linear-gradient(to top, white 40%, transparent)" }}
        />
      </div>
    </div>
  );
}