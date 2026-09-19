"use client";

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

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <select
        value={searchParams.get("store") ?? ""}
        onChange={(e) => update({ store: e.target.value || null })}
        className="rounded border px-2 py-1 text-sm"
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
        className="rounded border px-2 py-1 text-sm"
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
        className="rounded border px-2 py-1 text-sm"
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
