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
  const [filterOpen, setFilterOpen] = useState(false);

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
    // Only relevant when opened from the mobile popup — selecting a value
    // there should close it immediately rather than leaving it open until
    // a separate tap; harmless no-op on desktop, which never opens it.
    setFilterOpen(false);
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

  const activeFilterCount = ["store", "month", "week"].filter((key) => searchParams.get(key)).length;

  function renderSelects(widthClass: string) {
    return (
      <>
        <select
          value={searchParams.get("store") ?? ""}
          onChange={(e) => update({ store: e.target.value || null })}
          className={`rounded border px-2 py-1 text-sm ${widthClass}`}
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
          className={`rounded border px-2 py-1 text-sm ${widthClass}`}
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
          className={`rounded border px-2 py-1 text-sm ${widthClass}`}
        >
          <option value="">All weeks</option>
          {weeks.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex gap-2 md:hidden">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search invoice #, store, or date (e.g. 9/17)"
          className="w-full flex-1 rounded border px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="shrink-0 rounded border bg-gray-50 px-3 py-1 text-sm text-gray-700"
        >
          Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      <div className="hidden flex-wrap gap-3 md:flex">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search invoice #, store, or date (e.g. 9/17)"
          className="w-72 rounded border px-2 py-1 text-sm"
        />
        {renderSelects("w-40")}
      </div>

      {filterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 md:hidden"
          onClick={() => setFilterOpen(false)}
        >
          <div
            className="w-full rounded-t-lg bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium">Filters</h3>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                aria-label="Close"
                className="text-xl leading-none text-gray-500"
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col gap-3">{renderSelects("w-full")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
