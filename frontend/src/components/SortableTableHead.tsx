import { ChevronDown, ChevronUp } from "lucide-react";

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  currentSortKey?: string | number | symbol;
  currentSortOrder?: "asc" | "desc";
  onRequestSort: (key: string) => void;
  className?: string;
}

export function SortableTableHead({
  label,
  sortKey,
  currentSortKey,
  currentSortOrder,
  onRequestSort,
  className = "",
}: SortableTableHeadProps) {
  const isActive = currentSortKey === sortKey;

  return (
    <th
      className={`cursor-pointer hover:bg-brand-primary/15 dark:hover:bg-brand-detail/20 transition-colors select-none ${className}`}
      onClick={() => onRequestSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col opacity-50 w-3">
          {isActive ? (
            currentSortOrder === "asc" ? (
              <ChevronUp size={14} className="opacity-100 text-orange-600 dark:text-orange-400" />
            ) : (
              <ChevronDown size={14} className="opacity-100 text-orange-600 dark:text-orange-400" />
            )
          ) : (
            <ChevronUp size={14} className="opacity-0" /> // spacer
          )}
        </span>
      </div>
    </th>
  );
}
