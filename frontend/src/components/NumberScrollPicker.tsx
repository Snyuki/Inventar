import { useEffect, useRef } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  itemHeight?: number;
  visibleItems?: number;
}

export default function NumberScrollPicker({
  value,
  onChange,
  min,
  max,
  label,
  itemHeight = 44,
  visibleItems = 3,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spacerH    = itemHeight * Math.floor(visibleItems / 2);
  const containerH = itemHeight * visibleItems;
  const numbers    = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  // Set initial scroll position on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = (value - min) * itemHeight;
  }, []);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const idx    = Math.round(el.scrollTop / itemHeight);
    const newVal = Math.min(max, Math.max(min, idx + min));
    if (newVal !== value) onChange(newVal);
  };

  const scrollTo = (n: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: (n - min) * itemHeight, behavior: "smooth" });
    onChange(n);
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs text-gray-500 font-medium whitespace-nowrap">{label}</span>
      <div className="relative" style={{ width: 64, height: containerH }}>

        {/* Selection highlight band */}
        <div
          className="absolute left-0 right-0 bg-blue-50 border-y border-blue-200"
          style={{ top: spacerH, height: itemHeight }}
        />

        {/* Scrollable list */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-scroll"
          style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" } as React.CSSProperties}
        >
          <div style={{ height: spacerH }} />
          {numbers.map(n => (
            <div
              key={n}
              onClick={() => scrollTo(n)}
              style={{ height: itemHeight, scrollSnapAlign: "center" } as React.CSSProperties}
              className={`flex items-center justify-center cursor-pointer select-none transition-colors ${
                n === value
                  ? "text-blue-600 font-semibold text-lg"
                  : "text-gray-500 text-base font-medium"
              }`}
            >
              {n}
            </div>
          ))}
          <div style={{ height: spacerH }} />
        </div>

        {/* Fades */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none z-10"
          style={{ height: spacerH, background: "linear-gradient(to bottom, white 40%, transparent)" }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
          style={{ height: spacerH, background: "linear-gradient(to top, white 40%, transparent)" }}
        />
      </div>
    </div>
  );
}