import { Laptop, Moon, Sun } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAppTheme, type ThemePreference } from "../theme-context";

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Use system theme" },
  { value: "light", label: "Use light theme" },
  { value: "dark", label: "Use dark theme" },
];

export function ThemeControl({ inverse = false }: { inverse?: boolean }) {
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
        className={`flex size-9 items-center justify-center rounded-full transition-colors ${
          inverse
            ? "text-white/80 hover:bg-white/10 hover:text-white"
            : "text-gray-500 hover:bg-gray-200 dark:text-[#c7beb4] dark:hover:bg-[#2a2724]"
        }`}
        title="Theme"
      >
        <Icon size={20} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-[#3b3732] dark:bg-[#202020] dark:shadow-black/40 z-50">
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
                    ? "bg-brand-primary/10 text-brand-primary dark:bg-[#3a2a22] dark:text-[#ffb487] font-semibold"
                    : "text-gray-700 hover:bg-gray-100 dark:text-[#e8dfd5] dark:hover:bg-[#2a2724]"
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
