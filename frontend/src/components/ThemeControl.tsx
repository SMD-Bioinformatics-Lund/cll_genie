import { Laptop, Moon, Sun } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAppTheme, type ThemePreference } from "../theme-context";

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Use system theme" },
  { value: "light", label: "Use light theme" },
  { value: "dark", label: "Use dark theme" },
];

export function ThemeControl() {
  const { preference, resolved, setPreference } = useAppTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const Icon = preference === "system" ? Laptop : resolved === "dark" ? Moon : Sun;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label="Choose color theme"
        onClick={() => setIsOpen(!isOpen)}
        className="flex size-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
        title="Theme"
      >
        <Icon size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 z-50">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setPreference(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm ${
                  preference === option.value
                    ? "bg-[#7B4925]/10 text-[#7B4925] dark:bg-[#EBA98C]/10 dark:text-[#EBA98C] font-semibold"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
