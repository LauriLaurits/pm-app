"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir } | null;

/** Per-column value extractors. Define the map OUTSIDE the component (or useMemo it) so the
 * sort memo below doesn't recompute on every render. ISO date strings sort correctly as
 * strings; numbers sort numerically; null/undefined always sorts last in either direction. */
export type SortAccessors<T, K extends string> = Record<
  K,
  (row: T) => string | number | null | undefined
>;

export function useSort<T, K extends string>(
  rows: T[],
  accessors: SortAccessors<T, K>,
  // NoInfer: K must come from the accessors record's keys; otherwise the initial key's literal
  // narrows K and every other SortableHead sortKey becomes a type error.
  initial: { key: NoInfer<K>; dir: SortDir } | null = null
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const acc = accessors[sort.key];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return (
        String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) *
        dir
      );
    });
  }, [rows, sort, accessors]);

  const toggle = (key: K) =>
    setSort((s) =>
      s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );

  return { rows: sorted, sort, toggle };
}
