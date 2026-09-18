"use client";

import { useRouter } from "next/navigation";

export function MonthSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(`/dashboard?month=${e.target.value}`)}
      className="rounded border px-3 py-1 text-lg font-bold"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
