import { useState, useMemo } from "react";

export type SortOrder = "asc" | "desc";

export function useSortableTable<T>(
  data: T[] | undefined,
  initialKey?: keyof T | string,
  initialOrder: SortOrder = "asc"
) {
  const [sortKey, setSortKey] = useState<keyof T | string | undefined>(initialKey);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialOrder);

  const requestSort = (key: keyof T | string) => {
    let newOrder: SortOrder = "asc";
    if (sortKey === key && sortOrder === "asc") {
      newOrder = "desc";
    }
    setSortKey(key);
    setSortOrder(newOrder);
  };

  const sortedData = useMemo(() => {
    if (!data) return [];
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      // Handle nested keys like "user.name"
      const getVal = (obj: any, path: string) => {
        return path.split(".").reduce((acc, part) => acc && acc[part], obj);
      };

      const valA = getVal(a, sortKey as string);
      const valB = getVal(b, sortKey as string);

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      // Handle numbers
      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      // Fallback to string comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortOrder]);

  return { sortedData, sortKey, sortOrder, requestSort };
}
