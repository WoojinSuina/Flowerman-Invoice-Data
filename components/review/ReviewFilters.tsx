"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Option {
  value: string;
  label: string;
}

export function ReviewFilters({
  stores,
  months,
  weeks,
}: {
  stores: Option[];
  months: Option[];
  weeks: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  // Local state + a short debounce so navigation (and the resulting DB
  // query) fires once typing pauses, not on every keystroke.
  const [searchText, setSearchText] = useState(searchParams.get("search") ?? "");
  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (searchText === current) return;
    const timeout = setTimeout(() => update({ search: searchText || null }), 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search invoice #, store, or date (e.g. 9/17)"
        className="w-full rounded border px-2 py-1 text-sm sm:w-72"
      />

      <select
        value={searchParams.get("store") ?? ""}
        onChange={(e) => update({ store: e.target.value || null })}
        className="w-full rounded border px-2 py-1 text-sm sm:w-40"
      >
        <option value="">All stores</option>
        {stores.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("month") ?? ""}
        onChange={(e) => update({ month: e.target.value || null, week: null })}
        className="w-full rounded border px-2 py-1 text-sm sm:w-40"
      >
        <option value="">All months</option>
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("week") ?? ""}
        onChange={(e) => update({ week: e.target.value || null, month: null })}
        className="w-full rounded border px-2 py-1 text-sm sm:w-40"
      >
        <option value="">All weeks</option>
        {weeks.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}
